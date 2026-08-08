package term

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"time"

	"github.com/coder/websocket"
	"github.com/creack/pty"
	"github.com/go-chi/chi/v5"
)

// Routes mounts the terminal surface.
//
// Session-authenticated by the router it is mounted under, exactly like the
// rest of the dashboard API — there is no separate token, because a weaker
// credential for a shell than for the settings page would be backwards.
func (s *Service) Routes(r chi.Router) {
	r.Get("/status", s.handleStatus)
	r.Post("/sessions", s.handleCreateSession)
	r.Delete("/sessions/{name}", s.handleKillSession)
	r.Get("/attach/{name}", s.handleAttach)
}

func (s *Service) handleCreateSession(w http.ResponseWriter, r *http.Request) {
	if s.guard(w) != nil {
		return
	}
	var in struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10)).Decode(&in)
	name := in.Name
	if name == "" {
		name = "builder"
	}
	if !sessionName.MatchString(name) {
		httpErr(w, http.StatusUnprocessableEntity,
			"a session name may contain letters, digits, dashes and underscores only")
		return
	}

	bin, _ := tmuxBin()
	// -A: attach if it exists, create if it does not. Without it, opening the
	// same session twice is an error, and "already exists" is the single most
	// likely outcome of clicking a button called New session.
	cmd := exec.CommandContext(r.Context(), bin,
		"new-session", "-d", "-A", "-s", name, "-c", s.workdir)
	cmd.Env = sessionEnv()
	if out, err := cmd.CombinedOutput(); err != nil {
		s.log.Error("create tmux session", "name", name, "err", err, "out", string(out))
		httpErr(w, http.StatusInternalServerError, "could not start that session: "+string(out))
		return
	}
	s.log.Info("tmux session ready", "name", name, "workdir", s.workdir)
	writeJSON(w, http.StatusCreated, map[string]any{"name": name})
}

func (s *Service) handleKillSession(w http.ResponseWriter, r *http.Request) {
	if s.guard(w) != nil {
		return
	}
	name := chi.URLParam(r, "name")
	if !sessionName.MatchString(name) {
		httpErr(w, http.StatusUnprocessableEntity, "not a session name")
		return
	}
	bin, _ := tmuxBin()
	if out, err := exec.CommandContext(r.Context(), bin, "kill-session", "-t", name).CombinedOutput(); err != nil {
		httpErr(w, http.StatusNotFound, "no such session: "+string(out))
		return
	}
	s.log.Info("tmux session killed", "name", name)
	w.WriteHeader(http.StatusNoContent)
}

// clientMsg is what the browser sends. Two kinds: keystrokes and resizes.
//
// JSON rather than raw bytes because a resize has to travel on the same
// channel as input — a terminal that does not know its size renders wrapped
// nonsense the moment anything uses more than 80 columns.
type clientMsg struct {
	Type string `json:"type"` // "in" | "resize"
	Data string `json:"data,omitempty"`
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
}

func (s *Service) handleAttach(w http.ResponseWriter, r *http.Request) {
	if s.guard(w) != nil {
		return
	}
	name := chi.URLParam(r, "name")
	if !sessionName.MatchString(name) {
		httpErr(w, http.StatusUnprocessableEntity, "not a session name")
		return
	}
	// Checked BEFORE the upgrade. After the handshake there is no status code
	// left to send, only a close frame nobody reads.
	if !sameOrigin(r) {
		s.log.Warn("terminal attach refused: cross-origin", "origin", r.Header.Get("Origin"))
		httpErr(w, http.StatusForbidden, "cross-origin terminal attach refused")
		return
	}

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// Origin is verified above, by hand, so the library's own check is
		// disabled rather than duplicated with different rules.
		InsecureSkipVerify: true,
		CompressionMode:    websocket.CompressionDisabled,
	})
	if err != nil {
		s.log.Warn("terminal upgrade failed", "err", err)
		return
	}
	// Not tied to the request context: r.Context() is cancelled the moment the
	// handler returns on some servers, which would kill the session instantly.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer conn.Close(websocket.StatusNormalClosure, "")

	cols := atoiOr(r.URL.Query().Get("cols"), 120)
	rows := atoiOr(r.URL.Query().Get("rows"), 32)

	bin, _ := tmuxBin()
	// attach-session, not new-session: the tmux server owns the process tree,
	// so `claude` keeps running when this socket closes and is still there on
	// the next attach. That persistence is the entire reason for tmux.
	cmd := exec.CommandContext(ctx, bin, "attach-session", "-t", name)
	cmd.Env = sessionEnv()
	cmd.Dir = s.workdir

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{
		Cols: uint16(clampDim(cols, 240)),
		Rows: uint16(clampDim(rows, 200)),
	})
	if err != nil {
		s.log.Error("start pty", "session", name, "err", err)
		conn.Close(websocket.StatusInternalError, "could not attach")
		return
	}
	defer func() { _ = ptmx.Close() }()

	s.log.Info("terminal attached", "session", name, "cols", cols, "rows", rows)

	// PTY → browser.
	go func() {
		defer cancel()
		buf := make([]byte, 32<<10)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				// Binary, not text: a PTY emits bytes, and a partial UTF-8
				// sequence split across two reads is normal. Forcing them into
				// text frames would make the browser reject the frame and drop
				// the connection mid-escape-sequence.
				if werr := conn.Write(ctx, websocket.MessageBinary, buf[:n]); werr != nil {
					return
				}
			}
			if err != nil {
				if !errors.Is(err, io.EOF) {
					s.log.Debug("pty read ended", "session", name, "err", err)
				}
				return
			}
		}
	}()

	// browser → PTY.
	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			break
		}
		if typ != websocket.MessageText {
			continue
		}
		var m clientMsg
		if json.Unmarshal(data, &m) != nil {
			continue
		}
		switch m.Type {
		case "in":
			if _, err := ptmx.Write([]byte(m.Data)); err != nil {
				break
			}
		case "resize":
			// Clamped. A hostile or buggy client sending 60000 columns would
			// have the kernel allocate a window that size.
			_ = pty.Setsize(ptmx, &pty.Winsize{
				Cols: uint16(clampDim(m.Cols, 240)),
				Rows: uint16(clampDim(m.Rows, 200)),
			})
		}
	}

	// Detach, do not kill. The tmux server keeps the session and everything
	// running inside it; only this view of it goes away.
	cancel()
	_ = cmd.Process.Signal(os.Interrupt)
	go func() {
		// Reaped in the background with a deadline, so a wedged attach process
		// cannot leak a zombie into the API for the rest of its life.
		done := make(chan struct{})
		go func() { _, _ = cmd.Process.Wait(); close(done) }()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			_ = cmd.Process.Kill()
		}
	}()
	s.log.Info("terminal detached", "session", name)
}

// clampDim keeps a terminal dimension sane. Zero from a client that has not
// measured yet becomes a usable default rather than a 0x0 window.
func clampDim(v, max int) int {
	if v < 2 {
		return 24
	}
	if v > max {
		return max
	}
	return v
}

// sessionEnv is the environment a session starts with.
//
// The API's own environment, because that is what makes `claude` and `gh` work
// without the operator re-authenticating — they read the same HOME and the same
// PATH this process was started with. TERM is forced, because a PTY with no
// TERM makes every full-screen program refuse to draw.
func sessionEnv() []string {
	env := os.Environ()
	out := env[:0]
	for _, kv := range env {
		// The vault key is removed. A shell in the workdir does not need it,
		// and a terminal is exactly where an env dump ends up pasted into a
		// screenshot.
		if len(kv) > 18 && kv[:18] == "BUILDER_VAULT_KEY=" {
			continue
		}
		out = append(out, kv)
	}
	return append(out, "TERM=xterm-256color")
}

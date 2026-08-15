package integrations

// The tmux adapter.
//
// Separate from the service so the service can be tested without a terminal
// multiplexer installed, and so the one place that shells out is small enough
// to read in full.

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

type tmuxCLI struct{ workdir string }

// NewTmux returns a Tmux backed by the real binary.
func NewTmux(workdir string) Tmux { return tmuxCLI{workdir: workdir} }

func (t tmuxCLI) bin() (string, error) {
	return exec.LookPath("tmux")
}

func (t tmuxCLI) Ensure(ctx context.Context, name string) error {
	bin, err := t.bin()
	if err != nil {
		return fmt.Errorf("tmux is not installed: %w", err)
	}
	// has-session first, then new-session -d.
	//
	// NOT `new-session -A`: on the attach branch tmux builds a client, a client
	// needs a TTY, and this runs in an HTTP handler that has none — it dies
	// with "open terminal failed: not a terminal". The failure only appears on
	// the SECOND call for a name, so creating works and reconnecting does not.
	// internal/term/attach.go hit exactly this and documents it; the same
	// reasoning applies here.
	check := exec.CommandContext(ctx, bin, "has-session", "-t", "="+name)
	check.Env = env()
	if check.Run() == nil {
		return nil
	}
	create := exec.CommandContext(ctx, bin, "new-session", "-d", "-s", name, "-c", t.workdir)
	create.Env = env()
	if out, err := create.CombinedOutput(); err != nil {
		return fmt.Errorf("new-session: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

func (t tmuxCLI) SendKeys(ctx context.Context, name string, argv ...string) error {
	bin, err := t.bin()
	if err != nil {
		return err
	}
	if len(argv) == 0 {
		return fmt.Errorf("nothing to send")
	}
	// Each argument is passed to tmux as its own token and tmux joins them with
	// spaces before typing. The arguments come from the registry, never from a
	// request, so there is no interpolation of caller input anywhere on this
	// path — see Service.run.
	args := append([]string{"send-keys", "-t", name}, strings.Join(argv, " "))
	args = append(args, "Enter")
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Env = env()
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("send-keys: %s: %w", strings.TrimSpace(string(out)), err)
	}
	return nil
}

// env keeps the login's environment close to the operator's own shell.
//
// A login that runs with a stripped PATH finds neither the browser opener nor
// the credential helper, and fails in a way that looks like the vendor's fault.
func env() []string {
	keep := []string{"HOME", "PATH", "USER", "SHELL", "LANG", "LC_ALL", "TERM",
		"XDG_CONFIG_HOME", "XDG_DATA_HOME", "SSH_AUTH_SOCK", "DISPLAY", "BROWSER"}
	out := make([]string, 0, len(keep))
	for _, k := range keep {
		if v, ok := os.LookupEnv(k); ok {
			out = append(out, k+"="+v)
		}
	}
	return out
}

package issues

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
)

// Per-kind ceilings, mirrored in the SDK so the browser refuses early and the
// server refuses authoritatively.
//
// A screen recording of a bug is the highest-signal attachment there is, so
// video gets real headroom. The reference implementation caps SDK uploads at
// 5 MB while accepting 25 MB from the board — two inconsistent limits for the
// same file, which makes the feature a lie from one direction.
const (
	maxImageBytes = 10 << 20  // 10 MB
	maxVideoBytes = 100 << 20 // 100 MB
	maxFileBytes  = 25 << 20  // 25 MB
)

var allowedMIME = map[string]string{
	"image/png": "image", "image/jpeg": "image", "image/webp": "image", "image/gif": "image",
	"video/mp4": "video", "video/webm": "video", "video/quicktime": "video",
	"application/pdf": "file", "text/plain": "file",
}

// storageRoot is where uploads land. Object storage in a deployment; a local
// directory here. Either way NOT the database: a 100 MB video base64'd into a
// TEXT column inflates by a third and has to be held in memory twice to read.
func storageRoot() string {
	if d := os.Getenv("BUILDER_UPLOAD_DIR"); d != "" {
		return d
	}
	return filepath.Join(os.TempDir(), "builder-uploads")
}

type storedFile struct {
	Kind        string
	StorageKey  string
	FileName    string
	ContentType string
	Size        int64
	SHA256      string
}

// saveAttachments persists every uploaded file and returns what was stored.
//
// Errors on one file never fail the whole report: a bug report that arrives
// without its screenshot is far better than one that is rejected outright
// because the screenshot was too big.
func (s *Service) saveAttachments(
	ctx context.Context, tx *sql.Tx, issueID string, form *multipart.Form,
) ([]storedFile, []string) {
	if form == nil {
		return nil, nil
	}
	files := form.File["attachments"]
	if len(files) == 0 {
		return nil, nil
	}
	if len(files) > maxAttach {
		files = files[:maxAttach]
	}
	// Parallel array from the SDK; absent for non-SDK clients.
	kinds := form.Value["attachment_kinds"]

	var stored []storedFile
	var problems []string

	for i, fh := range files {
		declared := ""
		if i < len(kinds) {
			declared = kinds[i]
		}
		sf, err := s.saveOne(ctx, issueID, fh, declared)
		if err != nil {
			problems = append(problems, fmt.Sprintf("%s: %v", fh.Filename, err))
			s.log.Warn("attachment rejected", "file", fh.Filename, "err", err)
			continue
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO builder_issue_attachments
			   (issue_id, kind, storage_key, file_name, content_type, size_bytes, sha256)
			 VALUES ($1,$2,$3,$4,$5,$6,$7)
			 ON CONFLICT (issue_id, sha256) WHERE sha256 <> '' DO NOTHING`,
			issueID, sf.Kind, sf.StorageKey, sf.FileName, sf.ContentType, sf.Size, sf.SHA256,
		); err != nil {
			problems = append(problems, fmt.Sprintf("%s: could not record", fh.Filename))
			s.log.Error("record attachment", "err", err)
			continue
		}
		stored = append(stored, *sf)
	}
	return stored, problems
}

func (s *Service) saveOne(
	ctx context.Context, issueID string, fh *multipart.FileHeader, declaredKind string,
) (*storedFile, error) {
	src, err := fh.Open()
	if err != nil {
		return nil, fmt.Errorf("unreadable")
	}
	defer src.Close()

	// Sniff the real type. A client-declared Content-Type is a claim, not a
	// fact — accepting it means a .exe arrives labelled image/png.
	head := make([]byte, 512)
	n, _ := io.ReadFull(src, head)
	head = head[:n]
	sniffed := http.DetectContentType(head)
	base := strings.TrimSpace(strings.Split(sniffed, ";")[0])

	// THE SNIFFED TYPE IS AUTHORITATIVE. There is deliberately no fallback to
	// the client-declared Content-Type.
	//
	// An earlier version fell back to the declared type when sniffing produced
	// something unlisted, meaning to tolerate DetectContentType's text/plain
	// catch-all. That inverted the check: a Windows executable sniffs as
	// application/octet-stream, so an attacker declaring "image/png" got their
	// binary stored. Verified — a 2 KB MZ header was accepted as a screenshot.
	//
	// If the bytes do not look like something on the allowlist, it is refused,
	// whatever the client claims.
	kind, ok := allowedMIME[base]
	if !ok {
		return nil, fmt.Errorf("content is %s, which is not an allowed type", base)
	}

	limit := int64(maxFileBytes)
	switch kind {
	case "image":
		limit = maxImageBytes
	case "video":
		limit = maxVideoBytes
	}
	if fh.Size > limit {
		return nil, fmt.Errorf("%s exceeds the %d MB limit for %s", human(fh.Size), limit>>20, kind)
	}

	if _, err := src.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("not seekable")
	}

	// Keys carry no user-controlled path component — the filename is recorded
	// separately, so "../../etc/passwd" as a filename cannot escape the root.
	now := time.Now().UTC()
	key := filepath.Join(
		fmt.Sprintf("%04d", now.Year()), fmt.Sprintf("%02d", now.Month()),
		fmt.Sprintf("%s-%s%s", issueID[:8], randHex(8), safeExt(base)))

	dest := filepath.Join(storageRoot(), key)
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return nil, fmt.Errorf("storage unavailable")
	}
	out, err := os.Create(dest)
	if err != nil {
		return nil, fmt.Errorf("storage unavailable")
	}
	defer out.Close()

	// Hash while streaming — never buffer the whole file to hash it, or a
	// 100 MB video costs 100 MB of heap per concurrent upload.
	h := sha256.New()
	written, err := io.Copy(io.MultiWriter(out, h), io.LimitReader(src, limit+1))
	if err != nil {
		_ = os.Remove(dest)
		return nil, fmt.Errorf("write failed")
	}
	if written > limit {
		// Size can lie; the byte count cannot.
		_ = os.Remove(dest)
		return nil, fmt.Errorf("exceeds the %d MB limit for %s", limit>>20, kind)
	}

	if declaredKind == "screenshot" && kind == "image" {
		kind = "screenshot"
	}
	return &storedFile{
		Kind: kind, StorageKey: key,
		FileName:    truncate(filepath.Base(fh.Filename), 200),
		ContentType: base, Size: written,
		SHA256: hex.EncodeToString(h.Sum(nil)),
	}, nil
}

// handleAttachment streams a stored file back.
func (s *Service) handleAttachment(w http.ResponseWriter, r *http.Request) {
	var key, ctype, name string
	var size int64
	err := s.db.QueryRowContext(r.Context(),
		`SELECT storage_key, content_type, file_name, size_bytes
		   FROM builder_issue_attachments WHERE id = $1`,
		chi.URLParam(r, "id")).Scan(&key, &ctype, &name, &size)
	if err != nil {
		httpErr(w, http.StatusNotFound, "no such attachment")
		return
	}

	// The key comes from our own INSERT, but a path traversal here would serve
	// arbitrary files, so it is re-checked rather than trusted.
	full := filepath.Join(storageRoot(), filepath.Clean("/"+key))
	if !strings.HasPrefix(full, filepath.Clean(storageRoot())+string(os.PathSeparator)) {
		httpErr(w, http.StatusBadRequest, "bad key")
		return
	}
	f, err := os.Open(full)
	if err != nil {
		httpErr(w, http.StatusNotFound, "the file is no longer stored")
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", ctype)
	// Never inline: an uploaded SVG or HTML rendered in the app's origin is
	// stored XSS. Attachments are downloads, always.
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, name, time.Time{}, f)
}

// safeExt derives the extension from the SNIFFED mime type, never from the
// user's filename. Trusting the filename stored "evil.exe" on disk even once
// the content check was correct — the name is recorded in the database for
// display and has no business shaping a path.
func safeExt(mime string) string {
	switch mime {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "video/quicktime":
		return ".mov"
	case "application/pdf":
		return ".pdf"
	case "text/plain":
		return ".txt"
	}
	return ".bin"
}

func human(b int64) string {
	if b < 1<<20 {
		return fmt.Sprintf("%d kB", b>>10)
	}
	return fmt.Sprintf("%d MB", b>>20)
}

func randHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		// A weak key here only risks a filename collision, never a security
		// property — the path carries no user input either way.
		return hex.EncodeToString([]byte(time.Now().Format("150405.000000")))[:n*2]
	}
	return hex.EncodeToString(b)
}

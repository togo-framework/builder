package issues

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"mime/multipart"
	"net/textproto"
	"os"
	"strings"
	"testing"
)

// upload builds a multipart file header the way a browser would, including a
// client-declared Content-Type the caller controls.
func upload(t *testing.T, name, declaredType string, body []byte) *multipart.FileHeader {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", `form-data; name="attachments"; filename="`+name+`"`)
	h.Set("Content-Type", declaredType)
	part, err := w.CreatePart(h)
	if err != nil {
		t.Fatal(err)
	}
	part.Write(body)
	w.Close()

	r := multipart.NewReader(&buf, w.Boundary())
	form, err := r.ReadForm(32 << 20)
	if err != nil {
		t.Fatal(err)
	}
	return form.File["attachments"][0]
}

func svc(t *testing.T) *Service {
	t.Helper()
	t.Setenv("BUILDER_UPLOAD_DIR", t.TempDir())
	return &Service{log: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

var pngBytes = []byte{
	0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a,
	0, 0, 0, 0x0d, 'I', 'H', 'D', 'R', 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
}

// THE REGRESSION THIS FILE EXISTS FOR.
//
// An earlier version fell back to the client-declared Content-Type when
// sniffing returned something unlisted. A Windows executable sniffs as
// application/octet-stream, so declaring "image/png" got the binary stored as a
// screenshot — verified accepted in a live run before the fix.
func TestDeclaredTypeCannotOverrideSniffing(t *testing.T) {
	s := svc(t)
	exe := append([]byte{'M', 'Z', 0x90, 0x00}, bytes.Repeat([]byte{0}, 600)...)

	for _, declared := range []string{"image/png", "image/jpeg", "video/mp4", "text/plain"} {
		t.Run("declared="+declared, func(t *testing.T) {
			_, err := s.saveOne(context.Background(), "abcdefgh-1111", upload(t, "evil.exe", declared, exe), "screenshot")
			if err == nil {
				t.Fatalf("an executable declared as %q was ACCEPTED", declared)
			}
			if !strings.Contains(err.Error(), "not an allowed type") {
				t.Fatalf("rejected for the wrong reason: %v", err)
			}
		})
	}
}

func TestGenuineImageIsAccepted(t *testing.T) {
	s := svc(t)
	sf, err := s.saveOne(context.Background(), "abcdefgh-2222",
		upload(t, "shot.png", "image/png", append(pngBytes, bytes.Repeat([]byte{0}, 2000)...)), "screenshot")
	if err != nil {
		t.Fatalf("a real PNG was rejected: %v", err)
	}
	if sf.Kind != "screenshot" {
		t.Fatalf("kind = %q, want screenshot", sf.Kind)
	}
	if sf.ContentType != "image/png" {
		t.Fatalf("content type = %q", sf.ContentType)
	}
	if sf.SHA256 == "" {
		t.Fatal("no digest was computed")
	}
	if _, err := os.Stat(os.Getenv("BUILDER_UPLOAD_DIR") + "/" + sf.StorageKey); err != nil {
		t.Fatalf("the file was not written: %v", err)
	}
}

// The stored path must never take its extension from the user's filename.
// "evil.exe" was landing on disk as .exe even when the content check passed.
func TestStorageKeyIgnoresTheUserFilename(t *testing.T) {
	s := svc(t)
	for _, name := range []string{"evil.exe", "../../../etc/passwd", "x.php", "no-extension"} {
		sf, err := s.saveOne(context.Background(), "abcdefgh-3333",
			upload(t, name, "image/png", append(pngBytes, bytes.Repeat([]byte{0}, 500)...)), "")
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if !strings.HasSuffix(sf.StorageKey, ".png") {
			t.Fatalf("filename %q produced key %q — the extension must come from the sniffed type",
				name, sf.StorageKey)
		}
		if strings.Contains(sf.StorageKey, "..") {
			t.Fatalf("path traversal survived into the key: %q", sf.StorageKey)
		}
	}
}

func TestOversizeIsRefused(t *testing.T) {
	s := svc(t)
	huge := append(pngBytes, bytes.Repeat([]byte{0}, maxImageBytes+1024)...)
	if _, err := s.saveOne(context.Background(), "abcdefgh-4444",
		upload(t, "huge.png", "image/png", huge), ""); err == nil {
		t.Fatal("an oversize image was accepted")
	}
}

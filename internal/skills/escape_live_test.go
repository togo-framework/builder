package skills

import (
	"io"
	"log/slog"
	"strings"
	"testing"
)

// A skill name must never be able to write outside .claude/skills/.
//
// Import and create both take a name from the caller and turn it into a
// filesystem path. That is the one place in this package where untrusted input
// meets the disk, so the containment is asserted rather than reviewed.
func TestSkillNameCannotEscapeTheSkillsDirectory(t *testing.T) {
	root := t.TempDir()
	s := &Service{root: root, log: slog.New(slog.NewTextHandler(io.Discard, nil))}

	for _, evil := range []string{
		"../escape",
		"../../etc/passwd",
		"..",
		"a/../../b",
		"/absolute",
		"./../../x",
		"foo/../../../bar",
	} {
		if got, err := s.dirFor(evil); err == nil {
			t.Errorf("dirFor(%q) returned %q — it must refuse", evil, got)
		}
	}

	// And an ordinary name must still resolve, inside the root.
	got, err := s.dirFor("feedback-sdk")
	if err != nil {
		t.Fatalf("a normal name was refused: %v", err)
	}
	if !strings.HasPrefix(got, root) {
		t.Fatalf("resolved outside the root: %q", got)
	}
	if !strings.Contains(got, ".claude/skills/feedback-sdk") {
		t.Fatalf("unexpected path: %q", got)
	}
}

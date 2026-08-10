package builder

import (
	"embed"
	"io/fs"
)

// webFS carries the builder's own dashboard — all 23 screens, compiled.
//
// # WHY THIS IS EMBEDDED AND NOT A DIRECTORY
//
// It used to be neither. The plugin shipped the feedback widget and nothing
// else, and the screens existed only as SOURCE in blueprint/_project/web/src —
// compiled by whichever project the scaffolder had stamped them into. Two
// things followed from that, and both were reported as bugs:
//
//   - builderd, the "standalone" daemon, served its UI out of BUILDER_WEB_DIR,
//     defaulting to ../../builder-dev/web/dist — a SIBLING DEVELOPMENT
//     PROJECT'S build output. On any machine without that checkout built, the
//     daemon came up healthy and served no pages at all. On a server it never
//     had any chance of working.
//   - Installing the plugin into an existing application wired up the whole Go
//     side and every screen 404'd, because the host's own SPA has no /issues
//     route and never will.
//
// A tool whose promise is "it is still there when your product is broken"
// cannot depend on somebody else's `npm run build` having happened. So the
// bundle is compiled from the shared source (web/, whose src/ is a symlink into
// the blueprint) and carried inside the binary, exactly as sdk/dist is. Copy
// the binary anywhere and the screens come with it.
//
// The cost is honest and worth naming: the bundle is a few megabytes and it
// lands in the host application's binary too. That is the price of a plugin
// that works on install rather than after a frontend integration.
//
//go:embed all:web/dist
var webFS embed.FS

// WebFiles returns the built dashboard rooted at "/", ready for http.FileServer.
func WebFiles() (fs.FS, error) { return fs.Sub(webFS, "web/dist") }

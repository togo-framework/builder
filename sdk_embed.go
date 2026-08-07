package builder

import (
	"embed"
	"io/fs"
)

// sdkFS carries the built feedback widget.
//
// Embedded rather than read from disk: BUILDER_SDK_DIR pointed at
// "<project>/sdk", a path that exists in this repo but NOT in a scaffolded
// project, so every generated app served a 404 and showed no feedback button.
// A plugin cannot depend on the host app having its source tree.
//
//go:embed all:sdk/dist
var sdkFS embed.FS

// SDKFiles returns the bundle rooted at "/", ready for http.FileServer.
func SDKFiles() (fs.FS, error) { return fs.Sub(sdkFS, "sdk/dist") }

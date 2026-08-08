package builder

import (
	"embed"
	"io/fs"
)

// assetsFS carries files the dashboard needs that are not part of the widget
// bundle — today, the terminal's icon font.
//
// Embedded for the same reason the SDK is: a scaffolded project has no source
// tree of ours to read from, so anything served off disk 404s in every
// generated app.
//
//go:embed all:assets
var assetsFS embed.FS

// AssetFiles returns the asset tree rooted at "/", ready for http.FileServer.
func AssetFiles() (fs.FS, error) { return fs.Sub(assetsFS, "assets") }

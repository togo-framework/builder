// Package blueprint carries the project template as an embedded filesystem.
//
// Nothing but embed.FS lives here, so the plugin module never depends on it and
// an app that installs the plugin does not pull the template along with it.
package blueprint

import "embed"

// Project is the overlay applied on top of `togo new` output. Files here win.
//
//go:embed all:_project
var Project embed.FS

// Claude is the shipped .claude/ operating system: rules, agents, skills, hooks.
//
//go:embed all:_claude
var Claude embed.FS

// Version is stamped into the generated project so `blueprint upgrade` knows
// which template it came from.
const Version = "0.1.0"

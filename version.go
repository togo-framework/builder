package builder

// Version is the plugin module version. Set by the release build via
// -ldflags "-X github.com/togo-framework/builder.Version=$TAG"; "dev" locally.
var Version = "dev"

// BlueprintVersion is stamped into a generated project's togo.yaml so
// `togo-builder blueprint upgrade` knows which template the project came from
// and which migrations it has already seen.
//
// It is deliberately separate from Version: the plugin can be patched without
// changing what a fresh scaffold produces, and a blueprint can change without
// forcing every installed app to upgrade the plugin.
const BlueprintVersion = "0.1.0"

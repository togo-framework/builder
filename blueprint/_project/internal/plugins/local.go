// Locally-developed plugins, blank-imported so their init() registers with the
// kernel. Kept separate from plugins.gen.go, which togo owns and regenerates.
package plugins

import _ "github.com/togo-framework/builder"

// A SEPARATE MODULE, deliberately.
//
// The daemon needs auth, auth-dev, db-postgres and realtime. The PLUGIN must
// not: a product that embeds the builder in-process brings its own auth and
// its own database driver, and inheriting a second set through us would put
// two session implementations in one binary and make every product carry
// auth-dev, which exists only for local development.
//
// Nested here rather than in its own repository so the daemon and the plugin
// version together — they share every provider, and a daemon that lags the
// plugin it wraps is a support burden nobody signed up for.
module github.com/togo-framework/builderd

go 1.26.4

require (
	github.com/togo-framework/auth v0.8.0
	github.com/togo-framework/auth-dev v0.0.0
	github.com/togo-framework/builder v0.0.0
	github.com/togo-framework/db-postgres v0.0.0
	github.com/togo-framework/realtime v0.0.0
	github.com/togo-framework/togo v0.20.1
)

require (
	github.com/coder/websocket v1.8.15 // indirect
	github.com/creack/pty v1.1.24 // indirect
	github.com/go-chi/chi/v5 v5.1.0 // indirect
	github.com/golang-jwt/jwt/v5 v5.3.1 // indirect
	github.com/google/jsonschema-go v0.4.3 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/pgx/v5 v5.10.0 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/modelcontextprotocol/go-sdk v1.7.0 // indirect
	github.com/segmentio/asm v1.1.3 // indirect
	github.com/segmentio/encoding v0.5.4 // indirect
	github.com/togo-framework/orm v0.1.0 // indirect
	github.com/yosida95/uritemplate/v3 v3.0.2 // indirect
	golang.org/x/crypto v0.54.0 // indirect
	golang.org/x/oauth2 v0.35.0 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.40.0 // indirect
	golang.org/x/time v0.15.0 // indirect
)

// NOT BUILDABLE FROM A CLONE YET, and saying so here rather than letting
// someone discover it.
//
// These point at sibling checkouts on the machine this was developed on. Until
// the togo plugins they name are tagged and published, `go build ./builderd`
// works only inside a workspace that has all six repositories side by side.
//
// The PLUGIN itself — the parent module — has no replace directives and builds
// from a clone normally. Only this daemon is affected, and only until the
// dependencies it needs exist as published versions.
replace (
	github.com/togo-framework/auth => ../../auth
	github.com/togo-framework/auth-dev => ../../auth-dev
	github.com/togo-framework/builder => ../
	github.com/togo-framework/db-postgres => ../../db-postgres
	github.com/togo-framework/realtime => ../../realtime
	github.com/togo-framework/togo => ../../togo
)

package sources

import (
	"context"

	"github.com/togo-framework/builder/internal/brain"
	"github.com/togo-framework/builder/internal/vault"
)

// The seams in this package are only useful if the real types fit them. These
// are compile-time assertions rather than tests because a mismatch should stop
// the build, not wait for someone to run the suite.

// The brain plugs straight in.
var _ Retainer = (*brain.Store)(nil)

// The vault needs one adapter, and the adapter is the point: RevealFor takes the
// PRINCIPAL and the RUN, so the audit row can answer "who read this key?". The
// connector must not choose those for itself — which principal an unattended
// ingester reveals as is a grant decision, and grants are a human's call.
type vaultSecrets struct {
	v         *vault.Store
	agentSlug string
	runID     string
}

func (s vaultSecrets) Reveal(ctx context.Context, name string) (string, error) {
	return s.v.RevealFor(ctx, name, s.agentSlug, s.runID)
}

var _ Secrets = vaultSecrets{}

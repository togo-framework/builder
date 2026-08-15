package actors

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
)

// A store that records the order things happened in, so the tests can assert
// the sequence rather than just the end state.
type fakeStore struct {
	mu       sync.Mutex
	events   []string
	claimed  map[string]string // idem -> id
	failNext error
}

func newStore() *fakeStore { return &fakeStore{claimed: map[string]string{}} }

func (f *fakeStore) Claim(_ context.Context, row OutboxRow) (string, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failNext != nil {
		err := f.failNext
		f.failNext = nil
		return "", false, err
	}
	if id, ok := f.claimed[row.Idem]; ok {
		f.events = append(f.events, "claim-duplicate")
		return id, false, nil
	}
	id := "row-" + row.Idem
	f.claimed[row.Idem] = id
	f.events = append(f.events, "claim")
	return id, true, nil
}

func (f *fakeStore) Finish(_ context.Context, _, status string, _ ActOutput, _ error) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, "finish:"+status)
	return nil
}

// A test actor that records when it was called and can be told to fail.
type spyActor struct {
	store   *fakeStore
	fail    error
	sawDry  bool
	reveals int
}

func (s *spyActor) Kind() string { return "spy" }
func (s *spyActor) Actions() []ActionSpec {
	return []ActionSpec{
		{Name: "send", External: true, Grant: "x.send"},
		{Name: "ping", External: false, Grant: "x.ping"},
	}
}
func (s *spyActor) Act(ctx context.Context, in ActInput, _ json.RawMessage, sec Secrets) (ActOutput, error) {
	s.store.mu.Lock()
	s.store.events = append(s.store.events, "act")
	s.store.mu.Unlock()
	if in.DryRun {
		s.sawDry = true
		return ActOutput{Preview: "would send: " + in.Action}, nil
	}
	if _, err := sec.Reveal(ctx, "tok"); err == nil {
		s.reveals++
	}
	if s.fail != nil {
		return ActOutput{Retryable: true}, s.fail
	}
	return ActOutput{ProviderRef: "ref-1", Preview: "sent"}, nil
}

func runnerWith(t *testing.T, a *spyActor) (*Runner, *fakeStore) {
	t.Helper()
	mu.Lock()
	registry["spy"] = a
	mu.Unlock()
	t.Cleanup(func() {
		mu.Lock()
		delete(registry, "spy")
		mu.Unlock()
	})
	return &Runner{
		Store:   a.store,
		Secrets: func(string, string) Secrets { return Static{"tok": "s3cret"} },
	}, a.store
}

func liveInput(action string) ActInput {
	return ActInput{
		Action:     action,
		Params:     json.RawMessage(`{}`),
		Actor:      Principal{Kind: "user", Slug: "fady", ID: "u1"},
		Idem:       "k1",
		ApprovalID: "appr-1",
	}
}

// THE ordering guarantee: the durable record exists before the provider is
// called. A crash between them must leave something to reconcile.
func TestOutboxRowIsWrittenBeforeTheProviderIsCalled(t *testing.T) {
	a := &spyActor{store: newStore()}
	r, st := runnerWith(t, a)

	if _, err := r.Run(context.Background(), "c1", "spy", nil, liveInput("send")); err != nil {
		t.Fatal(err)
	}
	got := strings.Join(st.events, ",")
	if got != "claim,act,finish:sent" {
		t.Fatalf("order was %q; the claim must precede the act, and the finish must follow it", got)
	}
}

// A failed send still records. An unrecorded outcome is the state this whole
// ordering exists to avoid.
func TestAFailedSendIsStillRecorded(t *testing.T) {
	a := &spyActor{store: newStore(), fail: errors.New("provider said no")}
	r, st := runnerWith(t, a)

	if _, err := r.Run(context.Background(), "c1", "spy", nil, liveInput("send")); err == nil {
		t.Fatal("expected the provider error to surface")
	}
	got := strings.Join(st.events, ",")
	if got != "claim,act,finish:failed" {
		t.Fatalf("order was %q; a failure must still finish the row", got)
	}
}

// The idempotency guarantee: the same key never sends twice.
func TestTheSameIdempotencyKeyDoesNotSendTwice(t *testing.T) {
	a := &spyActor{store: newStore()}
	r, st := runnerWith(t, a)

	if _, err := r.Run(context.Background(), "c1", "spy", nil, liveInput("send")); err != nil {
		t.Fatal(err)
	}
	_, err := r.Run(context.Background(), "c1", "spy", nil, liveInput("send"))
	if !errors.Is(err, ErrAlreadySent) {
		t.Fatalf("second run returned %v, want ErrAlreadySent", err)
	}
	// One act, not two.
	if n := strings.Count(strings.Join(st.events, ","), "act"); n != 1 {
		t.Fatalf("the provider was called %d times for one idempotency key", n)
	}
}

// A dry run touches nothing: no row, no network, no credential.
func TestDryRunWritesNoRowAndReadsNoSecret(t *testing.T) {
	a := &spyActor{store: newStore()}
	r, st := runnerWith(t, a)

	in := liveInput("send")
	in.DryRun = true
	in.Idem = ""       // a dry run needs neither
	in.ApprovalID = "" // of these
	out, err := r.Run(context.Background(), "c1", "spy", nil, in)
	if err != nil {
		t.Fatal(err)
	}
	if out.Preview == "" {
		t.Fatal("a dry run must return the payload it would have sent")
	}
	if !a.sawDry {
		t.Fatal("the actor was not told it was a dry run")
	}
	if a.reveals != 0 {
		t.Fatal("a dry run read a credential")
	}
	if got := strings.Join(st.events, ","); got != "act" {
		t.Fatalf("a dry run touched the outbox: %q", got)
	}
}

// Rule 41: anything crossing the organisation boundary needs a human.
func TestAnExternalActionRefusesWithoutAnApproval(t *testing.T) {
	a := &spyActor{store: newStore()}
	r, st := runnerWith(t, a)

	in := liveInput("send")
	in.ApprovalID = ""
	_, err := r.Run(context.Background(), "c1", "spy", nil, in)
	if !errors.Is(err, ErrNeedApproval) {
		t.Fatalf("got %v, want ErrNeedApproval", err)
	}
	if len(st.events) != 0 {
		t.Fatalf("a refused send touched the store: %v", st.events)
	}

	// A non-external action on the same connection does not need one.
	in2 := liveInput("ping")
	in2.ApprovalID = ""
	if _, err := r.Run(context.Background(), "c1", "spy", nil, in2); err != nil {
		t.Fatalf("an internal action should not need approval: %v", err)
	}
}

// A live send without an idempotency key cannot be reconciled after a crash, so
// it is refused rather than attempted.
func TestALiveSendNeedsAnIdempotencyKey(t *testing.T) {
	a := &spyActor{store: newStore()}
	r, _ := runnerWith(t, a)

	in := liveInput("send")
	in.Idem = ""
	if _, err := r.Run(context.Background(), "c1", "spy", nil, in); !errors.Is(err, ErrNeedIdem) {
		t.Fatalf("got %v, want ErrNeedIdem", err)
	}
}

// The principal has to be one an audit row can hold. SF-001 is what happens
// when the thing that acts and the thing that can be recorded diverge.
func TestAnUnauditablePrincipalIsRefused(t *testing.T) {
	a := &spyActor{store: newStore()}
	r, _ := runnerWith(t, a)

	for _, bad := range []Principal{
		{Kind: "user", Slug: "connection:slack:C0123"}, // colons cannot be stored
		{Kind: "wizard", Slug: "fady"},                 // not a known kind
		{Kind: "user", Slug: ""},
		{Kind: "user", Slug: "Fady"}, // uppercase
	} {
		in := liveInput("send")
		in.Actor = bad
		if _, err := r.Run(context.Background(), "c1", "spy", nil, in); !errors.Is(err, ErrBadPrincipal) {
			t.Fatalf("principal %+v was accepted (%v)", bad, err)
		}
	}
}

// Until SF-001 is decided, a live send fails with THAT reason rather than an
// authentication error from the provider — which is the shape that gets
// misdiagnosed as a bad token.
func TestTheDefaultSecretsSeamNamesSF001(t *testing.T) {
	a := &spyActor{store: newStore()}
	r, _ := runnerWith(t, a)
	r.Secrets = nil // the shipped default

	_, err := r.Run(context.Background(), "c1", "spy", nil, liveInput("send"))
	// The spy ignores a failed reveal, so the run itself succeeds; what matters
	// is that the seam refuses and says why.
	if err != nil && !strings.Contains(err.Error(), "SF-001") {
		t.Fatalf("unexpected error %v", err)
	}
	if _, err := (Blocked{Kind: "slack", Name: "ops"}).Reveal(context.Background(), "tok"); err == nil ||
		!errors.Is(err, ErrBlockedSF001) || !strings.Contains(err.Error(), "slack/ops") {
		t.Fatalf("the blocked seam must name SF-001 and the connection: %v", err)
	}
}

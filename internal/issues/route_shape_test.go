package issues

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// The SDK posts to `${base}/api/builder/feedback` with NO trailing slash
// (sdk/src/transport.ts:47). chi's Post("/") inside a Route registers the
// trailing-slash pattern, so this asserts the shape the SDK actually uses.
func TestPublicFeedbackPathMatchesWhatTheSDKPosts(t *testing.T) {
	hit := false
	r := chi.NewRouter()
	r.Route("/api/builder/feedback", func(r chi.Router) {
		r.Post("/", func(w http.ResponseWriter, _ *http.Request) { hit = true })
	})
	srv := httptest.NewServer(r)
	defer srv.Close()

	res, err := http.Post(srv.URL+"/api/builder/feedback", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if !hit {
		t.Fatalf("POST /api/builder/feedback did not reach the handler (status %d) — "+
			"the SDK's exact path does not match the registered pattern", res.StatusCode)
	}
}

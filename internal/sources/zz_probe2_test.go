package sources

import "testing"

func TestProbeNonContentTagPairing(t *testing.T) {
	// A page whose <nav> is never closed (extremely common in hand-written HTML).
	page := `<html><body><nav><a href="/">Home</a><article><p>THE WHOLE ARTICLE BODY.</p></article><footer>(c) 2026</footer></body></html>`
	t.Logf("extract+strip -> %q", rssHTMLToText(rssExtractBody(page)))

	// Correctly-closed control.
	ok := `<html><body><nav><a href="/">Home</a></nav><article><p>THE WHOLE ARTICLE BODY.</p></article><footer>(c) 2026</footer></body></html>`
	t.Logf("control       -> %q", rssHTMLToText(rssExtractBody(ok)))
}

package main

import "testing"

// The single-target path is the one every existing deployment is on. It must
// keep producing exactly one frame at exactly the URL it always did.
func TestParseTargetsFallsBackToTheSingularVar(t *testing.T) {
	got, err := parseTargets("", "http://localhost:4000")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].URL != "http://localhost:4000" {
		t.Fatalf("BUILDER_TARGET did not survive: %+v", got)
	}
	if got[0].Origin != "http://localhost:4000" {
		t.Fatalf("origin = %q", got[0].Origin)
	}
}

// Neither set: a working shell, not an error. An operator who has read nothing
// still gets something to look at.
func TestParseTargetsDefaults(t *testing.T) {
	got, err := parseTargets("", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].URL != defaultTarget {
		t.Fatalf("want the default target, got %+v", got)
	}
}

// The operator's own example: one product, three surfaces, three origins.
func TestParseTargetsReadsAList(t *testing.T) {
	got, err := parseTargets(
		"app=https://app.co,auth=https://auth.app.co,dashboard=https://dashboard.app.co", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("got %d targets, want 3", len(got))
	}
	want := []struct{ id, origin string }{
		{"app", "https://app.co"},
		{"auth", "https://auth.app.co"},
		{"dashboard", "https://dashboard.app.co"},
	}
	for i, w := range want {
		if got[i].ID != w.id || got[i].Origin != w.origin {
			t.Fatalf("target %d = {%s %s}, want {%s %s}", i, got[i].ID, got[i].Origin, w.id, w.origin)
		}
	}
}

// BUILDER_TARGETS wins over BUILDER_TARGET — an operator who set both meant
// the list, and silently framing the singular one would look like the list was
// ignored.
func TestParseTargetsListBeatsSingle(t *testing.T) {
	got, err := parseTargets("a=http://localhost:1111", "http://localhost:2222")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].URL != "http://localhost:1111" {
		t.Fatalf("the list did not win: %+v", got)
	}
}

// Newlines as well as commas: the same value is written one way in a shell
// export and another in a compose file or a heredoc.
func TestParseTargetsAcceptsNewlines(t *testing.T) {
	got, err := parseTargets("a=http://localhost:1111\n b=http://localhost:2222 \n", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].ID != "a" || got[1].ID != "b" {
		t.Fatalf("newline-separated list mis-parsed: %+v", got)
	}
}

// A bare URL takes its host as the name, so the shorthand stays usable.
func TestParseTargetsNamesABareURLAfterItsHost(t *testing.T) {
	got, err := parseTargets("https://auth.app.co/login", "")
	if err != nil {
		t.Fatal(err)
	}
	if got[0].Name != "auth.app.co" || got[0].ID != "auth-app-co" {
		t.Fatalf("name/id = %q/%q", got[0].Name, got[0].ID)
	}
	// The path is kept as the entry point; the ORIGIN drops it, because that
	// is what every postMessage targetOrigin is compared against.
	if got[0].URL != "https://auth.app.co/login" || got[0].Origin != "https://auth.app.co" {
		t.Fatalf("url/origin = %q/%q", got[0].URL, got[0].Origin)
	}
}

// The first '=' splits, not the last: a URL's query string is full of them.
func TestParseTargetsSplitsOnTheFirstEquals(t *testing.T) {
	got, err := parseTargets("app=https://app.co/?next=/home", "")
	if err != nil {
		t.Fatal(err)
	}
	if got[0].ID != "app" || got[0].URL != "https://app.co/?next=/home" {
		t.Fatalf("id/url = %q/%q", got[0].ID, got[0].URL)
	}
}

// Two targets that slug to the same id would be indistinguishable to the
// relay, which routes by id — the exact confusion the whole change exists to
// prevent. Refused loudly rather than hosting one of them.
func TestParseTargetsRefusesDuplicateIDs(t *testing.T) {
	if _, err := parseTargets("App=https://a.co,app=https://b.co", ""); err == nil {
		t.Fatal("duplicate ids were accepted")
	}
}

// A typo must not be defaulted away. The shell refuses to serve rather than
// framing localhost:3000 while the operator believes their config took.
func TestParseTargetsRefusesJunk(t *testing.T) {
	for _, bad := range []string{
		"app=notaurl",
		"app=ftp://a.co",
		"app=https://",
		"=https://a.co",
	} {
		if _, err := parseTargets(bad, ""); err == nil {
			t.Fatalf("parseTargets(%q) was accepted", bad)
		}
	}
}

// pickActive resolves ?app=; an unknown id opens on something rather than on
// an error page, because the list is config and config gets renamed.
func TestPickActive(t *testing.T) {
	ts, err := parseTargets("a=http://localhost:1,b=http://localhost:2", "")
	if err != nil {
		t.Fatal(err)
	}
	if got := pickActive(ts, "b"); got != 1 {
		t.Fatalf("pickActive(b) = %d, want 1", got)
	}
	if got := pickActive(ts, "gone"); got != 0 {
		t.Fatalf("an unknown app must fall back to the first, got %d", got)
	}
}

// ?url= restores a frame's place, and ONLY within that frame's own origin.
// Anything else would mean the relay validating a frame's messages against an
// origin the caller chose, which is the whole guarantee gone.
func TestRestoreURLIsConfinedToTheAppsOrigin(t *testing.T) {
	if got, ok := restoreURL("https://auth.app.co", "https://auth.app.co/reset?t=1"); !ok ||
		got != "https://auth.app.co/reset?t=1" {
		t.Fatalf("same-origin restore rejected: %q %v", got, ok)
	}
	for _, bad := range []string{
		"https://evil.co/",             // another origin entirely
		"https://auth.app.co.evil.co/", // a suffix trick
		"http://auth.app.co/",          // right host, wrong scheme
		"https://auth.app.co:8443/",    // right host, wrong port
		"javascript:alert(1)",          // not a fetchable scheme
		"//auth.app.co/x",              // no scheme at all
	} {
		if _, ok := restoreURL("https://auth.app.co", bad); ok {
			t.Fatalf("restoreURL accepted %q", bad)
		}
	}
}

// The configured list is shared by every request and must never be written to.
//
// Regression test for a bug caught in the browser: the handler mutated the
// shared slice, so Active was sticky. After a visit with ?app=alpha and
// another with ?app=auth, BOTH frames rendered active — two products stacked
// on top of each other, two switcher buttons both reading as pressed — and it
// stayed that way until the daemon restarted.
func TestViewForDoesNotMutateTheConfiguredList(t *testing.T) {
	configured, err := parseTargets("alpha=http://localhost:8201,auth=http://localhost:8202", "")
	if err != nil {
		t.Fatal(err)
	}

	first := viewFor(configured, "alpha", "")
	second := viewFor(configured, "auth", "")

	for _, c := range []struct {
		name string
		view []target
		want string
	}{{"first", first, "alpha"}, {"second", second, "auth"}} {
		var actives []string
		for _, a := range c.view {
			if a.Active {
				actives = append(actives, a.ID)
			}
		}
		if len(actives) != 1 || actives[0] != c.want {
			t.Fatalf("%s view has actives %v, want exactly [%s]", c.name, actives, c.want)
		}
	}

	// And the source of truth is untouched, so the third visitor gets a clean list.
	for _, a := range configured {
		if a.Active {
			t.Fatalf("viewFor wrote Active back onto the configured list: %+v", a)
		}
	}
}

// One visitor's ?url= must not rewrite the home URL every later visitor —
// and the liveness probe — reads.
func TestViewForKeepsRestoreOutOfTheConfiguredList(t *testing.T) {
	configured, err := parseTargets("auth=http://localhost:8202", "")
	if err != nil {
		t.Fatal(err)
	}
	v := viewFor(configured, "auth", "http://localhost:8202/deep/page")
	if v[0].URL != "http://localhost:8202/deep/page" {
		t.Fatalf("restore did not apply to the view: %q", v[0].URL)
	}
	if configured[0].URL != "http://localhost:8202" {
		t.Fatalf("restore leaked into the configured list: %q", configured[0].URL)
	}
}

// net/http serves concurrently; the shared slice had no lock. Run with -race.
func TestViewForIsRaceFreeUnderConcurrentRequests(t *testing.T) {
	configured, err := parseTargets("alpha=http://localhost:8201,auth=http://localhost:8202", "")
	if err != nil {
		t.Fatal(err)
	}
	ids := []string{"alpha", "auth"}
	done := make(chan struct{})
	for i := 0; i < 16; i++ {
		go func(i int) {
			defer func() { done <- struct{}{} }()
			for n := 0; n < 200; n++ {
				v := viewFor(configured, ids[(i+n)%2], "")
				count := 0
				for _, a := range v {
					if a.Active {
						count++
					}
				}
				if count != 1 {
					t.Errorf("view has %d active frames, want 1", count)
					return
				}
			}
		}(i)
	}
	for i := 0; i < 16; i++ {
		<-done
	}
}

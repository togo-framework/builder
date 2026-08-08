package issues

import "testing"

// readVerdict decides whether a comment changes the state of an issue, so the
// cases that must NOT count matter more than the ones that must. Every
// negative here is a sentence someone would plausibly write in a discussion.
func TestReadVerdict(t *testing.T) {
	cases := []struct {
		name, body string
		want       verdictKind
	}{
		// Approvals.
		{"bare", "approved", verdictApproved},
		{"with reason", "approved — use the second option", verdictApproved},
		{"comma", "approved, but keep the old endpoint", verdictApproved},
		{"bold", "**approved**", verdictApproved},
		{"capitalised", "Approved.", verdictApproved},
		{"shorthand yes", "yes please", verdictApproved},
		{"shorthand go", "go", verdictApproved},
		{"arabic", "موافق", verdictApproved},

		// Rejections.
		{"bare reject", "rejected", verdictRejected},
		{"reject with reason", "rejected: we are not doing this now", verdictRejected},
		{"no", "no — this duplicates #12", verdictRejected},
		{"arabic reject", "مرفوض", verdictRejected},

		// NOT verdicts. Each of these was the reason for reading only the first
		// word rather than searching the body.
		{"past tense mid-sentence", "I approved that yesterday, but this one is different", verdictNone},
		{"asking about approval", "who approved this?", verdictNone},
		{"reporting a rejection", "the build rejected my push", verdictNone},
		{"negation later", "this is not approved yet", verdictNone},
		{"ordinary comment", "Looks good, shipping tomorrow.", verdictNone},
		{"empty", "", verdictNone},
		{"whitespace", "   \n\t  ", verdictNone},
		{"code fence mentioning approved", "```\nstatus = approved\n```", verdictNone},
		// "approve" appears, but as part of a longer word.
		{"substring", "approvers should look at this", verdictNone},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := readVerdict(c.body); got != c.want {
				t.Errorf("readVerdict(%q) = %v, want %v", c.body, got, c.want)
			}
		})
	}
}

func TestQuoteJSON(t *testing.T) {
	cases := map[string]string{
		`approved`:   `"approved"`,
		`say "hi"`:   `"say \"hi\""`,
		`back\slash`: `"back\\slash"`,
	}
	for in, want := range cases {
		if got := quoteJSON(in); got != want {
			t.Errorf("quoteJSON(%q) = %s, want %s", in, got, want)
		}
	}
}

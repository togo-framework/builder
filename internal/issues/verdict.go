package issues

import (
	"context"
	"database/sql"
	"strings"
	"unicode"
)

// Unblocking an issue by talking to it.
//
// An issue parked as human-only had exactly one way out: find the checkbox and
// untick it. The agent that parked it had asked a question, the operator
// answered in a comment, and nothing happened — the answer sat in the thread
// while the issue stayed unclaimable, which reads as being ignored.
//
// So there is a contract, and it is the same one a person would expect: reply
// `approved` and it goes back in the queue, reply `rejected` and it is closed
// as rejected. Anything else is an ordinary comment.

type verdictKind int

const (
	verdictNone verdictKind = iota
	verdictApproved
	verdictRejected
)

var (
	approveWords = map[string]bool{
		"approved": true, "approve": true, "yes": true, "go": true,
		"ok": true, "okay": true, "ship": true, "proceed": true,
		// Arabic. The board is bilingual and an operator working in Arabic
		// should not have to switch language to answer a yes/no.
		"موافق": true, "نعم": true, "تم": true,
	}
	rejectWords = map[string]bool{
		"rejected": true, "reject": true, "no": true, "decline": true,
		"declined": true, "cancel": true, "drop": true,
		"مرفوض": true, "لا": true, "إلغاء": true,
	}
)

func verdictLabel(v verdictKind) string {
	switch v {
	case verdictApproved:
		return "approved"
	case verdictRejected:
		return "rejected"
	default:
		return ""
	}
}

// quoteJSON renders a string as a JSON string literal. The labels here are
// fixed constants, but the detail column is jsonb and an unquoted value is a
// syntax error rather than a silent one.
func quoteJSON(s string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) + `"`
}

// readVerdict classifies a comment.
//
// Only the FIRST word counts, which is the whole reason this is safe to run on
// every comment. "approved — use the second option" is a verdict; "I approved
// that yesterday, but this is different" is not, because it opens with "I".
// A rule that searched the whole body would turn a discussion of a past
// decision into a new one.
func readVerdict(body string) verdictKind {
	first := strings.TrimLeftFunc(strings.TrimSpace(body), func(r rune) bool {
		// Skip markdown emphasis so **approved** reads the same as approved.
		return r == '*' || r == '_' || r == '>' || r == '#' || r == '`'
	})
	// The first word, stripped of trailing punctuation.
	end := strings.IndexFunc(first, func(r rune) bool {
		return unicode.IsSpace(r) || r == ',' || r == '.' || r == '!' ||
			r == ':' || r == ';' || r == '—' || r == '-' || r == '*'
	})
	if end > 0 {
		first = first[:end]
	}
	word := strings.ToLower(strings.Trim(first, "*_`.,!?:;"))

	switch {
	case approveWords[word]:
		return verdictApproved
	case rejectWords[word]:
		return verdictRejected
	default:
		return verdictNone
	}
}

// applyVerdict resolves a pending decision and/or releases a human-only issue,
// inside the caller's transaction.
//
// Returns the note to post so the transition is never silent — the same lesson
// the triage bug taught: a state change nobody can see is a state change
// nobody can act on.
func applyVerdict(ctx context.Context, tx *sql.Tx, issueID, body string, v verdictKind) (string, error) {
	if v == verdictNone {
		return "", nil
	}

	state := "answered"
	if v == verdictRejected {
		state = "rejected"
	}

	// Answer the pending decision, if there is one. Not every human-only issue
	// has one — triage parks issues too — so a missing decision is normal and
	// not an error.
	var hadDecision bool
	var decisionID string
	err := tx.QueryRowContext(ctx,
		`UPDATE builder_decisions
		    SET state = $1::builder_decision_state,
		        answer_text = $2,
		        answered_at = now()
		  WHERE issue_id = $3 AND state = 'pending'
		 RETURNING id`, state, truncate(body, 4000), issueID).Scan(&decisionID)
	switch {
	case err == nil:
		hadDecision = true
	case err == sql.ErrNoRows:
		// Fine — see above.
	default:
		return "", err
	}

	if v == verdictRejected {
		// 'rejected', not 'done'. A rejected issue that lands in done gets
		// swept into a release as though it shipped.
		if _, err := tx.ExecContext(ctx,
			`UPDATE builder_issues
			    SET status = 'rejected'::builder_issue_status,
			        blocked_on_decision_id = NULL,
			        status_entered_at = now(), updated_at = now()
			  WHERE id = $1`, issueID); err != nil {
			return "", err
		}
		note := "**Rejected** by the operator. This issue is closed and no agent will pick it up."
		if hadDecision {
			note = "**Rejected** by the operator — the open question is closed with it. No agent will pick this up."
		}
		return note, nil
	}

	// Approved: clear the block, drop human-only, and put it back in the queue.
	//
	// attempt_count is reset because the answer is new information. Leaving it
	// where it was means an issue that already burned its attempts is approved
	// and then immediately refused as exhausted.
	res, err := tx.ExecContext(ctx,
		`UPDATE builder_issues
		    SET human_only = false,
		        blocked_on_decision_id = NULL,
		        attempt_count = 0,
		        status = CASE WHEN status IN ('blocked','triage')
		                      THEN 'ready'::builder_issue_status ELSE status END,
		        status_entered_at = now(), updated_at = now()
		  WHERE id = $1`, issueID)
	if err != nil {
		return "", err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return "", nil
	}

	if hadDecision {
		return "**Approved.** The open question is answered and the issue is back in the queue — an agent can claim it now.", nil
	}
	return "**Approved.** Human-only is off and the issue is back in the queue — an agent can claim it now.", nil
}

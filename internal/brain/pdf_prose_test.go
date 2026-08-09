package brain

import "testing"

// This test exists because an Arabic PDF was reported as having "no readable
// text layer" when its text had in fact been extracted correctly — the prose
// check counted ASCII letters only, so every non-Latin script failed it.
func TestProseIsRecognisedInAnyScript(t *testing.T) {
	prose := map[string]string{
		"arabic":  "تقييم تصاعد التوترات بين الولايات المتحدة وإيران وإعادة التقييم الاستراتيجي",
		"english": "The retention window for audit events is ninety days after collection",
		"russian": "Политика хранения журналов аудита составляет девяносто дней после сбора",
		"chinese": "保留政策 审计事件 保存九十天 之后 系统 自动 清除 这些 记录",
		"greek":   "Η πολιτική διατήρησης των αρχείων ελέγχου είναι ενενήντα ημέρες μετά",
		"hebrew":  "מדיניות השמירה של אירועי ביקורת היא תשעים ימים לאחר האיסוף שלהם",
	}
	for name, s := range prose {
		if !looksLikeProse(s) {
			t.Errorf("%s prose was rejected as unreadable: %q", name, s)
		}
	}
}

// The check still has to earn its place: it exists to catch a font with no
// Unicode mapping, which decodes to symbol soup rather than to language.
func TestGarbageIsStillRejected(t *testing.T) {
	garbage := map[string]string{
		"symbol soup": "   ",
		"digits":      "1 22 333 4444 55555 666666 7777777 88888888",
		"punctuation": "... --- ,,, ;;; ::: ((( ))) [[[ ]]]",
		"too short":   "a b c d e f g h i j k",
		"empty":       "",
	}
	for name, s := range garbage {
		if looksLikeProse(s) {
			t.Errorf("%s was accepted as prose: %q", name, s)
		}
	}
}

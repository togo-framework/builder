package setup

import (
	"fmt"
	"strings"
)

// RenderEnvExample generates .env.example from the registry.
//
// Generated rather than hand-written because the hand-written one documented 4
// of 51 variables. Not through carelessness — nothing connected the file to the
// code, so it recorded whatever was true on the day somebody last remembered
// it. A generated file plus a drift gate records what is true today, every day.
//
// Secrets are named but never given a value, not even a fake one: a plausible
// placeholder in a committed file is how a fake key ends up pasted into
// production by someone who assumed it was real.
func RenderEnvExample(r Registry) string {
	var b strings.Builder

	b.WriteString("# ---------------------------------------------------------------------------\n")
	b.WriteString("# GENERATED FILE — do not edit by hand.\n")
	b.WriteString("#\n")
	b.WriteString("# Produced from internal/setup/capabilities.go, which is the single place an\n")
	b.WriteString("# environment variable is declared. Editing this file directly will be\n")
	b.WriteString("# reverted by the next generate, and CI fails if the two disagree.\n")
	b.WriteString("#\n")
	b.WriteString("# To add a variable: declare a Capability. That one declaration produces the\n")
	b.WriteString("# setup step, this line, the docs row and the preflight probe.\n")
	b.WriteString("# ---------------------------------------------------------------------------\n")

	for _, g := range GroupOrder {
		caps := r.InGroup(g)
		if len(caps) == 0 {
			continue
		}
		b.WriteString("\n\n# ===========================================================================\n")
		b.WriteString("# " + strings.ToUpper(string(g)) + "\n")
		if g == GroupDanger {
			b.WriteString("#\n")
			b.WriteString("# Each of these hands out real capability over this host. They default off,\n")
			b.WriteString("# they require an explicit acknowledgement off localhost, and none of them\n")
			b.WriteString("# should be set because a guide told you to unlock something else.\n")
		}
		b.WriteString("# ===========================================================================\n")

		for _, c := range caps {
			b.WriteString("\n")
			for _, line := range wrapComment(c.Title.EN + " — " + c.Help.EN) {
				b.WriteString("# " + line + "\n")
			}
			if c.Danger == Dangerous {
				b.WriteString("#\n# DANGEROUS. Read the line above again before setting this.\n")
			}
			if len(c.Choices) > 0 {
				vals := make([]string, 0, len(c.Choices))
				for _, ch := range c.Choices {
					vals = append(vals, ch.Value)
				}
				b.WriteString("# one of: " + strings.Join(vals, " | ") + "\n")
			}
			if c.Secret {
				b.WriteString("# stored in the vault, not here\n")
			}
			switch {
			case c.Kind == KindSecret:
				// Named, never valued.
				b.WriteString(fmt.Sprintf("# %s=\n", c.Env))
			case c.Default != "":
				b.WriteString(fmt.Sprintf("%s=%s\n", c.Env, c.Default))
			case c.Placeholder != "":
				b.WriteString(fmt.Sprintf("# %s=%s\n", c.Env, c.Placeholder))
			default:
				b.WriteString(fmt.Sprintf("# %s=\n", c.Env))
			}
		}
	}
	b.WriteString("\n")
	return b.String()
}

func wrapComment(s string) []string {
	const width = 74
	words := strings.Fields(s)
	if len(words) == 0 {
		return nil
	}
	var out []string
	line := words[0]
	for _, w := range words[1:] {
		if len(line)+1+len(w) > width {
			out = append(out, line)
			line = w
			continue
		}
		line += " " + w
	}
	return append(out, line)
}

package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strconv"
	"text/tabwriter"

	"github.com/togo-framework/builder/customapps"
)

const appUsage = `usage: togo-builder app <new|list> …

  app new <slug>   scaffold a custom app
      --dir D        the apps directory (default: apps, or $BUILDER_APPS_DIR)
      --title T      English title    (default: the slug, title-cased)
      --title-ar T   Arabic title     (default: the English one — replace it)
      --desc D       English description
      --desc-ar D    Arabic description
      --icon I       lucide glyph name (default: app)
      --color C      #rrggbb tile colour (default: derived from the slug)
      --order N      launcher position; built-ins occupy 0..99 (default: 100)
      --go           also write a compiled-app backend skeleton
      --module M     the host module path, for the --go import line
      --force        overwrite an existing directory

  app list         what would be discovered, and what was rejected
      --dir D        the apps directory
`

func appCmd(args []string) int {
	if len(args) == 0 {
		fmt.Fprint(os.Stderr, appUsage)
		return 2
	}
	switch args[0] {
	case "new":
		return appNew(args[1:])
	case "list":
		return appList(args[1:])
	default:
		fmt.Fprintf(os.Stderr, "unknown app verb %q\n\n%s", args[0], appUsage)
		return 2
	}
}

// appsDir resolves the apps directory the same way the provider does, so the
// CLI cannot scaffold into a directory the running builder never reads.
func appsDir(flag string) string {
	if flag != "" {
		return flag
	}
	if env := os.Getenv("BUILDER_APPS_DIR"); env != "" {
		return env
	}
	return "apps"
}

func appNew(args []string) int {
	if len(args) == 0 || args[0] == "" || args[0][0] == '-' {
		fmt.Fprint(os.Stderr, appUsage)
		return 2
	}

	opts := customapps.ScaffoldOptions{Slug: args[0]}
	var dirFlag string
	for i := 1; i < len(args); i++ {
		next := func() string {
			if i+1 < len(args) {
				i++
				return args[i]
			}
			return ""
		}
		switch args[i] {
		case "--dir":
			dirFlag = next()
		case "--title":
			opts.TitleEN = next()
		case "--title-ar":
			opts.TitleAR = next()
		case "--desc":
			opts.DescEN = next()
		case "--desc-ar":
			opts.DescAR = next()
		case "--icon":
			opts.Icon = next()
		case "--color":
			opts.Color = next()
		case "--order":
			n, err := strconv.Atoi(next())
			if err != nil {
				fmt.Fprintln(os.Stderr, "--order must be a number")
				return 2
			}
			opts.Order = n
		case "--module":
			opts.GoModule = next()
		case "--go":
			opts.Go = true
		case "--force":
			opts.Force = true
		default:
			fmt.Fprintf(os.Stderr, "unknown flag %q\n\n%s", args[i], appUsage)
			return 2
		}
	}
	opts.Root = appsDir(dirFlag)

	res, err := customapps.Scaffold(opts)
	if err != nil {
		fmt.Fprintln(os.Stderr, "app new:", err)
		return 1
	}

	fmt.Printf("Created %s\n", res.Dir)
	for _, f := range res.Files {
		fmt.Printf("  %s\n", f)
	}
	fmt.Println()
	fmt.Println("It is already installed — nothing in builder names it, and no source was edited.")
	fmt.Println()
	fmt.Println("Next:")
	if res.GoImport != "" {
		fmt.Printf("  add %s to internal/plugins/local.go   # the compiled half\n", res.GoImport)
		fmt.Println("  restart the API")
	} else {
		fmt.Println("  restart the API, or POST /api/builder/apps/_reload to rescan")
	}
	fmt.Printf("  open /apps/%s, or press the feedback button and pick %q\n",
		res.Manifest.Slug, res.Manifest.Title.EN)
	fmt.Println()
	fmt.Println("If the tile does not appear: GET /api/builder/apps/_health names the app and says why.")
	return 0
}

func appList(args []string) int {
	var dirFlag string
	for i := 0; i < len(args); i++ {
		if args[i] == "--dir" && i+1 < len(args) {
			i++
			dirFlag = args[i]
		}
	}
	root := appsDir(dirFlag)

	// The same scan the provider runs, against the same directory — so this
	// reports what the builder would load, not what the filesystem contains.
	svc := customapps.New(nil, quietLogger(), root)
	svc.Scan(context.Background())

	list := svc.List()
	if len(list) == 0 {
		fmt.Printf("no custom apps in %s\n", root)
	} else {
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "SLUG\tTITLE\tSOURCE\tORDER\tAPI\tPATH")
		for _, m := range list {
			api := "-"
			if m.HasAPI {
				api = "yes"
			}
			fmt.Fprintf(w, "%s\t%s\t%s\t%d\t%s\t%s\n",
				m.Slug, m.Title.EN, m.Source, m.Order, api, m.Path)
		}
		_ = w.Flush()
	}

	// Printed on stderr and after the table, because a rejected app is the
	// question this command is usually being asked to answer.
	problems := svc.Problems()
	if len(problems) > 0 {
		fmt.Fprintf(os.Stderr, "\n%d rejected:\n", len(problems))
		for _, p := range problems {
			fmt.Fprintf(os.Stderr, "  %s\n", p)
		}
		return 1
	}
	return 0
}

// quietLogger keeps the scan's structured boot logging out of a CLI listing.
// The failures it would have reported are read back from Problems() instead, so
// nothing is lost — it is reformatted for a person rather than a log pipeline.
func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

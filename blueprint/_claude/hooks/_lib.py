"""_lib.py — the shared reading room for every guard in .claude/hooks/.

Guards are thin bash wrappers around one python call. Everything they have in
common lives here: reading .claude/hook-config.json, reading .claude/autonomy.yaml,
turning a gitignore-style glob into a regex, and normalising a path to something
repo-relative. Four hooks used to carry four slightly different copies of the
glob matcher, and they had already begun to disagree.

THE CONTRACT, inherited by everything that imports this file:
    NOTHING here raises. Every loader returns an empty container on failure and
    every accessor returns its default. A guard must never block the operator
    because a config file was missing, malformed, or half-written by a wizard
    that crashed. Permissiveness is the failure mode.

Imported by the heredoc python inside each guard with:

    import sys, os
    sys.path.insert(0, sys.argv[1])          # the hooks dir, passed by the caller
    try:
        from _lib import load_json, load_yaml, get, as_list, g2re, relpath
    except Exception:
        sys.exit(0)                          # no lib -> no verdict -> allow
"""

import json
import os
import re

__all__ = [
    "load_json", "load_yaml", "get", "as_list", "as_bool",
    "g2re", "relpath", "matches_any", "first_match", "ere_to_py",
]


# --------------------------------------------------------------------------
# loaders
# --------------------------------------------------------------------------

def load_json(path):
    """Read a JSON file. Returns {} on any failure — including the important
    one: an un-rendered blueprint whose {{tokens}} make it invalid JSON."""
    try:
        with open(path, "r", errors="replace") as fh:
            return json.load(fh)
    except Exception:
        return {}


def _scalar(v):
    """A YAML scalar: strip an inline # comment, then surrounding quotes.
    A quoted value keeps its hashes; an unquoted one loses everything from the
    first ' #'."""
    v = v.strip()
    if v[:1] in ("\"", "'"):
        q = v[0]
        end = v.find(q, 1)
        return v[1:end] if end > 0 else v[1:]
    i = v.find(" #")
    if i >= 0:
        v = v[:i]
    if v.startswith("#"):
        return ""
    return v.strip()


def _parse_yaml(lines, i, indent):
    """Indentation-recursive mini-parser: nested maps, lists of scalars, and
    scalars. Deliberately NOT a YAML implementation — no anchors, no flow
    collections, no multi-line strings. autonomy.yaml is written by the wizard
    and read by machines; if it ever needs real YAML, that is a signal the file
    has grown past what an operator can hold in their head."""
    result = None
    while i < len(lines):
        raw = lines[i]
        if not raw.strip() or raw.lstrip().startswith("#"):
            i += 1
            continue
        ind = len(raw) - len(raw.lstrip(" "))
        if ind < indent:
            break
        s = raw.strip()

        if s.startswith("- "):
            if result is None:
                result = []
            if not isinstance(result, list):
                break
            result.append(_scalar(s[2:]))
            i += 1
            continue

        if ":" in s:
            k, _, v = s.partition(":")
            k = k.strip()
            v = _scalar(v)
            if result is None:
                result = {}
            if not isinstance(result, dict):
                break
            if v == "":
                child, i = _parse_yaml(lines, i + 1, ind + 1)
                result[k] = child if child is not None else ""
            else:
                result[k] = v
                i += 1
            continue

        i += 1
    return result, i


def load_yaml(path):
    """Read autonomy.yaml (or any file of the same simple shape). {} on failure."""
    try:
        with open(path, "r", errors="replace") as fh:
            lines = fh.read().splitlines()
    except Exception:
        return {}
    try:
        out, _ = _parse_yaml(lines, 0, 0)
    except Exception:
        return {}
    return out if isinstance(out, dict) else {}


# --------------------------------------------------------------------------
# accessors
# --------------------------------------------------------------------------

def get(d, dotted, default=None):
    """get(cfg, "database.migration_runner.command", "togo migrate")"""
    cur = d
    for k in str(dotted).split("."):
        if not isinstance(cur, dict) or k not in cur:
            return default
        cur = cur[k]
    return default if cur is None else cur


def as_list(v):
    """Anything -> list of strings. An un-rendered {{token}} yields []; a
    template placeholder is not data, and treating it as a one-item list is how
    a guard ends up matching the literal string '{{protected_db_hosts}}'."""
    if v is None:
        return []
    if isinstance(v, str):
        s = v.strip()
        if not s or (s.startswith("{{") and s.endswith("}}")):
            return []
        return [s]
    if isinstance(v, dict):
        return [str(x) for x in v.keys()]
    if isinstance(v, (list, tuple)):
        out = []
        for x in v:
            if x is None:
                continue
            s = str(x).strip()
            if not s or (s.startswith("{{") and s.endswith("}}")):
                continue
            out.append(s)
        return out
    return [str(v)]


def as_bool(v, default=False):
    if isinstance(v, bool):
        return v
    if v is None:
        return default
    s = str(v).strip().lower()
    if s in ("true", "yes", "on", "1", "required", "forbidden"):
        return s != "0" and s not in ("false", "no", "off")
    if s in ("false", "no", "off", "0", ""):
        return False
    return default


# --------------------------------------------------------------------------
# paths and patterns
# --------------------------------------------------------------------------

def g2re(pattern):
    """gitignore-style glob -> compiled regex anchored at both ends.
      **/  -> any number of leading directories
      **   -> anything, including /
      *    -> anything except /
      ?    -> one character except /
    A pattern ending in / matches the directory and everything under it."""
    p = str(pattern)
    if p.endswith("/"):
        p += "**"
    out, i = "", 0
    while i < len(p):
        if p.startswith("**/", i):
            out += "(?:.*/)?"
            i += 3
            continue
        if p.startswith("**", i):
            out += ".*"
            i += 2
            continue
        c = p[i]
        if c == "*":
            out += "[^/]*"
        elif c == "?":
            out += "[^/]"
        elif c in ".^$+(){}[]|\\":
            out += "\\" + c
        else:
            out += c
        i += 1
    try:
        return re.compile("^" + out + "$")
    except Exception:
        return re.compile(r"^(?!)$")          # matches nothing


def relpath(p, root=None):
    """Absolute or relative path -> repo-relative, forward-slashed, no leading
    './' or '/'. NOT str.lstrip('./') — that eats the leading dot of '.env' and
    '.claude/', which is exactly the set of paths the guards care most about."""
    p = str(p or "").strip()
    if not p:
        return ""
    root = root if root is not None else (os.environ.get("CLAUDE_PROJECT_DIR") or "")
    p = p.replace("\\", "/")
    if root:
        root = root.replace("\\", "/").rstrip("/")
        if p == root:
            return ""
        if p.startswith(root + "/"):
            p = p[len(root) + 1:]
    while p.startswith("./"):
        p = p[2:]
    return p.lstrip("/")


def matches_any(path, patterns):
    """True if the repo-relative path matches any glob in patterns."""
    n = relpath(path)
    if not n:
        return False
    for pat in as_list(patterns):
        if g2re(pat).match(n):
            return True
    return False


def ere_to_py(pattern):
    """The config files carry POSIX ERE (they are also read by grep and by CI
    shell). Translate the classes python's re does not know. Anything that
    still fails to compile is dropped by the caller rather than raised."""
    return (str(pattern)
            .replace("[[:space:]]", r"\s")
            .replace("[[:alpha:]]", "[A-Za-z]")
            .replace("[[:alnum:]]", "[A-Za-z0-9]")
            .replace("[[:digit:]]", "[0-9]")
            .replace("[[:upper:]]", "[A-Z]")
            .replace("[[:lower:]]", "[a-z]"))


def first_match(text, patterns, flags=0):
    """Return (pattern, match) for the first ERE pattern that hits, else (None, None).
    A pattern that will not compile is skipped, never raised."""
    for pat in as_list(patterns):
        try:
            m = re.search(ere_to_py(pat), text, flags)
        except Exception:
            continue
        if m:
            return pat, m
    return None, None

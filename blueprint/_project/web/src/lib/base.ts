// Where this app is mounted.
//
// Two builds share these routes, and they do NOT live at the same place:
//
//   - A scaffolded product serves them at the root of its own site. BASE is "".
//   - The builder plugin serves them under /builder, inside somebody else's
//     application, because /issues and /agents are paths a host product may
//     already own and its router would answer first.
//
// Vite decides which by its `base` option and hands it over as
// import.meta.env.BASE_URL ("/" for a root build, "/builder/" for the plugin's).
// Reading it here rather than hard-coding a prefix is what keeps the two in
// step: the asset URLs stamped into index.html come from the same value, so the
// router and the bundle can never disagree about where the app is.
//
// Normalised WITHOUT the trailing slash so `BASE + "/issues"` is always right
// and never "//issues".
export const BASE = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");

/**
 * appPath prefixes an in-app route with the mount point.
 *
 * For anything that leaves the router — window.location, an <a href>, a
 * window.open — the router's own basepath does not apply, and a bare "/issues"
 * would leave the app entirely. Those are exactly the calls that must go
 * through here.
 *
 * Router <Link> and navigate() do NOT need this: they already prepend the
 * basepath, and passing an already-prefixed path to them would double it.
 */
export function appPath(path: string): string {
  return BASE + (path.startsWith("/") ? path : "/" + path);
}

/**
 * routePath strips the mount point back off a real pathname.
 *
 * The inverse of appPath, for the code that compares window.location.pathname
 * against route paths. Without it, "/builder/issues" matches none of the routes
 * the comparison is written against and the check silently fails.
 */
export function routePath(pathname: string): string {
  if (BASE && (pathname === BASE || pathname.startsWith(BASE + "/"))) {
    return pathname.slice(BASE.length) || "/";
  }
  return pathname;
}

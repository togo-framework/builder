// togo auth client — talks to the auth plugin's /api/auth/* endpoints.
// Session is an HttpOnly cookie; CSRF uses the double-submit token.
import { API } from "./api";

async function csrf(): Promise<string> {
  const res = await fetch(`${API}/api/auth/csrf`, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  return data.csrf_token ?? "";
}

async function post<T = any>(path: string, body?: unknown): Promise<T> {
  const token = await csrf();
  const res = await fetch(`${API}/api/auth/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || `request failed (${res.status})`);
  return data as T;
}

export interface Me { email: string; roles?: string[]; permissions?: string[]; [k: string]: unknown }

export const auth = {
  login: (email: string, password: string) => post("login", { email, password }),
  register: (email: string, password: string) => post("register", { email, password }),
  logout: () => post("logout"),
  me: async (): Promise<Me | null> => {
    // A network failure is NOT "signed out" — it is "unknown". Letting the
    // rejection escape poisons the session cache (see sessionMe below), so it
    // is converted to null here and the guard sends the visitor to /login,
    // where the server being unreachable is at least visible.
    // Bounded. A rejection can be caught, but a fetch that never settles cannot:
    // it would leave the cached promise below pending forever, and the route
    // guard awaiting it shows the loading screen with no error and no recovery.
    // An API restarting under the browser is exactly that case.
    const res = await fetch(`${API}/api/auth/me`, {
      credentials: "include",
      signal: AbortSignal.timeout(6000),
    }).catch(() => null);
    if (!res || !res.ok) return null;
    return res.json().catch(() => null);
  },
  methods: async (): Promise<{ name: string; label: string; type: string; url: string }[]> => {
    const res = await fetch(`${API}/api/auth/methods`, { credentials: "include" }).catch(() => null);
    if (!res || !res.ok) return [];
    const d = await res.json().catch(() => ({ methods: [] }));
    return d.methods ?? [];
  },
  requestOtp: (email: string, purpose = "reset") => post("otp", { email, purpose }),
  verifyOtp: (email: string, code: string, purpose = "reset") => post("otp/verify", { email, code, purpose }),
};

// Session cache so the router's beforeLoad guards resolve /me once per navigation
// pass instead of re-fetching on every route. Clear it after login/logout/register.
let _meCache: Promise<Me | null> | null = null;
export function sessionMe(force = false): Promise<Me | null> {
  if (force || !_meCache) {
    // Evict on failure. Caching the PROMISE (not the value) is what makes the
    // guard cheap, but it also means a rejected promise would be handed to
    // every later navigation forever: with the API briefly down, every in-app
    // link stopped working and stayed broken after the API came back, because
    // only a full page reload could clear this module variable.
    const inflight = auth.me();
    _meCache = inflight;
    inflight.catch(() => {
      if (_meCache === inflight) _meCache = null;
    });
  }
  return _meCache;
}
export function clearSession() { _meCache = null; }

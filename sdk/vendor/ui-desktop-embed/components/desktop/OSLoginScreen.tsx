'use client'

// OSLoginScreen — a real desktop-OS login/lock screen (Windows/macOS/Linux
// style): full-bleed wallpaper (image over gradient), a live ticking clock with
// a greeting, and a centered frosted-glass card asking for a username +
// password TOGETHER (single screen — not a corporate email-first wizard). It
// talks to togo auth through the provided `authClient` (login / optional
// one-click devLogin).
//
// Pass a `lockedUser` to switch to the macOS-style "click your avatar, enter
// your credentials" unlock flow (reuses the existing LockScreen /
// PasswordLockScreen components).

import * as React from "react";
import { ShieldCheck, Loader2, ArrowRight, Power, RotateCcw, Moon } from "lucide-react";
import { wallpaperCss } from "../../ui-core";
import { Input } from "../../ui-core";
import { Label } from "../../ui-core";
import { Button } from "../../ui-core";
import {
  PasswordInput,
  LockScreen,
  type LockScreenUser,
  PasswordLockScreen,
  type PasswordLockScreenUser,
  type UnlockCredentials,
  type AuthClient,
} from "../../ui-core";
import { cn } from "../../ui-core";

/** Minimal brand shape for the login crest (name may be bilingual). */
export interface OSLoginBrand {
  name?: string | { en: string; ar: string };
  tagline?: { en: string; ar: string };
  icon?: React.ReactNode | null;
}

export interface OSLoginScreenProps {
  /** Wallpaper id from `theme/wallpapers.ts` (defaults to "aurora"). */
  wallpaper?: string;
  /**
   * Optional background image URL, layered ON TOP of the gradient wallpaper
   * (cover/center). If it fails to load, the gradient shows through — so the
   * screen never ends up blank.
   */
  backgroundImage?: string;
  language?: "en" | "ar";
  brand?: OSLoginBrand;
  className?: string;

  // ── Sign-in form (username + password) ───────────────────────────────────
  authClient?: AuthClient;
  onSuccess?: () => void;
  /** Optional "Create account" affordance. */
  onRegister?: () => void;

  // ── Locked-session flow (avatar + PIN or avatar + password) ──────────────
  /** When set, renders LockScreen/PasswordLockScreen instead of the sign-in form. */
  lockedUser?: (LockScreenUser | PasswordLockScreenUser) & { usePassword?: boolean };
  onUnlockPin?: (pin: string) => Promise<void>;
  onUnlockPassword?: (creds: UnlockCredentials) => Promise<void>;
  onSignOut?: () => void;
  onForceLogout?: () => void;
  hasTOTP?: boolean;
}

function brandName(brand: OSLoginBrand | undefined, ar: boolean): string {
  const n = brand?.name;
  if (!n) return "togo OS";
  if (typeof n === "string") return n;
  return (ar ? n.ar || n.en : n.en || n.ar) ?? "togo OS";
}

function greeting(hour: number, ar: boolean): string {
  if (hour < 12) return ar ? "صباح الخير" : "Good morning";
  if (hour < 18) return ar ? "مساء الخير" : "Good afternoon";
  return ar ? "مساء الخير" : "Good evening";
}

// LiveClock — a real ticking clock (updates every second), isolated in its own
// component so only it re-renders each tick (the sign-in form is untouched).
// Big time with a blinking separator + live seconds, a time-of-day greeting, and
// the full date — the signature "lock screen" element.
function LiveClock({ ar }: { ar: boolean }) {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <div className="h-[136px]" aria-hidden="true" />;

  const locale = ar ? "ar" : "en-US";
  const hh = now.getHours();
  const h12 = ((hh + 11) % 12) + 1;
  const mm = now.getMinutes();
  const ss = now.getSeconds();
  const ampm = hh < 12 ? "AM" : "PM";
  const pad = (n: number) => String(n).padStart(2, "0");
  const blink = ss % 2 === 0; // blink the separator each second
  const dateStr = now.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex flex-col items-center text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.55)]">
      <div className="mb-1 text-sm font-medium uppercase tracking-[0.2em] text-white/70">
        {greeting(hh, ar)}
      </div>
      <div className="flex items-start font-semibold tabular-nums leading-none tracking-tight" aria-live="off">
        <span className="text-[5.5rem]">{ar ? pad(hh) : h12}</span>
        <span className={cn("text-[5.5rem] transition-opacity duration-200", blink ? "opacity-100" : "opacity-25")}>:</span>
        <span className="text-[5.5rem]">{pad(mm)}</span>
        <span className="ms-2 mt-3 flex flex-col items-start gap-1">
          <span className="rounded bg-white/15 px-1.5 py-0.5 text-lg tabular-nums">{pad(ss)}</span>
          {!ar && <span className="ps-0.5 text-xs font-medium tracking-widest text-white/70">{ampm}</span>}
        </span>
      </div>
      <div className="mt-2 text-lg font-medium capitalize text-white/85">{dateStr}</div>
    </div>
  );
}

export function OSLoginScreen({
  wallpaper = "aurora",
  backgroundImage,
  language = "en",
  brand,
  className,
  authClient,
  onSuccess,
  onRegister,
  lockedUser,
  onUnlockPin,
  onUnlockPassword,
  onSignOut,
  onForceLogout,
  hasTOTP,
}: OSLoginScreenProps) {
  const ar = language === "ar";
  const dir = ar ? "rtl" : "ltr";
  const gradient = wallpaperCss(wallpaper);
  // Image layered over the gradient (image wins where it loads; gradient shows
  // through if the image 404s or is offline — never a blank screen).
  const background = backgroundImage
    ? `url("${backgroundImage}") center / cover no-repeat, ${gradient}`
    : gradient;

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [devBusy, setDevBusy] = React.useState(false);

  // ── Locked-session flow: reuse the existing lock-screen components ──────────
  if (lockedUser) {
    return (
      <div className={cn("fixed inset-0 flex items-center justify-center", className)} style={{ background }} dir={dir}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
        <div className="relative z-10">
          {lockedUser.usePassword && onUnlockPassword ? (
            <PasswordLockScreen
              user={lockedUser}
              onUnlock={onUnlockPassword}
              onSignOut={onSignOut ?? (() => {})}
              onForceLogout={onForceLogout}
              language={language}
              hasTOTP={hasTOTP}
            />
          ) : (
            <LockScreen
              user={lockedUser}
              onUnlock={onUnlockPin ?? (async () => {})}
              onSignOut={onSignOut ?? (() => {})}
              language={language}
            />
          )}
        </div>
      </div>
    );
  }

  const crest = brand && "icon" in brand && brand.icon !== undefined
    ? brand.icon
    : <ShieldCheck className="h-8 w-8" strokeWidth={1.75} />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!authClient) return;
    setBusy(true);
    setError("");
    try {
      const res = await authClient.login(email.trim(), password);
      if (res.challenge === "none") onSuccess?.();
      else setError(ar ? "هذا الحساب يتطلب تحققاً إضافياً." : "This account requires an extra verification step.");
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "";
      setError(msg || (ar ? "البريد الإلكتروني أو كلمة المرور غير صحيحة." : "Incorrect email or password."));
    } finally {
      setBusy(false);
    }
  }

  async function devLogin() {
    if (!authClient?.devLogin) return;
    setDevBusy(true);
    setError("");
    try {
      await authClient.devLogin();
      onSuccess?.();
    } catch {
      setError(ar ? "تعذّر الدخول كمطوّر." : "Dev login failed.");
    } finally {
      setDevBusy(false);
    }
  }

  return (
    <div
      className={cn("fixed inset-0 flex flex-col items-center justify-center overflow-hidden", className)}
      style={{ background }}
      dir={dir}
    >
      {/* Legibility scrim + subtle vignette over the wallpaper image. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/15 to-black/60" aria-hidden="true" />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 80% at 50% 30%, transparent 40%, rgba(0,0,0,0.45) 100%)" }}
        aria-hidden="true"
      />

      {/* Centered column: live clock + sign-in card. */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8 px-6">
        <LiveClock ar={ar} />

        <div className="w-full rounded-3xl border border-white/20 bg-white/10 p-7 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
          <div className="flex flex-col items-center gap-3 text-center text-white">
            <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full border border-white/30 bg-gradient-to-br from-white/25 to-white/5 text-white shadow-inner ring-1 ring-white/10">
              {crest}
            </div>
            <div>
              <div className="text-lg font-semibold">{brandName(brand, ar)}</div>
              {brand?.tagline && (
                <div className="text-sm text-white/70">{ar ? brand.tagline.ar : brand.tagline.en}</div>
              )}
            </div>
          </div>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {error && (
              <div role="alert" className="rounded-lg border border-red-300/40 bg-red-500/20 px-3 py-2 text-sm text-white">
                {error}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="os-login-email" className="text-sm font-medium text-white/90">
                {ar ? "اسم المستخدم أو البريد" : "Username or email"}
              </Label>
              <Input
                id="os-login-email"
                type="email"
                dir="ltr"
                autoComplete="username"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                required
                autoFocus
                className="border-white/25 bg-white/10 text-white placeholder:text-white/50 focus-visible:ring-white/40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="os-login-password" className="text-sm font-medium text-white/90">
                {ar ? "كلمة المرور" : "Password"}
              </Label>
              <PasswordInput
                id="os-login-password"
                language={language}
                autoComplete="current-password"
                placeholder={ar ? "أدخل كلمة المرور" : "Enter your password"}
                value={password}
                onChange={(e) => setPassword((e as React.ChangeEvent<HTMLInputElement>).target.value)}
                disabled={busy}
                required
                className="border-white/25 bg-white/10 text-white placeholder:text-white/50 focus-visible:ring-white/40"
              />
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="w-full gap-2 bg-white font-semibold text-slate-900 shadow-lg transition hover:bg-white/90"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4 rtl:rotate-180" />}
              {busy ? (ar ? "جارٍ تسجيل الدخول…" : "Signing in…") : (ar ? "تسجيل الدخول" : "Sign in")}
            </Button>

            {authClient?.devLogin && (
              <Button
                type="button"
                variant="outline"
                onClick={devLogin}
                disabled={devBusy}
                className="w-full gap-2 border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                {devBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {ar ? "الدخول كمطوّر" : "Continue as developer"}
              </Button>
            )}
          </form>

          {onRegister && (
            <p className="mt-5 text-center text-sm text-white/70">
              {ar ? "ليس لديك حساب؟ " : "No account? "}
              <button type="button" onClick={onRegister} className="font-medium text-white underline-offset-4 hover:underline">
                {ar ? "أنشئ واحداً" : "Create one"}
              </button>
            </p>
          )}
        </div>
      </div>

      {/* OS-style power controls (decorative) — bottom center, like a real login. */}
      <div className="absolute inset-x-0 bottom-7 z-10 flex items-center justify-center gap-5" aria-hidden="true">
        {[Moon, RotateCcw, Power].map((Icon, i) => (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/70 backdrop-blur-md transition hover:bg-white/20 hover:text-white"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

OSLoginScreen.displayName = "OSLoginScreen";

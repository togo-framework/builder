import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn, useT,
} from "@togo-framework/ui";
import { Check, KeyRound, Languages, Mail, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { auth, clearSession, sessionMe, type Me } from "../lib/auth";
import { useSetupStrings } from "../lib/i18n.setup";
import { Field, FormFooter, PageShell, Section, Shimmer } from "../components/page-shell";
import { ConfirmAction } from "../components/ui/confirm-action";

/**
 * profile — quiet by design.
 *
 * The page shows only what the app can actually honour, which is the whole
 * point of the redesign. The previous version rendered the kit's ProfileView
 * with `sessions={[]}` and `twoFactorEnabled={false}` and no callbacks, so an
 * operator was shown a Security section with a two-factor toggle that changed
 * nothing and a Sessions list that was empty because nothing feeds it — not
 * because there are no sessions. A settings screen whose controls do not
 * settle anything is worse than a short one; it teaches the operator that
 * this app's switches are decorative. It also centred its own column
 * (`mx-auto max-w-5xl`), which is exactly the per-page centring that made
 * headings jump between routes.
 *
 * So: three sections, each backed by something real.
 *
 *   Account      read-only, and says WHY it is read-only. Identity comes from
 *                the sign-in; there is no profile-edit endpoint to call, and a
 *                Save button with nowhere to post is a lie in button form.
 *   Preferences  a real form with a real save. Language is deliberately NOT
 *                applied on selection: flipping the entire layout to RTL the
 *                instant a dropdown is touched is disorienting, and an
 *                explicit save is what makes the dirty state, the undo and the
 *                confirmation legible.
 *   Security     the one action here with a side effect, so it asks first.
 */

// Add a language here to offer it across the app (it also needs strings in the
// kit's LanguageProvider). Each option is written IN its own language — an
// operator who cannot read the current UI must still recognise their own.
const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
] as const;

type Lang = (typeof LANGUAGES)[number]["code"];

export function Profile() {
  const nav = useNavigate();
  const { S, language } = useSetupStrings();
  const { setLanguage } = useT();
  const [me, setMe] = useState<Me | null>(null);

  // The pending choice. Separate from the live language on purpose: this is
  // what makes "save" mean something and "undo" possible.
  const [pendingLang, setPendingLang] = useState<Lang>(language);
  const [savedFlash, setSavedFlash] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [err, setErr] = useState("");
  const flash = useRef<number | null>(null);

  useEffect(() => {
    void sessionMe().then(setMe);
    return () => { if (flash.current) window.clearTimeout(flash.current); };
  }, []);

  // Another surface (the sidebar's language toggle) can change the language
  // under this page. The pending value follows it, so the form never claims an
  // unsaved change the operator did not make.
  useEffect(() => { setPendingLang(language); }, [language]);

  const dirty = pendingLang !== language;

  const handleSavePrefs = () => {
    if (!dirty) return;
    setLanguage(pendingLang);
    setSavedFlash(true);
    if (flash.current) window.clearTimeout(flash.current);
    flash.current = window.setTimeout(() => setSavedFlash(false), 4000);
  };

  const handleRevertPrefs = () => setPendingLang(language);

  const handleSendResetCode = async () => {
    if (!me) return;
    setSendingCode(true); setErr(""); setCodeSent(false);
    try {
      await auth.requestOtp(me.email, "reset");
      setCodeSent(true);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setSendingCode(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true); setErr("");
    try {
      await auth.logout();
      clearSession();
      void nav({ to: "/login" });
    } catch (e) {
      setErr(String((e as Error).message));
      setSigningOut(false);
    }
  };

  if (!me) {
    return (
      <PageShell width="narrow" title={S.profile.title} description={S.profile.desc}>
        <div aria-live="polite" className="flex flex-col gap-4">
          <span className="sr-only">{S.profile.loading}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
              <Shimmer className="h-3 w-24" />
              <Shimmer className="h-9 w-full max-w-sm" />
              <Shimmer className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      </PageShell>
    );
  }

  const roles = me.roles ?? [];

  return (
    <PageShell width="narrow" title={S.profile.title} description={S.profile.desc}>
      {err && (
        <p
          role="alert"
          className="motion-entrance rounded-card border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {err}
        </p>
      )}

      <Section title={S.profile.accountHeading}>
        <div className="flex flex-col gap-5 rounded-card border border-border bg-card p-4">
          <Field label={S.profile.emailLabel} htmlFor="account-email" hint={S.profile.emailHint}>
            {/* Read-only, and shaped like a disabled control rather than a
                borderless line: the operator must be able to tell at a glance
                that this is a value the page will not take edits to. An email
                is a machine identifier — LTR and mono in both languages. */}
            <div
              id="account-email"
              className="flex min-w-0 items-center gap-2 rounded-field border border-border bg-muted/40 px-3 py-2"
            >
              <Mail aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <bdi dir="ltr" className="min-w-0 truncate font-mono text-sm">
                {me.email}
              </bdi>
            </div>
          </Field>

          <Field label={S.profile.rolesLabel} hint={S.profile.rolesHint}>
            {roles.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {roles.map((r) => (
                  <span
                    key={r}
                    className="rounded-pill border border-border bg-muted px-2 py-0.5 font-mono text-xs"
                  >
                    <bdi dir="ltr">{r}</bdi>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{S.profile.noRoles}</p>
            )}
          </Field>
        </div>
      </Section>

      <Section title={S.profile.prefsHeading}>
        <div className="rounded-card border border-border bg-card p-4">
          <Field label={S.profile.langLabel} htmlFor="language" hint={S.profile.langHint}>
            <Select value={pendingLang} onValueChange={(v) => setPendingLang(v as Lang)}>
              <SelectTrigger id="language" className="w-full max-w-xs" aria-label={S.profile.langLabel}>
                <span className="flex min-w-0 items-center gap-2">
                  <Languages aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <FormFooter
            note={
              savedFlash && !dirty ? (
                <span className="flex items-center gap-1.5 text-success">
                  <Check aria-hidden="true" className="size-3.5" />
                  {S.profile.saved}
                </span>
              ) : dirty ? (
                <span className="text-warning">{S.profile.dirty}</span>
              ) : (
                <span>{S.profile.noChanges}</span>
              )
            }
          >
            <Button onClick={handleSavePrefs} disabled={!dirty} className="motion-press">
              {S.profile.save}
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={handleRevertPrefs} className="motion-press">
                {S.profile.revert}
              </Button>
            )}
          </FormFooter>
        </div>
      </Section>

      <Section title={S.profile.securityHeading}>
        <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
          <div className="flex min-w-0 items-start gap-3">
            <KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{S.profile.passwordLabel}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{S.profile.passwordHint}</p>
            </div>
          </div>

          {codeSent ? (
            <p className="motion-entrance flex flex-wrap items-center gap-x-2 gap-y-1 rounded-field border border-success/40 bg-success/10 p-3 text-sm text-success">
              <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0">{S.profile.passwordSent}</span>
              <Link to="/reset" className="font-medium underline underline-offset-2">
                {S.profile.resetLink}
              </Link>
            </p>
          ) : (
            <div>
              <ConfirmAction
                tone="primary"
                title={S.profile.passwordConfirmTitle}
                description={S.profile.passwordConfirmDesc}
                consequences={S.profile.passwordConfirmPoints}
                confirmLabel={S.profile.passwordConfirmCta}
                busy={sendingCode}
                onConfirm={handleSendResetCode}
                trigger={
                  <Button variant="outline" disabled={sendingCode} className="motion-press">
                    {sendingCode ? S.profile.passwordSending : S.profile.passwordCta}
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </Section>

      <Section title={S.profile.sessionHeading}>
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-4">
          <MonitorSmartphone aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{S.profile.signOutLabel}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{S.profile.signOutHint}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className={cn("motion-press shrink-0")}
          >
            {signingOut ? S.profile.signingOut : S.profile.signOut}
          </Button>
        </div>
      </Section>
    </PageShell>
  );
}
Profile.displayName = "Profile";

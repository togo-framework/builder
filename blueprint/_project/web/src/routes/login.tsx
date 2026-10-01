import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, Terminal } from "lucide-react";
import { AuthLayout, LoginForm, type OAuthProvider } from "@fadymondy/nasaq/web";
import { auth, clearSession, type AuthMethod } from "../lib/auth";
import { API, APP_NAME } from "../lib/api";
import { appPath } from "../lib/base";
import { useLang } from "../lib/locale";
import { AppAuthFooter } from "../components/auth-footer";

export function Login() {
  const nav = useNavigate();
  const { tx } = useLang();
  const [methods, setMethods] = useState<AuthMethod[]>([]);
  useEffect(() => { auth.methods().then(setMethods); }, []);

  // Extra sign-in methods from the auth plugin (OAuth providers, the dev login) as provider buttons.
  // Google, GitHub, Apple and Microsoft get Nasaq's own buttons; anything else is a custom one.
  const BUILT_IN = ["google", "github", "apple", "microsoft"] as const;
  const providers: OAuthProvider[] = methods.map((m) =>
    (BUILT_IN as readonly string[]).includes(m.name)
      ? (m.name as (typeof BUILT_IN)[number])
      : { id: m.name, label: m.label, icon: m.type === "dev" ? <Terminal /> : <KeyRound /> });
  async function onOAuth(id: string) {
    const m = methods.find((x) => x.name === id);
    if (!m) return;
    if (m.type === "dev") { await fetch(`${API}${m.url}`, { method: "POST", credentials: "include" }); window.location.href = appPath("/dashboard"); }
    else window.location.href = `${API}${m.url}`;
  }

  return (
    <AuthLayout
      title={tx(`Sign in to ${APP_NAME}`, `تسجيل الدخول إلى ${APP_NAME}`)}
      description={tx("Welcome back", "مرحبًا بعودتك")}
      prompt={<>{tx("No account?", "ليس لديك حساب؟")} <Link to="/register" className="font-medium text-primary hover:underline">{tx("Create one", "أنشئ حسابًا")}</Link></>}
      footer={<AppAuthFooter />}
    >
      <LoginForm
        showRemember={false}
        forgotPassword={<Link to="/reset" className="text-body-sm text-primary hover:underline">{tx("Forgot password?", "نسيت كلمة المرور؟")}</Link>}
        oauthProviders={providers.length ? providers : undefined}
        onOAuth={onOAuth}
        onSubmit={async ({ email, password }) => {
          try { await auth.login(email, password); } catch (e) { return { error: (e as Error).message }; }
          clearSession(); nav({ to: "/dashboard" });
        }}
      />
    </AuthLayout>
  );
}

import { Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout, RegisterForm } from "@fadymondy/nasaq/web";
import { auth, clearSession } from "../lib/auth";
import { APP_NAME } from "../lib/api";
import { useLang } from "../lib/locale";
import { AppAuthFooter } from "../components/auth-footer";

export function Register() {
  const nav = useNavigate();
  const { tx } = useLang();
  return (
    <AuthLayout
      title={tx("Create your account", "أنشئ حسابك")}
      description={tx(`Get started with ${APP_NAME} in seconds`, `ابدأ مع ${APP_NAME} في ثوانٍ`)}
      prompt={<>{tx("Already registered?", "لديك حساب؟")} <Link to="/login" className="font-medium text-primary hover:underline">{tx("Sign in", "تسجيل الدخول")}</Link></>}
      footer={<AppAuthFooter />}
    >
      <RegisterForm
        requireTerms={false}
        onSubmit={async ({ email, password }) => {
          try { await auth.register(email, password); } catch (e) { return { error: (e as Error).message }; }
          clearSession(); nav({ to: "/dashboard" });
        }}
      />
    </AuthLayout>
  );
}

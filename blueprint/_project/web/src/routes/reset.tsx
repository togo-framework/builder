import { Link } from "@tanstack/react-router";
import { AuthLayout, ForgotPasswordForm } from "@fadymondy/nasaq/web";
import { auth } from "../lib/auth";
import { useLang } from "../lib/locale";

export function Reset() {
  const { tx } = useLang();
  return (
    <AuthLayout
      title={tx("Reset password", "إعادة تعيين كلمة المرور")}
      description={tx("We'll email you a reset code", "سنرسل لك رمز إعادة التعيين بالبريد")}
      footer={<p className="text-center text-body-sm"><Link to="/login" className="font-medium text-primary hover:underline">{tx("Back to sign in", "العودة لتسجيل الدخول")}</Link></p>}
    >
      {/* Same answer whether or not the account exists, so the form does not reveal who is registered. */}
      <ForgotPasswordForm
        onSubmit={async ({ email }) => {
          try { await auth.requestOtp(email, "reset"); } catch (e) { return { error: (e as Error).message }; }
        }}
      />
    </AuthLayout>
  );
}

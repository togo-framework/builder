import { AuthFooter, LocaleSwitcher } from "@fadymondy/nasaq/web";
import { useLang } from "../lib/locale";

/** Small print under every auth page: a way home, the docs, and the language switch. */
export function AppAuthFooter() {
  const { tx } = useLang();
  return (
    <AuthFooter
      links={[
        { label: tx("Home", "الرئيسية"), href: "/" },
        { label: tx("Docs", "التوثيق"), href: "https://to-go.dev/en/docs", external: true },
      ]}
      end={<LocaleSwitcher />}
    />
  );
}

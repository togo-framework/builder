import { useEffect, useState } from "react";
import { useT } from "@togo-framework/ui";
import { sessionMe, type Me } from "../lib/auth";

export function Dashboard() {
  const { language } = useT();
  const ar = language === "ar";
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => { sessionMe().then(setMe); }, []);

  if (!me) return <div className="p-6 text-muted-foreground">{ar ? "جارٍ التحميل…" : "Loading…"}</div>;

  return (
    <div className="space-y-6 p-6" dir={ar ? "rtl" : "ltr"}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{ar ? "لوحة التحكم" : "Dashboard"}</h1>
        <p className="text-sm text-muted-foreground">{ar ? `مرحبًا بعودتك، ${me.email}` : `Welcome back, ${me.email}`}</p>
      </div>
    </div>
  );
}

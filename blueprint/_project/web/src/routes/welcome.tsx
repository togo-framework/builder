import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Layers, LayoutGrid, Bot, ListChecks, KeyRound, ArrowRight, ArrowLeft,
  MessageSquareText, SearchCode, Wrench, GitPullRequest, ShieldCheck, GitBranch, ScrollText,
} from "lucide-react";
import { Button, useT } from "@togo-framework/ui";
import { API, APP_NAME } from "../lib/api";
import { sessionMe, type Me } from "../lib/auth";

type Card = {
  icon: typeof Layers;
  en: string; ar: string;
  descEn: string; descAr: string;
  to: string;
};

// What this fleet actually does — the landing page for the builder itself,
// not the generic togo framework scaffold it replaced.
const CARDS: Card[] = [
  { icon: LayoutGrid, en: "Dashboard", ar: "لوحة التحكم", descEn: "Live status across every run, issue and agent.", descAr: "حالة مباشرة لكل تشغيل ومهمة ووكيل.", to: "/dashboard" },
  { icon: Bot, en: "Agents", ar: "الوكلاء", descEn: "Meet the fleet — specialists that pick up issues and ship fixes.", descAr: "تعرّف على الفريق — متخصصون يتولون المهام وينفّذون الإصلاحات.", to: "/agents" },
  { icon: ListChecks, en: "Issues", ar: "المهام", descEn: "Report a bug and watch an agent reproduce and fix it.", descAr: "أبلغ عن خلل وشاهد وكيلاً يعيد إنتاجه ويصلحه.", to: "/issues" },
  { icon: KeyRound, en: "Vault", ar: "الخزنة", descEn: "Secrets your agents can use, never see.", descAr: "أسرار يستخدمها الوكلاء ولا يرونها أبداً.", to: "/vault" },
];

type Step = { icon: typeof Layers; en: string; ar: string; descEn: string; descAr: string };

const STEPS: Step[] = [
  { icon: MessageSquareText, en: "Report", ar: "الإبلاغ", descEn: "Anyone pins a problem on the page it happened on — a screenshot, a click path, the exact element.", descAr: "يشير أي شخص إلى مشكلة في الصفحة التي حدثت فيها — لقطة شاشة، مسار النقرات، والعنصر بالتحديد." },
  { icon: SearchCode, en: "Reproduce", ar: "إعادة الإنتاج", descEn: "An agent claims the issue and proves the bug is real before touching a single line of code.", descAr: "يتولى وكيل المهمة ويثبت أن الخلل حقيقي قبل تعديل أي سطر من الكود." },
  { icon: Wrench, en: "Fix", ar: "الإصلاح", descEn: "The right specialist — backend, database, or UI — makes the smallest change that fixes it, and proves it live.", descAr: "يقوم المتخصص المناسب — خلفي أو قاعدة بيانات أو واجهة — بأصغر تعديل يحل المشكلة ويثبت عمله فعليًا." },
  { icon: GitPullRequest, en: "Review & ship", ar: "المراجعة والتسليم", descEn: "A second, independent agent reviews the diff. A human merges. Nothing an agent writes merges itself.", descAr: "يراجع وكيل آخر مستقل التغييرات، ويدمجها إنسان. لا يدمج أي وكيل عمله بنفسه." },
];

type Pillar = { icon: typeof Layers; en: string; ar: string; descEn: string; descAr: string };

const PILLARS: Pillar[] = [
  { icon: ShieldCheck, en: "Guardrails, not vibes", ar: "ضوابط لا انطباعات", descEn: "Every run is bounded by written rules — blast-radius caps, spend ceilings, and a human gate on anything risky.", descAr: "كل تشغيل مقيّد بقواعد مكتوبة — حدود لنطاق التغيير، سقوف للإنفاق، وبوابة بشرية لأي شيء حسّاس." },
  { icon: GitBranch, en: "Generator-first togo", ar: "togo أولاً بالمولّدات", descEn: "Schema, queries and API contracts are declared once and generated — never hand-patched behind the framework's back.", descAr: "يُعلن المخطط والاستعلامات وعقود الواجهة مرة واحدة وتُولَّد تلقائيًا — لا تعديل يدوي خفي عن الإطار." },
  { icon: ScrollText, en: "Full audit trail", ar: "سجل تدقيق كامل", descEn: "Every run writes a journal — what reproduced, what changed, what was verified live. No journal, no merge.", descAr: "كل تشغيل يكتب سجلًا — ما تكرر، وما تغيّر، وما تم التحقق منه فعليًا. بلا سجل، لا دمج." },
];

export function Welcome() {
  const { language } = useT();
  const ar = language === "ar";
  const tx = (en: string, a: string) => (ar ? a : en);
  const Arrow = ar ? ArrowLeft : ArrowRight;

  const [health, setHealth] = useState<{ status?: string; togo?: string } | null>(null);
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    fetch(`${API}/api/health`).then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
    sessionMe().then(setMe).catch(() => setMe(null));
  }, []);

  const online = health?.status === "ok";

  return (
    <main dir={ar ? "rtl" : "ltr"} className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* subtle brand glow — theme-aware, decorative */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96"
        style={{ background: "radial-gradient(620px 320px at 50% -4%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 70%)" }} />

      <div className="mx-auto w-full max-w-4xl px-6 py-16 sm:py-20">
        {/* hero */}
        <header className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg"
            style={{ background: "linear-gradient(135deg,#1FC7DC,#2D8CE6 55%,#1659C8)" }}>
            <Layers className="h-8 w-8" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{APP_NAME}</h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground sm:text-lg">
            {tx("An autonomous fleet of AI agents that turns reported issues into shipped fixes.",
                "أسطول من الوكلاء الذكيين يحوّل المهام المُبلّغ عنها إلى إصلاحات مُنفَّذة.")}
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
            {tx(
              `${APP_NAME} is built on the togo builder blueprint: a set of specialist agents, each scoped to one part of the codebase, working under written rules instead of open-ended prompts. A person reports a problem; an agent reproduces it, fixes it, and proves the fix live — with another agent and a human standing between every change and production.`,
              `يقوم ${APP_NAME} على مخطط بناء togo: مجموعة من الوكلاء المتخصصين، كل واحد مسؤول عن جزء محدد من الشيفرة، يعملون وفق قواعد مكتوبة لا مطالبات مفتوحة. يُبلِّغ شخص عن مشكلة، فيعيد وكيل إنتاجها ويصلحها ويُثبت عمل الإصلاح فعليًا — مع وكيل آخر وإنسان بين كل تغيير والإنتاج.`
            )}
          </p>

          {/* auth-aware CTAs */}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {me ? (
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to="/dashboard">{tx("Go to dashboard", "اذهب إلى لوحة التحكم")} <Arrow className="ms-1 h-4 w-4" /></Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to="/login">{tx("Log in", "تسجيل الدخول")}</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link to="/register">{tx("Create account", "إنشاء حساب")}</Link>
                </Button>
              </>
            )}
          </div>
        </header>

        {/* how it works — the report → reproduce → fix → ship loop */}
        <section className="mt-16">
          <h2 className="text-center text-xl font-bold tracking-tight sm:text-2xl">
            {tx("How a fix happens", "كيف يتم الإصلاح")}
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.en} className="relative rounded-2xl border border-border bg-card p-5 text-start">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                    <s.icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground/70">
                    {tx(`Step ${i + 1}`, `الخطوة ${i + 1}`)}
                  </span>
                </div>
                <p className="mt-3 font-semibold">{tx(s.en, s.ar)}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{tx(s.descEn, s.descAr)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* why it's safe to run unattended — the guardrails that make autonomy trustworthy */}
        <section className="mt-14">
          <h2 className="text-center text-xl font-bold tracking-tight sm:text-2xl">
            {tx("Built on the togo blueprint", "مبني على مخطط togo")}
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {PILLARS.map((p) => (
              <div key={p.en} className="rounded-2xl border border-border bg-card p-5 text-start">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                  <p.icon className="h-5 w-5" />
                </span>
                <p className="mt-3 font-semibold">{tx(p.en, p.ar)}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{tx(p.descEn, p.descAr)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* explore — each card is a real in-app route */}
        <section className="mt-14">
          <h2 className="text-center text-xl font-bold tracking-tight sm:text-2xl">
            {tx("Explore the fleet", "استكشف الفريق")}
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CARDS.map((c) => (
              <Link key={c.en} to={c.to} className="group block rounded-2xl border border-border bg-card p-5 text-start transition-colors hover:border-primary/40 hover:bg-accent/40">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                    <c.icon className="h-5 w-5" />
                  </span>
                  <span className="font-semibold">{tx(c.en, c.ar)}</span>
                  <Arrow className="ms-auto h-4 w-4 text-muted-foreground/50 transition-all group-hover:text-primary group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{tx(c.descEn, c.descAr)}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* footer status */}
        <footer className="mt-14 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${online ? "bg-success" : "bg-muted-foreground/40"}`} />
            {tx(online ? "API connected" : "API offline", online ? "الواجهة متّصلة" : "الواجهة غير متّصلة")}
          </span>
          <span aria-hidden>·</span>
          <span>togo {health?.togo ?? "…"}</span>
          <span aria-hidden>·</span>
          <span>{tx("powered by Go", "مدعوم بـ Go")}</span>
        </footer>
      </div>
    </main>
  );
}

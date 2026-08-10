import { useT } from "@togo-framework/ui";

/**
 * i18n.welcome — EN/AR copy for the first screen.
 *
 * It lives beside lib/i18n.ts for the same reason i18n.home.ts does: welcome
 * was redesigned as one surface and its vocabulary is its own (a fleet, a run,
 * a trace, a thing that waits for a human). `useT()` stays the single language
 * AUTHORITY — it owns the locale, persists the choice and sets the document
 * `dir` — and this file only supplies the words.
 *
 * Conventions inherited from lib/i18n.ts and i18n.home.ts:
 *
 *  - Machine values NEVER enter this file. Agent handles (`agent:web`), file
 *    paths, diffstats, PR numbers, the product name and the togo version are
 *    identical in both languages, so they live in the component as constants
 *    and are wrapped there in <bdi dir="ltr">. A template string flattens a
 *    value into a plain `string`, and a plain string cannot carry the isolate —
 *    which is how `$2.40` renders as `2.40$` and `80 B` as `B 80`.
 *  - Where a sentence must sit next to a Latin token, it is split into a lead
 *    and the component supplies the isolated token (see `poweredBy`).
 *  - Counted phrases are functions, so Arabic can pick its own plural form.
 *  - Western digits in Arabic.
 *
 * The run trace is five fixed steps, so `steps` is a fixed-length tuple rather
 * than a `string[]`: the component indexes it against a parallel constant of
 * machine artefacts, and a length mismatch between the two must be a type
 * error, not a blank row at runtime.
 */

type FiveSteps = readonly [string, string, string, string, string];

interface WelcomeStrings {
  /* Hero */
  eyebrow: string;
  headline: string;
  sub: string;

  /* Actions — every one of these maps to a real route */
  ctaDashboard: string;
  ctaLogin: string;
  ctaRegister: string;

  /* Language switch */
  switchLang: string;
  /** The OTHER language, in its own script, so the control is self-describing. */
  otherLang: string;

  /* The example run */
  runTitle: string;
  runCaption: string;
  steps: FiveSteps;
  /** Accessible name for the step-index chip. */
  stepLabel: (n: number) => string;
  /** Tooltip on the spend readout inside the trace. */
  costLabel: string;

  /* Destinations */
  startTitle: string;
  dashboard: string;
  dashboardDesc: string;
  agents: string;
  agentsDesc: string;
  issues: string;
  issuesDesc: string;
  vault: string;
  vaultDesc: string;

  /* Signed-out wayfinder */
  emptyTitle: string;
  emptyDesc: string;
  emptyLabel: string;
  /** Tooltip on a wayfinder pill: "Opens {destination}". Split, not templated. */
  opens: string;

  /* Status footer */
  apiOnline: string;
  apiOffline: string;
  poweredBy: string;
  loading: string;
}

/* ------------------------------------------------------------------ */
/* English                                                             */
/* ------------------------------------------------------------------ */

const welcomeEn: WelcomeStrings = {
  eyebrow: "Autonomous engineering fleet",
  headline: "Report a bug. An agent ships the fix.",
  sub: "A fleet of specialist AI agents reproduces the problem, makes the smallest fix, and proves it live — with a human on every merge.",

  ctaDashboard: "Go to dashboard",
  ctaLogin: "Log in",
  ctaRegister: "Create account",

  switchLang: "Switch language",
  otherLang: "العربية",

  runTitle: "What a fix looks like",
  runCaption: "An example run. Every fix leaves a trace like this one.",
  steps: [
    "Someone pins the problem on the page it happened on.",
    "An agent claims it and proves the bug is real.",
    "The specialist for that layer makes the smallest fix.",
    "A second, independent agent reviews the diff.",
    "A human merges. Nothing an agent writes merges itself.",
  ],
  stepLabel: (n) => `Step ${n}`,
  costLabel: "Spend on this step",

  startTitle: "Where to start",
  dashboard: "Dashboard",
  dashboardDesc: "Live status across every run, issue and agent.",
  agents: "Agents",
  agentsDesc: "The fleet — who is on shift and what they may touch.",
  issues: "Issues",
  issuesDesc: "Report a bug and watch an agent reproduce and fix it.",
  vault: "Vault",
  vaultDesc: "Secrets your agents can use, but never see.",

  emptyTitle: "No fleet running here yet",
  emptyDesc: "Sign in to see yours — or look around first.",
  emptyLabel: "Take a look",
  opens: "Opens ",

  apiOnline: "API connected",
  apiOffline: "API offline",
  poweredBy: "powered by ",
  loading: "Loading",
};

/* ------------------------------------------------------------------ */
/* Arabic                                                              */
/* ------------------------------------------------------------------ */

const welcomeAr: WelcomeStrings = {
  eyebrow: "أسطول هندسي ذاتي التشغيل",
  headline: "أبلِغ عن خلل، ووكيلٌ يُنجز الإصلاح.",
  sub: "أسطول من الوكلاء المتخصصين يعيد إنتاج المشكلة، ويُجري أصغر إصلاح ممكن، ويُثبت عمله فعليًا — وبإنسان على كل عملية دمج.",

  ctaDashboard: "اذهب إلى لوحة التحكم",
  ctaLogin: "تسجيل الدخول",
  ctaRegister: "إنشاء حساب",

  switchLang: "تغيير اللغة",
  otherLang: "English",

  runTitle: "كيف يبدو الإصلاح",
  runCaption: "مثال لتشغيل واحد. كل إصلاح يترك أثرًا كهذا.",
  steps: [
    "يشير أحدهم إلى المشكلة في الصفحة التي حدثت فيها.",
    "يستلمها وكيل ويُثبت أن الخلل حقيقي.",
    "يُجري المتخصص في تلك الطبقة أصغر إصلاح ممكن.",
    "يراجع وكيلٌ ثانٍ مستقل التغييرات.",
    "يدمج إنسان. لا يدمج أي وكيل عمله بنفسه.",
  ],
  stepLabel: (n) => `الخطوة ${n}`,
  costLabel: "الإنفاق على هذه الخطوة",

  startTitle: "من أين تبدأ",
  dashboard: "لوحة التحكم",
  dashboardDesc: "حالة مباشرة لكل تشغيل ومهمة ووكيل.",
  agents: "الوكلاء",
  agentsDesc: "الأسطول — من يعمل الآن وما المسموح له بتعديله.",
  issues: "المهام",
  issuesDesc: "أبلغ عن خلل وشاهد وكيلًا يعيد إنتاجه ويصلحه.",
  vault: "الخزنة",
  vaultDesc: "أسرار يستخدمها الوكلاء ولا يرونها أبدًا.",

  emptyTitle: "لا يوجد أسطول يعمل هنا بعد",
  emptyDesc: "سجّل الدخول لترى أسطولك — أو تجوّل أولًا.",
  emptyLabel: "ألقِ نظرة",
  opens: "يفتح ",

  apiOnline: "الواجهة متّصلة",
  apiOffline: "الواجهة غير متّصلة",
  poweredBy: "مدعوم بـ ",
  loading: "جارٍ التحميل",
};

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

const useWelcomeStrings = (): { S: WelcomeStrings; ar: boolean; isRTL: boolean } => {
  const { language, isRTL } = useT();
  const ar = language === "ar";
  return { S: ar ? welcomeAr : welcomeEn, ar, isRTL };
};

export { useWelcomeStrings };
export type { WelcomeStrings };

import { useT } from "@togo-framework/ui";
import { exactTime, relativeTime } from "./i18n.vault";

/**
 * i18n.home — EN/AR copy for the landing screen.
 *
 * It lives beside lib/i18n.ts rather than inside it for the same reason
 * i18n.vault does: the dashboard was redesigned as one surface and its
 * vocabulary is its own (a fleet that works unwatched, a governor, a footprint,
 * a thing that is waiting for a human). `useT()` stays the single language
 * AUTHORITY — it owns the locale, persists the choice and sets the document
 * `dir` — and this file only supplies the words.
 *
 * Conventions inherited from lib/i18n.ts:
 *  - Counted phrases are functions. Arabic plurals are not an `s` suffix
 *    (1 singular, 2 dual, 3–10 plural, 11+ singular accusative).
 *  - Machine values (agent slugs, branches, issue numbers, money) stay verbatim
 *    in both languages and are wrapped by the component in <bdi dir="ltr">.
 *    `$2.40` dropped raw into an Arabic sentence renders as `2.40$`.
 *  - Western digits in Arabic.
 *
 * Sentences that embed a machine value are split into a lead and a tail rather
 * than taking a `${value}` argument, because a template string flattens the
 * value into a plain `string` and a plain string cannot carry the isolate.
 *
 * `relativeTime` / `exactTime` are re-exported rather than re-implemented: a
 * second Arabic relative-time formatter would drift from the first, and "3h
 * ago" has to read identically on the dashboard and on the vault.
 */

interface HomeStrings {
  /* Page */
  title: string;
  /** Followed by <bdi>{email}</bdi>. */
  welcome: string;
  refresh: string;
  live: string;
  offline: string;
  liveHint: string;
  offlineHint: string;

  /* Fresh install */
  freshTitle: string;
  freshDesc: string;
  freshLabel: string;
  goHire: string;
  goIssue: string;
  goDocs: string;
  goBoard: string;
  goRoster: string;

  /* The fleet map */
  fleetTitle: string;
  working: string;
  fleetOf: (n: number) => string;
  bandWorking: string;
  bandToday: string;
  bandIdle: string;
  paused: string;
  overCeiling: string;
  moreAgents: (n: number) => string;
  /** Tooltip leads. Followed by an isolated machine value. */
  onIssue: string;
  lastRun: string;
  neverRan: string;
  fleetAlt: (working: number, today: number, idle: number) => string;

  /* Waiting on a human */
  needTitle: string;
  needQuietTitle: string;
  needQuietDesc: string;
  needMore: (n: number) => string;
  asked: string;
  answer: string;
  open: string;
  tagReview: string;
  tagBlocked: string;
  tagHumanOnly: string;
  tagStopped: string;
  stoppedDesc: string;

  /* What happened while you were away */
  awayTitle: string;
  awayEmptyTitle: string;
  awayEmptyDesc: string;
  awayAll: string;
  filesTouched: (n: number) => string;

  /* Money */
  spendTitle: string;
  fleetSpend: string;
  spendHint: (n: number) => string;
  spendNoCeiling: string;
  biggest: string;

  /* Failing */
  failTitle: string;
  failCleanTitle: string;
  failCleanDesc: string;
  failedRuns: (n: number) => string;
  attempts: (n: number) => string;
  requeue: string;
  requeueTitle: string;
  /** Lead + tail around <bdi>#46</bdi>. */
  requeueLead: string;
  requeueTail: string;
  requeueConsequences: string[];
  requeueConfirm: string;

  /* Failure of the screen itself */
  loadFailed: string;
  retry: string;
}

/* ------------------------------------------------------------------ */
/* English                                                             */
/* ------------------------------------------------------------------ */

const homeEn: HomeStrings = {
  title: "Dashboard",
  welcome: "Welcome back,",
  refresh: "Refresh",
  live: "Live",
  offline: "Offline",
  liveHint: "Connected to the agent event stream.",
  offlineHint: "Not receiving agent events — this page is showing its last read.",

  freshTitle: "No fleet yet",
  freshDesc:
    "Agents claim issues from the board and implement them on their own. Hire one, give it an issue, and this page fills with what it did and what it cost.",
  freshLabel: "Start here",
  goHire: "Hire an agent",
  goIssue: "Open the board",
  goDocs: "Read the library",
  goBoard: "Open the board",
  goRoster: "Open the roster",

  fleetTitle: "The fleet",
  working: "working",
  fleetOf: (n) => `of ${n} agent${n === 1 ? "" : "s"}`,
  bandWorking: "Working now",
  bandToday: "Ran today",
  bandIdle: "Idle",
  paused: "Paused",
  overCeiling: "Over its ceiling",
  moreAgents: (n) => `+${n} more`,
  onIssue: "working on ",
  lastRun: "last run ",
  neverRan: "has never run",
  fleetAlt: (working, today, idle) =>
    `${working} working now, ${today} ran today, ${idle} idle.`,

  needTitle: "Waiting on you",
  needQuietTitle: "Nothing is waiting on you",
  needQuietDesc:
    "No agent has asked a question, and nothing on the board is gated on a human. The fleet can keep going without you.",
  needMore: (n) => `${n} more on the board`,
  asked: "asked ",
  answer: "Answer",
  open: "Open",
  tagReview: "Needs review",
  tagBlocked: "Blocked",
  tagHumanOnly: "Human-only",
  tagStopped: "Stopped for input",
  stoppedDesc: "The run ended asking for a decision it could not make alone.",

  awayTitle: "While you were away",
  awayEmptyTitle: "No runs yet",
  awayEmptyDesc:
    "Every action an agent takes lands here — the issue it claimed, the branch it pushed, the files it touched and what the run cost.",
  awayAll: "All activity",
  filesTouched: (n) => `${n} file${n === 1 ? "" : "s"}`,

  spendTitle: "Spend",
  fleetSpend: "Fleet total",
  spendHint: (n) => `Against the ceilings of ${n} agent${n === 1 ? "" : "s"}.`,
  spendNoCeiling: "No ceiling set — these agents can spend without a stop.",
  biggest: "Biggest spenders",

  failTitle: "Failing",
  failCleanTitle: "Nothing is failing",
  failCleanDesc: "No run ended in an error and no issue is stuck on repeated attempts.",
  failedRuns: (n) => `${n} run${n === 1 ? "" : "s"} ended badly`,
  attempts: (n) => `${n} attempt${n === 1 ? "" : "s"}`,
  requeue: "Send back to To do",
  requeueTitle: "Send this issue back to To do?",
  requeueLead: "Issue ",
  requeueTail: " becomes claimable again.",
  requeueConsequences: [
    "The issue moves to To do and leaves whoever holds it.",
    "Any enabled agent that owns its area can claim it and spend money on a new attempt.",
    "The attempt counter is not reset — the history of the failures stays.",
  ],
  requeueConfirm: "Send it back",

  loadFailed: "Could not read the fleet.",
  retry: "Try again",
};

/* ------------------------------------------------------------------ */
/* Arabic                                                              */
/* ------------------------------------------------------------------ */

/** 1 singular, 2 dual, 3–10 plural, 11+ singular accusative. */
const arCount = (n: number, one: string, two: string, few: string, many: string): string =>
  n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`;

const arAgents = (n: number) => arCount(n, "وكيل واحد", "وكيلين", "وكلاء", "وكيلًا");
const arRuns = (n: number) => arCount(n, "تشغيل واحد", "تشغيلين", "عمليات تشغيل", "تشغيلًا");
const arFiles = (n: number) => arCount(n, "ملف واحد", "ملفين", "ملفات", "ملفًا");
const arTries = (n: number) => arCount(n, "محاولة واحدة", "محاولتين", "محاولات", "محاولة");
const arOthers = (n: number) => arCount(n, "مشكلة واحدة", "مشكلتين", "مشكلات", "مشكلة");

const homeAr: HomeStrings = {
  title: "لوحة التحكم",
  welcome: "مرحبًا بعودتك،",
  refresh: "تحديث",
  live: "مباشر",
  offline: "غير متصل",
  liveHint: "متصل ببث أحداث الوكلاء.",
  offlineHint: "لا تصل أحداث الوكلاء — هذه الصفحة تعرض آخر قراءة لها.",

  freshTitle: "لا أسطول بعد",
  freshDesc:
    "يستلم الوكلاء المشكلات من اللوحة وينفّذونها وحدهم. وظّف وكيلًا وأسند إليه مشكلة، وستمتلئ هذه الصفحة بما فعله وبما كلّف.",
  freshLabel: "ابدأ من هنا",
  goHire: "وظّف وكيلًا",
  goIssue: "افتح اللوحة",
  goDocs: "اقرأ المكتبة",
  goBoard: "افتح اللوحة",
  goRoster: "افتح قائمة الوكلاء",

  fleetTitle: "الأسطول",
  working: "قيد العمل",
  fleetOf: (n) => `من أصل ${arAgents(n)}`,
  bandWorking: "يعمل الآن",
  bandToday: "عمل اليوم",
  bandIdle: "خامل",
  paused: "موقوف",
  overCeiling: "تجاوز سقفه",
  moreAgents: (n) => `+${n} آخرين`,
  onIssue: "يعمل على ",
  lastRun: "آخر تشغيل ",
  neverRan: "لم يعمل قط",
  fleetAlt: (working, today, idle) =>
    `${working} قيد العمل الآن، و${today} عمل اليوم، و${idle} خامل.`,

  needTitle: "بانتظارك",
  needQuietTitle: "لا شيء بانتظارك",
  needQuietDesc:
    "لم يسأل أي وكيل سؤالًا، ولا شيء على اللوحة موقوف على قرار بشري. يستطيع الأسطول المتابعة من دونك.",
  needMore: (n) => `و${arOthers(n)} أخرى على اللوحة`,
  asked: "سأل ",
  answer: "أجب",
  open: "افتح",
  tagReview: "بانتظار المراجعة",
  tagBlocked: "محجوبة",
  tagHumanOnly: "بشرية فقط",
  tagStopped: "توقّف بانتظار قرار",
  stoppedDesc: "انتهى التشغيل وهو يسأل عن قرار لا يستطيع اتخاذه وحده.",

  awayTitle: "أثناء غيابك",
  awayEmptyTitle: "لا تشغيلات بعد",
  awayEmptyDesc:
    "كل ما يفعله الوكيل يظهر هنا — المشكلة التي استلمها، والفرع الذي دفعه، والملفات التي لمسها، وتكلفة التشغيل.",
  awayAll: "كل النشاط",
  filesTouched: (n) => arFiles(n),

  spendTitle: "الإنفاق",
  fleetSpend: "إجمالي الأسطول",
  spendHint: (n) => `مقابل سقوف ${arAgents(n)}.`,
  spendNoCeiling: "لا سقف محدَّد — يستطيع هؤلاء الوكلاء الإنفاق دون توقّف.",
  biggest: "الأكثر إنفاقًا",

  failTitle: "الأعطال",
  failCleanTitle: "لا شيء متعطّل",
  failCleanDesc: "لم ينتهِ أي تشغيل بخطأ، ولا مشكلة عالقة على محاولات متكررة.",
  failedRuns: (n) => `${arRuns(n)} انتهت بسوء`,
  attempts: (n) => arTries(n),
  requeue: "أعدها إلى قائمة العمل",
  requeueTitle: "هل تعيد هذه المشكلة إلى قائمة العمل؟",
  requeueLead: "المشكلة ",
  requeueTail: " تصبح قابلة للاستلام من جديد.",
  requeueConsequences: [
    "تنتقل المشكلة إلى قائمة العمل وتترك من يحملها الآن.",
    "يستطيع أي وكيل مفعّل يملك نطاقها أن يستلمها وينفق مالًا على محاولة جديدة.",
    "لا يُصفَّر عدّاد المحاولات — يبقى سجل الإخفاقات كما هو.",
  ],
  requeueConfirm: "أعِدها",

  loadFailed: "تعذّرت قراءة الأسطول.",
  retry: "أعد المحاولة",
};

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

const useHomeStrings = (): { S: HomeStrings; ar: boolean; isRTL: boolean } => {
  const { language, isRTL } = useT();
  const ar = language === "ar";
  return { S: ar ? homeAr : homeEn, ar, isRTL };
};

export { exactTime, relativeTime, useHomeStrings };
export type { HomeStrings };

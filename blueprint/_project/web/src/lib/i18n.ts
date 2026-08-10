import { useT } from "@togo-framework/ui";
import type { IssueStatus, IssueType, Priority } from "./issues";

/**
 * i18n — the builder screens' EN/AR strings, side by side in one typed object.
 *
 * Pattern copied from builder/sdk/src/i18n.ts (the approved reference), NOT
 * from the UI package's i18next instance. Deliberate: `useT().t()` is bound to
 * @togo-framework/ui's own sealed namespaces (common, header, nav, copilot,
 * auth) and the package does not export its i18n instance, so page-level
 * resources cannot be registered without importing i18next directly — a new
 * dependency in all but name. `useT()` is still the language AUTHORITY here:
 * it owns the current locale, persists the choice, and sets the document
 * `dir`. This file only supplies the words.
 *
 * Conventions:
 *  - Counted phrases are functions, because Arabic plurals are not `s`-suffix
 *    (1 = singular, 2 = dual, 3–10 = plural, 11+ = singular accusative).
 *  - Machine values (kinds, schedules like `@hourly`, namespaces, routes)
 *    stay verbatim in both languages — they are identifiers, not prose.
 *  - Western digits in Arabic, matching the SDK dictionary.
 */

const COLUMNS_EN: Record<IssueStatus, string> = {
  triage: "Triage",
  ready: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  in_review: "Review",
  done: "Done",
  rejected: "Rejected",
};

const COLUMNS_AR: Record<IssueStatus, string> = {
  triage: "الفرز",
  ready: "للتنفيذ",
  in_progress: "قيد التنفيذ",
  blocked: "متعثرة",
  in_review: "قيد المراجعة",
  done: "منجزة",
  rejected: "مرفوضة",
};

const TYPES_EN: Record<IssueType, string> = {
  bug: "Bug",
  feature: "Feature",
  enhancement: "Enhancement",
  question: "Question",
  discussion: "Discussion",
  chore: "Chore",
};

const TYPES_AR: Record<IssueType, string> = {
  bug: "خطأ",
  feature: "ميزة",
  enhancement: "تحسين",
  question: "سؤال",
  discussion: "نقاش",
  chore: "مهمة روتينية",
};

const PRIORITIES_EN: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

const PRIORITIES_AR: Record<Priority, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "مرتفعة",
  critical: "حرجة",
};

/** Short relative age — "5m" / "5د". The board's card corner. */
const agoShortEN = (iso: string): string => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const agoShortAR = (iso: string): string => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "الآن";
  if (s < 3600) return `${Math.floor(s / 60)}د`;
  if (s < 86400) return `${Math.floor(s / 3600)}س`;
  return `${Math.floor(s / 86400)}ي`;
};

/** Long relative age — "5m ago" / "قبل 5د". The sources list. */
const agoLongEN = (iso: string | null): string => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const agoLongAR = (iso: string | null): string => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "—";
  const m = Math.round(ms / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m}د`;
  const h = Math.round(m / 60);
  if (h < 48) return `قبل ${h}س`;
  return `قبل ${Math.round(h / 24)}ي`;
};

const en = {
  common: {
    somethingWrong: "Something went wrong",
    cancel: "Cancel",
    close: "Close",
  },

  issues: {
    title: "Issues",
    descLoading: "Reported from the feedback widget or filed by hand.",
    desc: "Reported from the feedback widget or filed by hand. Drag a card, or use its status menu.",
    search: "Search issues…",
    boardView: "Board view",
    listView: "List view",
    board: "Board",
    list: "List",
    newIssue: "New issue",
    statTotal: "Total",
    statReady: "Ready",
    statWorking: "Agents working",
    statBlocked: "Blocked",
    columns: COLUMNS_EN,
    types: TYPES_EN,
    priorities: PRIORITIES_EN,
    working: "working",
    workingTitle: "An agent holds a lease on this issue",
    humanOnly: "Human only",
    humanOnlyTitle: "Agents will never claim this issue",
    feedbackTag: "feedback",
    attemptsTitle: "Agent attempts",
    statusOf: (n: number) => `Status of issue ${n}`,
    illegalMove: (from: string, to: string) => `${from} → ${to} is not a legal move`,
    nothingHere: "Nothing here",
    emptyTitle: "No issues yet",
    emptyDesc: "Click the feedback button on any page to file the first one.",
    noMatchTitle: "No issues match",
    noMatchDesc: "Try a different search.",
    colTitle: "Title",
    colStatus: "Status",
    colPriority: "Priority",
    colType: "Type",
    colArea: "Area",
    colAge: "Age",
    ago: agoShortEN,
    // New-issue dialog
    dialogTitle: "New issue",
    dialogErrTitle: "Could not file it",
    titleLabel: "Title",
    titlePlaceholder: "What needs doing?",
    titleRequired: "Give the issue a title.",
    typeLabel: "Type",
    priorityLabel: "Priority",
    areaLabel: "Area",
    areaPlaceholder: "dashboard, sdk, db…",
    areaHint:
      "An agent only claims work in an area it owns. Leave it blank and the lead will route it.",
    assigneeLabel: "Assignee",
    assigneeAuto: "Let the lead choose",
    assigneeDisabled: " (disabled)",
    assigneeHint:
      "Naming someone overrides area routing entirely — they get it even if the area is not theirs.",
    humanOnlyDesc:
      "Agents will never claim it, whatever the assignee says. For work you intend to do yourself.",
    detailsLabel: "Details",
    detailsPlaceholder: "What does done look like? Anything the agent should not touch?",
    detailsHint:
      "A title on its own is enough. Leave this empty and the agent will ask you what it needs before it starts.",
    filing: "Filing…",
    fileIssue: "File issue",
  },

  sources: {
    title: "Sources",
    desc: "Everything that feeds the project brain on a schedule — repositories, feeds, channels, saved queries.",
    addSource: "Add a source",
    statSources: "Sources",
    statCollecting: "Collecting",
    statFailing: "Failing",
    statRuns: "Runs",
    emptyTitle: "No sources yet",
    emptyDesc: "Add a repository, a feed or a saved query and the brain keeps itself current.",
    ago: agoLongEN,
    runningWord: "running",
    loadingRuns: "Loading runs…",
    noRuns: "No runs yet.",
    runOk: "succeeded",
    runFailed: "failed",
    trigger: (t: string) => t,
    items: (n: number, truncated: boolean) =>
      `${n} item${n === 1 ? "" : "s"}${truncated ? "+" : ""}`,
    hideRuns: "Hide runs",
    showRuns: "Show runs",
    refreshTitle: "Run it now and show what happened",
    disable: "Disable",
    enable: "Enable",
    deleteTitle: "Delete this source",
    confirmDelete: (name: string) =>
      `Delete the source "${name}"?\n\nWhat it already collected stays in the brain — ` +
      `removing the pipe is not a statement that the knowledge was wrong.`,
    off: "Off",
    failingBadge: (n: number) => `Failing${n > 1 ? ` ×${n}` : ""}`,
    into: "into",
    every: "every",
    lastRun: "last run",
    runsCount: (n: number) => `${n} run${n === 1 ? "" : "s"}`,
    collected: "Collected.",
    refreshFailed: "The refresh failed.",
    // Add-source form
    formTitle: "Add a source",
    kindLabel: "Kind",
    kindHint: "What system this connects to. Picking one loads its example configuration below.",
    pickConnector: "Pick a connector",
    nameLabel: "Name",
    nameHint:
      "Shown in the list and in every error message — make it the thing you would say out loud.",
    namePlaceholder: "Go blog feed",
    collectIntoLabel: "Collect into",
    collectIntoHint: "The brain namespace the memories land in. The default is the project's own.",
    scheduleLabel: "Schedule",
    scheduleHint: "How often it runs on its own. @hourly, @daily, or an interval like 30m.",
    configLabel: "Configuration",
    configHint: (kind: string) =>
      `What the ${kind || "connector"} needs to reach its system. Secrets are named here and resolved from the Vault — never pasted in.`,
    jsonError: "This is not valid JSON — check for a trailing comma or a missing quote.",
    nameFirst: "Name it first.",
    fixConfig: "Fix the configuration first.",
    createdOff: "Created switched off — enable it when you have run it once.",
    saving: "Saving…",
    createSource: "Create source",
  },

  brain: {
    title: "Project brain",
    desc: "What this project knows, and where each piece of it came from. Every agent reads this; every source writes into it.",
    keywordTitle: "Recall here is keyword-only",
    // The sentence is split around the two <code> islands the page renders.
    kbBefore: "The embedder is ",
    kbMiddle:
      ", a hashed bag of words with no semantic content: “the login button is broken” and “authentication fails” score as unrelated. Set ",
    kbAfter: " to an embeddings endpoint for real recall.",
    statMemories: "Memories",
    statEntities: "Entities",
    statConnections: "Connections",
    statNamespace: "Namespace",
    everything: "Everything",
    mentions: (n: number) => `${n} mention${n === 1 ? "" : "s"}`,
    noMemoriesRef: "No memories reference this yet.",
    filtered: "Filtered memories",
    recent: "Most recent",
    emptyTitle: "Nothing here yet",
    emptyDesc: "Add a source or upload a document and the brain fills itself.",
  },

  chat: {
    title: "Chat",
    desc: "Ask any agent on the fleet. Answers come from the project brain, with what they used shown underneath.",
    pickAgent: "Pick an agent",
    newChat: "New",
    untitled: "(untitled)",
    deleteAria: "Delete this conversation",
    confirmDelete: "Delete this conversation? Nothing was retained in the brain from it.",
    askAgent: (name: string) => `Ask ${name}`,
    emptyDesc:
      "Answers come from the project brain, with the memories they used shown underneath.",
    notGrounded: "Nothing in the project brain matched — this is the model’s own knowledge.",
    groundedIn: (n: number) => `Grounded in ${n} memor${n === 1 ? "y" : "ies"}`,
    thinking: "Thinking…",
    inputPlaceholder: "Ask about this project…",
    ask: "Ask",
  },
};

type Strings = typeof en;

const ar: Strings = {
  common: {
    somethingWrong: "حدث خطأ ما",
    cancel: "إلغاء",
    close: "إغلاق",
  },

  issues: {
    title: "المشكلات",
    descLoading: "بلاغات واردة من أداة الملاحظات أو مسجّلة يدويًا.",
    desc: "بلاغات واردة من أداة الملاحظات أو مسجّلة يدويًا. اسحب البطاقة، أو استخدم قائمة الحالة الخاصة بها.",
    search: "ابحث في المشكلات…",
    boardView: "عرض اللوحة",
    listView: "عرض القائمة",
    board: "لوحة",
    list: "قائمة",
    newIssue: "مشكلة جديدة",
    statTotal: "الإجمالي",
    statReady: "جاهزة",
    statWorking: "وكلاء يعملون",
    statBlocked: "متعثرة",
    columns: COLUMNS_AR,
    types: TYPES_AR,
    priorities: PRIORITIES_AR,
    working: "قيد العمل",
    workingTitle: "وكيل يحجز هذه المشكلة الآن",
    humanOnly: "للبشر فقط",
    humanOnlyTitle: "لن يستلم الوكلاء هذه المشكلة أبدًا",
    feedbackTag: "ملاحظات",
    attemptsTitle: "محاولات الوكلاء",
    statusOf: (n: number) => `حالة المشكلة ${n}`,
    illegalMove: (from: string, to: string) => `لا يمكن النقل من «${from}» إلى «${to}»`,
    nothingHere: "لا شيء هنا",
    emptyTitle: "لا توجد مشكلات بعد",
    emptyDesc: "اضغط زر الملاحظات في أي صفحة لتسجيل أول مشكلة.",
    noMatchTitle: "لا توجد مشكلات مطابقة",
    noMatchDesc: "جرّب بحثًا مختلفًا.",
    colTitle: "العنوان",
    colStatus: "الحالة",
    colPriority: "الأولوية",
    colType: "النوع",
    colArea: "النطاق",
    colAge: "العمر",
    ago: agoShortAR,
    dialogTitle: "مشكلة جديدة",
    dialogErrTitle: "تعذّر التسجيل",
    titleLabel: "العنوان",
    titlePlaceholder: "ما العمل المطلوب؟",
    titleRequired: "أدخل عنوانًا للمشكلة.",
    typeLabel: "النوع",
    priorityLabel: "الأولوية",
    areaLabel: "النطاق",
    // Machine identifiers, not prose — identical in both languages.
    areaPlaceholder: "dashboard, sdk, db…",
    areaHint: "لا يستلم الوكيل إلا العمل الواقع في نطاق يملكه. اتركه فارغًا وسيوجّهه القائد.",
    assigneeLabel: "المكلَّف",
    assigneeAuto: "دع القائد يختار",
    assigneeDisabled: " (معطّل)",
    assigneeHint: "تسمية شخص بعينه تتجاوز توجيه النطاق تمامًا — سيستلمها حتى لو لم يكن النطاق نطاقه.",
    humanOnlyDesc: "لن يستلمها الوكلاء أبدًا مهما كان المكلَّف. للعمل الذي تنوي إنجازه بنفسك.",
    detailsLabel: "التفاصيل",
    detailsPlaceholder: "كيف يبدو الإنجاز؟ وهل هناك ما يجب ألا يلمسه الوكيل؟",
    detailsHint: "العنوان وحده يكفي. اتركه فارغًا وسيسألك الوكيل عمّا يحتاجه قبل أن يبدأ.",
    filing: "جارٍ التسجيل…",
    fileIssue: "تسجيل المشكلة",
  },

  sources: {
    title: "المصادر",
    desc: "كل ما يغذّي دماغ المشروع وفق جدول زمني — مستودعات وخلاصات وقنوات واستعلامات محفوظة.",
    addSource: "إضافة مصدر",
    statSources: "المصادر",
    statCollecting: "نشطة",
    statFailing: "متعطّلة",
    statRuns: "مرات التشغيل",
    emptyTitle: "لا توجد مصادر بعد",
    emptyDesc: "أضف مستودعًا أو خلاصة أو استعلامًا محفوظًا وسيبقى الدماغ محدَّثًا من تلقاء نفسه.",
    ago: agoLongAR,
    runningWord: "قيد التشغيل",
    loadingRuns: "جارٍ تحميل عمليات التشغيل…",
    noRuns: "لا توجد عمليات تشغيل بعد.",
    runOk: "نجح",
    runFailed: "فشل",
    trigger: (t: string) =>
      t === "manual" ? "يدوي" : t === "schedule" || t === "scheduled" ? "مجدول" : t,
    items: (n: number, truncated: boolean) => {
      const w =
        n === 1 ? "عنصر واحد" : n === 2 ? "عنصران" : n >= 3 && n <= 10 ? `${n} عناصر` : `${n} عنصرًا`;
      return `${w}${truncated ? "+" : ""}`;
    },
    hideRuns: "إخفاء عمليات التشغيل",
    showRuns: "عرض عمليات التشغيل",
    refreshTitle: "شغّله الآن واعرض ما حدث",
    disable: "تعطيل",
    enable: "تفعيل",
    deleteTitle: "حذف هذا المصدر",
    confirmDelete: (name: string) =>
      `حذف المصدر «${name}»؟\n\nما جمعه سابقًا يبقى في الدماغ — إزالة القناة لا تعني أن المعرفة كانت خاطئة.`,
    off: "متوقف",
    failingBadge: (n: number) => `متعطّل${n > 1 ? ` ×${n}` : ""}`,
    into: "في",
    every: "كل",
    lastRun: "آخر تشغيل",
    runsCount: (n: number) =>
      n === 1 ? "تشغيل واحد" : n === 2 ? "تشغيلان" : n >= 3 && n <= 10 ? `${n} تشغيلات` : `${n} تشغيل`,
    collected: "تم الجمع.",
    refreshFailed: "فشلت عملية الجمع.",
    formTitle: "إضافة مصدر",
    kindLabel: "النوع",
    kindHint: "النظام الذي يتصل به هذا المصدر. اختيار النوع يحمّل مثالًا لإعداداته أدناه.",
    pickConnector: "اختر موصّلًا",
    nameLabel: "الاسم",
    nameHint: "يظهر في القائمة وفي كل رسالة خطأ — فاجعله الاسم الذي تستخدمه فعلًا عند الحديث عنه.",
    namePlaceholder: "خلاصة مدونة Go",
    collectIntoLabel: "الجمع في",
    collectIntoHint: "نطاق الأسماء في الدماغ الذي تستقر فيه الذكريات. الافتراضي هو نطاق المشروع نفسه.",
    scheduleLabel: "الجدولة",
    scheduleHint: "معدل تشغيله التلقائي: ‏@hourly أو ‏@daily أو فترة مثل ‏30m.",
    configLabel: "الإعدادات",
    configHint: (kind: string) =>
      `ما يحتاجه ${kind || "الموصّل"} للوصول إلى نظامه. الأسرار تُذكر هنا بأسمائها وتُجلب من الخزنة — ولا تُلصق أبدًا.`,
    jsonError: "هذا ليس JSON صالحًا — تحقق من فاصلة زائدة أو علامة اقتباس ناقصة.",
    nameFirst: "أدخل الاسم أولًا.",
    fixConfig: "صحّح الإعدادات أولًا.",
    createdOff: "يُنشأ المصدر متوقفًا — فعّله بعد أن تشغّله مرة واحدة.",
    saving: "جارٍ الحفظ…",
    createSource: "إنشاء المصدر",
  },

  brain: {
    title: "دماغ المشروع",
    desc: "ما يعرفه هذا المشروع، ومن أين جاء كل جزء منه. كل وكيل يقرأ منه، وكل مصدر يكتب فيه.",
    keywordTitle: "الاستدعاء هنا بالكلمات المفتاحية فقط",
    kbBefore: "المضمِّن المستخدم هو ",
    kbMiddle:
      "، وهو حقيبة كلمات مجزّأة بلا محتوى دلالي: «زر تسجيل الدخول معطّل» و«فشلت المصادقة» تُحسبان غير مترابطتين. عيّن ",
    kbAfter: " إلى نقطة نهاية تضمينات للحصول على استدعاء حقيقي.",
    statMemories: "الذكريات",
    statEntities: "الكيانات",
    statConnections: "الروابط",
    statNamespace: "نطاق الأسماء",
    everything: "الكل",
    mentions: (n: number) =>
      n === 1 ? "إشارة واحدة" : n === 2 ? "إشارتان" : n >= 3 && n <= 10 ? `${n} إشارات` : `${n} إشارة`,
    noMemoriesRef: "لا توجد ذكريات تشير إلى هذا بعد.",
    filtered: "الذكريات المصفّاة",
    recent: "الأحدث",
    emptyTitle: "لا شيء هنا بعد",
    emptyDesc: "أضف مصدرًا أو ارفع مستندًا وسيمتلئ الدماغ من تلقاء نفسه.",
  },

  chat: {
    title: "المحادثة",
    desc: "اسأل أي وكيل في الأسطول. تأتي الإجابات من دماغ المشروع، مع عرض ما استُند إليه أسفلها.",
    pickAgent: "اختر وكيلًا",
    newChat: "جديدة",
    untitled: "(بدون عنوان)",
    deleteAria: "حذف هذه المحادثة",
    confirmDelete: "أتريد حذف هذه المحادثة؟ لم يُحتفظ في الدماغ بأي شيء منها.",
    askAgent: (name: string) => `اسأل ${name}`,
    emptyDesc: "تأتي الإجابات من دماغ المشروع، مع عرض الذكريات المستخدمة أسفلها.",
    notGrounded: "لا شيء في دماغ المشروع يطابق سؤالك — هذه معرفة النموذج نفسه.",
    groundedIn: (n: number) =>
      n === 1 ? "مستندة إلى ذكرى واحدة" : `مستندة إلى ${n} من الذكريات`,
    thinking: "جارٍ التفكير…",
    inputPlaceholder: "اسأل عن هذا المشروع…",
    ask: "اسأل",
  },
};

/**
 * useStrings — the page-strings hook. `useT()` (from the LanguageProvider
 * already mounted in providers.tsx) is the single language authority; this
 * only maps its locale onto the typed dictionary above.
 */
const useStrings = (): { S: Strings; isRTL: boolean; language: "en" | "ar" } => {
  const { language, isRTL } = useT();
  return { S: language === "ar" ? ar : en, isRTL, language };
};

export { useStrings };
export type { Strings };

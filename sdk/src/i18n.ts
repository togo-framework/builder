/**
 * "3h ago", in the panel's own voice.
 *
 * Copied from the dashboard's agoLongEN rather than imported: this bundle
 * ships into somebody else's page with no build step and cannot reach into the
 * app's source tree. Same output on both surfaces, which is the point — a
 * comment that says "5m ago" on the issue page must not say "just now" in the
 * panel beside it.
 */
const agoEN = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!iso || !Number.isFinite(ms)) return "—";
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const agoAR = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!iso || !Number.isFinite(ms)) return "—";
  const m = Math.round(ms / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m}د`;
  const h = Math.round(m / 60);
  if (h < 48) return `قبل ${h}س`;
  return `قبل ${Math.round(h / 24)}ي`;
};

const en = {
  fab: "Feedback",
  title: "Feedback",
  intro:
    "Found a bug, have an idea, or want to ask something about this page? It is attached to the page you are on.",
  report: "Report an issue",
  onThisPage: "On this page",
  issueCount: (n: number) => `${n} issue${n === 1 ? "" : "s"} on this page`,
  none: "Nothing reported on this page yet.",
  loading: "Loading…",
  close: "Close",
  reportTitle: "Report an issue",
  type: "Type",
  bug: "Bug",
  feature: "Feature",
  question: "Question",
  discussion: "Discussion",
  titleLabel: "Title",
  titlePlaceholder: "Brief description",
  details: "Details",
  detailsPlaceholder: "Steps to reproduce, expected vs actual, etc.",
  cancel: "Cancel",
  // Said explicitly. The body is rendered as markdown everywhere it is read —
  // the issue page, the panel, the agent's prompt — and a reporter who does
  // not know that writes a wall of plain text where a list would have done.
  markdownHint: "Markdown supported — **bold**, `code`, lists.",
  pageUrl: "Page URL",
  location: "Location",
  pin: "Pin location",
  pinAnother: "Pin another",
  pinning: "Click an element on the page…  (Esc to cancel)",
  pinned: (tag: string) => `Pinned <${tag}>`,
  clear: "Clear",
  attachments: "Attachments",
  addFile: "Add file",
  screenshot: "Screenshot",
  submit: "Submit",
  submitting: "Submitting…",
  // The disclosure is a requirement, not a nicety: a report that quietly
  // ships the page's console and network activity is surveillance, not
  // feedback. Say what is attached, and offer the way out.
  //
  // The app is NAMED. A shell can host several at once, and "the product page"
  // is not an answer when the reporter has switched between three of them —
  // they have to be able to see, before they send, that the console about to
  // be attached is auth's and not the dashboard's.
  ctxAttached: (app: string, c: number, n: number) =>
    `Console and network activity from ${app} will be attached (${c} console line${c === 1 ? "" : "s"}, ${n} request${n === 1 ? "" : "s"}).`,
  ctxOptOut: "Send without console & network activity",
  created: (n: number) => `Reported as #${n}`,
  failed: "Could not submit. Try again.",
  titleRequired: "A title is required.",
  agentWorking: "An agent is working on this",
  agentWorkingBy: (who: string) => `${who} is working on this`,
  openBoard: "Open the issue board",
  // The launcher. "Build" rather than "Admin" or "Tools": these four screens
  // are how the app in front of you gets built, and naming them for that is
  // what makes it obvious they are not part of the product.
  apps: "Build",
  appAgents: "Agents",
  appSkills: "Skills",
  appIssues: "Issues",
  appVault: "Vault",
  appMcp: "MCP",
  appSources: "Sources",
  appDocs: "Library",
  appBrain: "Brain",
  appChat: "Chat",
  appTerminal: "Terminal",

  // ---- issue detail ---------------------------------------------------------
  // Vocabulary lifted verbatim from the dashboard's issue page (web i18n,
  // issueDetail). The panel and the page show the same issue; a property that
  // is "Attempts" on one and "Runs" on the other is two products.
  back: "Back",
  openFull: "Open the full issue",
  opened: (ago: string) => `Opened ${ago}`,
  ago: agoEN,
  properties: "Properties",
  statusLabel: "Status",
  priorityLabel: "Priority",
  assigneeLabel: "Assignee",
  areaLabel: "Area",
  branchLabel: "Branch",
  attemptsLabel: "Attempts",
  routeLabel: "Route",
  // Every property stays visible with nothing in it, the way the issue page
  // keeps an empty one as an invitation rather than hiding the row.
  notSet: "Not set",
  assigneeAnyArea: "Any area",
  assigneeHuman: "Human only",
  working: "An agent is working on it",
  statuses: {
    triage: "Triage",
    ready: "To do",
    in_progress: "In progress",
    blocked: "Blocked",
    in_review: "Review",
    done: "Done",
    rejected: "Rejected",
  } as Record<string, string>,
  priorities: {
    low: "Low",
    normal: "Normal",
    high: "High",
    critical: "Critical",
  } as Record<string, string>,
  enhancement: "Enhancement",
  chore: "Chore",
  // Pins
  pinnedHeading: "Pinned element",
  pinShow: "Show it on the page",
  pinNoStrategy: "No selector was captured, so this pin cannot be re-found.",
  pinFound: (by: string, pct: number) => `Found via ${by} (${pct}%)`,
  pinLost: "The pinned element is not on this page any more.",
  // Activity: comments and events, one stream
  activityHeading: "Activity",
  emptyThread: "Comments and agent activity land here as the work moves.",
  agentBadge: "Agent",
  commentPlaceholder: "Leave a comment…",
  commentCta: "Comment",
  posting: "Posting…",
  noDescription: "No description.",
  // Event lines. The action is a machine verb from the server; these are the
  // ones it can emit, phrased as something a reader recognises.
  actions: {
    created: "filed it",
    moved: "moved it",
    assigned: "assigned it",
    commented: "commented",
    edited: "edited it",
    linked: "linked something",
    unlinked: "unlinked something",
    attached: "attached a file",
    pinned: "pinned an element",
    claimed: "claimed it",
    released: "released it",
    blocked: "blocked it",
    unblocked: "unblocked it",
    approved: "approved it",
    rejected: "rejected it",
    pushed: "pushed",
    pr_opened: "opened a pull request",
    reviewed: "reviewed it",
    parked: "parked it",
  } as Record<string, string>,
  actors: {
    human: "Someone",
    agent: "An agent",
    system: "The system",
    anon: "A visitor",
  } as Record<string, string>,
  dir: "ltr" as "ltr" | "rtl",
};

type Dict = typeof en;

const ar: Dict = {
  fab: "ملاحظات",
  title: "الملاحظات",
  intro: "وجدت خطأ، أو لديك فكرة، أو سؤال عن هذه الصفحة؟ سيتم إرفاقها بالصفحة الحالية.",
  report: "الإبلاغ عن مشكلة",
  onThisPage: "في هذه الصفحة",
  issueCount: (n: number) => `${n} مشكلة في هذه الصفحة`,
  none: "لا توجد بلاغات على هذه الصفحة بعد.",
  loading: "جارٍ التحميل…",
  close: "إغلاق",
  reportTitle: "الإبلاغ عن مشكلة",
  type: "النوع",
  bug: "خطأ",
  feature: "ميزة",
  question: "سؤال",
  discussion: "نقاش",
  titleLabel: "العنوان",
  titlePlaceholder: "وصف مختصر",
  details: "التفاصيل",
  detailsPlaceholder: "خطوات إعادة الإنتاج، المتوقع مقابل الفعلي، إلخ.",
  cancel: "إلغاء",
  markdownHint: "يدعم Markdown — **عريض**، `شيفرة`، قوائم.",
  pageUrl: "رابط الصفحة",
  location: "الموقع",
  pin: "تحديد الموقع",
  pinAnother: "تحديد موقع آخر",
  pinning: "اختر عنصرًا في الصفحة…  (Esc للإلغاء)",
  pinned: (tag: string) => `تم التحديد <${tag}>`,
  clear: "مسح",
  attachments: "المرفقات",
  addFile: "إضافة ملف",
  screenshot: "لقطة شاشة",
  submit: "إرسال",
  submitting: "جارٍ الإرسال…",
  ctxAttached: (app: string, c: number, n: number) =>
    `سيتم إرفاق نشاط وحدة التحكم والشبكة من ${app} (${c} سطر، ${n} طلب).`,
  ctxOptOut: "الإرسال دون نشاط وحدة التحكم والشبكة",
  created: (n: number) => `تم الإبلاغ برقم #${n}`,
  failed: "تعذّر الإرسال. حاول مرة أخرى.",
  titleRequired: "العنوان مطلوب.",
  agentWorking: "يعمل أحد الوكلاء على هذه المشكلة",
  agentWorkingBy: (who: string) => `${who} يعمل على هذه المشكلة`,
  openBoard: "فتح لوحة المشكلات",
  apps: "البناء",
  appAgents: "الوكلاء",
  appSkills: "المهارات",
  appIssues: "المشكلات",
  appVault: "الخزنة",
  appMcp: "MCP",
  appSources: "المصادر",
  appDocs: "المكتبة",
  appBrain: "الدماغ",
  appChat: "المحادثة",
  appTerminal: "الطرفية",

  back: "رجوع",
  openFull: "فتح المهمة كاملة",
  opened: (ago: string) => `فُتحت ${ago}`,
  ago: agoAR,
  properties: "الخصائص",
  statusLabel: "الحالة",
  priorityLabel: "الأولوية",
  assigneeLabel: "المكلَّف",
  areaLabel: "النطاق",
  branchLabel: "الفرع",
  attemptsLabel: "المحاولات",
  routeLabel: "المسار",
  notSet: "غير محدَّد",
  assigneeAnyArea: "أي مجال",
  assigneeHuman: "بشري فقط",
  working: "يعمل أحد الوكلاء عليها",
  statuses: {
    triage: "الفرز",
    ready: "للتنفيذ",
    in_progress: "قيد التنفيذ",
    blocked: "متعثرة",
    in_review: "قيد المراجعة",
    done: "منجزة",
    rejected: "مرفوضة",
  },
  priorities: {
    low: "منخفضة",
    normal: "عادية",
    high: "عالية",
    critical: "حرجة",
  },
  enhancement: "تحسين",
  chore: "مهمة روتينية",
  pinnedHeading: "العنصر المثبّت",
  pinShow: "إظهاره في الصفحة",
  pinNoStrategy: "لم يُلتقط أي محدِّد، لذا لا يمكن إيجاد هذا التثبيت مجددًا.",
  // Western digits, matching the rest of this dictionary.
  pinFound: (by: string, pct: number) => `عُثر عليه عبر ${by} (${pct}%)`,
  pinLost: "لم يعد العنصر المثبّت موجودًا في هذه الصفحة.",
  activityHeading: "النشاط",
  emptyThread: "تظهر التعليقات ونشاط الوكلاء هنا مع تقدّم العمل.",
  agentBadge: "وكيل",
  commentPlaceholder: "اكتب تعليقًا…",
  commentCta: "تعليق",
  posting: "جارٍ النشر…",
  noDescription: "لا يوجد وصف.",
  actions: {
    created: "سجّلها",
    moved: "نقلها",
    assigned: "أسندها",
    commented: "علّق",
    edited: "عدّلها",
    linked: "ربط شيئًا بها",
    unlinked: "ألغى ربط شيء بها",
    attached: "أرفق ملفًا",
    pinned: "ثبّت عنصرًا",
    claimed: "استلمها",
    released: "تركها",
    blocked: "عطّلها",
    unblocked: "أزال تعطيلها",
    approved: "وافق عليها",
    rejected: "رفضها",
    pushed: "دفع التغييرات",
    pr_opened: "فتح طلب دمج",
    reviewed: "راجعها",
    parked: "علّقها جانبًا",
  },
  actors: {
    human: "أحدهم",
    agent: "وكيل",
    system: "النظام",
    anon: "زائر",
  },
  dir: "rtl",
};

export function dict(locale: string): Dict {
  return locale.toLowerCase().startsWith("ar") ? ar : en;
}

export type { Dict };

import { useT } from "@togo-framework/ui";

/**
 * i18n.ai — EN/AR strings for the three AI surfaces (chat, mcp, terminal).
 *
 * A SEPARATE file from lib/i18n.ts on purpose, and temporary: four redesigns
 * were running against the same dictionary at once, and a shared file that
 * every one of them appends to is a merge conflict per save. Same shape, same
 * conventions as lib/i18n.ts — counted phrases are functions because Arabic
 * plurals are not an `s` suffix, machine values (tool names, URLs, flags) stay
 * verbatim in both languages because they are identifiers, not prose — so a
 * later pass can paste these three blocks into the main dictionary unchanged.
 */

/** Long relative age — "5m ago" / "قبل 5د". */
const agoEN = (iso: string | null): string => {
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

const agoAR = (iso: string | null): string => {
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
  chat: {
    /* Conversation rail */
    historyHeading: "Conversations",
    historyOpen: "History",
    historyEmpty: "Nothing yet",
    historyEmptyDesc: "Every question you ask is kept here so you can come back to the answer.",
    messages: (n: number) => `${n} message${n === 1 ? "" : "s"}`,
    ago: agoEN,

    /* Thread toolbar */
    you: "You",
    agentLabel: "Answering",
    spend: "Spend",
    spendTitle: "What this conversation has cost since you opened the page. Reopened conversations start from zero — the earlier spend is on the agent's own record.",
    noAgents: "No agent is switched on. Enable one on the Agents screen and it appears here.",

    /* Wayfinders — the empty thread */
    startersHeading: "Start with one of these",
    startersFromBrain: "Drawn from what this project's brain actually holds right now.",
    startersGeneric: "The brain has nothing in it yet, so these are the questions an agent can answer from its own persona.",
    starterEntity: (name: string) => `What does this project know about ${name}?`,
    starterSource: (label: string) => `Summarise what ${label} has contributed to the project brain.`,
    starterRecent: "What is the most recent thing the brain learned, and does it change anything?",
    starterRole: (role: string) => `You own ${role} — what is currently the riskiest thing in it?`,
    starterOwnership: "What do you own on this project, and what would you refuse to touch?",
    starterGaps: "What would you need to know before your next run that the brain does not have?",

    /* Progress — honest, because there is no token stream on this endpoint */
    workingRecall: "Searching the project brain…",
    workingAnswer: "Writing the answer…",
    workingLong: "Still going. The agent has up to two minutes.",
    elapsed: (s: number) => `${s}s`,

    /* Per-answer actions */
    copy: "Copy answer",
    copied: "Copied",
    askAgain: "Ask again",
    askAgainTitle: "Send the same question again. This is a second run and costs again.",

    /* Trust indicators */
    sourcesHeading: "Grounded in",
    sourceOrdinal: (n: number) => `Source ${n}`,
    inspectorTitle: "Source",
    inspectorDesc: "The memory verbatim, as the agent received it.",
    matchLabel: "Match",
    matchTitle: "How closely this memory matched the question. Higher is closer.",
    fromLabel: "From",
    openBrain: "Open the project brain",
    ungroundedShort: "Model's own knowledge",

    /* Composer */
    composerHint: "Enter sends · Shift + Enter for a new line",
    stopHint: "The answer arrives in one piece — it cannot be interrupted once asked.",
  },

  mcp: {
    title: "MCP",
    desc: "Connect Claude Code, Codex or any MCP client to this builder — read the board, file issues, and talk to the fleet and its memory.",

    serversHeading: "Servers",
    serversNote: "Two servers with very different blast radii. A token is minted for one of them, so what a client can reach is decided before it ever connects.",
    endpointLabel: "Endpoint",
    copyUrl: "Copy URL",
    toolsCount: (n: number) => `${n} tool${n === 1 ? "" : "s"}`,
    badgeFeedback: "issue board",
    badgeAgents: "fleet & memory",

    /* Reachability — a 401 is the honest proof that the server is mounted */
    probeChecking: "Checking…",
    probeListening: "Listening",
    probeListeningTitle: "The server answered and asked for a bearer token. That is what a healthy MCP endpoint does to an unauthenticated request.",
    probeUnreachable: "No response",
    probeUnreachableTitle: "Nothing answered on this URL. The builder may not be running, or something in front of it is blocking the path.",
    probeOdd: "Unexpected",
    probeOddTitle: "Something answered, but not the way an MCP endpoint should. Check what is serving this path.",

    stepsHeading: "How to connect",
    step1: "Mint a token below, scoped to the least the client needs.",
    step2: "Paste the command or the config block into the client.",
    step3: "Ask the client to list its tools. If the names below come back, you are connected.",

    vaultTitle: "Secret values never leave the vault",
    vaultBody: "The agents server can list the NAMES of your credentials so a client knows what exists. It cannot read one. Reveal a value from the Vault screen, where every read is recorded.",

    /* New-token form */
    formTitle: "New token",
    nameLabel: "What is it for?",
    namePlaceholder: "my laptop",
    nameHint: "Names are how you find the right one to revoke — 'my laptop', 'Codex', 'CI'.",
    scopeLabel: "Reaches",
    scopeHint: "Grant the least the client needs — a board-only token cannot touch the fleet.",
    scopeFeedback: "Issue board only",
    scopeAgents: "Fleet, skills and memory",
    scopeAll: "Everything",
    noteReady: "Shown once, stored hashed.",
    noteNameFirst: "Name the token, so you know which one to revoke later.",
    creating: "Creating…",
    createCta: "Create token",

    /* Minted */
    mintedTitle: (name: string) => `${name} — copy it now`,
    mintedWarn: "This is the only time the token is shown. Only its hash is stored, so if you lose it you revoke it and make another.",
    tokenLabel: "Token",
    copyToken: "Copy token",
    tabClaude: "Claude Code",
    tabJson: "mcp.json",
    tabClaudeNote: "Run this in the directory you want the server available in.",
    tabJsonNote: "Anything that reads an mcp.json — Codex, Cursor, your own client.",
    bothServers: "This token reaches both servers. The snippets show the fleet one; swap `agents` for `feedback` in the URL to add the board as a second entry.",
    doneCta: "Done",

    /* Token list */
    tokensHeading: "Tokens",
    revoke: "Revoke",
    neverUsed: "never used",
    createdAgo: (s: string) => `created ${s}`,
    lastUsedAgo: (s: string) => `last used ${s}`,
    emptyTitle: "No tokens yet",
    emptyDesc: "Create one above to connect a client.",
    ago: agoEN,

    /* Tool descriptions — verbatim from the server's own tool registry */
    tools: {
      list_issues: "List issues on the board. Use it before filing, so a client comments on the existing issue instead of opening a duplicate.",
      get_issue: "Read one issue in full: body, pinned elements, the whole discussion, and what each agent did to it.",
      create_issue: "File an issue. It enters triage, which classifies it and either queues it for an agent or asks a question back.",
      comment_on_issue: "Add a comment. One beginning `approved` releases a blocked issue back to the queue; one beginning `rejected` closes it.",
      list_agents: "List the fleet: who each agent is, what surfaces they own, which skills they load, and whether they are working right now.",
      get_agent: "Read one agent in full, including the persona it runs on — why it makes the decisions it makes.",
      recall_memory: "Search what an agent has learned. Ask before assuming something about this codebase.",
      retain_memory: "Teach an agent something durable. Facts still true next month, not notes about the task at hand.",
      list_skills: "List the skill catalogue — the procedures agents load by name.",
      get_skill: "Read one skill's full instructions.",
      list_secret_names: "List the NAMES of credentials in the vault. Values are never returned over MCP.",
      list_apps: "List the custom apps installed on this builder, and what the last scan rejected.",
      create_app: "Add a screen to this builder — a launcher tile and a route at /apps/<slug>. Live on a rescan, with no restart and no edit to builder's source.",
    },
  },

  term: {
    title: "Terminal",
    desc: "A shell on the machine this builder runs on.",
    descIn: (dir: string) => `tmux in ${dir}. Sessions keep running when you close the tab.`,

    sessionsHeading: "Sessions",
    newSession: "New session",
    namePlaceholder: "session name",
    nameAria: "Name for the new session",
    killAria: (n: string) => `Kill ${n}`,
    killTitle: "End this session and everything running in it",

    attached: "attached",
    detached: "detached",
    attachedSince: (t: string) => `attached ${t}`,
    reconnect: "Reconnect",
    reconnectTitle: "Drop the socket and attach again",
    jumpToLatest: "Jump to latest",
    following: "Following output",
    // Truthful about WHERE the scrollback is. Attached to tmux the browser
    // holds none of it — tmux owns the screen and its own history — so naming
    // the browser's 5000-line buffer here would send the operator to a control
    // that does nothing. The prefix key is deliberately not named: it is
    // whatever the machine's tmux is configured with.
    scrollbackNote: "Scrollback belongs to tmux — enter its copy mode (prefix, then `[`) to read back.",

    emptyPickTitle: "Pick a session",
    emptyPickDesc: "Choose one above to attach to it.",
    emptyNoneTitle: "No sessions yet",
    emptyNoneDesc: "Start one to run claude, gh, git — anything you would run in a terminal here.",

    offTitle: "The terminal is off",
    offBody: "It is off by default on purpose: anyone who can reach this dashboard would be able to run commands on this machine. It refuses to run in production whatever the flag says.",
    noTmuxTitle: "tmux is not installed",
    noTmuxBody: "Sessions run inside tmux so they survive closing this tab. Install it and reload:",
    copyCommand: "Copy",
    copied: "Copied",
  },
};

type AIStrings = typeof en;

const ar: AIStrings = {
  chat: {
    historyHeading: "المحادثات",
    historyOpen: "السجل",
    historyEmpty: "لا شيء بعد",
    historyEmptyDesc: "يُحفظ كل سؤال تطرحه هنا لتعود إلى إجابته وقتما شئت.",
    messages: (n: number) =>
      n === 1 ? "رسالة واحدة" : n === 2 ? "رسالتان" : n >= 3 && n <= 10 ? `${n} رسائل` : `${n} رسالة`,
    ago: agoAR,

    you: "أنت",
    agentLabel: "المجيب",
    spend: "الإنفاق",
    spendTitle: "ما كلّفته هذه المحادثة منذ فتحك الصفحة. المحادثات المُعاد فتحها تبدأ من الصفر — والإنفاق السابق مسجَّل في سجل الوكيل نفسه.",
    noAgents: "لا يوجد وكيل مفعّل. فعّل واحدًا من شاشة الوكلاء ليظهر هنا.",

    startersHeading: "ابدأ بواحد من هذه",
    startersFromBrain: "مستمدة مما يحتويه دماغ هذا المشروع فعلًا الآن.",
    startersGeneric: "الدماغ فارغ بعد، لذا هذه أسئلة يجيب عنها الوكيل من شخصيته وحدها.",
    starterEntity: (name: string) => `ماذا يعرف هذا المشروع عن ${name}؟`,
    starterSource: (label: string) => `لخّص ما أضافه ${label} إلى دماغ المشروع.`,
    starterRecent: "ما آخر ما تعلّمه الدماغ، وهل يغيّر ذلك شيئًا؟",
    starterRole: (role: string) => `أنت تملك ${role} — ما أخطر ما فيه حاليًا؟`,
    starterOwnership: "ما الذي تملكه في هذا المشروع، وما الذي ترفض المساس به؟",
    starterGaps: "ما الذي تحتاج معرفته قبل تشغيلك التالي ولا يملكه الدماغ؟",

    workingRecall: "يبحث في دماغ المشروع…",
    workingAnswer: "يكتب الإجابة…",
    workingLong: "ما زال يعمل. أمام الوكيل دقيقتان كحد أقصى.",
    elapsed: (s: number) => `${s}ث`,

    copy: "نسخ الإجابة",
    copied: "نُسخت",
    askAgain: "اسأل مجددًا",
    askAgainTitle: "إرسال السؤال نفسه مرة أخرى. هذا تشغيل ثانٍ وتكلفة ثانية.",

    sourcesHeading: "مستندة إلى",
    sourceOrdinal: (n: number) => `المصدر ${n}`,
    inspectorTitle: "المصدر",
    inspectorDesc: "نص الذكرى حرفيًا كما وصل الوكيل.",
    matchLabel: "التطابق",
    matchTitle: "مدى قرب هذه الذكرى من السؤال. الأعلى أقرب.",
    fromLabel: "من",
    openBrain: "افتح دماغ المشروع",
    ungroundedShort: "معرفة النموذج نفسه",

    composerHint: "‏Enter للإرسال · ‏Shift + Enter لسطر جديد",
    stopHint: "تصل الإجابة دفعة واحدة — ولا يمكن إيقافها بعد السؤال.",
  },

  mcp: {
    // Machine name, verbatim in both languages.
    title: "MCP",
    desc: "اربط Claude Code أو Codex أو أي عميل MCP بهذا الباني — ليقرأ اللوحة ويسجّل المشكلات ويحادث الأسطول وذاكرته.",

    serversHeading: "الخوادم",
    serversNote: "خادمان بنطاقَي أثر مختلفَين تمامًا. يُصدر الرمز لأحدهما، فيُحسم ما يصل إليه العميل قبل أن يتصل أصلًا.",
    endpointLabel: "نقطة الاتصال",
    copyUrl: "نسخ الرابط",
    toolsCount: (n: number) =>
      n === 1 ? "أداة واحدة" : n === 2 ? "أداتان" : n >= 3 && n <= 10 ? `${n} أدوات` : `${n} أداة`,
    badgeFeedback: "لوحة المشكلات",
    badgeAgents: "الأسطول والذاكرة",

    probeChecking: "جارٍ الفحص…",
    probeListening: "يستمع",
    probeListeningTitle: "ردّ الخادم وطلب رمزًا. هذا ما تفعله نقطة MCP سليمة مع طلب غير موثّق.",
    probeUnreachable: "لا استجابة",
    probeUnreachableTitle: "لم يردّ شيء على هذا الرابط. قد يكون الباني متوقفًا، أو أن شيئًا أمامه يحجب المسار.",
    probeOdd: "استجابة غير متوقعة",
    probeOddTitle: "ردّ شيء ما، لكن ليس بالطريقة التي تردّ بها نقطة MCP. تحقق مما يخدم هذا المسار.",

    stepsHeading: "كيف تتصل",
    step1: "أصدر رمزًا أدناه، بأقل نطاق يحتاجه العميل.",
    step2: "الصق الأمر أو كتلة الإعداد في العميل.",
    step3: "اطلب من العميل سرد أدواته. إن عادت الأسماء أدناه فأنت متصل.",

    vaultTitle: "قيم الأسرار لا تغادر الخزنة",
    vaultBody: "يستطيع خادم الأسطول سرد أسماء بيانات اعتمادك ليعرف العميل ما هو موجود. ولا يستطيع قراءة أي قيمة. اكشف القيمة من شاشة الخزنة، حيث تُسجَّل كل قراءة.",

    formTitle: "رمز جديد",
    nameLabel: "لأي غرض؟",
    namePlaceholder: "حاسوبي المحمول",
    nameHint: "الأسماء هي ما يدلّك على الرمز الصحيح عند الإبطال — «حاسوبي» أو «Codex» أو «CI».",
    scopeLabel: "يصل إلى",
    scopeHint: "امنح أقل ما يحتاجه العميل — رمز اللوحة وحدها لا يمس الأسطول.",
    scopeFeedback: "لوحة المشكلات فقط",
    scopeAgents: "الأسطول والمهارات والذاكرة",
    scopeAll: "كل شيء",
    noteReady: "يُعرض مرة واحدة، ويُخزَّن مجزّأً.",
    noteNameFirst: "سمِّ الرمز لتعرف أيّها تُبطل لاحقًا.",
    creating: "جارٍ الإنشاء…",
    createCta: "إنشاء الرمز",

    mintedTitle: (name: string) => `${name} — انسخه الآن`,
    mintedWarn: "هذه المرة الوحيدة التي يُعرض فيها الرمز. لا يُخزَّن إلا تجزئته، فإن ضاع منك فأبطله وأنشئ غيره.",
    tokenLabel: "الرمز",
    copyToken: "نسخ الرمز",
    tabClaude: "Claude Code",
    tabJson: "mcp.json",
    tabClaudeNote: "شغّل هذا في الدليل الذي تريد الخادم متاحًا فيه.",
    tabJsonNote: "أي عميل يقرأ ملف mcp.json — ‏Codex أو Cursor أو عميلك الخاص.",
    bothServers: "هذا الرمز يصل إلى الخادمين. المقتطفات تعرض خادم الأسطول؛ استبدل `agents` بـ `feedback` في الرابط لإضافة اللوحة كمدخل ثانٍ.",
    doneCta: "تم",

    tokensHeading: "الرموز",
    revoke: "إبطال",
    neverUsed: "لم يُستخدم قط",
    createdAgo: (s: string) => `أُنشئ ${s}`,
    lastUsedAgo: (s: string) => `آخر استخدام ${s}`,
    emptyTitle: "لا رموز بعد",
    emptyDesc: "أنشئ واحدًا أعلاه لربط عميل.",
    ago: agoAR,

    tools: {
      list_issues: "سرد مشكلات اللوحة. استخدمها قبل التسجيل ليعلّق العميل على المشكلة القائمة بدل فتح نسخة مكررة.",
      get_issue: "قراءة مشكلة واحدة كاملة: المتن والعناصر المثبّتة والنقاش كله وما فعله كل وكيل بها.",
      create_issue: "تسجيل مشكلة. تدخل الفرز الذي يصنّفها ثم يضعها في طابور وكيل أو يعيد عليك سؤالًا.",
      comment_on_issue: "إضافة تعليق. التعليق الذي يبدأ بـ `approved` يعيد المشكلة المتعثرة إلى الطابور، والذي يبدأ بـ `rejected` يغلقها.",
      list_agents: "سرد الأسطول: من كل وكيل، وما النطاقات التي يملكها، وما المهارات التي يحمّلها، وهل يعمل الآن.",
      get_agent: "قراءة وكيل واحد كاملًا بما في ذلك شخصيته — أي لماذا يتخذ ما يتخذه من قرارات.",
      recall_memory: "البحث فيما تعلّمه الوكيل. اسأل قبل أن تفترض شيئًا عن هذه الشيفرة.",
      retain_memory: "تعليم الوكيل شيئًا دائمًا. حقائق تبقى صحيحة الشهر القادم، لا ملاحظات عن المهمة الحالية.",
      list_skills: "سرد فهرس المهارات — الإجراءات التي يحمّلها الوكلاء بأسمائها.",
      get_skill: "قراءة تعليمات مهارة واحدة كاملة.",
      list_secret_names: "سرد أسماء بيانات الاعتماد في الخزنة. لا تُعاد القيم عبر MCP أبدًا.",
      list_apps: "سرد التطبيقات المخصّصة المثبّتة على هذا البنّاء، وما رفضه آخر فحص.",
      create_app: "إضافة شاشة إلى هذا البنّاء — بلاطة في المشغّل ومسار على ‎/apps/<slug>‎. تصبح فعّالة بعد إعادة الفحص، دون إعادة تشغيل ودون تعديل شيفرة البنّاء.",
    },
  },

  term: {
    title: "الطرفية",
    desc: "صدفة على الجهاز الذي يعمل عليه هذا الباني.",
    descIn: (dir: string) => `‏tmux في ${dir}. تبقى الجلسات تعمل بعد إغلاق التبويب.`,

    sessionsHeading: "الجلسات",
    newSession: "جلسة جديدة",
    namePlaceholder: "اسم الجلسة",
    nameAria: "اسم الجلسة الجديدة",
    killAria: (n: string) => `إنهاء ${n}`,
    killTitle: "إنهاء هذه الجلسة وكل ما يعمل بداخلها",

    attached: "متصلة",
    detached: "منفصلة",
    attachedSince: (t: string) => `اتصلت ${t}`,
    reconnect: "إعادة الاتصال",
    reconnectTitle: "أغلق المقبس واتصل من جديد",
    jumpToLatest: "الانتقال إلى الأحدث",
    following: "يتابع المخرجات",
    scrollbackNote: "السجل ملك لـ tmux — ادخل وضع النسخ لديه (البادئة ثم `[`) للقراءة إلى الوراء.",

    emptyPickTitle: "اختر جلسة",
    emptyPickDesc: "اختر واحدة أعلاه للاتصال بها.",
    emptyNoneTitle: "لا جلسات بعد",
    emptyNoneDesc: "ابدأ واحدة لتشغّل claude أو gh أو git — أي شيء تشغّله في طرفية هنا.",

    offTitle: "الطرفية متوقفة",
    offBody: "هي متوقفة افتراضيًا عن قصد: كل من يصل إلى هذه اللوحة سيصبح قادرًا على تنفيذ أوامر على هذا الجهاز. وهي ترفض العمل في الإنتاج مهما كانت الراية.",
    noTmuxTitle: "‏tmux غير مثبّت",
    noTmuxBody: "تعمل الجلسات داخل tmux لتصمد بعد إغلاق التبويب. ثبّته ثم أعد التحميل:",
    copyCommand: "نسخ",
    copied: "نُسخ",
  },
};

/**
 * useAIStrings — same contract as useStrings in lib/i18n.ts. `useT()` is the
 * language authority (it owns the locale, persists it and sets document dir);
 * this only supplies the words.
 */
const useAIStrings = (): { A: AIStrings; isRTL: boolean; language: "en" | "ar" } => {
  const { language, isRTL } = useT();
  return { A: language === "ar" ? ar : en, isRTL, language };
};

export { useAIStrings };
export type { AIStrings };

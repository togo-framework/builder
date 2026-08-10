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

/** Arabic count of agent attempts — 1 singular, 2 dual, 3–10 plural, 11+ singular accusative. */
const attemptsAR = (n: number): string =>
  n === 1 ? "محاولة واحدة" : n === 2 ? "محاولتان" : n >= 3 && n <= 10 ? `${n} محاولات` : `${n} محاولة`;

const en = {
  common: {
    somethingWrong: "Something went wrong",
    cancel: "Cancel",
    close: "Close",
    loading: "Loading…",
    saving: "Saving…",
    discard: "Discard",
    on: "On",
    off: "Off",
    open: "Open",
    dismiss: "Dismiss",
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
    branchTitle: "The branch agents work this issue on",
    areaTitle: "The area this issue belongs to",
    numberTitle: (n: number) => `Issue ${n}`,
    commentsTitle: (n: number) => `${n} comment${n === 1 ? "" : "s"}`,
    // Board filters. Each reads as the unfiltered state, so the trigger says
    // what you would get if you never touched it.
    filterType: "All types",
    filterPriority: "All priorities",
    filterAgent: "All agents",
    runDelivered: (n: number) =>
      `${n} agent attempt${n === 1 ? "" : "s"} — the work went through`,
    runStalled: (n: number) =>
      `${n} agent attempt${n === 1 ? "" : "s"} — the card bounced back`,
    statusOf: (n: number) => `Status of issue ${n}`,
    illegalMove: (from: string, to: string) => `${from} → ${to} is not a legal move`,
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

  agents: {
    title: "Agents",
    desc: "The fleet that works your issue board. Only enabled agents can claim work, and an agent only takes issues in an area it owns.",
    search: "Search agents…",
    hire: "Hire an agent",
    statAgents: "Agents",
    statEnabled: "Enabled",
    statWorking: "Working now",
    statAreas: "Areas covered",
    loadErr: "Could not load the fleet",
    emptyTitle: "No agents yet",
    emptyDesc: "Run the setup wizard to generate the fleet.",
    noMatchTitle: "No agents match",
    noMatchDesc: "Try a different search.",
    working: "working",
    workingOn: (n: number) => `working #${n}`,
    enableAria: (name: string) => `Enable ${name}`,
    disableAria: (name: string) => `Disable ${name}`,
    // Card action. The button says what pressing it DOES; the card's dot says
    // what the agent currently IS.
    enable: "Enable",
    disable: "Disable",
    disabledMeta: "Disabled",
    moreCount: (n: number) => `+${n} more`,
    // Filter sentence: "12 agents in [area] running [model]"
    // Annotated: without it TS infers the literal union "agent" | "agents" and
    // the Arabic dictionary can never satisfy the shape.
    sentenceAgents: (n: number): string => (n === 1 ? "agent" : "agents"),
    sentenceIn: "in",
    sentenceRunning: "running",
    allAreas: "All areas",
    allModels: "All models",
    reset: "Reset",
    facetAreas: "Areas",
    facetStatus: "Status",
    statusEnabled: "Enabled",
    statusDisabled: "Disabled",
    statusWorking: "Working",
    noAreasFacet: "No areas yet",
    runsCount: (n: number) => `${n} run${n === 1 ? "" : "s"}`,
    memoriesCount: (n: number) => `${n} memor${n === 1 ? "y" : "ies"}`,
    noDescription: "No description yet.",
    ago: agoLongEN,
    // Hire form
    hireErrTitle: "Could not hire",
    slugLabel: "Slug",
    slugHint: "The permanent machine name — it goes into file paths and cannot change.",
    nameLabel: "Name",
    nameHint: "What the dashboard and the board call it.",
    areasLabel: "Areas it owns",
    areasHint: "Comma separated. An agent that owns no area can never claim work.",
    whatLabel: "What it does",
    whatHint: "This is what routing reads to decide who owns a report — write it for the router, not for a bio.",
    modelLabel: "Model",
    modelHint: "Haiku is cheap triage, opus is expensive depth — sonnet is the fleet default.",
    workdirLabel: "Working directory",
    workdirHint: "Where its shell starts. Blank uses the fleet default.",
    personaLabel: "Persona",
    draftAI: "Draft with AI",
    draftAgain: "Draft again",
    drafting: "Drafting…",
    draftingNote: "Claude Code is reading the repository. This takes up to a minute.",
    draftedFor: (cost: string) => `Drafted for ${cost}. Edit anything it got wrong before hiring.`,
    draftOptional: "Optional. Leave it blank and the agent is hired with a starter template.",
    draftErrTitle: "Could not draft a persona",
    draftErrNote: "You can still hire the agent and write its persona yourself.",
    noteSlugFirst: "Give it a slug first.",
    noteAreasFirst: "Give it at least one area — otherwise it can never claim work.",
    noteReady: "Created with its own brain, disabled — read the persona, then enable it.",
    hiring: "Hiring…",
    hireCta: "Hire",
    // Detail page
    back: "Agents",
    loadOneErr: "Could not load the agent",
    tabOverview: "Overview",
    tabSkills: "Skills",
    tabRuns: "Runs",
    tabMemory: "Memory",
    enabledLabel: "Enabled",
    enabledHint: "Only enabled agents can claim work.",
    personaHeading: "Persona",
    savePersona: "Save persona",
    personaSaved: "Persona saved",
    saved: "Saved",
    skillsHeading: (held: number) => `Skills it loads — ${held}`,
    skillsEmpty: "No skills. This agent runs on its persona alone.",
    skillsFieldLabel: "Assigned skills, by name",
    skillsFieldHint: "Comma separated. Each name is a directory under .claude/skills — edit the list to assign or unassign.",
    runsEmptyTitle: "No runs yet",
    runsEmptyDesc: "This agent has not claimed any work.",
    runsProgress: (shown: number, total: number) => `${shown} of ${total} runs — scroll for more`,
    noBrainTitle: "No brain",
    noBrainDesc: "This agent has no memory store.",
    brainMemories: "memories",
    brainEntities: "entities",
    brainLinks: "links",
    brainGaps: "gaps",
    gapsTitle: "What it looked for and did not find",
    remembersTitle: "What it remembers",
    // Rail
    railName: "Name",
    railTitle: "Title",
    railTitlePlaceholder: "e.g. App UI Engineer",
    railModel: "Model",
    modelHaiku: "haiku — cheapest, classification",
    modelSonnet: "sonnet — the default for code",
    modelOpus: "opus — hardest reasoning",
    railColour: "Colour",
    colourAria: "Agent colour",
    colourPlaceholder: "#4f46e5 — blank derives one",
    railAvatar: "Avatar URL",
    avatarPlaceholder: "https://… or /path",
    railBudget: "Per-run budget (USD)",
    budgetHint: "One session. A run that stops here reports rather than half-finishing.",
    railTurns: "Max turns per run",
    railWorkdir: "Working directory",
    workdirPlaceholder: "/absolute/path — blank uses BUILDER_WORKDIR",
    workdirRailHint: "The repository this agent branches from. A fleet can span more than one — point each agent at the codebase its areas actually live in.",
    railAreas: "Areas it owns",
    areasRailHint: "An issue is only claimable by an agent that owns its area.",
    statRuns: "Runs",
    statSpent: "Spent",
    statCap: "Per-run cap",
    statMemories: "Memories",
    statBrain: "Brain",
    statLastRun: "Last run",
    brainYes: "yes",
    brainNone: "none",
    never: "never",
  },

  skills: {
    title: "Skills",
    desc: "The instruction files agents load by name. Editing one here rewrites its SKILL.md on disk, which is what an agent actually reads on its next run.",
    search: "Search skills…",
    sync: "Sync from disk",
    syncing: "Scanning…",
    importGh: "Import from GitHub",
    newSkill: "New skill",
    statSkills: "Skills",
    statInUse: "In use",
    statUnused: "Nobody uses",
    statDisabled: "Disabled",
    agentsCount: (n: number) => `${n} agent${n === 1 ? "" : "s"}`,
    sourceLocal: "local",
    sourceGithub: "github",
    sourceOperator: "written here",
    notInstalled: "not on disk yet",
    noTitle: "No title yet",
    noDescription: "No description.",
    enableAria: (name: string) => `Enable ${name}`,
    disableAria: (name: string) => `Disable ${name}`,
    // Card action. The button says what pressing it DOES; the card's dot says
    // what the skill currently IS.
    enable: "Enable",
    disable: "Disable",
    disabledMeta: "Disabled",
    emptyTitle: "No skills yet",
    emptyDesc: (dir: string) =>
      `Sync from disk to pick up whatever is already in ${dir}, import a repository, or write one here.`,
    noMatchTitle: "No skills match",
    noMatchDesc: "Try a different search.",
    progress: (shown: number, total: number) => `${shown} of ${total} — scroll for more`,
    // Sync / import outcome report
    scannedTitle: (dir: string, n: number) => `Scanned ${dir} — ${n} ${n === 1 ? "directory" : "directories"}`,
    added: "Added:",
    updated: "Updated:",
    nothingChanged: "Nothing changed.",
    skippedCount: (n: number) => `${n} skipped`,
    unnamed: "(unnamed)",
    // Create form
    createTitle: "New skill",
    createErrTitle: "Could not create it",
    nameLabel: "Name",
    nameHint: "Lowercase letters, digits and hyphens. This is also the directory name, and agents reference it — it cannot be changed later.",
    titleLabel: "Title",
    titleHint: "The human name shown in the catalogue.",
    whenLabel: "When an agent should reach for it",
    whenHint: "Becomes the description in the file's frontmatter — what the model reads to decide whether the skill applies.",
    bodyLabel: "Instructions",
    noteNameFirst: "Name it first — the name is the file path.",
    noteBodyFirst: "Write the instructions — an empty skill teaches nothing.",
    noteReady: "Written to .claude/skills/<name>/SKILL.md, then assign it to the agents that need it.",
    creating: "Creating…",
    createCta: "Create skill",
    // Import form
    importTitle: "Import from GitHub",
    importErrTitle: "Could not import",
    repoLabel: "Repository",
    repoHint: "owner/name, public. The default branch is what gets read.",
    folderLabel: "Folder inside it",
    folderHint: "Limits the search to one directory. Blank scans the whole repository.",
    noteRepoFirst: "Name a repository first.",
    noteImport: "Every directory holding a SKILL.md becomes a skill, up to 50 per import.",
    downloading: "Downloading…",
    importCta: "Import",
    foundTitle: (repoRef: string, n: number) => `${repoRef} — ${n} found`,
    // Detail page
    back: "All skills",
    openErr: "Could not open this skill",
    tabOverview: "Overview",
    tabBody: "Body",
    tabAgents: "Agents",
    tabActivity: "Activity",
    enabledLabel: "Enabled",
    enabledHint: "A disabled skill stays in the catalogue and keeps its assignments.",
    statHolders: "Agents holding it",
    statLoads: "Times loaded",
    statRan: "Agents that ran it",
    sourceLabel: "Source",
    pathLabel: "Path",
    editTitleLabel: "Title",
    editDescLabel: "When an agent should reach for it",
    save: "Save skill",
    savedNote: "Saved, and written to disk",
    regenerate: "Regenerate",
    regenerating: "Reading the repo…",
    regenNote: "This runs a real Claude Code session — usually two or three minutes.",
    regenDirtyTitle: "Save or discard your edits first — regenerating replaces the whole body",
    regenTitle: "Read the repository and rewrite this skill as a full procedure",
    rewritten: (words: number, cost: string, grounded: boolean) =>
      `Rewritten — ${words} words, ${cost}` + (grounded ? "" : " (no repository was available, so it is generic)"),
    agentsHeading: (held: number, total: number) => `Agents using this skill — ${held} of ${total}`,
    noAgentsTitle: "No agents yet",
    noAgentsDesc: "Hire an agent before assigning skills.",
    agentDisabled: "disabled",
    assignAria: (name: string) => `Assign to ${name}`,
    activityNote:
      "Every run that carried this skill in its context. Claude Code reports a run's result, not its individual tool calls, so this records that the skill was loaded — not that the agent reached for it.",
    notLoadedTitle: "Not loaded yet",
    notLoadedNoHolder: "No agent holds this skill, so no run has ever carried it. Assign it on the Agents tab.",
    notLoadedAssigned: "It is assigned, but no run has started since. The log fills as agents work.",
    allShown: (n: number) => `All ${n} shown.`,
    ago: agoLongEN,
    delete: "Delete skill",
    deleteTitle: (name: string) => `Delete ${name}?`,
    deleteDesc: (holders: number, path: string) =>
      `This removes the skill from the catalogue, unassigns it from the ${holders === 1 ? "one agent" : `${holders} agents`} that ${holders === 1 ? "loads" : "load"} it, and deletes ${path} from disk. It cannot be undone.`,
    keep: "Keep it",
    deleteConfirm: "Delete",
  },

  issueDetail: {
    loadErrTitle: "Could not load the issue",
    noDescription: "No description.",
    opened: (ago: string) => `Opened ${ago}`,
    ago: agoLongEN,
    // Properties rail
    branchLabel: "Branch",
    prLabel: "Pull request",
    sourceLabel: "Source",
    attemptsLabel: "Attempts",
    agentBadge: "Agent",
    assigneeHuman: "Human only",
    assigneeAnyArea: "Any area",
    onlyClaim: (assignee: string) => `Only ${assignee} can claim this.`,
    // Thread
    commentPlaceholder: "Leave a comment…",
    commentCta: "Comment",
    posting: "Posting…",
    emptyThreadTitle: "Nothing here yet",
    emptyThreadDesc: "Comments and agent activity land here as the work moves.",
    activityHeading: "Activity",
    // Captured browser context
    contextHeading: "Captured context",
    contextSummary: (logs: number, reqs: number) =>
      `${logs} console ${logs === 1 ? "entry" : "entries"}, ${reqs} ${reqs === 1 ? "request" : "requests"}`,
    consoleHeading: "Console",
    networkHeading: "Network",
    errorsCount: (n: number) => `${n} ${n === 1 ? "error" : "errors"}`,
    failedCount: (n: number) => `${n} failed`,
    reportedFrom: "Reported from",
    // Which of a shell's hosted apps the report came from — app.co vs
    // auth.app.co vs dashboard.app.co. Absent on issues filed outside a
    // multi-app shell, where there is only one app and naming it is noise.
    appLabel: "App",
    routeLabel: "Route",
    viewportLabel: "Viewport",
    userAgentLabel: "User agent",
    localeLabel: "Language",
    // Pin
    pinnedHeading: "Pinned element",
    pinVerified: "Matched on the page when the report was filed.",
    pinNoStrategy: "No selector was captured, so this pin cannot be re-found.",
    fragileTitle: "This pin may not survive",
    fragileBefore: "The selector depends on ",
    fragileAfter: ", so a layout change can break it.",
    // Delete
    deleteCta: "Delete issue",
    deleteTitle: (n: number | string) => `Delete issue #${n}?`,
    deleteDesc:
      "This removes the issue, its thread and everything captured with it. It cannot be undone.",
    keep: "Keep it",
    deleteConfirm: "Delete",
    deleting: "Deleting…",
    // Watching a live run
    tmuxLabel: "Watch it work",
    tmuxCopy: "Copy the attach command",
    tmuxCopied: "Copied",
    tmuxHint: "Run this in a terminal to watch the agent live.",
    // Shell: breadcrumb, pager, collapsible sections, properties rail
    propertiesHeading: "Properties",
    pagerPosition: (i: number, n: number) => `${i} / ${n}`,
    pagerPrev: "Previous issue",
    pagerNext: "Next issue",
    moreActions: "More actions",
    copyLink: "Copy link",
    copiedLink: "Link copied",
    starAdd: "Add to favourites",
    starRemove: "Remove from favourites",
    linksHeading: "Links",
    openLink: "Open",
    labelsLabel: "Labels",
    labelsEmpty: "No labels",
    branchEmpty: "No branch yet",
    setArea: "Set area",
    copyLog: "Copy the captured log",
    copiedLog: "Copied",
    sendComment: "Send comment",
    youLabel: "You",
  },
};

type Strings = typeof en;

const ar: Strings = {
  common: {
    somethingWrong: "حدث خطأ ما",
    cancel: "إلغاء",
    close: "إغلاق",
    loading: "جارٍ التحميل…",
    saving: "جارٍ الحفظ…",
    discard: "تجاهل",
    on: "مفعّل",
    off: "متوقف",
    open: "فتح",
    dismiss: "إخفاء",
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
    branchTitle: "الفرع الذي يعمل عليه الوكلاء في هذه المشكلة",
    areaTitle: "النطاق الذي تنتمي إليه هذه المشكلة",
    numberTitle: (n: number) => `المشكلة ${n}`,
    commentsTitle: (n: number) =>
      n === 1 ? "تعليق واحد" : n === 2 ? "تعليقان" : n <= 10 ? `${n} تعليقات` : `${n} تعليقًا`,
    filterType: "كل الأنواع",
    filterPriority: "كل الأولويات",
    filterAgent: "كل الوكلاء",
    runDelivered: (n: number) => `${attemptsAR(n)} — نجح العمل`,
    runStalled: (n: number) => `${attemptsAR(n)} — ارتدت البطاقة`,
    statusOf: (n: number) => `حالة المشكلة ${n}`,
    illegalMove: (from: string, to: string) => `لا يمكن النقل من «${from}» إلى «${to}»`,
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

  agents: {
    title: "الوكلاء",
    desc: "الأسطول الذي يعمل على لوحة مشكلاتك. الوكلاء المفعّلون وحدهم يستلمون العمل، ولا يأخذ الوكيل إلا المشكلات الواقعة في نطاق يملكه.",
    search: "ابحث في الوكلاء…",
    hire: "توظيف وكيل",
    statAgents: "الوكلاء",
    statEnabled: "مفعّلون",
    statWorking: "يعملون الآن",
    statAreas: "النطاقات المغطاة",
    loadErr: "تعذّر تحميل الأسطول",
    emptyTitle: "لا يوجد وكلاء بعد",
    emptyDesc: "شغّل معالج الإعداد لإنشاء الأسطول.",
    noMatchTitle: "لا يوجد وكلاء مطابقون",
    noMatchDesc: "جرّب بحثًا مختلفًا.",
    working: "قيد العمل",
    workingOn: (n: number) => `يعمل على #${n}`,
    enableAria: (name: string) => `تفعيل ${name}`,
    disableAria: (name: string) => `تعطيل ${name}`,
    // إجراء البطاقة: الزر يقول ما سيحدث عند الضغط، والنقطة تقول الحالة الراهنة.
    enable: "تفعيل",
    disable: "تعطيل",
    disabledMeta: "معطّل",
    // No leading "+": a plus sign is a neutral, so in an RTL run "+2" renders
    // as "2+". Arabic states the overflow as a plain count instead of importing
    // a punctuation mark that the script reverses.
    moreCount: (n: number) => `${n} أخرى`,
    // جملة التصفية: «١٢ وكيلًا في [النطاق] تعمل بنموذج [النموذج]»
    sentenceAgents: (n: number) =>
      n === 1 ? "وكيل" : n === 2 ? "وكيلان" : n >= 3 && n <= 10 ? "وكلاء" : "وكيلًا",
    sentenceIn: "في",
    sentenceRunning: "تعمل بنموذج",
    allAreas: "كل النطاقات",
    allModels: "كل النماذج",
    reset: "إعادة تعيين",
    facetAreas: "النطاقات",
    facetStatus: "الحالة",
    statusEnabled: "مفعّل",
    statusDisabled: "معطّل",
    statusWorking: "يعمل الآن",
    noAreasFacet: "لا نطاقات بعد",
    runsCount: (n: number) =>
      n === 1 ? "تشغيل واحد" : n === 2 ? "تشغيلان" : n >= 3 && n <= 10 ? `${n} تشغيلات` : `${n} تشغيل`,
    memoriesCount: (n: number) =>
      n === 1 ? "ذكرى واحدة" : n === 2 ? "ذكريان" : n >= 3 && n <= 10 ? `${n} ذكريات` : `${n} ذكرى`,
    noDescription: "لا يوجد وصف بعد.",
    ago: agoLongAR,
    // Hire form
    hireErrTitle: "تعذّر التوظيف",
    slugLabel: "المعرّف",
    slugHint: "الاسم الآلي الدائم — يدخل في مسارات الملفات ولا يمكن تغييره.",
    nameLabel: "الاسم",
    nameHint: "ما تسميه به لوحة المعلومات ولوحة المشكلات.",
    areasLabel: "النطاقات التي يملكها",
    areasHint: "مفصولة بفواصل. الوكيل الذي لا يملك نطاقًا لن يستلم عملًا أبدًا.",
    whatLabel: "ما الذي يفعله",
    whatHint: "هذا ما يقرؤه التوجيه ليقرر من يملك البلاغ — اكتبه للموجّه لا كسيرة ذاتية.",
    modelLabel: "النموذج",
    modelHint: "haiku فرزٌ رخيص، وopus عمقٌ مكلف — وsonnet هو الافتراضي للأسطول.",
    workdirLabel: "دليل العمل",
    workdirHint: "حيث تبدأ صدفته. اتركه فارغًا لاستخدام افتراضي الأسطول.",
    personaLabel: "الشخصية",
    draftAI: "صياغة بالذكاء الاصطناعي",
    draftAgain: "صياغة من جديد",
    drafting: "جارٍ الصياغة…",
    draftingNote: "‏Claude Code يقرأ المستودع الآن. يستغرق هذا حتى دقيقة.",
    draftedFor: (cost: string) => `صيغت مقابل ${cost}. صحّح ما أخطأت فيه قبل التوظيف.`,
    draftOptional: "اختياري. اتركه فارغًا وسيوظَّف الوكيل بقالب مبدئي.",
    draftErrTitle: "تعذّرت صياغة الشخصية",
    draftErrNote: "لا يزال بإمكانك توظيف الوكيل وكتابة شخصيته بنفسك.",
    noteSlugFirst: "أدخل المعرّف أولًا.",
    noteAreasFirst: "أعطه نطاقًا واحدًا على الأقل — وإلا فلن يستلم عملًا أبدًا.",
    noteReady: "يُنشأ بدماغه الخاص معطّلًا — اقرأ الشخصية ثم فعّله.",
    hiring: "جارٍ التوظيف…",
    hireCta: "توظيف",
    // Detail page
    back: "الوكلاء",
    loadOneErr: "تعذّر تحميل الوكيل",
    tabOverview: "نظرة عامة",
    tabSkills: "المهارات",
    tabRuns: "التشغيلات",
    tabMemory: "الذاكرة",
    enabledLabel: "مفعّل",
    enabledHint: "الوكلاء المفعّلون وحدهم يستلمون العمل.",
    personaHeading: "الشخصية",
    savePersona: "حفظ الشخصية",
    personaSaved: "حُفظت الشخصية",
    saved: "حُفظ",
    skillsHeading: (held: number) => `المهارات التي يحمّلها — ${held}`,
    skillsEmpty: "لا مهارات. يعمل هذا الوكيل بشخصيته وحدها.",
    skillsFieldLabel: "المهارات المسندة، بأسمائها",
    skillsFieldHint: "مفصولة بفواصل. كل اسم دليلٌ تحت ‎.claude/skills‎ — عدّل القائمة للإسناد أو الإلغاء.",
    runsEmptyTitle: "لا تشغيلات بعد",
    runsEmptyDesc: "لم يستلم هذا الوكيل أي عمل.",
    runsProgress: (shown: number, total: number) => `${shown} من ${total} — مرّر للمزيد`,
    noBrainTitle: "لا دماغ",
    noBrainDesc: "لا يملك هذا الوكيل مخزن ذاكرة.",
    brainMemories: "ذكريات",
    brainEntities: "كيانات",
    brainLinks: "روابط",
    brainGaps: "فجوات",
    gapsTitle: "ما بحث عنه ولم يجده",
    remembersTitle: "ما يتذكره",
    // Rail
    railName: "الاسم",
    railTitle: "المسمى",
    railTitlePlaceholder: "مثل: مهندس واجهة التطبيق",
    railModel: "النموذج",
    modelHaiku: "‏haiku — الأرخص، للتصنيف",
    modelSonnet: "‏sonnet — الافتراضي للبرمجة",
    modelOpus: "‏opus — لأصعب الاستدلال",
    railColour: "اللون",
    colourAria: "لون الوكيل",
    colourPlaceholder: "‏#4f46e5 — اتركه فارغًا ليُشتق تلقائيًا",
    railAvatar: "رابط الصورة",
    avatarPlaceholder: "‏https://… أو مسار",
    railBudget: "ميزانية التشغيل الواحد (دولار)",
    budgetHint: "جلسة واحدة. التشغيل الذي يتوقف هنا يبلّغ بدل أن ينجز نصف العمل.",
    railTurns: "أقصى عدد أدوار في التشغيل",
    railWorkdir: "دليل العمل",
    workdirPlaceholder: "مسار مطلق — فارغًا يستخدم BUILDER_WORKDIR",
    workdirRailHint: "المستودع الذي يتفرع منه هذا الوكيل. قد يمتد الأسطول لأكثر من مستودع — وجّه كل وكيل إلى الشيفرة التي تقع فيها نطاقاته فعلًا.",
    railAreas: "النطاقات التي يملكها",
    areasRailHint: "لا يمكن استلام مشكلة إلا لوكيل يملك نطاقها.",
    statRuns: "التشغيلات",
    statSpent: "المصروف",
    statCap: "سقف التشغيل",
    statMemories: "الذكريات",
    statBrain: "الدماغ",
    statLastRun: "آخر تشغيل",
    brainYes: "نعم",
    brainNone: "لا يوجد",
    never: "أبدًا",
  },

  skills: {
    title: "المهارات",
    desc: "ملفات التعليمات التي يحمّلها الوكلاء بأسمائها. تحرير أي منها هنا يعيد كتابة SKILL.md على القرص، وهو ما يقرؤه الوكيل فعلًا في تشغيله التالي.",
    search: "ابحث في المهارات…",
    sync: "مزامنة من القرص",
    syncing: "جارٍ الفحص…",
    importGh: "استيراد من GitHub",
    newSkill: "مهارة جديدة",
    statSkills: "المهارات",
    statInUse: "قيد الاستخدام",
    statUnused: "لا يستخدمها أحد",
    statDisabled: "معطّلة",
    agentsCount: (n: number) =>
      n === 1 ? "وكيل واحد" : n === 2 ? "وكيلان" : n >= 3 && n <= 10 ? `${n} وكلاء` : `${n} وكيلًا`,
    // Machine values — provenance identifiers, verbatim in both languages.
    sourceLocal: "local",
    sourceGithub: "github",
    sourceOperator: "written here",
    notInstalled: "ليست على القرص بعد",
    noTitle: "بلا عنوان بعد",
    noDescription: "لا يوجد وصف.",
    enableAria: (name: string) => `تفعيل ${name}`,
    disableAria: (name: string) => `تعطيل ${name}`,
    // إجراء البطاقة: الزر يقول ما سيحدث عند الضغط، والنقطة تقول الحالة الراهنة.
    enable: "تفعيل",
    disable: "تعطيل",
    disabledMeta: "معطّلة",
    emptyTitle: "لا مهارات بعد",
    emptyDesc: (dir: string) =>
      `زامن من القرص لالتقاط ما هو موجود أصلًا في ${dir}، أو استورد مستودعًا، أو اكتب واحدة هنا.`,
    noMatchTitle: "لا مهارات مطابقة",
    noMatchDesc: "جرّب بحثًا مختلفًا.",
    progress: (shown: number, total: number) => `${shown} من ${total} — مرّر للمزيد`,
    // Sync / import outcome report
    scannedTitle: (dir: string, n: number) =>
      `فُحص ${dir} — ${n === 1 ? "دليل واحد" : n === 2 ? "دليلان" : n >= 3 && n <= 10 ? `${n} أدلة` : `${n} دليلًا`}`,
    added: "أضيفت:",
    updated: "حُدّثت:",
    nothingChanged: "لم يتغير شيء.",
    skippedCount: (n: number) =>
      n === 1 ? "تخطّي واحدة" : n === 2 ? "تخطّي اثنتين" : `تخطّي ${n}`,
    unnamed: "(بلا اسم)",
    // Create form
    createTitle: "مهارة جديدة",
    createErrTitle: "تعذّر الإنشاء",
    nameLabel: "الاسم",
    nameHint: "حروف لاتينية صغيرة وأرقام وشرطات. هذا أيضًا اسم الدليل ويشير إليه الوكلاء — لا يمكن تغييره لاحقًا.",
    titleLabel: "العنوان",
    titleHint: "الاسم البشري الظاهر في الفهرس.",
    whenLabel: "متى يلجأ إليها الوكيل",
    whenHint: "يصبح الوصف في ترويسة الملف — ما يقرؤه النموذج ليقرر إن كانت المهارة تنطبق.",
    bodyLabel: "التعليمات",
    noteNameFirst: "سمّها أولًا — الاسم هو مسار الملف.",
    noteBodyFirst: "اكتب التعليمات — المهارة الفارغة لا تعلّم شيئًا.",
    noteReady: "تُكتب إلى ‎.claude/skills/<name>/SKILL.md‎، ثم أسندها إلى الوكلاء الذين يحتاجونها.",
    creating: "جارٍ الإنشاء…",
    createCta: "إنشاء المهارة",
    // Import form
    importTitle: "استيراد من GitHub",
    importErrTitle: "تعذّر الاستيراد",
    repoLabel: "المستودع",
    repoHint: "‏owner/name، عام. الفرع الافتراضي هو ما يُقرأ.",
    folderLabel: "المجلد بداخله",
    folderHint: "يحصر البحث في دليل واحد. فارغًا يفحص المستودع كله.",
    noteRepoFirst: "سمّ مستودعًا أولًا.",
    noteImport: "كل دليل يحوي SKILL.md يصبح مهارة، حتى 50 لكل استيراد.",
    downloading: "جارٍ التنزيل…",
    importCta: "استيراد",
    foundTitle: (repoRef: string, n: number) => `${repoRef} — عُثر على ${n}`,
    // Detail page
    back: "كل المهارات",
    openErr: "تعذّر فتح هذه المهارة",
    tabOverview: "نظرة عامة",
    tabBody: "المحتوى",
    tabAgents: "الوكلاء",
    tabActivity: "النشاط",
    enabledLabel: "مفعّلة",
    enabledHint: "المهارة المعطّلة تبقى في الفهرس وتحتفظ بإسناداتها.",
    statHolders: "وكلاء يحملونها",
    statLoads: "مرات التحميل",
    statRan: "وكلاء شغّلوها",
    sourceLabel: "المصدر",
    pathLabel: "المسار",
    editTitleLabel: "العنوان",
    editDescLabel: "متى يلجأ إليها الوكيل",
    save: "حفظ المهارة",
    savedNote: "حُفظت وكُتبت إلى القرص",
    regenerate: "إعادة توليد",
    regenerating: "يقرأ المستودع…",
    regenNote: "هذه جلسة Claude Code حقيقية — عادةً دقيقتان أو ثلاث.",
    regenDirtyTitle: "احفظ تعديلاتك أو تجاهلها أولًا — إعادة التوليد تستبدل المحتوى كله",
    regenTitle: "اقرأ المستودع وأعد كتابة هذه المهارة كإجراء كامل",
    rewritten: (words: number, cost: string, grounded: boolean) =>
      `أعيدت كتابتها — ${words} كلمة، ${cost}` + (grounded ? "" : " (لم يتوفر مستودع، فجاءت عامة)"),
    agentsHeading: (held: number, total: number) => `الوكلاء الذين يستخدمونها — ${held} من ${total}`,
    noAgentsTitle: "لا وكلاء بعد",
    noAgentsDesc: "وظّف وكيلًا قبل إسناد المهارات.",
    agentDisabled: "معطّل",
    assignAria: (name: string) => `إسناد إلى ${name}`,
    activityNote:
      "كل تشغيل حمل هذه المهارة في سياقه. يبلّغ Claude Code عن نتيجة التشغيل لا عن استدعاءات أدواته، فهذا يسجّل أن المهارة حُمّلت — لا أن الوكيل لجأ إليها.",
    notLoadedTitle: "لم تُحمّل بعد",
    notLoadedNoHolder: "لا وكيل يحمل هذه المهارة، فلم يحملها أي تشغيل. أسندها من تبويب الوكلاء.",
    notLoadedAssigned: "أُسندت، لكن لم يبدأ أي تشغيل منذ ذلك. يمتلئ السجل مع عمل الوكلاء.",
    allShown: (n: number) => `عُرض الكل — ${n}.`,
    ago: agoLongAR,
    delete: "حذف المهارة",
    deleteTitle: (name: string) => `حذف ${name}؟`,
    deleteDesc: (holders: number, path: string) =>
      `هذا يزيل المهارة من الفهرس، ويلغي إسنادها من ${holders === 1 ? "الوكيل الوحيد الذي يحمّلها" : `${holders} من الوكلاء الذين يحمّلونها`}، ويحذف ${path} من القرص. لا يمكن التراجع عنه.`,
    keep: "إبقاؤها",
    deleteConfirm: "حذف",
  },

  issueDetail: {
    loadErrTitle: "تعذّر تحميل المهمة",
    noDescription: "لا يوجد وصف.",
    opened: (ago: string) => `فُتحت ${ago}`,
    ago: agoLongAR,
    // الخصائص
    branchLabel: "الفرع",
    prLabel: "طلب الدمج",
    sourceLabel: "المصدر",
    attemptsLabel: "المحاولات",
    agentBadge: "الوكيل",
    assigneeHuman: "بشري فقط",
    assigneeAnyArea: "أي مجال",
    onlyClaim: (assignee: string) => `${assignee} وحده يمكنه استلامها.`,
    // النقاش
    commentPlaceholder: "اكتب تعليقًا…",
    commentCta: "تعليق",
    posting: "جارٍ النشر…",
    emptyThreadTitle: "لا شيء هنا بعد",
    emptyThreadDesc: "تظهر التعليقات ونشاط الوكلاء هنا مع تقدّم العمل.",
    activityHeading: "النشاط",
    // السياق الملتقط من المتصفح
    contextHeading: "السياق الملتقط",
    contextSummary: (logs: number, reqs: number) =>
      `${logs === 1 ? "إدخال واحد" : logs === 2 ? "إدخالان" : logs <= 10 ? `${logs} إدخالات` : `${logs} إدخالًا`} في السجل و${reqs === 1 ? "طلب واحد" : reqs === 2 ? "طلبان" : reqs <= 10 ? `${reqs} طلبات` : `${reqs} طلبًا`}`,
    consoleHeading: "سجل الطرفية",
    networkHeading: "الشبكة",
    errorsCount: (n: number) =>
      n === 1 ? "خطأ واحد" : n === 2 ? "خطآن" : n <= 10 ? `${n} أخطاء` : `${n} خطأً`,
    failedCount: (n: number) =>
      n === 1 ? "طلب فاشل واحد" : n === 2 ? "طلبان فاشلان" : n <= 10 ? `${n} طلبات فاشلة` : `${n} طلبًا فاشلًا`,
    reportedFrom: "أُبلغ عنها من",
    appLabel: "التطبيق",
    routeLabel: "المسار",
    viewportLabel: "مقاس العرض",
    userAgentLabel: "معرّف المتصفح",
    localeLabel: "اللغة",
    // التثبيت
    pinnedHeading: "العنصر المثبّت",
    pinVerified: "طوبق على الصفحة عند إرسال البلاغ.",
    pinNoStrategy: "لم يُلتقط أي محدِّد، لذا لا يمكن إيجاد هذا التثبيت مجددًا.",
    fragileTitle: "قد لا يصمد هذا التثبيت",
    fragileBefore: "يعتمد المحدِّد على ",
    fragileAfter: "، لذا قد يكسره أي تغيير في التخطيط.",
    // الحذف
    deleteCta: "حذف المهمة",
    deleteTitle: (n: number | string) => `حذف المهمة رقم ${n}؟`,
    deleteDesc: "يحذف هذا المهمة ونقاشها وكل ما التُقط معها. لا يمكن التراجع.",
    keep: "إبقاؤها",
    deleteConfirm: "حذف",
    deleting: "جارٍ الحذف…",
    // متابعة التنفيذ الجاري
    tmuxLabel: "تابع التنفيذ",
    tmuxCopy: "نسخ أمر الاتصال",
    tmuxCopied: "تم النسخ",
    tmuxHint: "شغّل هذا الأمر في الطرفية لمتابعة الوكيل أثناء عمله.",
    // الهيكل: مسار التنقل، المرقّم، الأقسام القابلة للطي، عمود الخصائص
    propertiesHeading: "الخصائص",
    pagerPosition: (i: number, n: number) => `${i} / ${n}`,
    pagerPrev: "المهمة السابقة",
    pagerNext: "المهمة التالية",
    moreActions: "إجراءات أخرى",
    copyLink: "نسخ الرابط",
    copiedLink: "نُسخ الرابط",
    starAdd: "إضافة إلى المفضّلة",
    starRemove: "إزالة من المفضّلة",
    linksHeading: "الروابط",
    openLink: "فتح",
    labelsLabel: "الوسوم",
    labelsEmpty: "لا وسوم",
    branchEmpty: "لا فرع بعد",
    setArea: "حدّد المجال",
    copyLog: "نسخ السجل الملتقط",
    copiedLog: "تم النسخ",
    sendComment: "إرسال التعليق",
    youLabel: "أنت",
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

package setup

// The declared set. Every environment variable this codebase reads appears
// here exactly once, and the call-site gate fails the build on any that does
// not.
//
// Ordering inside a group is offering order in the wizard: the thing an
// operator must decide first comes first.

// Capabilities is the registry.
var Capabilities = Registry{
	// ── core ────────────────────────────────────────────────────────────────
	{
		Env: "DATABASE_URL", Group: GroupCore, Kind: KindSecret, Danger: Sensitive,
		Title: Localized{EN: "Database URL", AR: "رابط قاعدة البيانات"},
		Help: Localized{
			EN: "Postgres connection string. Everything the builder remembers — issues, runs, the brain, the vault — lives here.",
			AR: "سلسلة الاتصال بـ Postgres. كل ما يحفظه الباني — المشكلات والتشغيلات والذاكرة والخزنة — مخزّن هنا.",
		},
		Placeholder: "postgres://user:pass@localhost:5432/app?sslmode=disable",
		Probe:       probeDatabase,
	},
	{
		Env: "ADDR", Group: GroupCore, Kind: KindText, Default: ":8080", Danger: Safe,
		Title: Localized{EN: "Listen address", AR: "عنوان الاستماع"},
		Help: Localized{
			EN: "Host:port the API binds. Note `togo serve` ignores this and always binds :8080.",
			AR: "المضيف والمنفذ الذي يستمع عليه الـ API. لاحظ أن `togo serve` يتجاهل هذا ويستخدم 8080 دائماً.",
		},
	},
	{
		Env: "APP_ENV", Aliases: []string{"ENV", "TOGO_ENV"}, Group: GroupCore,
		Kind: KindChoice, Default: "production", Danger: Sensitive,
		Choices: []Choice{
			{Value: "production", Label: Localized{EN: "Production", AR: "إنتاج"}},
			{Value: "development", Label: Localized{EN: "Development", AR: "تطوير"}},
			{Value: "local", Label: Localized{EN: "Local", AR: "محلي"}},
			{Value: "test", Label: Localized{EN: "Test", AR: "اختبار"}},
		},
		Title: Localized{EN: "Environment", AR: "البيئة"},
		Help: Localized{
			EN: "Controls MORE than it looks: it gates the terminal AND widens the feedback widget's CORS origins. Never set it to development on a real server to unlock something — use that capability's own switch.",
			AR: "يتحكم بأكثر مما يبدو: يفتح الطرفية ويوسّع أيضاً مصادر CORS لأداة الملاحظات. لا تضبطه على development على خادم حقيقي لفتح ميزة — استخدم مفتاح تلك الميزة نفسه.",
		},
	},
	{
		Env: "BUILDER_DISABLE", Group: GroupCore, Kind: KindToggle, Default: "", Danger: Safe,
		Title: Localized{EN: "Disable the builder", AR: "تعطيل الباني"},
		Help: Localized{
			EN: "Turns the whole plugin off without uninstalling it. The kill switch.",
			AR: "يوقف الملحق بالكامل دون إزالته. مفتاح الإيقاف.",
		},
	},
	{
		Env: "BUILDER_LOCALE", Group: GroupCore, Kind: KindChoice, Default: "en", Danger: Safe,
		Choices: []Choice{
			{Value: "en", Label: Localized{EN: "English", AR: "الإنجليزية"}},
			{Value: "ar", Label: Localized{EN: "Arabic", AR: "العربية"}},
		},
		Title: Localized{EN: "Default locale", AR: "اللغة الافتراضية"},
		Help: Localized{
			EN: "Language the dashboard and the widget open in. Arabic renders right-to-left throughout.",
			AR: "اللغة التي تفتح بها اللوحة والأداة. العربية تُعرض من اليمين إلى اليسار في كل الواجهات.",
		},
	},
	{
		Env: "BUILDER_WORKDIR", Group: GroupCore, Kind: KindPath, Danger: Safe,
		Title: Localized{EN: "Working directory", AR: "مجلد العمل"},
		Help: Localized{
			EN: "Repository root the agents read and write. Defaults to the process working directory.",
			AR: "جذر المستودع الذي تقرأ منه الوكلاء وتكتب فيه. الافتراضي هو مجلد تشغيل العملية.",
		},
	},
	{
		Env: "BUILDER_VAULT_KEY", Group: GroupCore, Kind: KindSecret, Danger: Sensitive,
		Title: Localized{EN: "Vault encryption key", AR: "مفتاح تشفير الخزنة"},
		Help: Localized{
			EN: "Envelope key for stored secrets. Lose it and every stored credential is unreadable; leak it and they are all readable.",
			AR: "مفتاح تشفير الأسرار المخزّنة. فقدانه يجعل كل بيانات الاعتماد غير قابلة للقراءة، وتسريبه يجعلها كلها مقروءة.",
		},
		Probe: probeVaultKey,
	},

	// ── agents ──────────────────────────────────────────────────────────────
	{
		Env: "BUILDER_RUNNER", Group: GroupAgents, Kind: KindToggle, Default: "", Danger: Dangerous,
		RequiresProdAck: true,
		Title:           Localized{EN: "Run agents", AR: "تشغيل الوكلاء"},
		Help: Localized{
			EN: "Lets the fleet claim issues and run Claude Code. With the local executor an agent runs INSIDE this process, inheriting DATABASE_URL and the vault key, holding a Bash tool. Off unless you mean it.",
			AR: "يتيح للأسطول التقاط المشكلات وتشغيل Claude Code. مع المنفّذ المحلي يعمل الوكيل داخل هذه العملية ويرث رابط قاعدة البيانات ومفتاح الخزنة ومعه أداة Bash. اتركه مغلقاً ما لم تكن متأكداً.",
		},
		Unlocks: []Localized{{EN: "The autonomous issue queue", AR: "طابور المشكلات الذاتي"}},
	},
	{
		Env: "BUILDER_EXEC", Group: GroupAgents, Kind: KindChoice, Default: "local", Danger: Dangerous,
		Choices: []Choice{
			{Value: "local", Label: Localized{EN: "In this process", AR: "داخل هذه العملية"}},
			{Value: "coder", Label: Localized{EN: "Coder workspace", AR: "مساحة Coder"}},
		},
		Title: Localized{EN: "Where agents execute", AR: "أين تُنفَّذ الوكلاء"},
		Help: Localized{
			EN: "Only `local` is implemented. Setting anything else currently changes nothing — the probe below reports that honestly rather than letting you believe you sandboxed something.",
			AR: "الخيار المنفَّذ فعلياً هو `local` فقط. أي قيمة أخرى لا تغيّر شيئاً حالياً، والفحص أدناه يقول ذلك صراحةً بدل أن تظن أنك عزلت التنفيذ.",
		},
		Probe: probeExecutor,
	},
	{
		Env: "BUILDER_CLAUDE_BIN", Group: GroupAgents, Kind: KindPath, Default: "claude", Danger: Safe,
		Title: Localized{EN: "Claude Code binary", AR: "ملف Claude Code التنفيذي"},
		Help: Localized{
			EN: "Path to the claude executable the runner spawns.",
			AR: "مسار الملف التنفيذي claude الذي يشغّله المنفّذ.",
		},
		Probe: probeClaudeBin,
	},
	{
		Env: "BUILDER_PERMISSION_MODE", Group: GroupAgents, Kind: KindChoice,
		Default: "acceptEdits", Danger: Sensitive,
		Choices: []Choice{
			{Value: "acceptEdits", Label: Localized{EN: "Accept edits", AR: "قبول التعديلات"}},
			{Value: "default", Label: Localized{EN: "Ask", AR: "السؤال"}},
		},
		Title: Localized{EN: "Agent permission mode", AR: "وضع أذونات الوكيل"},
		Help: Localized{
			EN: "How much a run may do unattended. Never bypassPermissions — that is not offered here on purpose.",
			AR: "ما الذي يُسمح للتشغيل بفعله دون إشراف. لا يوجد خيار تجاوز الأذونات هنا عن قصد.",
		},
	},
	{
		Env: "BUILDER_DAILY_BUDGET_USD", Group: GroupAgents, Kind: KindNumber, Default: "10", Danger: Sensitive,
		Title: Localized{EN: "Daily fleet budget (USD)", AR: "الميزانية اليومية للأسطول (دولار)"},
		Help: Localized{
			EN: "Ceiling across every agent in a rolling 24h. Hitting it aborts and reports — it never quietly downgrades to a cheaper model.",
			AR: "الحد الأقصى لكل الوكلاء خلال ٢٤ ساعة متحركة. بلوغه يوقف التشغيل ويبلّغ، ولا ينتقل بصمت إلى نموذج أرخص.",
		},
	},
	{
		Env: "BUILDER_TRIAGE_MODEL", Group: GroupAgents, Kind: KindText, Default: "claude-haiku-4-5-20251001", Danger: Safe,
		Title: Localized{EN: "Triage model", AR: "نموذج الفرز"},
		Help:  Localized{EN: "Model used to label and route incoming issues.", AR: "النموذج المستخدم لتصنيف المشكلات الواردة وتوجيهها."},
	},
	{
		Env: "BUILDER_PREFLIGHT_MODEL", Group: GroupAgents, Kind: KindText, Danger: Safe,
		Title: Localized{EN: "Preflight model", AR: "نموذج الفحص المسبق"},
		Help:  Localized{EN: "Model used by the setup wizard's connectivity check.", AR: "النموذج الذي يستخدمه فحص الاتصال في معالج الإعداد."},
	},
	{
		Env: "BUILDER_OPEN_PR", Group: GroupAgents, Kind: KindToggle, Default: "", Danger: Sensitive,
		Title: Localized{EN: "Open pull requests", AR: "فتح طلبات الدمج"},
		Help: Localized{
			EN: "Whether a finished run opens a PR. Off means the work stays on a branch for you to look at.",
			AR: "هل يفتح التشغيل المكتمل طلب دمج. الإيقاف يعني بقاء العمل على فرع لتراجعه بنفسك.",
		},
	},
	{
		Env: "BUILDER_PR_BASE", Group: GroupAgents, Kind: KindText, Default: "main", Danger: Safe,
		Title: Localized{EN: "PR base branch", AR: "الفرع الأساس لطلب الدمج"},
		Help:  Localized{EN: "Branch pull requests target.", AR: "الفرع الذي تستهدفه طلبات الدمج."},
	},
	{
		Env: "BUILDER_PR_REMOTE", Group: GroupAgents, Kind: KindText, Default: "origin", Danger: Safe,
		Title: Localized{EN: "PR remote", AR: "المستودع البعيد لطلب الدمج"},
		Help:  Localized{EN: "Git remote pushed to.", AR: "المستودع البعيد الذي يُدفع إليه."},
	},
	{
		Env: "BUILDER_VERIFY_CMD", Group: GroupAgents, Kind: KindText, Danger: Safe,
		Title: Localized{EN: "Verify command", AR: "أمر التحقق"},
		Help: Localized{
			EN: "Run after a change to decide whether it holds — your test or build command.",
			AR: "يُشغَّل بعد أي تغيير للحكم على صلاحيته — أمر الاختبار أو البناء لديك.",
		},
	},
	{
		Env: "BUILDER_WORKTREE_ROOT", Group: GroupAgents, Kind: KindPath, Danger: Safe,
		Title: Localized{EN: "Worktree root", AR: "جذر أشجار العمل"},
		Help: Localized{
			EN: "Where per-run git worktrees are created, so a run never edits your checkout.",
			AR: "مكان إنشاء أشجار العمل لكل تشغيل، حتى لا يعدّل أي تشغيل نسختك العاملة.",
		},
	},
	{
		Env: "BUILDER_TMUX", Group: GroupAgents, Kind: KindToggle, Default: "1", Danger: Safe,
		Title: Localized{EN: "Attachable runs (tmux)", AR: "تشغيلات قابلة للمتابعة (tmux)"},
		Help: Localized{
			EN: "Every run gets a tmux session you can attach to and watch.",
			AR: "كل تشغيل يحصل على جلسة tmux يمكنك الاتصال بها ومتابعتها.",
		},
	},
	{
		Env: "BUILDER_TMUX_LINGER", Group: GroupAgents, Kind: KindNumber, Danger: Safe,
		Title: Localized{EN: "Keep sessions after exit (s)", AR: "إبقاء الجلسات بعد الانتهاء (ثانية)"},
		Help:  Localized{EN: "Seconds a finished run's tmux session survives, for reading the tail.", AR: "عدد الثواني التي تبقى فيها جلسة التشغيل المنتهي، لقراءة آخر المخرجات."},
	},
	{
		Env: "BUILDER_TARGET", Group: GroupAgents, Kind: KindText, Danger: Safe,
		Title: Localized{EN: "Target app", AR: "التطبيق الهدف"},
		Help:  Localized{EN: "Which hosted app this daemon acts on.", AR: "التطبيق المستضاف الذي يعمل عليه هذا الخادم."},
	},
	{
		Env: "BUILDER_TARGETS", Group: GroupAgents, Kind: KindText, Danger: Safe,
		Title: Localized{EN: "Target apps", AR: "التطبيقات الهدف"},
		Help:  Localized{EN: "Comma-separated apps a single builderd hosts, each reporting as itself.", AR: "تطبيقات مفصولة بفواصل يستضيفها builderd واحد، ويظهر كل منها باسمه."},
	},
	{
		Env: "BUILDER_ADMIN_EMAIL", Group: GroupAgents, Kind: KindText, Danger: Sensitive,
		Title: Localized{EN: "Admin email", AR: "بريد المشرف"},
		Help:  Localized{EN: "Seeded administrator account.", AR: "حساب المشرف الذي يُنشأ ابتداءً."},
	},
	{
		Env: "BUILDER_ADMIN_PASSWORD", Group: GroupAgents, Kind: KindSecret, Danger: Sensitive,
		Title: Localized{EN: "Admin password", AR: "كلمة مرور المشرف"},
		Help:  Localized{EN: "Seeded administrator password. Change it after first sign-in.", AR: "كلمة مرور المشرف الأولية. غيّرها بعد أول دخول."},
	},

	// ── brain ───────────────────────────────────────────────────────────────
	{
		Env: "BUILDER_EMBED_URL", Group: GroupBrain, Kind: KindURL, Danger: Safe,
		Title: Localized{EN: "Embedding endpoint", AR: "نقطة اتصال التضمين"},
		Help:  Localized{EN: "Service that turns text into vectors for recall.", AR: "الخدمة التي تحوّل النص إلى متجهات للاسترجاع."},
		Probe: probeEmbedURL,
	},
	{
		Env: "BUILDER_EMBED_KEY", Group: GroupBrain, Kind: KindSecret, Danger: Sensitive,
		Title: Localized{EN: "Embedding API key", AR: "مفتاح خدمة التضمين"},
		Help:  Localized{EN: "Credential for the embedding endpoint.", AR: "بيانات الاعتماد لنقطة اتصال التضمين."},
	},
	{
		Env: "BUILDER_EMBED_DIM", Group: GroupBrain, Kind: KindNumber, Danger: Sensitive,
		Title: Localized{EN: "Embedding dimensions", AR: "أبعاد التضمين"},
		Help: Localized{
			EN: "Vector width. Changing it after data exists invalidates every stored embedding — they cannot be compared across widths.",
			AR: "عرض المتجه. تغييره بعد تخزين بيانات يبطل كل التضمينات المحفوظة، إذ لا يمكن مقارنة أعراض مختلفة.",
		},
	},
	{
		Env: "BUILDER_EMBED_BACKFILL", Group: GroupBrain, Kind: KindToggle, Default: "", Danger: Safe,
		Title: Localized{EN: "Backfill embeddings", AR: "إعادة توليد التضمينات"},
		Help:  Localized{EN: "Re-embed existing rows in the background.", AR: "إعادة تضمين الصفوف الموجودة في الخلفية."},
	},
	{
		Env: "BUILDER_EMBED_BACKFILL_RATE", Group: GroupBrain, Kind: KindNumber, Danger: Safe,
		Title: Localized{EN: "Backfill rate", AR: "معدل إعادة التوليد"},
		Help:  Localized{EN: "Rows per second, to keep a backfill from starving live traffic.", AR: "عدد الصفوف في الثانية، حتى لا تُجوّع العملية حركة المرور الحيّة."},
	},
	{
		Env: "BUILDER_RECALL_MAX_DISTANCE", Group: GroupBrain, Kind: KindNumber, Danger: Safe,
		Title: Localized{EN: "Recall distance cutoff", AR: "حد مسافة الاسترجاع"},
		Help:  Localized{EN: "Beyond this vector distance a match is discarded as unrelated.", AR: "أبعد من هذه المسافة تُهمل النتيجة باعتبارها غير ذات صلة."},
	},
	{
		Env: "BUILDER_RERANK_OFF", Group: GroupBrain, Kind: KindToggle, Default: "", Danger: Safe,
		Title: Localized{EN: "Disable reranking", AR: "تعطيل إعادة الترتيب"},
		Help:  Localized{EN: "Skip the rerank pass and return vector order directly.", AR: "تخطّي مرحلة إعادة الترتيب وإرجاع ترتيب المتجهات مباشرة."},
	},
	{
		Env: "BUILDER_RERANK_URL", Group: GroupBrain, Kind: KindURL, Danger: Safe,
		Title: Localized{EN: "Rerank endpoint", AR: "نقطة اتصال إعادة الترتيب"},
		Help:  Localized{EN: "Service that reorders recall candidates by relevance.", AR: "الخدمة التي تعيد ترتيب نتائج الاسترجاع حسب الصلة."},
	},
	{
		Env: "BUILDER_RERANK_KEY", Group: GroupBrain, Kind: KindSecret, Danger: Sensitive,
		Title: Localized{EN: "Rerank API key", AR: "مفتاح خدمة إعادة الترتيب"},
		Help:  Localized{EN: "Credential for the rerank endpoint.", AR: "بيانات الاعتماد لنقطة إعادة الترتيب."},
	},
	{
		Env: "BUILDER_RERANK_MODEL", Group: GroupBrain, Kind: KindText, Danger: Safe,
		Title: Localized{EN: "Rerank model", AR: "نموذج إعادة الترتيب"},
		Help:  Localized{EN: "Model used for reranking.", AR: "النموذج المستخدم في إعادة الترتيب."},
	},
	{
		Env: "BUILDER_RERANK_CANDIDATES", Group: GroupBrain, Kind: KindNumber, Danger: Safe,
		Title: Localized{EN: "Rerank candidates", AR: "عدد المرشحين لإعادة الترتيب"},
		Help:  Localized{EN: "How many vector hits are handed to the reranker.", AR: "عدد نتائج المتجهات التي تُمرَّر لإعادة الترتيب."},
	},
	{
		Env: "BUILDER_RERANK_MIN_SCORE", Group: GroupBrain, Kind: KindNumber, Danger: Safe,
		Title: Localized{EN: "Rerank score floor", AR: "الحد الأدنى لدرجة إعادة الترتيب"},
		Help:  Localized{EN: "Results scoring below this are dropped.", AR: "تُهمل النتائج التي تقل درجتها عن هذا الحد."},
	},

	// ── connections ─────────────────────────────────────────────────────────
	{
		Env: "BUILDER_UPLOAD_DIR", Group: GroupConnections, Kind: KindPath, Danger: Safe,
		Title: Localized{EN: "Upload directory", AR: "مجلد الرفع"},
		Help:  Localized{EN: "Where screenshots and attachments are written.", AR: "مكان حفظ لقطات الشاشة والمرفقات."},
	},
	{
		Env: "BUILDER_APPS_DIR", Group: GroupConnections, Kind: KindPath, Danger: Safe,
		Title: Localized{EN: "Custom apps directory", AR: "مجلد التطبيقات المخصصة"},
		Help:  Localized{EN: "Scanned for app.json manifests at boot.", AR: "يُفحص بحثاً عن ملفات app.json عند الإقلاع."},
	},
	{
		Env: "BUILDER_SKILLS_DIR", Group: GroupConnections, Kind: KindPath, Danger: Safe,
		Title: Localized{EN: "Skills directory", AR: "مجلد المهارات"},
		Help:  Localized{EN: "Where generated agent skills are written.", AR: "مكان كتابة مهارات الوكلاء المولّدة."},
	},

	// ── sdk ─────────────────────────────────────────────────────────────────
	{
		Env: "BUILDER_SDK_THEME", Group: GroupSDK, Kind: KindChoice, Default: "default", Danger: Safe,
		Choices: []Choice{
			{Value: "default", Label: Localized{EN: "Default", AR: "الافتراضي"}},
			{Value: "plex", Label: Localized{EN: "IBM Plex", AR: "IBM Plex"}},
		},
		Title: Localized{EN: "Widget theme", AR: "مظهر الأداة"},
		Help: Localized{
			EN: "Visual preset for the feedback widget and its windows. A theme is data — a preset swaps design tokens, so this takes effect without a rebuild.",
			AR: "النمط البصري لأداة الملاحظات ونوافذها. المظهر بيانات فقط — يبدّل رموز التصميم، فيسري دون إعادة بناء.",
		},
	},
	{
		Env: "BUILDER_ENHANCER", Group: GroupSDK, Kind: KindChoice, Default: "0", Danger: Safe,
		Choices: []Choice{
			{Value: "0", Label: Localized{EN: "Off", AR: "معطّل"}},
			{Value: "1", Label: Localized{EN: "On", AR: "مفعّل"}},
		},
		Title: Localized{EN: "Rewrite reports with AI", AR: "تحسين البلاغات بالذكاء الاصطناعي"},
		Help: Localized{
			EN: "Adds an \"Improve this\" button to the report composer that rewrites the reporter's text for clarity. Off by default because every press costs a model call; the endpoint is authenticated, so anonymous reporters can still file but cannot spend.",
			AR: "يضيف زر \"تحسين الصياغة\" إلى نموذج الإبلاغ لإعادة صياغة النص بوضوح. معطّل افتراضيًا لأن كل ضغطة تكلّف طلب نموذج؛ نقطة النهاية تتطلب تسجيل الدخول، فيظل بإمكان المجهولين الإبلاغ دون إنفاق.",
		},
	},
	{
		Env: "BUILDER_FEEDBACK_ORIGINS", Group: GroupSDK, Kind: KindText, Danger: Sensitive,
		Title: Localized{EN: "Allowed widget origins", AR: "المصادر المسموح بها للأداة"},
		Help: Localized{
			EN: "Comma-separated sites permitted to post feedback. Anything not listed is refused, so add every domain the widget is embedded on.",
			AR: "مواقع مفصولة بفواصل يُسمح لها بإرسال الملاحظات. يُرفض ما عداها، فأضف كل نطاق تُضمَّن فيه الأداة.",
		},
	},
	{
		Env: "BUILDER_SDK_DIR", Group: GroupSDK, Kind: KindPath, Danger: Safe,
		Title: Localized{EN: "SDK source directory", AR: "مجلد مصدر الـ SDK"},
		Help: Localized{
			EN: "Serve the widget from disk instead of the embedded bundle. For developing the widget itself.",
			AR: "تقديم الأداة من القرص بدل الحزمة المدمجة. لتطوير الأداة نفسها.",
		},
	},
	{
		Env: "BUILDER_WEB_DIR", Group: GroupSDK, Kind: KindPath, Danger: Safe,
		Title: Localized{EN: "Dashboard source directory", AR: "مجلد مصدر اللوحة"},
		Help:  Localized{EN: "Serve the dashboard from disk instead of the embedded build.", AR: "تقديم اللوحة من القرص بدل النسخة المدمجة."},
	},

	// ── danger ──────────────────────────────────────────────────────────────
	{
		Env: "BUILDER_TERMINAL", Group: GroupDanger, Kind: KindToggle, Default: "", Danger: Dangerous,
		RequiresProdAck: true,
		Title:           Localized{EN: "Terminal", AR: "الطرفية"},
		Help: Localized{
			EN: "Gives ANYONE who can reach the dashboard a shell on this host. There is no narrower version of this.",
			AR: "يمنح أي شخص يصل إلى اللوحة صدفة أوامر على هذا الخادم. لا توجد نسخة أضيق من هذا.",
		},
	},
	{
		Env: "BUILDER_TERMINAL_ALLOW_PRODUCTION", Group: GroupDanger, Kind: KindToggle,
		Default: "", Danger: Dangerous, RequiresProdAck: true,
		Title: Localized{EN: "Allow the terminal on a real server", AR: "السماح بالطرفية على خادم حقيقي"},
		Help: Localized{
			EN: "Required alongside the terminal switch off localhost. It exists so nobody has to set APP_ENV=development to get a shell — that also widens CORS, and a guard you can only satisfy by lying teaches lying.",
			AR: "مطلوب مع مفتاح الطرفية خارج الجهاز المحلي. وُجد حتى لا يضطر أحد لضبط APP_ENV=development للحصول على صدفة، فذلك يوسّع CORS أيضاً، والحاجز الذي لا يُرضى إلا بالكذب يعلّم الكذب.",
		},
	},
	{
		Env: "BUILDER_LIVE_CLAUDE", Group: GroupDanger, Kind: KindToggle, Default: "", Danger: Dangerous,
		RequiresProdAck: true,
		Title:           Localized{EN: "Live Claude responder", AR: "مستجيب Claude الحيّ"},
		Help: Localized{
			EN: "Answers public chat in-process with a model. Same class of exposure as the runner and it faces the open internet.",
			AR: "يجيب على المحادثات العامة داخل العملية بنموذج. نفس مستوى المخاطرة كالمنفّذ، لكنه مواجه للإنترنت المفتوح.",
		},
	},

	// ── declared but not offered ────────────────────────────────────────────
	// Read somewhere, so the call-site gate needs them; not settings an
	// operator configures.
	{Env: "USER", Group: GroupCore, Kind: KindText, Deprecated: "provided by the OS, read for attribution only",
		Title: Localized{EN: "Username", AR: "اسم المستخدم"}, Help: Localized{EN: "Read from the OS.", AR: "يُقرأ من نظام التشغيل."}},
	{Env: "TEST_DATABASE_URL", Group: GroupCore, Kind: KindSecret, Deprecated: "test-suite only; refuses any DSN without _test in it",
		Title: Localized{EN: "Test database URL", AR: "رابط قاعدة بيانات الاختبار"}, Help: Localized{EN: "Used by the Go test suite only.", AR: "تستخدمه مجموعة اختبارات Go فقط."}},
	{Env: "BUILDER_SKILLS_FIXTURE", Group: GroupCore, Kind: KindPath, Deprecated: "test fixture path",
		Title: Localized{EN: "Skills fixture", AR: "بيانات المهارات التجريبية"}, Help: Localized{EN: "Test fixture path.", AR: "مسار بيانات الاختبار."}},
}

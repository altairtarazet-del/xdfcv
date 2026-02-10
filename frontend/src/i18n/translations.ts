export const translations = {
  en: {
    // Common
    login: "Login",
    loggingIn: "Logging in...",
    logout: "Logout",
    loading: "Loading...",
    password: "Password",
    email: "Email",
    username: "Username",
    dashboard: "Dashboard",

    // Admin Login
    adminTitle: "DasherHelp Admin",

    // Dashboard
    portalUsers: "Portal Users",
    scanAll: "Scan All",
    scanning: "Scanning...",
    startingScan: "Starting scan...",
    scanFailed: "Scan failed to start",
    lastScan: "Last scan",
    noScansYet: "No scans yet",
    scanned: "scanned",
    transitions: "transitions",
    errors: "errors",
    searchEmail: "Search email...",
    accounts: "accounts",
    noAccountsFound: "No accounts found",
    // Table headers
    emailHeader: "Email",
    stageHeader: "Stage",
    stageUpdated: "Stage Updated",
    lastScanned: "Last Scanned",
    errorHeader: "Error",

    // Stage labels
    stageRegistered: "Registered",
    stageIdVerified: "ID Verified",
    stageBgcPending: "BGC Pending",
    stageBgcClear: "BGC Clear",
    stageBgcConsider: "BGC Consider",
    stageActive: "Active",
    stageDeactivated: "Deactivated",

    // Account Detail
    stageProgression: "STAGE PROGRESSION",
    currentStage: "Current Stage",
    created: "Created",
    lastScanError: "Last scan error",
    notes: "NOTES",
    saveNotes: "Save Notes",
    saving: "Saving...",
    stageHistory: "STAGE HISTORY",
    dateHeader: "Date",
    fromHeader: "From",
    toHeader: "To",
    triggerEmail: "Trigger Email",
    noStageChanges: "No stage changes recorded",

    // Portal Users
    createPortalUser: "CREATE PORTAL USER",
    displayName: "Display Name",
    create: "Create",
    creating: "Creating...",
    lastLogin: "Last Login",
    never: "Never",
    delete: "Delete",
    noPortalUsers: "No portal users yet",
    deleteConfirm: "Delete portal user",

    // Portal
    portalTitle: "DasherHelp",
    portalLogin: "Portal Login",
    dasherHelpMail: "DasherHelp Mail",
    noMessages: "No messages",
    noSubject: "(no subject)",
    unknown: "Unknown",
    selectMessage: "Select a message to read",
    noContent: "No content",
  },
  tr: {
    // Common
    login: "Giri\u015f",
    loggingIn: "Giri\u015f yap\u0131l\u0131yor...",
    logout: "\u00c7\u0131k\u0131\u015f",
    loading: "Y\u00fckleniyor...",
    password: "\u015eifre",
    email: "E-posta",
    username: "Kullan\u0131c\u0131 Ad\u0131",
    dashboard: "Panel",

    // Admin Login
    adminTitle: "DasherHelp Y\u00f6netim",

    // Dashboard
    portalUsers: "Portal Kullan\u0131c\u0131lar\u0131",
    scanAll: "T\u00fcm\u00fcn\u00fc Tara",
    scanning: "Taran\u0131yor...",
    startingScan: "Tarama ba\u015flat\u0131l\u0131yor...",
    scanFailed: "Tarama ba\u015flat\u0131lamad\u0131",
    lastScan: "Son tarama",
    noScansYet: "Hen\u00fcz tarama yok",
    scanned: "tarand\u0131",
    transitions: "ge\u00e7i\u015f",
    errors: "hata",
    searchEmail: "E-posta ara...",
    accounts: "hesap",
    noAccountsFound: "Hesap bulunamad\u0131",
    emailHeader: "E-posta",
    stageHeader: "A\u015fama",
    stageUpdated: "A\u015fama G\u00fcncellendi",
    lastScanned: "Son Tarama",
    errorHeader: "Hata",

    // Stage labels
    stageRegistered: "Kay\u0131tl\u0131",
    stageIdVerified: "Kimlik Do\u011fruland\u0131",
    stageBgcPending: "BGC Bekliyor",
    stageBgcClear: "BGC Temiz",
    stageBgcConsider: "BGC Sorunlu",
    stageActive: "Aktif",
    stageDeactivated: "Deaktif",

    // Account Detail
    stageProgression: "A\u015eAMA \u0130LERLEMESI",
    currentStage: "Mevcut A\u015fama",
    created: "Olu\u015fturulma",
    lastScanError: "Son tarama hatas\u0131",
    notes: "NOTLAR",
    saveNotes: "Notlar\u0131 Kaydet",
    saving: "Kaydediliyor...",
    stageHistory: "A\u015eAMA GE\u00c7M\u0130\u015e\u0130",
    dateHeader: "Tarih",
    fromHeader: "\u00d6nceki",
    toHeader: "Sonraki",
    triggerEmail: "Tetikleyen E-posta",
    noStageChanges: "A\u015fama de\u011fi\u015fikli\u011fi kaydedilmemi\u015f",

    // Portal Users
    createPortalUser: "PORTAL KULLANICISI OLU\u015eTUR",
    displayName: "G\u00f6r\u00fcnen Ad",
    create: "Olu\u015ftur",
    creating: "Olu\u015fturuluyor...",
    lastLogin: "Son Giri\u015f",
    never: "Hi\u00e7",
    delete: "Sil",
    noPortalUsers: "Hen\u00fcz portal kullan\u0131c\u0131s\u0131 yok",
    deleteConfirm: "Portal kullan\u0131c\u0131s\u0131n\u0131 sil",

    // Portal
    portalTitle: "DasherHelp",
    portalLogin: "Portal Giri\u015fi",
    dasherHelpMail: "DasherHelp Posta",
    noMessages: "Mesaj yok",
    noSubject: "(konu yok)",
    unknown: "Bilinmiyor",
    selectMessage: "Okumak i\u00e7in bir mesaj se\u00e7in",
    noContent: "\u0130\u00e7erik yok",
  },
} as const;

export type Language = "en" | "tr";
export type TranslationKey = keyof typeof translations.en;

const $ = (id) => document.getElementById(id);
const KEYS = ["examModeActive", "examStartedAt", "examSession", "lastReport", "examHistory", "dpp_history", "examConfig", "exam_arena_subjects", "exam_arena_recent_names", "focusModeActive", "exam-arena-cultivation-state"];
let state = {};
let ticker;
let setupStep = 1;
let selectedMode = "stopwatch";
let selectedSubject = "";

function sessionTimestamp(session) {
  if (Number(session?.startedAtMs) > 0) return Number(session.startedAtMs);
  const raw = session?.startedAt;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && /^\d{10,13}$/.test(raw)) return Number(raw);
  return Date.parse(raw) || 0;
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
function sortQuestions(questions = {}) {
  return Object.entries(questions).sort(([a], [b]) => {
    const na = Number(a.match(/\d+/)?.[0]); const nb = Number(b.match(/\d+/)?.[0]);
    return Number.isFinite(na) && Number.isFinite(nb) ? na - nb : a.localeCompare(b);
  });
}
function setSetupError(id, message = "") {
  const el = $(id); if (!el) return;
  el.textContent = message; el.hidden = !message;
}
function paint() {
  const active = Boolean(state.examModeActive);
  const session = state.examSession || {};
  const questions = session.questions || {};
  const ids = Object.keys(questions);
  const elapsed = active ? Date.now() - (state.examStartedAt || sessionTimestamp(session) || Date.now()) : 0;
  const shownTime = active && session.mode === "countdown"
    ? Math.max(0, (session.allottedTimeMs || 0) - elapsed)
    : active ? elapsed : (state.lastReport?.durationMs || 0);
  $("statePill").textContent = active ? "ACTIVE" : "OFF";
  $("statePill").classList.toggle("on", active);
  $("timerLabel").textContent = active ? (session.mode === "countdown" ? "Time remaining" : "Time elapsed") : "Ready when you are";
  $("timer").textContent = formatDuration(shownTime);
  $("questionCount").textContent = `${ids.length} question${ids.length === 1 ? "" : "s"} tracked`;
  if (active && session.mode === "countdown" && session.targetQuestions) {
    $("questionCount").textContent = `${(session.completedQuestionIds || []).length} / ${session.targetQuestions} completed`;
  }
  $("questionCount").previousElementSibling?.classList.toggle("active", active);
  $("toggleButton").textContent = active ? "End Session" : "Start Session";
  $("toggleButton").classList.toggle("end", active);
  const focusToggle = $("focusModeToggle");
  if (focusToggle) {
    focusToggle.checked = Boolean(state.focusModeActive || active);
    focusToggle.disabled = active;
  }
  $("reportSection").hidden = active || !state.lastReport;
  if (active) $("setupModal").hidden = true;
  if (!active && state.lastReport) renderReport(state.lastReport);
}
// --- Official Study Slash Progressive Cultivation Realm System ---
const CULTIVATION_REALMS_CONFIG = [
  { name: "Elementary Profound", color: "#14b8a6", aura: "rgba(20, 184, 166, 0.55)", start: 1, end: 10 },
  { name: "Nascent Profound", color: "#06b6d4", aura: "rgba(6, 182, 212, 0.55)", start: 11, end: 20 },
  { name: "True Profound", color: "#38bdf8", aura: "rgba(56, 189, 248, 0.55)", start: 21, end: 30 },
  { name: "Spirit Profound", color: "#6366f1", aura: "rgba(99, 102, 241, 0.55)", start: 31, end: 40 },
  { name: "Earth Profound", color: "#8b5cf6", aura: "rgba(139, 92, 246, 0.6)", start: 41, end: 50 },
  { name: "Sky Profound", color: "#a855f7", aura: "rgba(168, 85, 247, 0.6)", start: 51, end: 60 },
  { name: "Emperor Profound", color: "#d946ef", aura: "rgba(217, 70, 239, 0.6)", start: 61, end: 70 },
  { name: "Tyrant Profound", color: "#ec4899", aura: "rgba(236, 72, 153, 0.65)", start: 71, end: 80 },
  { name: "Sovereign Profound", color: "#f43f5e", aura: "rgba(244, 63, 94, 0.65)", start: 81, end: 90 },
  { name: "Divine Origin", color: "#f59e0b", aura: "rgba(245, 158, 11, 0.7)", start: 91, end: 100 },
  { name: "Divine Soul", color: "#fbbf24", aura: "rgba(251, 191, 36, 0.7)", start: 101, end: 110 },
  { name: "Divine Tribulation", color: "#eab308", aura: "rgba(234, 179, 8, 0.7)", start: 111, end: 119 },
  { name: "Divine Spirit", color: "#facc15", aura: "rgba(250, 204, 21, 0.75)", start: 120, end: 129 },
  { name: "Divine King", color: "#fef08a", aura: "rgba(254, 240, 138, 0.75)", start: 130, end: 139 },
  { name: "Divine Sovereign", color: "#ffffff", aura: "rgba(255, 255, 255, 0.8)", start: 140, end: 149 },
  { name: "Divine Master", color: "#67e8f9", aura: "rgba(103, 232, 249, 0.8)", start: 150, end: 159 },
  { name: "Divine Extinction", color: "#c084fc", aura: "rgba(192, 132, 252, 0.85)", start: 160, end: 169 },
  { name: "True God", color: "#fb7185", aura: "rgba(251, 113, 133, 0.85)", start: 170, end: 179 },
  { name: "Creation God", color: "#34d399", aura: "rgba(52, 211, 153, 0.9)", start: 180, end: 189 },
  { name: "Ancestor God", color: "#ffd700", aura: "rgba(255, 215, 0, 0.95)", start: 190, end: 199 }
];

function toRoman(num) {
  const romanMap = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let romanTier = "";
  let n = Math.max(1, Math.min(10, Number(num) || 1));
  for (const [v, r] of romanMap) {
    while (n >= v) { romanTier += r; n -= v; }
  }
  return romanTier || "I";
}

function getPopupRealmDetails(level = 1) {
  const boundedLevel = Math.max(1, Math.min(199, Math.floor(Number(level) || 1)));
  const realmIndex = Math.max(0, CULTIVATION_REALMS_CONFIG.findIndex(r => boundedLevel >= r.start && boundedLevel <= r.end));
  const realm = CULTIVATION_REALMS_CONFIG[realmIndex];
  const insideLevel = (boundedLevel - realm.start) + 1;
  const romanTier = toRoman(insideLevel);
  return { boundedLevel, realm, realmIndex, insideLevel, romanTier: romanTier || "I" };
}

function getCultivationDetails(level = 1) {
  return getPopupRealmDetails(level);
}

function renderPopupShieldFallback(realmIndex, insideLevel, romanTier, color, size = 46) {
  return `
    <svg viewBox="0 0 100 100" width="${size}" height="${size}" class="cultivation-emblem emblem-${realmIndex + 1}">
      <defs>
        <filter id="popGlow_${insideLevel}" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3.5" flood-color="${color}" flood-opacity="0.6"/>
        </filter>
        <linearGradient id="popMetal_${insideLevel}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${color}" />
          <stop offset="60%" stop-color="#0f2634" />
          <stop offset="100%" stop-color="#050e14" />
        </linearGradient>
      </defs>
      <g filter="url(#popGlow_${insideLevel})">
        <path d="M50 4 87 19 78 59 50 94 22 59 13 19z" fill="url(#popMetal_${insideLevel})" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"></path>
        <path d="m16 20-12-9 8 37 14 13zm68 0 12-9-8 37-14 13zM50 16 67 36 50 55 33 36z" fill="#0d9488" stroke="${color}" stroke-width="2" stroke-linejoin="round"></path>
        <path d="m31 59 19 24 19-24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"></path>
        <path d="M50 32 65 41 65 59 50 68 35 59 35 41z" fill="#08101e" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"></path>
        <text x="50" y="55" text-anchor="middle" fill="#f8fafc" font-size="${romanTier.length >= 3 ? 12 : 15}" font-weight="900" font-family="'JetBrains Mono', monospace">
          ${romanTier}
        </text>
      </g>
    </svg>
  `;
}

function renderOfficialCultivationBadgeSvg(level = 1, size = 46) {
  const { realmIndex, insideLevel, romanTier, realm } = getPopupRealmDetails(level);
  if (typeof window.CultivationVisuals !== "undefined" && typeof window.CultivationVisuals.renderCultivationBadge === "function") {
    const svg = window.CultivationVisuals.renderCultivationBadge(realmIndex, insideLevel, size);
    svg.classList.add("cultivation-emblem", `emblem-${realmIndex + 1}`);
    return svg.outerHTML;
  }
  return renderPopupShieldFallback(realmIndex, insideLevel, romanTier, realm.color, size);
}

function updateCultivationDisplay(data) {
  const cultivation = CultivationStore.deriveProgressFromHistories(state.examHistory, state.dpp_history);
  const level = cultivation.level;
  const totalXp = cultivation.total_xp;

  // Derive realm index and sub-level tier
  const { realmIndex, insideLevel, romanTier, realm } = getPopupRealmDetails(level);

  // 1. Mount Official Badge into #cultivationBadgeIcon / #popupCultivationBadge
  const badgeContainer = document.getElementById("cultivationBadgeIcon") || document.querySelector(".cultivation-icon-wrap") || document.getElementById("popupCultivationBadge");
  if (badgeContainer) {
    if (typeof window.CultivationVisuals !== "undefined" && typeof window.CultivationVisuals.renderCultivationBadge === "function") {
      const svg = window.CultivationVisuals.renderCultivationBadge(realmIndex, insideLevel, 46);
      svg.classList.add("cultivation-emblem", `emblem-${realmIndex + 1}`);
      badgeContainer.replaceChildren(svg);
    } else {
      // Self-contained high-fidelity fallback matching Hall of Cultivation
      badgeContainer.innerHTML = renderPopupShieldFallback(realmIndex, insideLevel, romanTier, realm.color, 46);
    }
  }

  // 2. Update Text Labels
  const levelPill = document.getElementById("popupCultivationLevelPill") || document.getElementById("popupCultivationLevelTag");
  if (levelPill) levelPill.textContent = `LEVEL ${level} / 199`;

  const realmTitle = document.getElementById("popupCultivationRealmTitle") || document.getElementById("popupCultivationTitle");
  if (realmTitle) realmTitle.textContent = level === 0 ? "Uninitiated / Mortal" : `${realm.name} Realm · Tier ${romanTier}`;

  const flowStatus = document.getElementById("popupCultivationFlowStatus") || document.getElementById("popupCultivationWound");
  if (flowStatus) {
    if (cultivation.current_debt > 0) {
      flowStatus.textContent = `⚠️ Debt: -${cultivation.current_debt} XP`;
      flowStatus.className = "flow-status debt mini-flow wounded";
    } else {
      flowStatus.textContent = "🟢 Flow: Unhindered";
      flowStatus.className = "flow-status clean mini-flow";
    }
  }
}

function renderPopupCultivation() {
  updateCultivationDisplay(state);
}
function renderReport(report) {
  const questions = report.questions || {};
  const rows = sortQuestions(questions);
  const totalQuestionMs = rows.reduce((sum, [, data]) => sum + (data.timeMs || 0), 0);
  $("totalTime").textContent = formatDuration(report.durationMs);
  $("averageTime").textContent = formatDuration(rows.length ? totalQuestionMs / rows.length : 0);
  $("endedLabel").textContent = report.endedAt ? new Date(report.endedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  $("reportIdentity").textContent = [report.examName || "Practice session", report.subject].filter(Boolean).join(" · ");
  const tbody = $("questionRows"); tbody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr"); const td = document.createElement("td");
    td.colSpan = 3; td.className = "empty"; td.textContent = "No questions detected in this session."; tr.append(td); tbody.append(tr); return;
  }
  rows.forEach(([id, data], index) => {
    const tr = document.createElement("tr");
    const label = typeof data.label === "string" && data.label.trim() ? data.label : `Question ${index + 1}`;
    for (const text of [label, formatDuration(data.timeMs), report.outcomes?.[id] || data.outcome || "Unattempted"]) {
      const td = document.createElement("td"); td.textContent = text; tr.append(td);
    }
    tbody.append(tr);
  });
}
async function load() {
  state = await chrome.storage.local.get(KEYS);
  if (!Array.isArray(state.exam_arena_subjects)) {
    state.exam_arena_subjects = [];
    await chrome.storage.local.set({ exam_arena_subjects: [] });
  }
  if (!Array.isArray(state.exam_arena_recent_names)) state.exam_arena_recent_names = [];
  const savedTheme = localStorage.getItem("examfocus-theme") || "system";
  const dark = savedTheme === "dark" || (savedTheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (savedTheme === "light") document.documentElement.setAttribute("data-theme", "light");
  else if (dark) document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  paint();
  renderPopupCultivation();
}
function send(message) {
  const payload = typeof message === "string" ? { type: message } : message;
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(payload, (response) => {
    if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
    else if (response?.ok === false) reject(new Error(response.error || "The request could not be completed."));
    else resolve(response);
  }));
}
function renderRecentNames() {
  const list = $("recentNamesList"); list.replaceChildren();
  (state.exam_arena_recent_names || []).forEach((name) => {
    const option = document.createElement("option"); option.value = name; list.append(option);
  });
}
function renderSubjects() {
  const choices = $("subjectChoices"); choices.replaceChildren();
  (state.exam_arena_subjects || []).forEach((subject) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "subject-choice";
    button.textContent = subject; button.classList.toggle("selected", selectedSubject === subject);
    button.setAttribute("aria-pressed", String(selectedSubject === subject));
    button.addEventListener("click", () => {
      selectedSubject = subject; setSetupError("subjectError"); renderSubjects(); updateStepButtons();
    });
    choices.append(button);
  });
}
function updateProgress() {
  document.querySelectorAll("[data-progress-step]").forEach((dot) => {
    const number = Number(dot.dataset.progressStep);
    dot.classList.toggle("current", number === setupStep);
    dot.classList.toggle("done", number < setupStep);
  });
  document.querySelectorAll(".setup-step").forEach((panel) => { panel.hidden = Number(panel.dataset.step) !== setupStep; });
  $("setupTitle").textContent = ["Name this session", "Choose a subject", "Set your pace"][setupStep - 1];
  if (setupStep === 1) setTimeout(() => $("examNameInput").focus(), 0);
  if (setupStep === 2 && !(state.exam_arena_subjects || []).length) setTimeout(() => $("subjectInput").focus(), 0);
  if (setupStep === 3) { updateCountdownFields(); updateStepButtons(); }
}
function updateCountdownFields() {
  const countdown = selectedMode === "countdown";
  $("countdownFields").hidden = !countdown;
  document.querySelectorAll(".mode-choice").forEach((button) => {
    const selected = button.dataset.mode === selectedMode;
    button.classList.toggle("selected", selected); button.setAttribute("aria-pressed", String(selected));
  });
  if (countdown && !validCountdown()) {
    const minutes = Number($("minutesInput").value);
    const cap = $("questionsInput").value.trim();
    setSetupError("setupError", minutes > 0 && cap
      ? "Use a time from 1–1440 minutes and an optional cap from 1–500."
      : "Enter an allotted time from 1–1440 minutes to launch a countdown session.");
  } else {
    setSetupError("setupError");
  }
  updateStepButtons();
}
function validCountdown() {
  if (selectedMode !== "countdown") return true;
  const minutes = Number($("minutesInput").value);
  const rawCap = $("questionsInput").value.trim();
  const cap = rawCap ? Number(rawCap) : null;
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 1440 &&
    (cap === null || (Number.isInteger(cap) && cap > 0 && cap <= 500));
}
function updateStepButtons() {
  if ($("subjectNext")) $("subjectNext").disabled = !selectedSubject;
  if ($("launchButton")) $("launchButton").disabled = !validCountdown();
}
function openSetup() {
  setupStep = 1; selectedMode = "stopwatch"; selectedSubject = "";
  $("examNameInput").value = ""; $("subjectInput").value = "";
  $("minutesInput").value = ""; $("questionsInput").value = "";
  setSetupError("nameError"); setSetupError("subjectError"); setSetupError("setupError");
  renderRecentNames(); renderSubjects(); updateProgress();
  $("setupModal").hidden = false;
}
function closeSetup() { $("setupModal").hidden = true; setSetupError("nameError"); setSetupError("subjectError"); setSetupError("setupError"); }
async function addSubject() {
  const value = $("subjectInput").value.trim().replace(/\s+/g, " ");
  if (!value) { $("subjectInput").focus(); return; }
  const subjects = [...(state.exam_arena_subjects || [])];
  const existing = subjects.find((subject) => subject.toLowerCase() === value.toLowerCase());
  if (!existing) {
    subjects.push(value); state.exam_arena_subjects = subjects;
    try { await chrome.storage.local.set({ exam_arena_subjects: subjects }); }
    catch (error) { setSetupError("subjectError", `Could not save subject: ${error.message}`); return; }
  }
  selectedSubject = existing || value;
  $("subjectInput").value = ""; setSetupError("subjectError"); renderSubjects(); updateStepButtons();
}
async function launchArena() {
  const examName = $("examNameInput").value.trim().replace(/\s+/g, " ");
  if (!examName || !selectedSubject || !validCountdown()) return;
  const startedAtMs = Date.now();
  const sessionConfig = {
    sessionId: crypto.randomUUID(),
    examName,
    subject: selectedSubject,
    mode: selectedMode,
    startedAt: new Date(startedAtMs).toISOString(),
    ...(selectedMode === "countdown" ? { countdownSettings: {
      allottedMinutes: Number($("minutesInput").value),
      ...( $("questionsInput").value.trim() ? { questionCap: Number($("questionsInput").value) } : {})
    } } : {})
  };
  const recent = [examName, ...(state.exam_arena_recent_names || []).filter((name) => name.toLowerCase() !== examName.toLowerCase())].slice(0, 12);
  try {
    const response = await send({
      type: "START_EXAM",
      config: {
        ...sessionConfig,
        startedAtMs,
        allottedMinutes: sessionConfig.countdownSettings?.allottedMinutes,
        targetQuestions: sessionConfig.countdownSettings?.questionCap ?? null
      }
    });
    state.exam_arena_recent_names = recent;
    await chrome.storage.local.set({ exam_arena_recent_names: recent });
    closeSetup(); await load();
    return response;
  } catch (error) {
    setSetupError("setupError", error.message || "Could not start session. Please try again.");
  }
}

$("toggleButton").addEventListener("click", async () => {
  try {
    if (state.examModeActive) { await send("END_EXAM"); await load(); }
    else openSetup();
  } catch (error) { console.error("Could not update Study Slash session", error); }
});
$("nameNext").addEventListener("click", () => {
  if (!$("examNameInput").value.trim()) { setSetupError("nameError", "Enter an exam name to continue."); $("examNameInput").focus(); return; }
  setSetupError("nameError"); setupStep = 2; renderSubjects(); updateProgress();
});
$("examNameInput").addEventListener("input", () => setSetupError("nameError"));
$("examNameInput").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); $("nameNext").click(); } });
$("subjectNext").addEventListener("click", () => {
  if (!selectedSubject) { setSetupError("subjectError", "Choose or add a subject to continue."); return; }
  setupStep = 3; setSetupError("subjectError"); updateProgress();
});
$("addSubjectButton").addEventListener("click", () => { void addSubject(); });
$("subjectInput").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); void addSubject(); } });
$("subjectInput").addEventListener("input", () => setSetupError("subjectError"));
document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => { setupStep = Number(button.dataset.back); updateProgress(); }));
document.querySelectorAll(".mode-choice").forEach((button) => button.addEventListener("click", () => {
  selectedMode = button.dataset.mode; updateCountdownFields();
}));
["minutesInput", "questionsInput"].forEach((id) => $(id).addEventListener("input", () => {
  updateCountdownFields();
}));
$("launchButton").addEventListener("click", () => { void launchArena(); });
$("setupCancelTop").addEventListener("click", closeSetup);
document.querySelectorAll(".setup-cancel").forEach((button) => button.addEventListener("click", closeSetup));
$("setupModal").addEventListener("click", (event) => { if (event.target === $("setupModal")) closeSetup(); });
$("exportButton").addEventListener("click", async () => {
  const report = state.lastReport;
  if (!report) return;
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const timestamp = sessionTimestamp(report) || Date.now();
  const link = document.createElement("a"); link.href = url; link.download = `exam-arena-${new Date(timestamp).toISOString().replace(/[:.]/g, "-")}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("clearButton").addEventListener("click", async () => { await send("CLEAR_HISTORY"); await load(); });
$("dashboardButton").addEventListener("click", () => { chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") }); });
$("dppArenaButton")?.addEventListener("click", () => { chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dpp_arena.html") }); });
$("focusModeToggle")?.addEventListener("change", async (e) => {
  const enabled = e.target.checked;
  try {
    await send({ type: "TOGGLE_FOCUS_MODE", enabled });
    state.focusModeActive = enabled;
  } catch (err) {
    console.error("Could not toggle Focus Shield:", err);
    e.target.checked = !enabled;
  }
});
chrome.storage.onChanged.addListener((changes) => {
  for (const [key, change] of Object.entries(changes)) state[key] = change.newValue;
  if (changes.examModeActive?.newValue === true) state.lastReport = undefined;
  if (changes.exam_arena_subjects) renderSubjects();
  if (changes.exam_arena_recent_names) renderRecentNames();
  paint();
  if (changes.examHistory || changes.examSession || changes.examModeActive || changes["exam-arena-cultivation-state"]) {
    renderPopupCultivation();
  }
});
load().catch((error) => console.error("Could not load Study Slash session state", error));
ticker = setInterval(() => { if (state.examModeActive) paint(); }, 1000);

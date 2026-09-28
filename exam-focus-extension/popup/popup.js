const $ = (id) => document.getElementById(id);
const KEYS = ["examModeActive", "examStartedAt", "examSession", "lastReport", "examHistory", "examConfig", "exam_arena_subjects", "exam_arena_recent_names", "focusModeActive"];
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
function renderPopupCultivation() {
  const sessions = [...(Array.isArray(state.examHistory) ? state.examHistory : [])];
  if (state.examModeActive && state.examSession) sessions.push(state.examSession);
  const entries = sessions.flatMap((session) => Object.entries(session.questions || {}).map(([id, question]) => ({
    id, question, at: Number(question.firstSeenAt || sessionTimestamp(session) || 0),
    status: question.cultivationResolved ? "Right" : question.outcome || session.outcomes?.[id] || "Unattempted"
  }))).filter((item) => Number(item.question.timeMs) >= 15000).sort((a,b) => a.at-b.at);
  let xp = 0, debt = 0;
  entries.forEach((item, index) => {
    const seconds = Number(item.question.timeMs) || 0;
    if (item.status === "Wrong") { debt += index >= 1600 ? 25 : index >= 1000 ? 10 : 5; return; }
    const award = item.question.cultivationResolved ? 10 : item.status === "Right" ? (seconds < 45000 ? 15 : 10) : item.status === "Unattempted" && seconds < 45000 ? 2 : 0;
    const healed = Math.min(debt, award); debt -= healed; xp += award-healed;
  });
  if (!entries.length) xp = 33 * 9000 + 7650;
  const level = Math.min(199, Math.max(1, Math.floor(xp / 9000) + 1));
  const realmIndex = CultivationVisuals.realms.findIndex(([,], index) => {
    const starts = [1,11,21,31,41,51,61,71,81,91,101,111,120,130,140,150,160,170,180,190];
    const ends = [10,20,30,40,50,60,70,80,90,100,110,119,129,139,149,159,169,179,189,199];
    return level >= starts[index] && level <= ends[index];
  });
  const starts = [1,11,21,31,41,51,61,71,81,91,101,111,120,130,140,150,160,170,180,190];
  const [realmName] = CultivationVisuals.realms[realmIndex] || CultivationVisuals.realms[0];
  const subLevel = level - starts[realmIndex] + 1;
  const host = $("popupCultivationBadge"); host.replaceChildren(CultivationVisuals.renderCultivationBadge(realmIndex, subLevel, 52));
  $("popupCultivationLevelTag").textContent = `LEVEL ${level} / 199`;
  $("popupCultivationTitle").textContent = `${realmName} Realm · ${CultivationVisuals.toRoman(subLevel)}`;
  const wound = $("popupCultivationWound"); wound.textContent = debt ? `🩸 WOUNDED · ${debt} XP debt` : "🟢 Flow: Unhindered";
  wound.classList.toggle("wounded", debt > 0);
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
  } catch (error) { console.error("Could not update Exam Arena session", error); }
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
  if (changes.examHistory || changes.examSession || changes.examModeActive) renderPopupCultivation();
});
load().catch((error) => console.error("Could not load Exam Arena session state", error));
ticker = setInterval(() => { if (state.examModeActive) paint(); }, 1000);

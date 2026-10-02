// Single source of truth for progress derived from the saved session archives.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CultivationStore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const CULTIVATION_KEY = "exam-arena-cultivation-state";
  const EXAM_HISTORY_KEY = "examHistory";
  const DPP_HISTORY_KEY = "dpp_history";
  const CONCEPT_MIN_DWELL_MS = 60_000;
  const CONCEPT_MAX_DWELL_MS = 270_000;
  const REALMS = [
    ["Elementary Profound", "#14b8a6"], ["Nascent Profound", "#06b6d4"], ["True Profound", "#38bdf8"],
    ["Spirit Profound", "#6366f1"], ["Earth Profound", "#8b5cf6"], ["Sky Profound", "#a855f7"],
    ["Emperor Profound", "#d946ef"], ["Tyrant Profound", "#ec4899"], ["Sovereign Profound", "#f43f5e"],
    ["Divine Origin", "#f59e0b"], ["Divine Soul", "#fbbf24"], ["Divine Tribulation", "#eab308"],
    ["Divine Spirit", "#facc15"], ["Divine King", "#fef08a"], ["Divine Sovereign", "#fff"],
    ["Divine Master", "#67e8f9"], ["Divine Extinction", "#c084fc"], ["True God", "#fb7185"],
    ["Creation God", "#34d399"], ["Ancestor God", "#ffd700"]
  ];
  const levelForXp = (xp) => {
    if (!(xp > 0)) return 0;
    let level = Math.min(199, Math.max(1, Math.floor((-60 + Math.sqrt(3600 + 16 * xp)) / 8)));
    while (level < 199 && xp >= 4 * (level + 1) ** 2 + 60 * (level + 1)) level++;
    while (level > 1 && xp < 4 * level ** 2 + 60 * level) level--;
    return level;
  };
  function createZeroState() {
    return { level: 0, realmName: "Uninitiated / Mortal", tier: "I", xp: 0, total_xp: 0, lifetime_xp: 0,
      current_debt: 0, total_questions_logged: 0, qualified_concept_reviews: 0, accuracy: 0, streakDays: 0, isEmpty: true, lastSyncedAt: Date.now() };
  }
  function getRealmMetadata(level) {
    if (!level) return { realmIndex: 0, realmName: "Uninitiated / Mortal", tierRoman: "I", color: "#64748b" };
    const realmIndex = Math.min(REALMS.length - 1, Math.floor((level - 1) / 10));
    const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
    return { realmIndex: realmIndex + 1, realmName: REALMS[realmIndex][0], tierRoman: roman[(level - 1) % 10], color: REALMS[realmIndex][1] };
  }
  function deriveProgressFromHistories(examHistory = [], dppHistory = []) {
    const exams = (Array.isArray(examHistory) ? examHistory : []).filter(s => s && !String(s.sessionId || "").includes("test_"));
    const dpps = (Array.isArray(dppHistory) ? dppHistory : []).filter(s => s && !String(s.id || "").includes("test_"));
    let xp = 0, questions = 0, correct = 0, debt = 0, qualifiedConceptReviews = 0;
    const isQualifiedConcept = item => Boolean(item?.isConceptReview && item?.conceptQualified &&
      Number(item.dwellMs) >= CONCEPT_MIN_DWELL_MS && Number(item.dwellMs) <= CONCEPT_MAX_DWELL_MS);
    const questionLog = [];
    const timeOf = s => Number(s.startedAtMs) || Number(s.startedAt) || Date.parse(s.startedAt || s.startTime || s.date || s.timestamp) || 0;
    for (const s of exams) {
      const qs = s.questions && typeof s.questions === "object" ? Object.entries(s.questions) : [];
      if (qs.length) {
        questions += qs.length;
        for (const [id, q] of qs) {
          const status = q?.cultivationResolved ? "Right" : q?.outcome || s.outcomes?.[id] || "Unattempted";
          if (status === "Right" || q?.cultivationResolved) correct++;
          if (isQualifiedConcept(q)) qualifiedConceptReviews++;
          questionLog.push({ q, status, at: Number(q?.firstSeenAt) || timeOf(s) });
        }
      } else {
        xp += Math.max(0, Number(s.cultivationXpGained) || 0);
        debt += Math.max(0, Number(s.debtAdded) || 0);
        questions += Math.max(0, Number(s.questionCount) || 0);
        correct += Math.max(0, Number(s.correctCount) || 0);
      }
      if (isQualifiedConcept(s)) qualifiedConceptReviews++;
    }
    questionLog.sort((a, b) => a.at - b.at);
    questionLog.forEach(({ q, status }, index) => {
      const duration = Number(q?.timeMs) || 0;
      if (duration < 15000) return;
      if (status === "Wrong" && !q?.cultivationResolved && !q?.healed) { debt += index + 1 >= 16000 ? 25 : index + 1 >= 10000 ? 10 : 5; return; }
      const award = q?.cultivationResolved ? 10 : status === "Right" ? (duration < 45000 ? 15 : 10) : status === "Unattempted" && duration < 45000 ? 2 : 0;
      const healed = Math.min(debt, award); debt -= healed; xp += award - healed;
    });
    for (const d of dpps) {
      xp += Math.max(0, Number(d.cultivationXpGained) || 0);
      questions += Math.max(0, Number(d.totalQuestions) || 0);
      correct += Math.max(0, Number(d.correctCount) || 0);
    }
    xp = Math.floor(xp) + Math.floor(qualifiedConceptReviews / 2);
    if (!exams.length && !dpps.length || xp === 0 && questions === 0 && qualifiedConceptReviews === 0) return createZeroState();
    const level = levelForXp(xp), meta = getRealmMetadata(level);
    return { level, realmName: meta.realmName, tier: meta.tierRoman, color: meta.color, xp, total_xp: xp, lifetime_xp: xp,
      current_debt: debt, total_questions_logged: questions, accuracy: questions ? Math.round(correct / questions * 100) : 0,
      qualified_concept_reviews: qualifiedConceptReviews, isEmpty: false, lastSyncedAt: Date.now() };
  }
  function extractAllTimeBleeds(examHistory = [], dppHistory = [], activeSession = null) {
    const bleeds = [], seen = new Set();
    const addSession = (session, sourceHint = "") => {
      if (!session || String(session.sessionId || session.id || "").includes("test_")) return;
      const isDpp = sourceHint === "dpp" || session.source === "dpp" || session.isDpp || session.pdfSessionId;
      const source = isDpp ? "dpp" : "marks";
      const entries = Array.isArray(session.questions) ? session.questions.map((q, i) => [String(i + 1), q]) : Object.entries(session.questions || {});
      const attempts = [...(session.reattemptLedger || []), ...Object.values(session.reattempts || {})];
      for (const [qid, question = {}] of entries) {
        const outcome = question.outcome || session.outcomes?.[qid];
        const mismatch = isDpp && question.userAnswer != null && question.correctAnswer != null &&
          String(question.userAnswer).trim().toUpperCase() !== String(question.correctAnswer).trim().toUpperCase();
        if (outcome !== "Wrong" && question.preReattemptOutcome !== "Wrong" && !mismatch) continue;
        const sessionId = String(session.sessionId || session.id || "");
        const id = `${source}:${sessionId}:${qid}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const healed = Boolean(question.healed || question.cultivationResolved || question.reattemptSuccess ||
          attempts.some(item => String(item.questionId) === String(qid) && item.outcome === "Right"));
        let url = question.url || session.testUrl || "";
        if (!isDpp && (!url || !/\/question\//i.test(url))) {
          const questionId = String(question.questionId || qid);
          url = /^[A-Za-z0-9_-]+$/.test(questionId) && !/^question[-_ ]?\d+$/i.test(questionId)
            ? `https://web.getmarks.app/cpyqbV3/question/${encodeURIComponent(questionId)}/` : "";
        }
        bleeds.push({ id, source, sessionId, questionId: String(question.questionId || qid), question, session,
          subject: String(session.subject || "Unspecified").toUpperCase(),
          examTitle: session.examName || session.dppName || session.title || (isDpp ? "DPP Test" : "Marks Practice"),
          label: question.label || `Question ${qid}`, date: session.completedAt || session.endedAt || session.startedAtMs || session.startedAt || Date.now(),
          url: isDpp ? url : url, userChoice: question.userChoice || question.reattemptSelected || session.userAnswers?.[qid] || question.userAnswer || "—", healed });
      }
      if (!entries.length) {
        const count = Math.floor(Math.max(0, Number(session.wrongCount || session.debtAdded) || 0));
        for (let i = 1; i <= count; i++) {
          const id = `${source}:${session.sessionId || session.id || "legacy"}:err_${i}`;
          if (seen.has(id)) continue;
          seen.add(id);
          bleeds.push({ id, source, sessionId: String(session.sessionId || session.id || ""), questionId: `err_${i}`,
            question: null, session, subject: String(session.subject || "Unspecified").toUpperCase(),
            examTitle: session.examName || session.dppName || session.title || "Practice", label: `Wounded item #${i}`,
            date: session.completedAt || session.endedAt || session.startedAtMs || Date.now(), url: session.testUrl || "", userChoice: "—", healed: false });
        }
      }
    };
    const exams = Array.isArray(examHistory) ? examHistory : [];
    exams.forEach(session => addSession(session));
    (Array.isArray(dppHistory) ? dppHistory : []).forEach(session => addSession(session, "dpp"));
    if (activeSession && !exams.some(s => (s.sessionId || s.id) === (activeSession.sessionId || activeSession.id))) addSession(activeSession);
    const time = value => typeof value === "number" ? value : Date.parse(value) || 0;
    return bleeds.sort((a, b) => time(b.date) - time(a.date));
  }
  async function syncProgressFromStorage() {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return createZeroState();
    const data = await chrome.storage.local.get([EXAM_HISTORY_KEY, DPP_HISTORY_KEY]);
    const progress = deriveProgressFromHistories(data[EXAM_HISTORY_KEY], data[DPP_HISTORY_KEY]);
    await chrome.storage.local.set({ [CULTIVATION_KEY]: progress });
    return progress;
  }
  async function clearAllStudentLogs() {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return createZeroState();
    const zero = createZeroState();
    await chrome.storage.local.set({ [EXAM_HISTORY_KEY]: [], [DPP_HISTORY_KEY]: [], examSession: null, examModeActive: false,
      streakDays: 0, [CULTIVATION_KEY]: zero });
    return zero;
  }
  async function importBackupCleanOverwrite(data) {
    if (typeof chrome === "undefined" || !chrome.storage?.local) throw new Error("Storage is unavailable");
    if (!data || typeof data !== "object") throw new Error("Invalid backup format");
    const exams = Array.isArray(data.examHistory) ? data.examHistory : Array.isArray(data.sessions) ? data.sessions : Array.isArray(data) ? data : [];
    const dpps = Array.isArray(data.dpp_history) ? data.dpp_history : [];
    const progress = deriveProgressFromHistories(exams, dpps);
    const payload = { ...data };
    for (const key of ["sessions", "examHistory", "dpp_history"]) delete payload[key];
    await chrome.storage.local.set({ ...payload, [EXAM_HISTORY_KEY]: exams, [DPP_HISTORY_KEY]: dpps,
      examSession: null, examStartedAt: null, examModeActive: false, lastReport: null,
      monthlyReports: {}, [CULTIVATION_KEY]: progress,
      streakDays: Number(data.streakDays) || 0, monthlyTargetPercent: Number(data.monthlyTargetPercent) || 0 });
    return progress;
  }
  return { createZeroState, deriveProgressFromHistories, extractAllTimeBleeds, syncProgressFromStorage, clearAllStudentLogs,
    importBackupCleanOverwrite, getRealmMetadata, CULTIVATION_KEY };
});

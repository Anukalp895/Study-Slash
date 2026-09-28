const KEYS = { active: "examModeActive", started: "examStartedAt", snapshot: "examSnapshot", session: "examSession", history: "examHistory", lastReport: "lastReport", config: "examConfig" };
const TEST_HOST = "getmarks.app";
const SEARCH_HOSTS = ["google.", "bing.com", "duckduckgo.com", "yahoo.com", "search.brave.com", "ecosia.org"];
const lastAllowedByTab = new Map();
let endingSession = false;
let sessionWriteQueue = Promise.resolve();

function serializeSessionWrite(operation) {
  const pending = sessionWriteQueue.then(operation, operation);
  sessionWriteQueue = pending.catch(() => {});
  return pending;
}

const getState = () => chrome.storage.local.get(Object.values(KEYS));
function sessionStartMs(session) {
  if (Number(session?.startedAtMs) > 0) return Number(session.startedAtMs);
  const raw = session?.startedAt;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && /^\d{10,13}$/.test(raw)) return Number(raw);
  return Date.parse(raw) || 0;
}
function sessionIdentity(session) { return String(session?.sessionId || sessionStartMs(session)); }
function compactQuestionUrl(raw) {
  if (typeof raw !== "string" || !/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|gclid$|fbclid$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    if (url.search.length > 600) url.search = "";
    const safe = `${url.origin}${url.pathname}${url.search}${url.hash}`;
    return safe.length <= 1200 ? safe : `${url.origin}${url.pathname.slice(0, 800)}`;
  } catch { return null; }
}
function isSearch(url) {
  try { const host = new URL(url).hostname.toLowerCase(); return SEARCH_HOSTS.some((needle) => host === needle || host.endsWith(`.${needle}`) || host.includes(needle)); }
  catch { return false; }
}
function hostname(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } }
function setBlockedBadge() {
  chrome.action.setBadgeText({ text: "BLOCK" }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: "#b42318" }).catch(() => {});
  chrome.action.setTitle({ title: "Exam Mode Active: Navigation blocked." }).catch(() => {});
  setTimeout(() => chrome.action.setBadgeText({ text: "" }).catch(() => {}), 3500);
}
async function completeSession(reason = "manual", finalQuestionState = null) {
  if (endingSession) return null;
  endingSession = true;
  try {
    const openTabs = await chrome.tabs.query({ url: ["*://*.getmarks.app/*"] });
    await Promise.all(openTabs.filter((tab) => tab.id != null).map((tab) => new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: "FLUSH_QUESTION", reason }, () => { void chrome.runtime.lastError; resolve(); });
    })));
    await sessionWriteQueue;
    const data = await getState();
    if (!data[KEYS.active]) return data[KEYS.lastReport] || null;
    const session = data[KEYS.session] || { startedAt: new Date().toISOString(), startedAtMs: Date.now(), questions: {}, outcomes: {} };
    session.questions ||= {}; session.outcomes ||= {}; session.completedQuestionIds ||= [];
    if (finalQuestionState && typeof finalQuestionState === "object") {
      const questionId = String(finalQuestionState.questionId || "").slice(0, 100);
      if (questionId) {
        const existing = session.questions[questionId] || { timeMs: 0, visits: 0 };
        const finalTimeMs = Math.max(0, Number(finalQuestionState.timeMs) || 0);
        const finalOutcome = ["Right", "Wrong", "Unattempted"].includes(finalQuestionState.outcome) ? finalQuestionState.outcome : null;
        const savedOutcome = session.outcomes[questionId] || existing.outcome;
        const outcome = finalOutcome === "Right" || finalOutcome === "Wrong"
          ? finalOutcome
          : (savedOutcome === "Right" || savedOutcome === "Wrong" ? savedOutcome : (finalOutcome || savedOutcome));
        session.questions[questionId] = {
          ...existing,
          // The page flushes this question before END_EXAM; max() makes the final-state merge idempotent.
          timeMs: Math.max(Number(existing.timeMs) || 0, finalTimeMs),
          visits: Math.max(1, Number(existing.visits) || 0),
          firstSeenAt: existing.firstSeenAt || Date.now(),
          ...(typeof finalQuestionState.label === "string" ? { label: finalQuestionState.label.slice(0, 100) } : {}),
          ...(compactQuestionUrl(finalQuestionState.url) ? { url: compactQuestionUrl(finalQuestionState.url) } : {}),
          ...(typeof finalQuestionState.userSelected === "boolean" ? { userSelected: finalQuestionState.userSelected } : {}),
          ...(Number(finalQuestionState.lastInteractedAt) > 0 ? { lastInteractedAt: Number(finalQuestionState.lastInteractedAt) } : {}),
          ...(outcome ? { outcome } : {})
        };
        if (outcome) session.outcomes[questionId] = outcome;
        if ((outcome === "Right" || outcome === "Wrong") && !session.completedQuestionIds.includes(questionId)) {
          session.completedQuestionIds.push(questionId);
        }
      }
    }
    const startedAtMs = sessionStartMs(session) || Date.now();
    const endedAt = Date.now();
    session.outcomes ||= {};
    let attemptedCount = 0;
    for (const [questionId, question] of Object.entries(session.questions || {})) {
      const recorded = session.outcomes[questionId] || question.outcome;
      const outcome = recorded === "Right" || recorded === "Wrong" ? recorded : "Unattempted";
      if (outcome === "Right" || outcome === "Wrong") attemptedCount += 1;
      session.outcomes[questionId] = outcome;
      question.outcome = outcome;
    }
    if (session.mode === "countdown" && Number.isFinite(session.targetQuestions)) {
      const visitedCount = Object.keys(session.questions || {}).length;
      const remaining = Math.max(0, session.targetQuestions - visitedCount);
      session.targetPadding = Array.from({ length: remaining }, (_, index) => ({
        questionId: `Relative #${visitedCount + index + 1}`,
        label: `Relative #${visitedCount + index + 1}`,
        timeMs: 0,
        outcome: "Not Visited",
        url: null,
        isPlaceholder: true
      }));
    }
    const report = { ...session, startedAtMs, endedAt, endedReason: reason, durationMs: Math.max(0, endedAt - startedAtMs) };
    const history = Array.isArray(data[KEYS.history]) ? data[KEYS.history] : [];
    if (attemptedCount === 0) {
      // A zero-attempt session is only an in-page summary; never archive or retain it.
      await chrome.storage.local.set({ [KEYS.active]: false });
      await chrome.storage.local.remove([KEYS.session, KEYS.started, KEYS.snapshot, KEYS.config]);
    } else {
      await chrome.storage.local.set({ [KEYS.active]: false, [KEYS.history]: [report, ...history].slice(0, 25), [KEYS.lastReport]: report });
    }
    await chrome.alarms.clear("examfocus-deadline");
    chrome.action.setBadgeText({ text: "" });
    const tabs = await chrome.tabs.query({ url: ["*://*.getmarks.app/*"] });
    for (const tab of tabs) if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: "EXAM_COMPLETED", reason, report, discarded: attemptedCount === 0 }, () => { void chrome.runtime.lastError; });
    return report;
  } finally { endingSession = false; }
}
function isAllowed(url, snapshot) {
  const host = hostname(url);
  if (!host || isSearch(url)) return false;
  // The practice domain remains reachable even when it was not open at start.
  if (host === TEST_HOST || host.endsWith(`.${TEST_HOST}`)) return true;
  return (snapshot?.allowedHosts || []).some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}
async function blockNavigation(tabId, url) {
  const { examModeActive, examSnapshot } = await getState();
  if (!examModeActive || isAllowed(url, examSnapshot)) return;
  setBlockedBadge();
  const fallback = lastAllowedByTab.get(tabId) || (examSnapshot?.fallbackUrl);
  if (fallback) chrome.tabs.update(tabId, { url: fallback }).catch(() => {});
  else chrome.tabs.update(tabId, { url: "https://web.getmarks.app/" }).catch(() => {});
}

async function syncFocusRules(enabled) {
  if (!chrome.declarativeNetRequest?.updateEnabledRulesets) return;
  try {
    if (enabled) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: ["focus_rules"]
      });
    } else {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ["focus_rules"]
      });
    }
  } catch (err) {
    console.error("Failed to update declarativeNetRequest rulesets:", err);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get([
    KEYS.active,
    KEYS.history,
    "exam_arena_subjects",
    "exam_arena_recent_names",
    "focusModeActive",
    "whitelistedVideos"
  ]);
  if (data[KEYS.active] === undefined) await chrome.storage.local.set({ [KEYS.active]: false });
  if (data.focusModeActive === undefined) await chrome.storage.local.set({ focusModeActive: false });
  if (!Array.isArray(data.whitelistedVideos)) await chrome.storage.local.set({ whitelistedVideos: [] });
  if (!Array.isArray(data[KEYS.history])) await chrome.storage.local.set({ [KEYS.history]: [] });
  if (!Array.isArray(data.exam_arena_subjects)) await chrome.storage.local.set({ exam_arena_subjects: [] });
  if (!Array.isArray(data.exam_arena_recent_names)) await chrome.storage.local.set({ exam_arena_recent_names: [] });

  const isFocusOn = Boolean(data.focusModeActive || data[KEYS.active]);
  await syncFocusRules(isFocusOn);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.focusModeActive || changes.examModeActive) {
    chrome.storage.local.get(["focusModeActive", "examModeActive"], (data) => {
      const active = Boolean(data.focusModeActive || data.examModeActive);
      syncFocusRules(active);
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "MARKS_MASK_CSS_ENABLE" && sender.tab?.id != null) {
      await chrome.scripting.insertCSS({ target: { tabId: sender.tab.id }, files: ["styles/blur.css"] });
      sendResponse({ ok: true }); return;
    }
    if (message?.type === "MARKS_MASK_CSS_DISABLE" && sender.tab?.id != null) {
      await chrome.scripting.removeCSS({ target: { tabId: sender.tab.id }, files: ["styles/blur.css"] });
      sendResponse({ ok: true }); return;
    }
    if (message?.type === "OPEN_DASHBOARD") {
      const dashboardUrl = new URL(chrome.runtime.getURL("dashboard/dashboard.html"));
      if (message.sessionId != null) dashboardUrl.searchParams.set("sessionId", String(message.sessionId));
      const tab = await chrome.tabs.create({ url: dashboardUrl.toString() });
      sendResponse({ ok: true, tabId: tab.id }); return;
    }
    if (message?.type === "GET_STATE") { sendResponse(await getState()); return; }
    if (message?.type === "TOGGLE_FOCUS_MODE") {
      const data = await chrome.storage.local.get(["focusModeActive", KEYS.active]);
      const next = message.enabled !== undefined ? Boolean(message.enabled) : !data.focusModeActive;
      await chrome.storage.local.set({ focusModeActive: next });
      await syncFocusRules(Boolean(next || data[KEYS.active]));
      sendResponse({ ok: true, focusModeActive: next }); return;
    }
    if (message?.type === "YOUTUBE_WHITELIST_ADD") {
      const { videoId, title, channel, timestamp } = message;
      if (videoId) {
        const data = await chrome.storage.local.get(["whitelistedVideos", KEYS.session, KEYS.active]);
        const currentList = Array.isArray(data.whitelistedVideos) ? data.whitelistedVideos : [];
        if (!currentList.includes(videoId)) {
          await chrome.storage.local.set({ whitelistedVideos: [...currentList, videoId] });
        }
        if (data[KEYS.active] && data[KEYS.session]) {
          const session = data[KEYS.session];
          session.whitelistedVideos ||= [];
          session.whitelistedVideos.push({
            videoId,
            title: title || "",
            channel: channel || "",
            timestamp: timestamp || Date.now()
          });
          await chrome.storage.local.set({ [KEYS.session]: session });
        }
      }
      sendResponse({ ok: true }); return;
    }
    if (message?.type === "YOUTUBE_TAB_CHECK") {
      const { examSnapshot } = await getState();
      sendResponse({ allowed: Boolean(sender.tab?.id != null && examSnapshot?.allowedTabIds?.includes(sender.tab.id)) }); return;
    }
    if (message?.type === "START_EXAM") {
      const rawConfig = message.config || {};
      const examName = String(rawConfig.examName || "").trim().replace(/\s+/g, " ");
      const subject = String(rawConfig.subject || "").trim().replace(/\s+/g, " ");
      if (!examName || !subject) throw new Error("Exam name and subject are required before launch.");
      const mode = rawConfig.mode === "countdown" ? "countdown" : "stopwatch";
      const countdown = rawConfig.countdownSettings || {};
      const minutes = Number(countdown.allottedMinutes ?? rawConfig.allottedMinutes);
      if (mode === "countdown" && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)) {
        throw new Error("Countdown time must be between 1 and 1440 minutes.");
      }
      const rawCap = countdown.questionCap ?? rawConfig.targetQuestions;
      const targetQuestions = mode === "countdown" && rawCap !== null && rawCap !== undefined && rawCap !== ""
        ? Number(rawCap) : null;
      if (targetQuestions !== null && (!Number.isInteger(targetQuestions) || targetQuestions < 1 || targetQuestions > 500)) {
        throw new Error("Question cap must be between 1 and 500.");
      }
      const allottedTimeMs = mode === "countdown" ? minutes * 60000 : null;
      const requestedStart = Date.parse(rawConfig.startedAt || "");
      const startedAtMs = Number.isFinite(requestedStart) ? requestedStart : (Number(rawConfig.startedAtMs) || Date.now());
      const startedAt = new Date(startedAtMs).toISOString();
      const sessionId = String(rawConfig.sessionId || crypto.randomUUID());
      endingSession = false;
      await chrome.alarms.clear("examfocus-deadline");
      const tabs = await chrome.tabs.query({});
      const active = tabs.find((tab) => tab.active && tab.url && /^https?:/.test(tab.url));
      const allowedHosts = [...new Set(tabs.map((tab) => hostname(tab.url)).filter(Boolean))];
      const snapshot = { takenAt: startedAtMs, allowedHosts, allowedTabIds: tabs.filter((tab) => tab.id != null).map((tab) => tab.id), fallbackUrl: active?.url || "https://web.getmarks.app/" };
      const config = { mode, allottedTimeMs, targetQuestions, sessionId, examName, subject, startedAt, startedAtMs,
        ...(mode === "countdown" ? { countdownSettings: { allottedMinutes: minutes, ...(targetQuestions ? { questionCap: targetQuestions } : {}) } } : {}) };
      const session = { ...config, questions: {}, outcomes: {}, completedQuestionIds: [], reviewQuestionIds: [] };
      await chrome.storage.local.remove([KEYS.lastReport]);
      for (const tab of tabs) if (tab.id != null && tab.url && isAllowed(tab.url, { allowedHosts })) lastAllowedByTab.set(tab.id, tab.url);
      await chrome.storage.local.set({ [KEYS.active]: true, [KEYS.started]: snapshot.takenAt, [KEYS.snapshot]: snapshot, [KEYS.config]: config, [KEYS.session]: session });
      if (mode === "countdown") chrome.alarms.create("examfocus-deadline", { when: startedAtMs + allottedTimeMs });
      chrome.action.setBadgeText({ text: "ON" }); chrome.action.setBadgeBackgroundColor({ color: "#087e66" });
      sendResponse({ ok: true }); return;
    }
    if (message?.type === "END_EXAM") {
      const reason = ["question-limit-confirmed", "user-confirmed"].includes(message.reason) ? message.reason : "manual";
      const report = await completeSession(reason, message.finalQuestionState);
      sendResponse({ ok: true, report }); return;
    }
    if (message?.type === "SESSION_TICK") {
      const data = await getState(); const session = data[KEYS.session];
      const startedAtMs = sessionStartMs(session);
      if (data[KEYS.active] && session?.mode === "countdown" && Date.now() - startedAtMs >= session.allottedTimeMs) await completeSession("time-limit");
      sendResponse({ ok: true }); return;
    }
    if (message?.type === "RECORD_QUESTION") {
      const result = await serializeSessionWrite(async () => {
        const data = await getState();
        if (!data[KEYS.active]) return { ok: false, ended: false };
        const session = data[KEYS.session] || { startedAt: Date.now(), questions: {}, outcomes: {} };
        session.questions ||= {}; session.outcomes ||= {}; session.completedQuestionIds ||= []; session.questionOrder ||= [];
        if (!Array.isArray(session.reviewQuestionIds)) session.reviewQuestionIds = [];
        const id = String(message.questionId || "Unknown").slice(0, 100);
        const existing = session.questions[id] || { timeMs: 0, visits: 0 };
        if (message.entered && !session.questionOrder.includes(id)) session.questionOrder.push(id);
        const validOutcomes = ["Right", "Wrong", "Unattempted"];
        const requestedOutcome = validOutcomes.includes(message.outcome) ? message.outcome : null;
        // A delayed selection event must never overwrite a result already detected for that question.
        const savedOutcome = ["Right", "Wrong", "Unattempted"].includes(existing.outcome)
          ? existing.outcome
          : (["Right", "Wrong", "Unattempted"].includes(session.outcomes[id]) ? session.outcomes[id] : null);
        const outcome = message.clearOutcome === true ? null : (["Right", "Wrong"].includes(savedOutcome) ? savedOutcome : requestedOutcome || savedOutcome);
        const questionUrl = compactQuestionUrl(message.url) || existing.url;
        session.questions[id] = {
          ...existing,
          timeMs: existing.timeMs + Math.max(0, Number(message.dwellMs) || 0),
          visits: existing.visits + (message.entered ? 1 : 0),
          ...(!existing.firstSeenAt && message.entered ? { firstSeenAt: Date.now() } : {}),
          ...(questionUrl ? { url: questionUrl } : {}),
          ...(typeof message.label === "string" ? { label: message.label.slice(0, 100) } : {}),
          ...(typeof message.userSelected === "boolean" ? { userSelected: message.userSelected } : {}),
          ...(Number(message.lastInteractedAt) > 0 ? { lastInteractedAt: Number(message.lastInteractedAt) } : {}),
          ...(outcome ? { outcome } : {}),
          lastSeenAt: Date.now()
        };
        if (outcome) session.outcomes[id] = outcome;
        else { delete session.questions[id].outcome; delete session.outcomes[id]; }
        if (outcome === "Right" || outcome === "Wrong") session.reviewQuestionIds = session.reviewQuestionIds.filter((reviewId) => reviewId !== id);
        if (message.completed && !session.completedQuestionIds.includes(id)) session.completedQuestionIds.push(id);
        if (message.clearOutcome === true) session.completedQuestionIds = session.completedQuestionIds.filter((completedId) => completedId !== id);
        await chrome.storage.local.set({ [KEYS.session]: session });
        // Question caps are confirmed by the page before ending. Only the time alarm ends silently.
        return { ok: true };
      });
      sendResponse({ ok: result.ok, ended: false }); return;
    }
    if (message?.type === "TOGGLE_REVIEW") {
      const result = await serializeSessionWrite(async () => {
        const data = await getState();
        if (!data[KEYS.active]) return { ok: false, error: "No active exam session." };
        const session = data[KEYS.session];
        const id = String(message.questionId || "").slice(0, 100);
        if (!id || !session?.questions?.[id]) return { ok: false, error: "Question is not part of this session." };
        if (!Array.isArray(session.reviewQuestionIds)) session.reviewQuestionIds = [];
        const question = session.questions[id];
        const outcome = session.outcomes?.[id] || question.outcome;
        if (outcome === "Right" || outcome === "Wrong") {
          session.reviewQuestionIds = session.reviewQuestionIds.filter((reviewId) => reviewId !== id);
          await chrome.storage.local.set({ [KEYS.session]: session });
          return { ok: true, locked: true, marked: false, reviewQuestionIds: session.reviewQuestionIds };
        }
        const alreadyMarked = session.reviewQuestionIds.includes(id);
        session.reviewQuestionIds = alreadyMarked
          ? session.reviewQuestionIds.filter((reviewId) => reviewId !== id)
          : [...session.reviewQuestionIds, id];
        await chrome.storage.local.set({ [KEYS.session]: session });
        return { ok: true, marked: !alreadyMarked, reviewQuestionIds: session.reviewQuestionIds };
      });
      sendResponse(result); return;
    }
    if (message?.type === "RECORD_REATTEMPT") {
      const result = await serializeSessionWrite(async () => {
        const data = await getState();
        const sessionId = String(message.sessionId || "");
        const questionId = String(message.questionId || "").slice(0, 100);
        const dwellMs = Math.max(0, Number(message.dwellMs) || 0);
        const outcome = ["Right", "Wrong", "Unattempted"].includes(message.outcome) ? message.outcome : "Unattempted";
        const timestamp = Number(message.timestamp) || Date.now();

        let history = Array.isArray(data[KEYS.history]) ? [...data[KEYS.history]] : [];
        let activeSession = data[KEYS.session];
        let lastReport = data[KEYS.lastReport];
        let targetSession = null;
        let inHistory = false;
        let inActive = false;
        let historyIdx = -1;

        if (activeSession && (sessionIdentity(activeSession) === sessionId || activeSession.sessionId === sessionId)) {
          targetSession = activeSession;
          inActive = true;
        } else {
          historyIdx = history.findIndex((s) => sessionIdentity(s) === sessionId || s.sessionId === sessionId);
          if (historyIdx >= 0) {
            targetSession = { ...history[historyIdx] };
            inHistory = true;
          } else if (lastReport && (sessionIdentity(lastReport) === sessionId || lastReport.sessionId === sessionId)) {
            targetSession = { ...lastReport };
          } else if (history.length > 0 && questionId) {
            historyIdx = history.findIndex((s) => s.questions && s.questions[questionId]);
            if (historyIdx >= 0) {
              targetSession = { ...history[historyIdx] };
              inHistory = true;
            }
          }
        }

        if (!targetSession) {
          return { ok: false, error: "Session not found for reattempt." };
        }

        targetSession.reattempts ||= {};
        const existing = targetSession.reattempts[questionId] || { timeMs: 0, attempts: 0 };
        targetSession.reattempts[questionId] = {
          questionId,
          timeMs: existing.timeMs + dwellMs,
          dwellMs,
          outcome,
          timestamp,
          attempts: (existing.attempts || 0) + 1,
          history: [...(existing.history || []), { dwellMs, outcome, timestamp }]
        };

        targetSession.reattemptLedger ||= [];
        targetSession.reattemptLedger.push({
          questionId,
          dwellMs,
          outcome,
          timestamp
        });

        const qObj = targetSession.questions?.[questionId];
        const wasAlreadyRight = qObj && (qObj.outcome === "Right" || targetSession.outcomes?.[questionId] === "Right");
        const wasAlreadyResolved = Boolean(qObj?.cultivationResolved);
        const wasUnattempted = !qObj || qObj.outcome === "Unattempted" || !qObj.outcome;

        // Anti-exploit check: only resolve if question was originally failed and not yet resolved
        const canHeal = outcome === "Right" && !wasAlreadyRight && !wasAlreadyResolved;
        if (canHeal) {
          targetSession.questions ||= {};
          if (targetSession.questions[questionId]) {
            targetSession.questions[questionId].cultivationResolved = true;
            targetSession.questions[questionId].reattemptSuccess = true;
          }
        }

        // Reattempt Ledger Matrix:
        // Unattempted -> Right: +1 Cultivated, +10 XP, Healed
        // Unattempted -> Wrong: +1 Cultivated, -5 XP, Incurred
        // Wrong -> Right: +0 Cultivated, +10 XP, Healed (Antidote)
        // Wrong -> Wrong: +0 Cultivated, 0 XP, Maintained
        // Right -> Right: +0 Cultivated, 0 XP (Exploit Prevented)
        // Right -> Wrong: +0 Cultivated, 0 XP
        let xpDelta = 0;
        if (wasAlreadyRight) {
          xpDelta = 0; // Exploit Prevented
        } else if (wasUnattempted) {
          targetSession.questions ||= {};
          targetSession.questions[questionId] ||= { questionId, timeMs: 0 };
          targetSession.questions[questionId].outcome = outcome;
          if (outcome === "Right") {
            targetSession.questions[questionId].cultivationResolved = true;
            targetSession.questions[questionId].reattemptSuccess = true;
            xpDelta = 10;
          } else if (outcome === "Wrong") {
            xpDelta = -5;
          }
        } else {
          // Originally Wrong
          if (outcome === "Right" && !wasAlreadyResolved) {
            xpDelta = 10;
          } else {
            xpDelta = 0;
          }
        }
        targetSession.cultivationXpGained = (targetSession.cultivationXpGained || 0) + xpDelta;

        const updates = {};
        if (inHistory && historyIdx >= 0) {
          history[historyIdx] = targetSession;
          updates[KEYS.history] = history;
        }
        if (inActive) {
          updates[KEYS.session] = targetSession;
        }
        if (lastReport && (sessionIdentity(lastReport) === sessionIdentity(targetSession) || lastReport.sessionId === targetSession.sessionId)) {
          updates[KEYS.lastReport] = targetSession;
        }

        await chrome.storage.local.set(updates);
        return { ok: true, resolved: outcome === "Right", session: targetSession };
      });
      sendResponse(result); return;
    }
    if (message?.type === "CLEAR_HISTORY") { await chrome.storage.local.set({ [KEYS.history]: [], [KEYS.lastReport]: null }); sendResponse({ ok: true }); return; }
    if (message?.type === "NAVIGATION_BLOCKED") { setBlockedBadge(); sendResponse({ ok: true }); }
  })().catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === "examfocus-deadline") completeSession("time-limit"); });

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.id == null || !tab.url || tab.url === "chrome://newtab/") return;
  await blockNavigation(tab.id, tab.url);
});
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0 || !details.tabId || !/^https?:/.test(details.url)) return;
  blockNavigation(details.tabId, details.url);
});
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0 || details.tabId < 0) return;
  const { examModeActive, examSnapshot } = await getState();
  if (examModeActive && isAllowed(details.url, examSnapshot)) lastAllowedByTab.set(details.tabId, details.url);
});
chrome.tabs.onRemoved.addListener((tabId) => lastAllowedByTab.delete(tabId));

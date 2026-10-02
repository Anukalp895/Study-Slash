(() => {
  const MASK = "examfocus-masked";
  const HUD_ID = "examfocus-floating-hud";
  let active = false;
  let completed = false;
  let currentId = null;
  let currentLabel = null;
  let currentUrl = null;
  let sessionStartedAt = 0;
  let questionInteracted = false;
  let answerSubmitted = false;
  let currentOutcome = null;
  let selectedOption = null;
  let solutionWaitObserver = null;
  let solutionWaitTimer = 0;
  let solutionIntentInterval = 0;
  let enteredAt = 0;
  let lastTickAt = 0;
  let relativeIndex = 0;
  let questionDwellMs = 0;
  let observer;
  let observerRoot = null;
  let scanQueued = false;
  let scanInProgress = false;
  let scanAgain = false;
  let transitionTimer = 0;
  let transitionCandidate = null;
  let transitionReadyId = null;
  let tickTimer = 0;
  let isMutating = false;
  let pendingJump = null;
  let replayingNativeNavigation = false;
  let currentFlushPromise = null;
  let lastLiveScanAt = 0;
  let liveScanTimer = 0;
  const pendingQuestionWrites = new Map();
  const pendingMaskRoots = new Set();
  // Preserve page-owned inline styles while overriding Marks' inline/Tailwind colors.
  const inlineStyleSnapshots = new Map();
  let completionModal = null;
  let submitConfirmModal = null;
  let paletteModal = null;
  let submitConfirmTimer = 0;
  let submittingConfirmedExam = false;
  let session = {};

  const REATTEMPT_HUD_ID = "examfocus-reattempt-hud";
  const REATTEMPT_CONFIRM_ID = "examarena-reattempt-confirm-modal";
  const REATTEMPT_TOAST_ID = "examfocus-reattempt-toast";
  let reattemptActive = false;
  let reattemptSessionId = null;
  let reattemptQuestionId = null;
  let reattemptTarget = null;
  let activeReattemptIntent = null;
  let reattemptInitPromise = null;
  let reattemptStartedAt = 0;
  let reattemptElapsedMs = 0;
  let reattemptTickTimer = 0;
  let reattemptSelectedOption = null;
  let reattemptConfirmModal = null;
  let lockoutCooldown = false;
  let lockoutCooldownTimer = 0;
  let reattemptLockoutAttempts = 0;
  let conceptReviewStartedAt = 0;
  let conceptReviewInterval = 0;
  let conceptReviewKey = "";
  const CONCEPT_MIN_DWELL_MS = 60 * 1000;
  const CONCEPT_MAX_DWELL_MS = 270 * 1000;

  function evaluateConceptReviewDwell(dwellMs) {
    return Number(dwellMs) >= CONCEPT_MIN_DWELL_MS && Number(dwellMs) <= CONCEPT_MAX_DWELL_MS;
  }
  let conceptObserver = null;
  let activeConceptSessionId = null;
  let activeQuestionKey = null;
  let activeQuestionNum = 1;
  let conceptAwaitingQuestionRender = false;
  let conceptAwaitingQuestionTimer = 0;
  let activeConceptIntent = null;
  let conceptIntentActivationKey = "";

  let isOrphaned = false;

  function isExtensionValid() {
    try {
      return Boolean(typeof chrome !== "undefined" && chrome?.runtime && chrome.runtime?.id);
    } catch (_) {
      return false;
    }
  }

  const bodyReadyCallbacks = [];
  let bodyReadyPoll = 0;
  let bodyReadyPending = false;
  function flushBodyReadyCallbacks() {
    if (!document.body) return;
    if (bodyReadyPoll) clearInterval(bodyReadyPoll);
    bodyReadyPoll = 0;
    bodyReadyPending = false;
    const callbacks = bodyReadyCallbacks.splice(0);
    callbacks.forEach((callback) => {
      try { callback(); } catch (err) { console.error("Deferred DOM mount failed:", err); }
    });
  }
  function whenBodyReady(callback) {
    if (document.body) { callback(); return; }
    bodyReadyCallbacks.push(callback);
    if (bodyReadyPending) return;
    bodyReadyPending = true;
    document.addEventListener("DOMContentLoaded", flushBodyReadyCallbacks, { once: true });
    bodyReadyPoll = setInterval(flushBodyReadyCallbacks, 20);
  }
  function ensureBodyReady() {
    if (document.body) return Promise.resolve(document.body);
    return new Promise((resolve) => whenBodyReady(() => resolve(document.body)));
  }
  function safeAppendToHead(element) {
    if (!element) return;
    const target = document.head || document.documentElement;
    if (target) {
      if (!element.isConnected) target.appendChild(element);
      return;
    }
    const appendWhenReady = () => {
      const fallbackTarget = document.head || document.documentElement;
      if (fallbackTarget && !element.isConnected) fallbackTarget.appendChild(element);
    };
    document.addEventListener("readystatechange", appendWhenReady);
  }
  function safeAppendToBody(element) {
    if (!element) return;
    const existing = element.id ? document.getElementById(element.id) : null;
    if (existing && existing !== element) existing.remove();
    if (document.body) {
      if (!element.isConnected || element.parentElement !== document.body) document.body.appendChild(element);
    } else {
      whenBodyReady(() => {
        if (document.body && !element.isConnected) document.body.appendChild(element);
      });
    }
  }
  const safeMount = safeAppendToBody;

  function teardownOrphanedScript() {
    if (isOrphaned) return;
    isOrphaned = true;
    active = false;
    completed = true;
    reattemptActive = false;
    conceptReviewStartedAt = 0;
    if (bodyReadyPoll) clearInterval(bodyReadyPoll);
    bodyReadyPoll = 0; bodyReadyPending = false; bodyReadyCallbacks.length = 0;

    // Clear ticking intervals
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = 0;
    }
    if (typeof solutionIntentInterval !== "undefined" && solutionIntentInterval) {
      clearInterval(solutionIntentInterval);
      solutionIntentInterval = 0;
    }
    if (typeof submitConfirmTimer !== "undefined" && submitConfirmTimer) {
      clearInterval(submitConfirmTimer);
      submitConfirmTimer = 0;
    }
    if (typeof reattemptTickTimer !== "undefined" && reattemptTickTimer) {
      clearInterval(reattemptTickTimer);
      reattemptTickTimer = 0;
    }
    if (typeof lockoutCooldownTimer !== "undefined" && lockoutCooldownTimer) {
      clearTimeout(lockoutCooldownTimer);
      lockoutCooldownTimer = 0;
    }
    if (typeof solutionWaitTimer !== "undefined" && solutionWaitTimer) {
      clearTimeout(solutionWaitTimer);
      solutionWaitTimer = 0;
    }
    if (typeof liveScanTimer !== "undefined" && liveScanTimer) {
      clearTimeout(liveScanTimer);
      liveScanTimer = 0;
    }
    if (typeof conceptReviewInterval !== "undefined" && conceptReviewInterval) {
      clearInterval(conceptReviewInterval);
      conceptReviewInterval = 0;
    }
    if (typeof conceptAwaitingQuestionTimer !== "undefined" && conceptAwaitingQuestionTimer) {
      clearTimeout(conceptAwaitingQuestionTimer);
      conceptAwaitingQuestionTimer = 0;
    }
    if (typeof transitionTimer !== "undefined" && transitionTimer) {
      clearTimeout(transitionTimer);
      transitionTimer = 0;
    }

    // Disconnect observers
    try { observer?.disconnect(); } catch (_) {}
    try { launcherObserver?.disconnect(); } catch (_) {}
    launcherObserver = null;
    observerRoot = null;
    try { solutionWaitObserver?.disconnect(); } catch (_) {}
    try { conceptObserver?.disconnect(); } catch (_) {}
    solutionWaitObserver = null;
    conceptObserver = null;
    scanQueued = false;
    scanAgain = false;
    transitionCandidate = null;
    transitionReadyId = null;

    // Remove injected floating HUD and modals to prevent further user actions on dead context
    try {
      document.getElementById(HUD_ID)?.remove();
      document.getElementById("examarena-palette-modal")?.remove();
      document.getElementById("examarena-submit-confirm-modal")?.remove();
      document.getElementById(REATTEMPT_HUD_ID)?.remove();
      document.getElementById(REATTEMPT_CONFIRM_ID)?.remove();
      document.getElementById(REATTEMPT_TOAST_ID)?.remove();
      document.getElementById("ea-concept-answer-prompt")?.remove();
      document.getElementById("ea-marks-hover-tile")?.remove();
      document.getElementById("ea-marks-setup-modal")?.remove();
    } catch (_) {}
  }

  // An already orphaned tab can still have a pending async callback from the
  // previous extension instance. Silence only the known context-loss failures.
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = typeof reason === "string" ? reason : reason?.message || String(reason || "");
    if (/extension context invalidated|receiving end does not exist|invoked a callback on a discarded/i.test(message)) {
      event.preventDefault();
      teardownOrphanedScript();
    }
  });

  // Only explicit solution nodes and result banners may receive the broad mask class.
  const solutionSelector = ".question-solution, [class*='question-solution']";
  const chipSelector = "div[class*='absolute'][class*='items-center']";
  const solutionActionText = /show\s+(?:the\s+)?(?:solution|correct\s+answer)|marks\s+solution|solutions\s+by\s+others|view\s+(?:the\s+)?explanation/i;
  const hintActionText = /view\s+hint/i;

  function send(payload) {
    if (!isExtensionValid()) {
      teardownOrphanedScript();
      return Promise.resolve({ ok: false, error: "Extension context invalidated", orphaned: true });
    }

    const message = typeof payload === "string" ? { type: payload } : payload;

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const error = chrome.runtime.lastError;
          if (error) {
            const errorMessage = error.message || "Message delivery failed";
            if (/context invalidated|invoked a callback on a discarded|receiving end does not exist/i.test(errorMessage)) {
              teardownOrphanedScript();
            }
            resolve({ ok: false, error: errorMessage, ...(isOrphaned ? { orphaned: true } : {}) });
            return;
          }
          resolve(response || { ok: true });
        });
      } catch (err) {
        const errorMessage = err?.message || "Send failed";
        if (/context invalidated|receiving end does not exist/i.test(errorMessage)) {
          teardownOrphanedScript();
        }
        resolve({ ok: false, error: errorMessage, orphaned: isOrphaned });
      }
    });
  }

  function recordQuestion(questionId = currentId, dwellMs = 0, outcome, extra = {}, questionUrl = currentUrl || window.location.href) {
    if (!questionId) return Promise.resolve(null);
    if (!isExtensionValid()) {
      teardownOrphanedScript();
      return Promise.resolve(null);
    }
    const questionLabel = session.questions?.[questionId]?.label || (questionId === currentId ? currentLabel : null);
    const write = send({
      type: "RECORD_QUESTION",
      questionId,
      url: questionUrl,
      dwellMs,
      ...(outcome && ["Right", "Wrong", "Unattempted"].includes(outcome) ? { outcome } : {}),
      ...(questionLabel ? { label: questionLabel } : {}),
      ...extra
    }).catch((err) => {
      if (/context invalidated/i.test(err?.message || "")) {
        teardownOrphanedScript();
        return null;
      }
      throw err;
    });
    const tracked = write.finally(() => { if (pendingQuestionWrites.get(questionId) === tracked) pendingQuestionWrites.delete(questionId); });
    pendingQuestionWrites.set(questionId, tracked);
    return write;
  }
  function formatDuration(ms) {
    const seconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
      .map((part) => String(part).padStart(2, "0")).join(":");
  }
  function countdownRemaining() {
    const elapsed = Math.max(0, Date.now() - (sessionTimestamp(session) || sessionStartedAt || Date.now()));
    return Math.max(0, Number(session.allottedTimeMs || 0) - elapsed);
  }
  function atQuestionCap() {
    const cap = Number(session.targetQuestions);
    if (!active || session.mode !== "countdown" || !Number.isInteger(cap) || cap < 1 || !currentId) return false;
    const order = session.questionOrder || Object.keys(session.questions || {});
    const index = order.indexOf(currentId);
    // Use the session-relative unique visit index, not the site's absolute question label.
    return index >= 0 && index + 1 >= cap;
  }
  function removeSubmitConfirm() {
    if (submitConfirmTimer) clearInterval(submitConfirmTimer);
    submitConfirmTimer = 0;
    submitConfirmModal?.remove();
    document.getElementById("examarena-submit-confirm-modal")?.remove();
    submitConfirmModal = null;
    submittingConfirmedExam = false;
  }
  async function scanAnswerOutcome(questionId = currentId) {
    if (!active || !questionId) return null;
    const roots = [getQuestionContentRoot()];
    let outcome = detectOutcome(roots) || outcomeForQuestion(questionId);
    // The Marks evaluator can paint the result immediately after the submit click.
    // Poll briefly only if this question had a post-start interaction; never block for a network request.
    if (!outcome && questionId === currentId && answerSubmitted) {
      for (let attempt = 0; attempt < 20 && active && !outcome; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 75));
        outcome = detectOutcome([getQuestionContentRoot()]) || outcomeForQuestion(questionId);
      }
    }
    if (outcome === "Right" || outcome === "Wrong") {
      if (questionId === currentId) currentOutcome = outcome;
      session.outcomes ||= {}; session.outcomes[questionId] = outcome;
      session.completedQuestionIds ||= [];
      if (!session.completedQuestionIds.includes(questionId)) session.completedQuestionIds.push(questionId);
      questionInteracted = true; answerSubmitted = true;
    }
    return outcome === "Right" || outcome === "Wrong" ? outcome : null;
  }
  function flushCurrentQuestion() {
    if (!active || !currentId) return Promise.resolve(null);
    if (currentFlushPromise) return currentFlushPromise;
    const questionId = currentId;
    const delta = Math.max(0, Date.now() - lastTickAt);
    lastTickAt = Date.now(); questionDwellMs += delta;
    const tracked = (async () => {
      const pending = pendingQuestionWrites.get(questionId);
      if (pending) await pending;
      let outcome = outcomeForQuestion(questionId);
      if (questionId === currentId && (answerSubmitted || session.questions?.[questionId]?.userSelected)) {
        outcome = await scanAnswerOutcome(questionId) || outcome;
      }
      const question = session.questions?.[questionId] || {};
      const response = await recordQuestion(questionId, delta, outcome || undefined, {
        completed: outcome === "Right" || outcome === "Wrong",
        userSelected: Boolean(question.userSelected),
        ...(question.lastInteractedAt ? { lastInteractedAt: question.lastInteractedAt } : {})
      }, questionId === currentId ? currentUrl : question.url);
      if (!response?.ok) throw new Error("The current question could not be saved before navigation.");
      return response;
    })().finally(() => { if (currentFlushPromise === tracked) currentFlushPromise = null; });
    currentFlushPromise = tracked;
    return tracked;
  }
  // Capture the outgoing question synchronously, then let the serialized background
  // writer persist it without delaying the host app's navigation event.
  function snapshotCurrentQuestion() {
    if (!active || !currentId) return null;
    const questionId = currentId;
    const now = Date.now();
    const delta = Math.max(0, now - lastTickAt);
    lastTickAt = now;
    questionDwellMs += delta;
    const question = session.questions?.[questionId] || {};
    const outcome = currentOutcome || outcomeForQuestion(questionId);
    return recordQuestion(questionId, delta, outcome || undefined, {
      completed: outcome === "Right" || outcome === "Wrong",
      userSelected: Boolean(question.userSelected),
      ...(question.lastInteractedAt ? { lastInteractedAt: question.lastInteractedAt } : {})
    }, questionId === currentId ? currentUrl : question.url);
  }
  function paintSubmitConfirmTimer() {
    if (!submitConfirmModal || !active) return;
    const clock = submitConfirmModal.querySelector(".ea-submit-clock");
    const label = submitConfirmModal.querySelector(".ea-submit-timer span");
    const elapsed = Math.max(0, Date.now() - (sessionTimestamp(session) || sessionStartedAt || Date.now()));
    if (label) label.textContent = session.mode === "countdown" ? "TIME REMAINING" : "TIME ELAPSED";
    if (clock) clock.textContent = formatDuration(session.mode === "countdown" ? countdownRemaining() : elapsed);
  }
  async function openSubmitConfirmation(force = false) {
    if (submitConfirmModal || !active || (!force && !atQuestionCap()) || !document.body) return;
    // Pull the latest stored counters so the summary reflects the final-page state.
    const stored = await chrome.storage.local.get("examSession");
    if (!active || (!force && !atQuestionCap())) return;
    session = stored.examSession || session;
    submitConfirmModal = document.createElement("div");
    submitConfirmModal.id = "examarena-submit-confirm-modal";
    submitConfirmModal.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="ea-submit-title">
      <span class="ea-submit-eyebrow">EXAM SUBMISSION</span>
      <div class="ea-submit-heading"><h2 id="ea-submit-title">Submit Exam?</h2><div class="ea-submit-timer"><span>TIME REMAINING</span><strong class="ea-submit-clock">00:00:00</strong></div></div>
      <p class="ea-submit-copy">${atQuestionCap() ? "You’re at the final question in your target. Confirm to finish now, or return to review this question." : "Confirm to finish this session now, or return to continue your exam. The timer keeps running until you confirm."}</p>
      <div class="ea-submit-summary"><div><span>Approached</span><strong class="ea-submit-approached">0</strong></div><div><span>Solved / Attempted</span><strong class="ea-submit-attempted">0</strong></div><div><span>Skipped</span><strong class="ea-submit-skipped">0</strong></div></div>
      <div class="ea-submit-actions"><button class="ea-submit-cancel" type="button">Cancel / Return</button><button class="ea-submit-confirm" type="button">Confirm &amp; Submit</button></div>
    </section>`;
    safeAppendToBody(submitConfirmModal);
    const questions = session.questions || {};
    const ids = Object.keys(questions);
    const attempted = ids.filter((id) => {
      const outcome = session.outcomes?.[id] || questions[id]?.outcome;
      return outcome === "Right" || outcome === "Wrong";
    }).length;
    submitConfirmModal.querySelector(".ea-submit-approached").textContent = String(ids.length);
    submitConfirmModal.querySelector(".ea-submit-attempted").textContent = String(attempted);
    submitConfirmModal.querySelector(".ea-submit-skipped").textContent = String(Math.max(0, ids.length - attempted));
    submitConfirmModal.querySelector(".ea-submit-cancel").addEventListener("click", removeSubmitConfirm);
    submitConfirmModal.querySelector(".ea-submit-confirm").addEventListener("click", async (event) => {
      if (submittingConfirmedExam) return;
      submittingConfirmedExam = true;
      const button = event.currentTarget;
      button.disabled = true; button.textContent = "Submitting…";
      try {
        // Resolve the live DOM result, then wait for its final dwell/outcome write before ending.
        const finalOutcome = await scanAnswerOutcome();
        if (!active) throw new Error("The session has already ended.");
        const finalDelta = currentId ? Math.max(0, Date.now() - lastTickAt) : 0;
        if (currentId) {
          lastTickAt = Date.now();
          questionDwellMs += finalDelta;
          const flushed = await recordQuestion(currentId, finalDelta, finalOutcome || undefined, {
            completed: finalOutcome === "Right" || finalOutcome === "Wrong",
            userSelected: Boolean(session.questions?.[currentId]?.userSelected),
            ...(session.questions?.[currentId]?.lastInteractedAt ? { lastInteractedAt: session.questions[currentId].lastInteractedAt } : {})
          }, currentUrl);
          if (!flushed?.ok) throw new Error(flushed?.error || "Could not save the final question.");
        }
        // Keep the countdown running until the worker has flushed and completed the report.
        const response = await send({
          type: "END_EXAM",
          reason: atQuestionCap() ? "question-limit-confirmed" : "user-confirmed",
          ...(currentId ? { finalQuestionState: {
            questionId: currentId,
            outcome: finalOutcome || "Unattempted",
            timeMs: questionDwellMs,
            label: currentLabel,
            url: currentUrl,
            userSelected: Boolean(session.questions?.[currentId]?.userSelected),
            ...(session.questions?.[currentId]?.lastInteractedAt ? { lastInteractedAt: session.questions[currentId].lastInteractedAt } : {})
          } } : {})
        });
        if (!response?.ok) throw new Error(response?.error || "The session is still active.");
        removeSubmitConfirm();
        const sessionId = response?.report?.sessionId || session.sessionId;
        await send({ type: "OPEN_DASHBOARD", ...(sessionId ? { sessionId } : {}) });
      } catch (error) {
        submittingConfirmedExam = false;
        button.disabled = false; button.textContent = "Confirm & Submit";
        const copy = submitConfirmModal?.querySelector(".ea-submit-copy");
        if (copy) copy.textContent = `Could not submit yet: ${error.message || "Please try again."}`;
      }
    });
    paintSubmitConfirmTimer();
    submitConfirmTimer = setInterval(paintSubmitConfirmTimer, 250);
    submitConfirmModal.querySelector(".ea-submit-cancel").focus();
  }
  function sessionTimestamp(value) {
    if (Number(value?.startedAtMs) > 0) return Number(value.startedAtMs);
    const raw = value?.startedAt || value?.startTime || value?.date || value?.timestamp;
    if (typeof raw === "number") return raw;
    if (typeof raw === "string" && /^\d{10,13}$/.test(raw)) return Number(raw);
    return Date.parse(raw) || 0;
  }
  function findQuestionId() {
    let label = null;
    // Strategy 1: Read the exact Marks question header structure.
    const headerP = document.querySelector(".question-header p, [class*='question-header'] p");
    if (headerP) {
      const text = headerP.textContent.trim();
      const match = text.match(/^Q\.?\s*(\d{1,4})/i);
      if (match) label = `Question ${match[1]}`;
    }

    // Strategy 2: Check small leaf tags for an isolated question label.
    if (!label) {
      for (const p of getQuestionContentRoot().querySelectorAll("p, span, div")) {
        if (p.children.length === 0) {
          const match = p.textContent.trim().match(/^Q\.?\s*(\d{1,4})(?:\s*[•\.\:\-]|$)/i);
          if (match) { label = `Question ${match[1]}`; break; }
        }
      }
    }

    if (!label) {
      const params = new URLSearchParams(window.location.search);
      for (const key of ["question", "questionNumber", "question_number", "questionNo", "question_no", "questionId", "q", "qNo"]) {
        const value = params.get(key);
        if (/^\d{1,4}$/.test(value || "")) { label = `Question ${value}`; break; }
      }
    }

    // Strategy 3: Use the route's question ID when the rendered header is unavailable.
    const urlMatch = window.location.pathname.match(/\/question\/([a-zA-Z0-9_-]+)\/?/);
    if (urlMatch) return { id: urlMatch[1], label };
    if (!label) return null;
    return { id: label, label };
  }
  function getQuestionContentRoot() {
    return document.querySelector(".question-body, .question-options, #MathJaxWrapper, [class*='question-body'], main, [role='main']") || document.body || document;
  }
  function hasUnsafeLayoutClass(el) {
    const classes = typeof el.className === "string" ? el.className : "";
    return /\bh-screen\b|\bflex-1\b|\boverflow-y-auto\b|\bpb-20\b|\bmax-w-/.test(classes);
  }
  function isSafeCommunityRoot(el) {
    if (!el || !el.matches("div, section") || hasUnsafeLayoutClass(el)) return false;
    if (el.matches("main, [role='main'], nav, form, .question-header, [class*='question-options']")) return false;
    if (el.querySelector("main, [role='main'], nav, form, .question-header, [class*='question-options']")) return false;
    if (el.querySelector("button, a, [role='button']") && /\b(previous|next)\b/i.test(el.textContent || "")) return false;
    if (el.matches(".fixed.bottom-0, .sticky.bottom-0") && /\b(previous|next)\b/i.test(el.textContent || "")) return false;
    return true;
  }
  function maskCommunitySolutions(root) {
    const communityCopy = /solutions\s+by\s+others|add\s+your\s+own\s+solution|tap\s+to\s+view\s+full\s+answer/i;
    const marked = new Set();
    for (const leaf of matchingNodes(root, "div, section, p, span, button")) {
      const text = (leaf.innerText || leaf.textContent || "").trim();
      if (!communityCopy.test(text) || text.length > 180) continue;
      let candidate = leaf.matches("div, section") ? leaf : leaf.parentElement;
      let chosen = null;
      for (let depth = 0; candidate && depth < 8; depth += 1, candidate = candidate.parentElement) {
        if (!isSafeCommunityRoot(candidate)) break;
        const candidateText = candidate.innerText || candidate.textContent || "";
        if (communityCopy.test(candidateText)) chosen = candidate;
      }
      if (chosen) marked.add(chosen);
    }
    for (const el of marked) el.classList.add(MASK, "examfocus-community-solution");
  }
  function isLeafFeedback(el) {
    if (!el.matches(solutionSelector) || el.children.length > 4 || el.closest(`#${HUD_ID}`)) return false;
    const classNames = typeof el.className === "string" ? el.className : "";
    if (/\bh-screen\b|\bmax-w-[^\s]*|\bpb-20\b/.test(classNames)) return false;
    if (el.matches("main, [role='main'], nav, form, button, input, textarea, .question-header, [class*='question-options']")) return false;
    if (el.querySelector("main, [role='main'], nav, form, button, [role='button'], input, textarea, .question-header, [class*='question-options']")) return false;
    const text = (el.innerText || "").trim();
    return text.length > 15 && text.length < 2500;
  }
  function isSafeBanner(el) {
    if (!el.matches(".fixed.bottom-0, .sticky.bottom-0")) return false;
    const classNames = typeof el.className === "string" ? el.className : "";
    if (/\bh-screen\b|\bmax-w-[^\s]*|\bpb-20\b/.test(classNames)) return false;
    if (el.querySelector("main, [role='main'], nav, form, button, [role='button'], input, textarea, .question-header, [class*='question-options']")) return false;
    return true;
  }
  function clearNavigationMasks() {
    for (const el of document.querySelectorAll(`.${MASK}`)) {
      const actions = [...el.querySelectorAll("button, a, [role='button']")];
      if (actions.some((action) => /\b(previous|next)\b/i.test(action.innerText || action.textContent || ""))) {
        el.classList.remove(MASK, "examfocus-community-solution");
      }
    }
  }
  // blur.css is registered at document_start; toggle its permanent spoiler rules
  // instead of inserting a duplicate copy at runtime.
  function enableMaskStyles() { document.documentElement?.classList.add("examfocus-active"); }
  function disableMaskStyles() { document.documentElement?.classList.remove("examfocus-active"); }
  function mutateDom(callback) {
    if (isMutating) return;
    rememberMutationRoots(observer?.takeRecords() || []);
    isMutating = true;
    observer?.disconnect();
    try { callback(); }
    finally {
      if (active && observerRoot) observer?.observe(observerRoot, observerOptions);
      isMutating = false;
      if (pendingMaskRoots.size) {
        if (scanInProgress) scanAgain = true;
        else queueScan();
      }
    }
  }
  const observerOptions = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "aria-current", "aria-selected", "data-status"] };

  function matchingNodes(root, selector) {
    if (!root || root.nodeType === Node.TEXT_NODE) return [];
    const nodes = [];
    if (root.nodeType === Node.ELEMENT_NODE && root.matches(selector)) nodes.push(root);
    if (root.querySelectorAll) nodes.push(...root.querySelectorAll(selector));
    return nodes;
  }
  function setInlineImportant(el, property, value) {
    if (!inlineStyleSnapshots.has(el)) inlineStyleSnapshots.set(el, new Map());
    const properties = inlineStyleSnapshots.get(el);
    if (!properties.has(property)) properties.set(property, {
      value: el.style.getPropertyValue(property),
      priority: el.style.getPropertyPriority(property)
    });
    el.style.setProperty(property, value, "important");
  }
  function restoreInlineProperties(el, names) {
    const saved = inlineStyleSnapshots.get(el);
    if (!saved) return;
    for (const property of names) {
      const original = saved.get(property);
      if (!original) continue;
      if (original.value) el.style.setProperty(property, original.value, original.priority);
      else el.style.removeProperty(property);
      saved.delete(property);
    }
    if (!saved.size) inlineStyleSnapshots.delete(el);
  }
  function restoreInlineOverrides() {
    for (const [el, properties] of inlineStyleSnapshots) {
      for (const [property, original] of properties) {
        if (original.value) el.style.setProperty(property, original.value, original.priority);
        else el.style.removeProperty(property);
      }
    }
    inlineStyleSnapshots.clear();
  }
  function clearCustomOptionHighlights(container) {
    const root = container || document;
    for (const card of root.querySelectorAll?.('.question-options__option, [class*="question-options__option"]') || []) {
      card.classList.remove("examfocus-selected-option");
      restoreInlineProperties(card, ["border-color", "background-color", "box-shadow", "outline"]);
    }
  }
  function neutralizeOptionCards(root) {
    if (!active) return;
    for (const card of matchingNodes(root, '.question-options__option, [class*="question-options__option"]')) {
      const group = card.closest(".question-options") || card.parentElement;
      const isMulti = group?.dataset?.type === "multipleCorrect" || Boolean(group?.querySelector("[data-type='multipleCorrect']"));
      const selectedCard = selectedOption instanceof Element
        ? selectedOption.closest('.question-options__option, [class*="question-options__option"]') : null;
      const isSelected = !isMulti && selectedCard ? selectedCard === card : isOptionCardSelected(card);
      if (isSelected) {
        card.classList.add("examfocus-selected-option");
        setInlineImportant(card, "border-color", "#3b82f6");
        setInlineImportant(card, "background-color", "rgba(59, 130, 246, 0.16)");
        setInlineImportant(card, "box-shadow", "0 0 0 1.5px #3b82f6");
        setInlineImportant(card, "outline", "none");
      } else {
        card.classList.remove("examfocus-selected-option");
        setInlineImportant(card, "border-color", "rgba(255, 255, 255, 0.12)");
        setInlineImportant(card, "background-color", "var(--m5-base-1, #121621)");
        setInlineImportant(card, "box-shadow", "none");
        setInlineImportant(card, "outline", "none");
      }
      for (const badge of card.querySelectorAll(':scope > div[class*="absolute"], svg')) {
        if (badge.closest(`#${HUD_ID}`)) continue;
        setInlineImportant(badge, "display", "none");
        setInlineImportant(badge, "opacity", "0");
      }
      for (const label of card.querySelectorAll('[class*="question-options__option_label"], span')) {
        if (/\d+%\s*$/.test((label.textContent || "").trim())) {
          setInlineImportant(label, "display", "none");
          setInlineImportant(label, "opacity", "0");
        }
      }
    }
  }
  function isOptionCardSelected(card) {
    if (!card) return false;
    return card.classList.contains("examfocus-selected-option") ||
      card.getAttribute("aria-checked") === "true" ||
      card.getAttribute("data-selected") === "true" ||
      card.querySelector('input[type="radio"]:checked') !== null ||
      card.matches(".selected, .is-selected, [aria-selected='true']") ||
      card.querySelector('[aria-checked="true"]') !== null ||
      card.querySelector(".selected, .is-selected, [aria-selected='true']") !== null ||
      card.querySelector(".examfocus-you-marked") !== null ||
      Boolean(selectedOption && selectedOption.isConnected && (selectedOption === card || card.contains(selectedOption)));
  }
  function setSelectedOption(option) {
    const card = option?.closest?.('.question-options__option, [class*="question-options__option"]');
    if (!card) return;
    const group = card.closest(".question-options") || card.parentElement || document;
    clearCustomOptionHighlights(group);
    card.classList.add("examfocus-selected-option");
    // Inline important styles give immediate feedback before the observer runs.
    setInlineImportant(card, "border-color", "#3b82f6");
    setInlineImportant(card, "background-color", "rgba(59, 130, 246, 0.16)");
    setInlineImportant(card, "box-shadow", "0 0 0 1.5px #3b82f6");
    setInlineImportant(card, "outline", "none");
  }
  function hostOptionIsSelected(card) {
    if (!card) return false;
    return card.getAttribute("aria-checked") === "true" || card.getAttribute("aria-selected") === "true" ||
      card.getAttribute("data-selected") === "true" || card.classList.contains("selected") || card.classList.contains("is-selected") ||
      card.querySelector('input[type="radio"]:checked, [aria-checked="true"], [aria-selected="true"], [data-selected="true"], .selected, .is-selected') !== null;
  }
  function clearHostOptionSelection(card, option) {
    if (!card) return;
    card.classList.remove("examfocus-selected-option", "selected", "is-selected");
    for (const selected of card.querySelectorAll(".selected, .is-selected")) selected.classList.remove("selected", "is-selected");
    for (const node of [card, ...card.querySelectorAll("[aria-checked='true'], [aria-selected='true'], [data-selected='true']")]) {
      if (node.hasAttribute("aria-checked")) node.setAttribute("aria-checked", "false");
      if (node.hasAttribute("aria-selected")) node.setAttribute("aria-selected", "false");
      if (node.hasAttribute("data-selected")) node.setAttribute("data-selected", "false");
    }
    const radio = card.querySelector('input[type="radio"]:checked');
    if (radio) {
      radio.checked = false;
      radio.dispatchEvent(new Event("input", { bubbles: true }));
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (option && option !== card) {
      option.classList.remove("selected", "is-selected");
      if (option.hasAttribute("aria-checked")) option.setAttribute("aria-checked", "false");
    }
    restoreInlineProperties(card, ["border-color", "background-color", "box-shadow", "outline"]);
  }
  async function persistDeselection(questionId, card, option) {
    if (!questionId || questionId !== currentId) return;
    clearHostOptionSelection(card, option);
    selectedOption = null; currentOutcome = null; answerSubmitted = false; questionInteracted = false;
    session.outcomes ||= {}; delete session.outcomes[questionId];
    const question = session.questions?.[questionId];
    if (question) { delete question.outcome; question.userChoice = null; question.userSelected = false; question.lastInteractedAt = Date.now(); }
    session.completedQuestionIds = (session.completedQuestionIds || []).filter((id) => id !== questionId);
    const response = await recordQuestion(questionId, 0, undefined, {
      clearOutcome: true, userSelected: false, lastInteractedAt: question?.lastInteractedAt || Date.now()
    }, currentUrl);
    if (response?.ok) {
      const stored = await chrome.storage.local.get("examSession"); session = stored.examSession || session;
    }
    queueScan();
    paintReviewButton(); renderPaletteGrid(); updateHud();
  }
  function isSafeYouMarkedBadge(el) {
    if (!el.matches("div, span") || el.children.length > 3 || el.closest(`#${HUD_ID}`)) return false;
    const classes = typeof el.className === "string" ? el.className : "";
    if (/\bh-screen\b|\bflex-1\b|\boverflow-y-auto\b|\bpb-20\b|\bmax-w-/.test(classes)) return false;
    if (el.matches("main, body, html, .question-header, [class*='question-options']")) return false;
    // Read only text owned by this node; ancestor textContent includes all descendants.
    const directText = Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || "")
      .join(" ").trim();
    return /^you\s+marked\b/i.test(directText);
  }
  function maskYouMarkedBadges(root) {
    for (const el of matchingNodes(root, "div, span")) {
      if (isSafeYouMarkedBadge(el) && !el.classList.contains("examfocus-you-marked")) {
        el.classList.add("examfocus-you-marked");
      }
    }
  }
  function maskFloatingFeedback(root) {
    if (!active) return;
    for (const el of matchingNodes(root, "div, span, p")) {
      if (hasUnsafeLayoutClass(el) || el.id === HUD_ID || el.closest(`#${HUD_ID}`)) continue;
      const txt = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      if (!/(?:your\s+answer\s+is\s+(?:correct|wrong)|incorrect\s+answer|correct\s+answer)/i.test(txt) || txt.length > 180) continue;
      const pill = el.closest(".rounded-full, [class*='rounded-full'], .fixed, .sticky") || el;
      if (hasUnsafeLayoutClass(pill) || pill.matches("main, [role='main'], nav, form, .question-header, [class*='question-options']")) continue;
      const rect = pill.getBoundingClientRect();
      if (rect.width > 600 || rect.height > 160) continue;
      setInlineImportant(pill, "display", "none");
      setInlineImportant(pill, "opacity", "0");
      setInlineImportant(pill, "pointer-events", "none");
    }
  }
  function maskNumericAnswer(root) {
    if (!active) return;
    for (const input of matchingNodes(root, 'input[type="number"], input[type="text"]')) {
      setInlineImportant(input, "border-color", "rgba(255, 255, 255, 0.15)");
      setInlineImportant(input, "box-shadow", "none");
      if (input.parentElement) {
        setInlineImportant(input.parentElement, "border-color", "rgba(255, 255, 255, 0.15)");
        setInlineImportant(input.parentElement, "box-shadow", "none");
      }
    }
    const hasEvaluation = matchingNodes(root, '[data-status="true"], [data-status="false"], .examfocus-floating-feedback').length > 0 ||
      /(?:CORRECT|INCORRECT)\s+ANSWER|YOUR\s+ANSWER\s+IS\s+(?:CORRECT|WRONG)/i.test(root.textContent || "");
    // Marks nests "Correct Answer:" and its numeric value in a row directly
    // beneath the numerical option; mask the row, not the question container.
    for (const row of matchingNodes(root, '.question-options > div')) {
      const text = (row.innerText || row.textContent || "").replace(/\s+/g, " ").trim();
      if (row.querySelector(".examfocus-result-copy") || /^correct\s*answer\s*:/i.test(text)) {
        row.classList.add("examfocus-numeric-evaluation");
      }
    }
    if (!hasEvaluation) return;
    for (const container of matchingNodes(root, 'div[class*="Numerical"], div:has(> input[type="number"]), div:has(> input[type="text"])')) {
      if (hasUnsafeLayoutClass(container) || container.closest(`#${HUD_ID}`)) continue;
      let sibling = container.nextElementSibling;
      while (sibling) {
        if (hasUnsafeLayoutClass(sibling) || sibling.matches(".question-solution, [class*='question-solution']")) break;
        const text = (sibling.textContent || "").trim();
        if (/^\d+(?:\.\d+)?$/.test(text) || /^correct\s*answer/i.test(text)) {
          setInlineImportant(sibling, "filter", "blur(20px)");
          setInlineImportant(sibling, "pointer-events", "none");
          setInlineImportant(sibling, "user-select", "none");
        }
        sibling = sibling.nextElementSibling;
      }
    }
  }
  function hideOptionOutcomeIcons(root) {
    for (const svg of matchingNodes(root, "svg")) {
      const clues = `${svg.getAttribute("class") || ""} ${svg.getAttribute("aria-label") || ""} ${svg.getAttribute("title") || ""} ${svg.outerHTML.slice(0, 1000)}`.toLowerCase();
      const iconStyle = getComputedStyle(svg);
      const hasResultColor = Boolean(outcomeFromColor(`${iconStyle.color} ${iconStyle.fill} ${iconStyle.stroke}`));
      if (!/(?:check|checkmark|tick|cross|x-mark|xmark|circle-x|circle-check)/.test(clues) && !hasResultColor) continue;
      const card = svg.closest('[data-status="true"], [data-status="false"], [class*="question-option" i], [role="radio"]')
        || svg.closest('[class*="question-options" i]');
      if (!card) continue;
      let badge = svg.parentElement;
      for (let depth = 0; badge && badge !== card && depth < 4; depth += 1, badge = badge.parentElement) {
        const bounds = badge.getBoundingClientRect();
        const position = getComputedStyle(badge).position;
        const badgeClass = typeof badge.className === "string" ? badge.className : "";
        if ((position === "absolute" || /\babsolute\b/.test(badgeClass)) && bounds.width <= 90 && bounds.height <= 90) break;
      }
      if (!badge || badge === card) badge = svg;
      if (!card.contains(badge)) badge = svg;
      badge.classList.add("examfocus-option-result-icon");
    }
  }
  function rememberMutationRoots(records) {
    for (const record of records) {
      const candidates = record.type === "childList"
        ? [...record.addedNodes, ...(Array.from(record.addedNodes).some((node) => node.nodeType === Node.TEXT_NODE) ? [record.target] : [])]
        : [record.type === "characterData" ? record.target.parentElement : record.target];
      for (const node of candidates) {
        if (!node) continue;
        if (node.nodeType === Node.ELEMENT_NODE && (node.id === HUD_ID || node.closest(`#${HUD_ID}`))) continue;
        pendingMaskRoots.add(node);
        if (node.nodeType === Node.ELEMENT_NODE) {
          const markedChip = node.closest(chipSelector);
          if (markedChip) pendingMaskRoots.add(markedChip);
        }
      }
    }
  }
  function maskFeedback(roots) {
    if (!active || isMutating || !roots.length) return;
    mutateDom(() => {
      const seen = new Set();
      for (const root of roots) {
        for (const el of matchingNodes(root, solutionSelector)) {
          if (seen.has(el)) continue;
          seen.add(el);
          if (isLeafFeedback(el) && !el.classList.contains(MASK)) el.classList.add(MASK);
        }
        maskCommunitySolutions(root);
        hideOptionOutcomeIcons(root);
        for (const el of matchingNodes(root, "button, [role='button']")) {
          if (solutionActionText.test((el.innerText || el.textContent || "").trim()) && !el.classList.contains("examfocus-solution-cta")) {
            el.classList.add("examfocus-solution-cta");
          }
          if (hintActionText.test((el.innerText || el.textContent || "").trim()) && !el.classList.contains("examfocus-hint-cta")) {
            el.classList.add("examfocus-hint-cta");
          }
        }
        for (const el of matchingNodes(root, "div, span")) {
          const classes = typeof el.className === "string" ? el.className : "";
          if (el.children.length > 1 || /\bh-screen\b|\bflex-1\b|\boverflow-y-auto\b|\bpb-20\b|\bmax-w-/.test(classes)) continue;
          const ownText = Array.from(el.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent || "").join(" ").trim();
          if (hintActionText.test(ownText)) el.classList.add("examfocus-hint-cta");
        }
        for (const el of matchingNodes(root, "div, span, p, h1, h2, h3, h4, h5, h6")) {
          const classes = typeof el.className === "string" ? el.className : "";
          if (/\bh-screen\b|\bflex-1\b|\boverflow-y-auto\b|\bpb-20\b|\bmax-w-/.test(classes) || el.children.length > 2) continue;
          if (el.matches("main, [role='main'], nav, form, button, [role='button'], .question-header, [class*='question-options']") || el.querySelector("main, nav, form, button, [role='button'], .question-header, [class*='question-options']")) continue;
          const directText = Array.from(el.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent || "").join(" ").trim();
          if (/^(?:marks\s+solution|solutions\s+by\s+others)\b/i.test(directText)) el.classList.add("examfocus-solution-copy");
          if (/^your\s+answer\s+is\b/i.test(directText) && !el.classList.contains("examfocus-floating-feedback")) {
            el.classList.add("examfocus-floating-feedback");
          }
        }
        maskYouMarkedBadges(root);
        maskFloatingFeedback(root);
        maskNumericAnswer(root);
      }
      // Result pills and numerical answer nodes can be siblings outside the
      // mutation subtree, so do one document-level pass per debounced scan.
      neutralizeOptionCards(document);
      maskFloatingFeedback(document);
      maskNumericAnswer(document);
    });
  }
  function outcomeFromColor(value) {
    const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return null;
    const [, r, g, b] = match.map(Number);
    if (g > r * 1.15 && g > b * 1.05) return "Right";
    if (r > g * 1.25 && r > b * 1.2) return "Wrong";
    return null;
  }
  function markedChipOutcome(chip) {
    if (!/you\s+marked/i.test(chip.textContent || "")) return null;
    for (const svg of chip.querySelectorAll("svg")) {
      const clues = `${svg.className?.baseVal || ""} ${svg.id || ""} ${svg.getAttribute("aria-label") || ""} ${svg.getAttribute("title") || ""} ${svg.outerHTML.slice(0, 1200)}`.toLowerCase();
      if (/check|tick|success|circle-check/.test(clues)) return "Right";
      if (/cross|x-mark|x-circle|circle-x|cancel|close_icon|\bx\b|\berror\b/.test(clues)) return "Wrong";
      const style = getComputedStyle(svg);
      const colorOutcome = outcomeFromColor(`${style.color} ${style.fill} ${style.stroke}`);
      if (colorOutcome) return colorOutcome;
    }
    return null;
  }
  function detectOutcome(roots) {
    // Marks exposes authoritative result attributes on its status banner and
    // numerical answer container. Check these before any visual heuristics.
    const topStatus = document.querySelector("[data-status='correct'], [data-status='incorrect']");
    if (topStatus?.getAttribute("data-status") === "correct") return "Right";
    if (topStatus?.getAttribute("data-status") === "incorrect") return "Wrong";
    const numericStatus = document.querySelector(".question-options__option_numeric[data-status='true'], .question-options__option_numeric[data-status='false']");
    if (numericStatus?.getAttribute("data-status") === "true") return "Right";
    if (numericStatus?.getAttribute("data-status") === "false") return "Wrong";
    for (const card of document.querySelectorAll(".question-options__option")) {
      const text = card.textContent || "";
      if (!/you\s+marked/i.test(text)) continue;
      const label = card.querySelector(".question-options__option__label");
      const clues = `${label?.className || ""} ${card.outerHTML || ""}`;
      if (/incorrect|--m5-danger-base/i.test(clues)) return "Wrong";
      if (/correct|--m5-success-base/i.test(clues)) return "Right";
    }
    const feedback = document.querySelectorAll(".Toastify, [class*='toast' i], div[class*='fixed']");
    for (const el of feedback) {
      const text = (el.textContent || "").toLowerCase();
      if (text.includes("your answer is correct")) return "Right";
      if (text.includes("your answer is wrong")) return "Wrong";
    }
    // Explicit result copy is the most specific evidence, especially when both colors appear.
    for (const root of roots) {
      for (const banner of matchingNodes(root, "div, section")) {
        const text = (banner.textContent || "").toUpperCase();
        if (text.includes("INCORRECT ANSWER")) return "Wrong";
        if (text.includes("CORRECT ANSWER")) return "Right";
      }
    }
    const clickedStatusNode = selectedOption && (
      (selectedOption.matches?.("[data-status]") && selectedOption) ||
      selectedOption.querySelector?.("[data-status]") ||
      selectedOption.closest?.("[data-status]")
    );
    if (clickedStatusNode?.getAttribute("data-status") === "true") return "Right";
    if (clickedStatusNode?.getAttribute("data-status") === "false") return "Wrong";
    for (const root of roots) {
      const selected = matchingNodes(root, '[aria-checked="true"][data-status], [aria-selected="true"][data-status], [data-selected="true"][data-status]')[0];
      if (selected) return selected.getAttribute("data-status") === "true" ? "Right" : "Wrong";
    }
    for (const root of roots) {
      for (const option of matchingNodes(root, '[data-status="true"], [data-status="false"]')) {
        return option.getAttribute("data-status") === "true" ? "Right" : "Wrong";
      }
    }
    for (const root of roots) {
      for (const chip of matchingNodes(root, chipSelector)) {
        const outcome = markedChipOutcome(chip);
        if (outcome) return outcome;
      }
    }
    return null;
  }
  function inspectMarksOutcome() {
    if (!active || !currentId) return null;
    const numericContainer = document.querySelector(".question-options__option_numeric");
    if (numericContainer && !selectedOption) {
      const text = (numericContainer.innerText || numericContainer.textContent || "").replace(/you\s*marked/ig, "").trim();
      const match = text.match(/-?\d+(?:\.\d+)?/);
      if (match) selectedOption = match[0];
    }
    const outcome = detectOutcome([getQuestionContentRoot()]);
    if (outcome !== "Right" && outcome !== "Wrong") return null;
    currentOutcome = outcome;
    const question = session.questions?.[currentId] || (session.questions[currentId] = { timeMs: 0, visits: 0, label: currentLabel });
    question.outcome = outcome;
    question.userChoice = selectedOption ?? question.userChoice ?? null;
    question.userSelected = true;
    session.outcomes ||= {};
    session.outcomes[currentId] = outcome;
    session.completedQuestionIds ||= [];
    if (!session.completedQuestionIds.includes(currentId)) session.completedQuestionIds.push(currentId);
    void recordQuestion(currentId, questionDwellMs, outcome, {
      userChoice: question.userChoice,
      userSelected: true,
      questionType: question.questionType || (numericContainer ? "numerical" : undefined),
      completed: true
    }, currentUrl);
    updateHud();
    renderPaletteGrid();
    return outcome;
  }
  function handleOptionClick(event) {
    if (!active || completed || !currentId || !(event.target instanceof Element) ||
        event.target.closest(`#${HUD_ID}, #examarena-palette-modal, #examarena-submit-confirm-modal, #examfocus-completion-modal`)) return;
    const option = event.target.closest('[data-option], [role="radio"], input[type="radio"], [class*="question-option" i], [class*="question-options" i] button');
    const card = option?.closest?.('.question-options__option, [class*="question-options__option"]');
    if (option && card) {
      const container = card.closest(".question-options") || card.parentElement;
      const cards = Array.from(container?.querySelectorAll(".question-options__option") || []);
      const idx = cards.indexOf(card);
      const letters = ["A", "B", "C", "D"];
      const choice = option.getAttribute("data-option") || card.querySelector(".question-options__option__label")?.textContent?.trim() || letters[idx] || String(idx + 1);
      const isMulti = container?.dataset?.type === "multipleCorrect" || Boolean(container?.querySelector("[data-type='multipleCorrect']"));
      const questionId = currentId;
      const wasSelected = isOptionCardSelected(card);
      const interactedAt = Date.now();
      questionInteracted = true;
      const question = session.questions?.[questionId] || (session.questions[questionId] = { timeMs: 0, visits: 0, label: currentLabel });
      question.lastInteractedAt = interactedAt;
      if (wasSelected) {
        if (isMulti) {
          const current = String(question.userChoice || "").split(",").map((s) => s.trim()).filter(Boolean);
          question.userChoice = current.filter((value) => value !== choice).sort().join(", ");
          question.userSelected = question.userChoice.length > 0;
          void recordQuestion(questionId, 0, undefined, { userSelected: question.userSelected, userChoice: question.userChoice, questionType: "multipleCorrect", lastInteractedAt: interactedAt }, currentUrl);
        }
        queueMicrotask(() => { void persistDeselection(questionId, card, option); });
      } else {
        selectedOption = option; question.userSelected = true;
        question.userChoice = isMulti ? [ ...(String(question.userChoice || "").split(",").map((s) => s.trim()).filter(Boolean)), choice ].filter((v, i, a) => a.indexOf(v) === i).sort().join(", ") : choice;
        question.questionType = isMulti ? "multipleCorrect" : "singleCorrect";
        setSelectedOption(option);
        void recordQuestion(questionId, 0, undefined, { userSelected: true, userChoice: question.userChoice, questionType: question.questionType, lastInteractedAt: interactedAt }, currentUrl);
        queueMicrotask(() => {
          if (currentId !== questionId) return;
          const result = detectOutcome([getQuestionContentRoot()]);
          if (result === "Right" || result === "Wrong") {
            currentOutcome = result; session.outcomes ||= {}; session.outcomes[questionId] = result;
            session.completedQuestionIds ||= [];
            if (!session.completedQuestionIds.includes(questionId)) session.completedQuestionIds.push(questionId);
            void recordQuestion(questionId, 0, result, { completed: true, userSelected: true, userChoice: question.userChoice, questionType: question.questionType, lastInteractedAt: interactedAt }, currentUrl);
            paintReviewButton(); renderPaletteGrid();
          }
          queueScan();
        });
      }
    }
    const submit = event.target.closest("button, [role='button']");
    const submitText = /\b(submit|check answer|confirm answer|lock answer)\b/i.test(submit?.textContent || "");
    if (!option && !submitText) return;
    if (Date.now() < sessionStartedAt) return;
    questionInteracted = true;
    if (submitText) {
      const numericInput = document.querySelector("input.question-options__input, .question-options input[type='number']");
      if (numericInput) captureNumericalInput(numericInput);
      answerSubmitted = true;
      [200, 600, 1200].forEach((delay) => setTimeout(() => {
        if (active && currentId) { inspectMarksOutcome(); queueScan(); }
      }, delay));
    }
    // A selection or submit click is not a final outcome. Unresolved visits remain Unattempted.
  }
  function captureNumericalInput(target) {
    if (!active || completed || !currentId || !(target instanceof HTMLInputElement)) return;
    if (!target.matches("input.question-options__input, .question-options input, input[type='number']")) return;
    if (target.closest(`#${HUD_ID}, #examarena-palette-modal, #examarena-submit-confirm-modal`)) return;
    const value = target.value.trim();
    if (!value) return;
    const question = session.questions?.[currentId] || (session.questions[currentId] = { timeMs: 0, visits: 0, label: currentLabel });
    if (question.questionType === "numerical" && question.userChoice === value && selectedOption === value) return;
    selectedOption = value;
    questionInteracted = true;
    question.userSelected = true;
    question.userChoice = value;
    question.questionType = "numerical";
    question.lastInteractedAt = Date.now();
    void recordQuestion(currentId, 0, undefined, { userSelected: true, userChoice: value, questionType: "numerical", lastInteractedAt: question.lastInteractedAt }, currentUrl);
    updateHud();
    renderPaletteGrid();
  }
  function handleMarksAnswerInput(event) { captureNumericalInput(event.target); }
  function handleNextClick(event) {
    if (reattemptActive && event.target instanceof Element) {
      const healAction = event.target.closest("button, a, [role='button'], input[type='button'], input[type='submit']");
      if (healAction && (healAction.dataset.eaReattemptNext === "true" || /^(?:next|next question)$/i.test((healAction.innerText || healAction.textContent || "").trim()))) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        openReattemptConfirmation(); return;
      }
      return;
    }
    if (!active || completed || replayingNativeNavigation || !(event.target instanceof Element) ||
        event.target.closest(`#${HUD_ID}, #examarena-palette-modal, #examarena-submit-confirm-modal, #examfocus-completion-modal`)) return;
    const action = event.target.closest("button, a, [role='button'], input[type='button'], input[type='submit']");
    if (!action) return;
    const label = [action.innerText, action.textContent, action.getAttribute("aria-label"), action.getAttribute("title"), action.value]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const isNext = /\bnext\b|next\s+question|continue\s+to\s+next/i.test(label) && !/\b(previous|back)\b/i.test(label);
    const isPrevious = /\b(previous|prev|back)\b/i.test(label);
    const parent = action.closest("[class*='palette' i], [class*='question-list' i], [class*='question-navigation' i], [aria-label*='question' i]");
    const paletteLabel = /^(?:q\.?\s*)?\d{1,4}$/i.test(label) || /\b(?:question|q\.?)[\s#]*\d{1,4}\b/i.test(label);
    const isPaletteJump = Boolean(parent && paletteLabel);
    if (!isNext && !isPrevious && !isPaletteJump) return;
    if (isNext && atQuestionCap()) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      void openSubmitConfirmation(); return;
    }
    // Preserve the final-question confirmation, but keep ordinary host navigation
    // on the original click path. The background queue serializes this snapshot.
    void snapshotCurrentQuestion()?.catch((error) => console.warn("Study Slash could not save the outgoing question", error));
  }
  function maskResultBanner(roots) {
    if (!active || isMutating || !roots.length) return;
    mutateDom(() => {
      for (const root of roots) {
        for (const el of matchingNodes(root, "div, section, span, p")) {
          const text = el.textContent || "";
          const upperText = text.toUpperCase();
          if (el.children.length < 10 && (
            upperText.includes("INCORRECT ANSWER") ||
            upperText.includes("CORRECT ANSWER") ||
            upperText.includes("EVEN A WRONG ATTEMPT HERE")
          )) {
            const banner = el.closest(".fixed.bottom-0, .sticky.bottom-0");
            if (banner && isSafeBanner(banner)) banner.classList.add(MASK);
          }
          if (el.children.length === 0 && /^(?:correct\s+answer\s*:|incorrect\s+answer\b|correct\s+answer\b|even a wrong attempt here\b)/i.test(text.trim())) {
            el.classList.add("examfocus-result-copy");
          }
        }
      }
    });
  }
  function stopSolutionHashWait() {
    solutionWaitObserver?.disconnect(); solutionWaitObserver = null;
    conceptObserver?.disconnect(); conceptObserver = null;
    if (solutionIntentInterval) clearInterval(solutionIntentInterval);
    solutionIntentInterval = 0;
    if (solutionWaitTimer) clearTimeout(solutionWaitTimer);
    solutionWaitTimer = 0;
  }
  function conceptQuestionNumber(id, question) {
    const source = question?.label;
    const match = (source && String(source).match(/\d+/)) || String(id || "").match(/^(?:question\s*|q\s*)?(\d+)$/i);
    return match ? Number(match[1] || match[0]) : Number.POSITIVE_INFINITY;
  }
  function intentButtons(pattern) {
    return [...document.querySelectorAll("button, [role='button'], a")].filter((el) => {
      if (el.closest(`#${HUD_ID}, #examarena-palette-modal, #examarena-submit-confirm-modal`)) return false;
      const text = (el.innerText || el.textContent || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      return !/solutions\s+by\s+others|community/i.test(text) && pattern.test(text) && el.getClientRects().length > 0;
    });
  }
  function questionOptionsVisible() {
    const isVisible = (el) => {
      const style = getComputedStyle(el);
      return el.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const optionArea = [...document.querySelectorAll(
      ".question-options__option, [class*='question-options__option']"
    )].some(isVisible);
    if (optionArea) return true;
    return [...document.querySelectorAll(
      "input.question-options__input, .question-options input, input[type='number'], [data-option], [role='radio'], input[type='radio']"
    )].some(isVisible);
  }
  function waitForMarksQuestionReady(timeoutMs = 8000) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        if (questionOptionsVisible()) return resolve(true);
        if (Date.now() - startedAt >= timeoutMs) return resolve(false);
        setTimeout(check, 200);
      };
      check();
    });
  }
  async function checkAndInitReattemptMode() {
    if (!isExtensionValid() || reattemptActive || reattemptInitPromise) return;
    reattemptInitPromise = (async () => {
      let storedTarget = null;
      try {
        const data = await new Promise((resolve) => chrome.storage.local.get("ea_reattempt_target", resolve));
        storedTarget = data?.ea_reattempt_target || null;
      } catch (_) { return; }

      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const hasHashIntent = hashParams.get("ea-intent") === "reattempt";
      const currentPath = window.location.pathname.replace(/\/$/, "");
      let matchesTarget = false;
      if (storedTarget) {
        try {
          const targetUrl = storedTarget.url || storedTarget.targetUrl;
          if (targetUrl) matchesTarget = new URL(targetUrl, window.location.href).pathname.replace(/\/$/, "") === currentPath;
        } catch (_) { /* Fall back to the question ID path check. */ }
        const qid = String(storedTarget.questionId || "");
        if (!matchesTarget && qid) matchesTarget = currentPath.split("/").filter(Boolean).pop() === qid;
      }
      if (!hasHashIntent && !matchesTarget) return;

      const pathQuestionId = currentPath.split("/").filter(Boolean).pop() || "";
      const qid = hashParams.get("ea-qid") || storedTarget?.questionId || pathQuestionId;
      const sessionId = hashParams.get("ea-session") || storedTarget?.sessionId || "";
      if (!qid) return;
      reattemptTarget = storedTarget || { questionId: qid, sessionId };
      reattemptSessionId = sessionId;
      reattemptQuestionId = qid;
      activeReattemptIntent = new URLSearchParams({
        "ea-intent": "reattempt", "ea-session": sessionId, "ea-qid": qid
      });

      if (!document.body) await new Promise((resolve) => whenBodyReady(resolve));
      const ready = await waitForMarksQuestionReady(8000);
      if (!ready) console.warn("[Study Slash] Marks question controls have not rendered yet; re-attempt activation will continue waiting.");
      if (!isExtensionValid()) return;
      maybeOpenSolutionFromHash();
    })().finally(() => { reattemptInitPromise = null; });
    return reattemptInitPromise;
  }
  function solutionViewVisible() {
    const strongSolution = [...document.querySelectorAll(".question-solution, #question-solution-title, [class*='question-solution'], [class*='solution-container'], [class*='Explanation'], [class*='explanation']")]
      .some((el) => {
        const style = getComputedStyle(el);
        return el.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden";
      });
    if (strongSolution) return true;
    if (intentButtons(/(?:show\s+question|back\s+to\s+question|hide\s+solution)/i).length) return true;
    const headingVisible = [...document.querySelectorAll("h1,h2,h3,h4,strong,div")].some((el) => {
      if (!el.getClientRects().length) return false;
      const text = (el.innerText || "").trim().toLowerCase();
      return text === "solution" || text === "explanation" || text === "detailed solution" || text.startsWith("solution:");
    });
    if (headingVisible) return true;
    const resultNode = [...document.querySelectorAll(".examfocus-result-copy,[class*='result'],[class*='correct-answer']")].find((el) => el.getClientRects().length > 0);
    if (resultNode && /correct\s+answer|your\s+answer\s+is\s+(?:correct|wrong|incorrect)/i.test(resultNode.innerText || resultNode.textContent || "")) return true;
    const mathWrapper = document.querySelector("#MathJaxWrapper");
    if (!mathWrapper?.getClientRects().length) return false;
    const context = mathWrapper.closest("section, article, main, [role='main']") || mathWrapper.parentElement;
    const heading = context?.querySelector("h1, h2, h3, [id*='solution' i], [class*='solution-title' i]");
    const label = `${mathWrapper.getAttribute("aria-label") || ""} ${heading?.textContent || ""}`;
    return /solution|explanation|worked\s+answer/i.test(label);
  }
  function startConceptReviewHud(params) {
    const sessionId = params.get("ea-session"), qid = params.get("ea-qid"), qnum = params.get("ea-qnum") || "1";
    if (!sessionId || !qid) return;
    const key = `${sessionId}:${qid}`;
    if (conceptReviewKey === key && conceptReviewStartedAt > 0 && document.getElementById("ea-concept-timer-hud")) {
      document.getElementById("ea-concept-timer-hud").hidden = false;
      activeConceptIntent = null;
      return;
    }
    hideAnswerToRevealPrompt();
    conceptObserver?.disconnect(); conceptObserver = null;
    conceptAwaitingQuestionRender = false;
    if (conceptAwaitingQuestionTimer) clearTimeout(conceptAwaitingQuestionTimer);
    conceptAwaitingQuestionTimer = 0;
    activeConceptSessionId = sessionId; activeQuestionKey = qid; activeQuestionNum = Number.parseInt(qnum, 10) || 1;
    activeConceptIntent = null;
    conceptReviewKey = key; conceptReviewStartedAt = Date.now();
    clearInterval(conceptReviewInterval);
    let hud = document.getElementById("ea-concept-timer-hud");
    if (!hud) {
      hud = document.createElement("aside"); hud.id = "ea-concept-timer-hud"; hud.className = "concept-timer-hud";
      hud.innerHTML = '<div class="hud-drag-handle"><span class="hud-pill-tag">💡 CONCEPT UNDERSTANDING</span><span class="hud-q-label"></span></div><div class="hud-timer-display"><span class="timer-icon">⏱</span><span class="timer-clock">00:00</span></div><div class="hud-actions-row"><button class="hud-btn-secondary" data-review-status="Visited">Skip &amp; Next →</button><button class="hud-btn-primary" data-review-status="Completed">✓ Complete &amp; Next →</button></div><button class="hud-btn-ghost">Pause &amp; Close</button>';
      safeMount(hud);
    }
    hud.hidden = false; hud.querySelector(".hud-q-label").textContent = `Q${activeQuestionNum} Review`;
    const paint = () => { const sec=Math.floor((Date.now()-conceptReviewStartedAt)/1000); hud.querySelector(".timer-clock").textContent=`${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`; };
    paint(); conceptReviewInterval = setInterval(paint,1000);
    const record = async (status) => {
      if (!conceptReviewStartedAt) return;
      clearInterval(conceptReviewInterval); conceptReviewInterval=0;
      const elapsed=Math.max(0,Date.now()-conceptReviewStartedAt), at=Date.now(); conceptReviewStartedAt=0;
      const conceptQualified = status === "Completed" && evaluateConceptReviewDwell(elapsed);
      const stored=await chrome.storage.local.get("examHistory"), history=Array.isArray(stored.examHistory)?stored.examHistory:[];
      const identity=s=>String(s.sessionId || (typeof s.startedAt === "number" ? s.startedAt : (/^\d{10,13}$/.test(String(s.startedAt||"")) ? s.startedAt : (Date.parse(s.startedAt)||0))));
      const updated=history.map(s=>{
        if(identity(s)!==sessionId) return s;
        const conceptReview={...(s.conceptReview||{})}, prev=conceptReview[qid]||conceptReview[String(activeQuestionNum)]||{dwellMs:0};
        conceptReview[qid]={dwellMs:(Number(prev.dwellMs)||0)+elapsed,status:status==="Completed"||prev.status==="Completed"?"Completed":"Visited",lastReviewedAt:at};
        conceptReview[String(activeQuestionNum)]=conceptReview[qid];
        return {...s,conceptReview};
      });
      await chrome.storage.local.set({examHistory:updated});
      const reviewId = `${sessionId}:${qid}:${at}`;
      await send({ type: "RECORD_CONCEPT_REVIEW", sessionId, questionId: String(qid), reviewId,
        dwellMs: elapsed, isConceptReview: true, conceptQualified, timestamp: at });
      console.info(`[Study Slash] Concept review ${conceptQualified ? "qualified" : "unrewarded"} (${Math.round(elapsed / 1000)}s).`);
    };
    hud.querySelectorAll("[data-review-status]").forEach(btn=>btn.onclick=async()=>{
      const status=btn.dataset.reviewStatus; await record(status);
      const stored=await chrome.storage.local.get("examHistory"), sessionRecord=(stored.examHistory||[]).find(s=>String(s.sessionId || (typeof s.startedAt === "number" ? s.startedAt : (/^\d{10,13}$/.test(String(s.startedAt||"")) ? s.startedAt : (Date.parse(s.startedAt)||0))))===sessionId);
      const orderedEntries=Object.entries(sessionRecord?.questions||{}).sort(([idA,qA],[idB,qB])=>{
        const numA=conceptQuestionNumber(idA,qA), numB=conceptQuestionNumber(idB,qB);
        if(numA!==numB) return numA-numB;
        return (Number(qA?.firstSeenAt)||0)-(Number(qB?.firstSeenAt)||0) || String(idA).localeCompare(String(idB), undefined, { numeric: true });
      });
      const index=orderedEntries.findIndex(([key])=>key===activeQuestionKey), nextEntry=index>=0?orderedEntries[index+1]:null;
      if(nextEntry){
        const [nextKey,nextQuestion]=nextEntry;
        const nextNum=conceptQuestionNumber(nextKey,nextQuestion);
        const qnum=Number.isFinite(nextNum)?nextNum:index+2;
        const nextUrl=new URL(nextQuestion.url||sessionRecord.testUrl||window.location.href);
        const nextHash=new URLSearchParams({"ea-intent":"solution","ea-session":sessionId,"ea-qid":nextKey,"ea-qnum":String(qnum)});
        nextUrl.hash=nextHash.toString();
        await chrome.storage.local.set({ pendingConceptReview: { sessionId, qid: String(nextKey), qnum, targetUrl: nextQuestion.url || sessionRecord.testUrl || nextUrl.href, timestamp: Date.now() } });
        activeQuestionKey=nextKey; activeQuestionNum=qnum;
        clearInterval(conceptReviewInterval); conceptReviewInterval=0;
        const currentUrl=new URL(window.location.href);
        if(currentUrl.origin===nextUrl.origin&&currentUrl.pathname===nextUrl.pathname&&currentUrl.search===nextUrl.search){
          conceptAwaitingQuestionRender=true;
          if(conceptAwaitingQuestionTimer) clearTimeout(conceptAwaitingQuestionTimer);
          conceptAwaitingQuestionTimer=setTimeout(()=>{
            conceptAwaitingQuestionRender=false; conceptAwaitingQuestionTimer=0;
            maybeOpenSolutionFromHash();
          },700);
          window.location.hash=nextHash.toString();
          maybeOpenSolutionFromHash();
        }else window.location.href=nextUrl.href;
      } else {hud.hidden=true;window.alert("✓ Concept review completed for all questions in this session!");}
    });
    hud.querySelector(".hud-btn-ghost").onclick=async()=>{await record("Visited");hud.hidden=true;};
  }
  function showConceptAnswerNote() {
    const params = activeConceptIntent || new URLSearchParams(window.location.hash.slice(1));
    const qnum = params.get("ea-qnum") || params.get("ea-qid") || "";
    document.getElementById("ea-concept-answer-prompt")?.remove();
    const prompt = document.createElement("div");
    prompt.id = "ea-concept-answer-prompt";
    prompt.innerHTML = `<div class="concept-prompt-card"><div class="prompt-icon">💡</div><div class="prompt-content"><div class="prompt-title">Question ${qnum} · Concept Review</div><p class="prompt-text">Choose an option according to your preference and continue to view solution. Your concept session timer will start automatically once the explanation appears.</p><button id="ea-force-start-timer-btn" class="ea-prompt-force-btn" type="button">▶ Solution already visible? Start Timer</button></div></div>`;
    safeMount(prompt);
    prompt.querySelector("#ea-force-start-timer-btn")?.addEventListener("click", () => {
      const intent = activeConceptIntent || params;
      if (!intent.get("ea-session") || !intent.get("ea-qid")) return;
      hideAnswerToRevealPrompt();
      conceptObserver?.disconnect(); conceptObserver = null;
      clearInterval(solutionIntentInterval); solutionIntentInterval = 0;
      startConceptReviewHud(intent);
    });
  }
  function hideAnswerToRevealPrompt() { document.getElementById("ea-concept-answer-prompt")?.remove(); }
  function clearQuestionAnswerState() {
    const root = getQuestionContentRoot();
    root.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked').forEach((input) => {
      input.checked = false;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    root.querySelectorAll(".examfocus-selected-option, .examfocus-you-marked, .selected, .is-selected, [aria-checked='true'], [aria-selected='true'], [data-selected='true']")
      .forEach((node) => {
        node.classList.remove("examfocus-selected-option", "examfocus-you-marked", "selected", "is-selected");
        if (node.hasAttribute("aria-checked")) node.setAttribute("aria-checked", "false");
        if (node.hasAttribute("aria-selected")) node.setAttribute("aria-selected", "false");
        if (node.hasAttribute("data-selected")) node.setAttribute("data-selected", "false");
        restoreInlineProperties(node, ["border-color", "background-color", "box-shadow", "outline"]);
      });
    selectedOption = null;
  }
  function clearIntentHash() {
    try { history.replaceState(history.state, "", `${location.pathname}${location.search}`); }
    catch { location.hash = ""; }
    stopSolutionHashWait();
  }
  function conceptSessionIdentity(item) {
    if (item?.sessionId) return String(item.sessionId);
    if (Number(item?.startedAtMs) > 0) return String(item.startedAtMs);
    const startedAt = item?.startedAt;
    if (typeof startedAt === "number") return String(startedAt);
    if (/^\d{10,13}$/.test(String(startedAt || ""))) return String(startedAt);
    return String(Date.parse(startedAt) || 0);
  }
  function targetMatchesCurrentPage(targetUrl) {
    try {
      const target = new URL(targetUrl);
      const current = new URL(window.location.href);
      return target.origin === current.origin && target.pathname === current.pathname && target.search === current.search;
    } catch { return false; }
  }
  async function markQuestionVisitedInstant(sessionId, qKey, qNum) {
    if (!sessionId || !qKey) return;
    try {
      const stored = await chrome.storage.local.get(["examHistory", "lastReport"]);
      const history = Array.isArray(stored.examHistory) ? stored.examHistory : [];
      const update = (item) => {
        if (conceptSessionIdentity(item) !== String(sessionId)) return item;
        const reviewMap = { ...(item.conceptReview || {}) };
        const prev = reviewMap[qKey] || reviewMap[String(qNum)] || { dwellMs: 0 };
        const record = { dwellMs: Number(prev.dwellMs) || 0, status: prev.status === "Completed" ? "Completed" : "Visited", lastReviewedAt: Date.now() };
        reviewMap[qKey] = record;
        reviewMap[String(qNum)] = record;
        return { ...item, conceptReview: reviewMap };
      };
      const updates = { examHistory: history.map(update) };
      if (stored.lastReport && conceptSessionIdentity(stored.lastReport) === String(sessionId)) updates.lastReport = update(stored.lastReport);
      await chrome.storage.local.set(updates);
    } catch (err) { console.error("Failed to mark concept question visited:", err); }
  }
  async function checkAndLaunchConceptSession() {
    if (active) return;
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const isHashIntent = hashParams.get("ea-intent") === "solution";
    let pending = null;
    try {
      const stored = await chrome.storage.local.get("pendingConceptReview");
      const candidate = stored.pendingConceptReview;
      if (candidate && Date.now() - Number(candidate.timestamp) < 120000 && targetMatchesCurrentPage(candidate.targetUrl)) pending = candidate;
    } catch (err) { console.warn("Could not read pending concept review:", err); }
    if (!isHashIntent && !pending) return;
    const intent = isHashIntent ? hashParams : new URLSearchParams({
      "ea-intent": "solution", "ea-session": String(pending.sessionId || ""), "ea-qid": String(pending.qid || ""), "ea-qnum": String(pending.qnum || "1")
    });
    const sessionId = intent.get("ea-session") || pending?.sessionId;
    const qKey = intent.get("ea-qid") || pending?.qid;
    const qNum = Number.parseInt(intent.get("ea-qnum") || String(pending?.qnum || "1"), 10) || 1;
    if (!sessionId || !qKey) return;
    const activationKey = `${sessionId}:${qKey}:${pending?.timestamp || "hash"}`;
    if (conceptIntentActivationKey === activationKey) { maybeOpenSolutionFromHash(); return; }
    activeConceptIntent = intent;
    conceptIntentActivationKey = activationKey;
    await markQuestionVisitedInstant(sessionId, qKey, qNum);
    if (pending) {
      try { await chrome.storage.local.remove("pendingConceptReview"); }
      catch (err) { console.warn("Could not clear pending concept review:", err); }
    }
    maybeOpenSolutionFromHash();
  }
  function showLockoutToast(message, isError = true) {
    let toast = document.getElementById(REATTEMPT_TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = REATTEMPT_TOAST_ID;
      safeAppendToBody(toast);
    }
    toast.className = `ea-reattempt-toast ${isError ? "toast-warning" : "toast-success"}`;
    toast.textContent = message;
    setTimeout(() => {
      toast?.classList.add("toast-fadeout");
      setTimeout(() => { toast?.remove(); }, 350);
    }, 4500);
  }

  function startReattemptMode(sessionId, questionId) {
    if (active || reattemptActive) return;
    reattemptActive = true;
    reattemptSessionId = sessionId || session?.sessionId || "";
    reattemptQuestionId = questionId || "";
    reattemptStartedAt = Date.now();
    reattemptElapsedMs = 0;
    reattemptSelectedOption = null;

    renderReattemptHud();
    overrideReattemptNextButton();
    if (reattemptTickTimer) clearInterval(reattemptTickTimer);
    reattemptTickTimer = setInterval(tickReattempt, 1000);
  }

  function renderReattemptHud() {
    document.getElementById(REATTEMPT_HUD_ID)?.remove();
    const hud = document.createElement("div");
    hud.id = REATTEMPT_HUD_ID;
    hud.className = "ea-reattempt-hud";
    hud.innerHTML = `
      <div class="ea-reattempt-head">
        <div class="ea-reattempt-badge">
          <span class="ea-pulse-dot"></span>
          <strong>⚡ HEALING MODE</strong>
        </div>
        <button type="button" class="ea-reattempt-close" title="Exit Reattempt">✕</button>
      </div>
      <div class="ea-reattempt-body">
        <div class="ea-reattempt-timer-row">
          <span class="ea-reattempt-label">ELAPSED TIME</span>
          <span class="ea-reattempt-timer">00:00</span>
        </div>
        <div class="ea-reattempt-selection-status">
          <span class="ea-reattempt-sel-label">Selected:</span>
          <strong class="ea-reattempt-sel-val">None</strong>
        </div>
        <button type="button" class="ea-reattempt-submit-btn">Submit Re-attempt</button>
      </div>
    `;
    safeAppendToBody(hud);

    hud.querySelector(".ea-reattempt-close")?.addEventListener("click", () => {
      if (confirm("Exit Reattempt Mode? Your timing and answer will not be saved.")) {
        stopReattemptMode();
      }
    });

    hud.querySelector(".ea-reattempt-submit-btn")?.addEventListener("click", () => {
      openReattemptConfirmation();
    });
  }

  function tickReattempt() {
    if (!isExtensionValid()) {
      teardownOrphanedScript();
      return;
    }
    if (!reattemptActive) return;
    overrideReattemptNextButton();
    reattemptElapsedMs = Math.max(0, Date.now() - reattemptStartedAt);
    const timer = document.querySelector(`#${REATTEMPT_HUD_ID} .ea-reattempt-timer`);
    if (timer) {
      timer.textContent = formatDuration(reattemptElapsedMs, false);
    }
  }

  function overrideReattemptNextButton() {
    if (!reattemptActive) return;
    for (const button of document.querySelectorAll("button, [role='button']")) {
      if (button.closest(`#${REATTEMPT_HUD_ID}, #${REATTEMPT_CONFIRM_ID}`)) continue;
      const label = (button.innerText || button.textContent || "").trim();
      if (!/^(?:next|next question)$/i.test(label)) continue;
      if (!button.dataset.eaReattemptOriginalHtml) {
        button.dataset.eaReattemptOriginalHtml = button.innerHTML;
        for (const property of ["background", "color", "font-weight"]) {
          button.dataset[`eaReattemptOriginal${property.replace(/[^a-z]/gi, "")}`] = JSON.stringify({ value: button.style.getPropertyValue(property), priority: button.style.getPropertyPriority(property) });
        }
      }
      button.dataset.eaReattemptNext = "true";
      button.textContent = "Submit Re-attempt";
      button.style.setProperty("background", "#14b8a6", "important");
      button.style.setProperty("color", "#020817", "important");
      button.style.setProperty("font-weight", "800", "important");
    }
  }

  function openReattemptConfirmation() {
    if (reattemptConfirmModal || !reattemptActive) return;
    const hasSelected = Boolean(reattemptSelectedOption);
    const selectedLabel = reattemptSelectedOption
      ? (reattemptSelectedOption.getAttribute("data-option") || reattemptSelectedOption.innerText?.trim()?.slice(0, 24) || "Selected")
      : "None";

    reattemptConfirmModal = document.createElement("div");
    reattemptConfirmModal.id = REATTEMPT_CONFIRM_ID;
    reattemptConfirmModal.innerHTML = `
      <section role="dialog" aria-modal="true" aria-labelledby="ea-reattempt-title">
        <span class="ea-submit-eyebrow">REATTEMPT SUBMISSION</span>
        <div class="ea-submit-heading">
          <h2 id="ea-reattempt-title">Submit Reattempt?</h2>
          <div class="ea-submit-timer">
            <span>TIME TAKEN</span>
            <strong class="ea-submit-clock">${formatDuration(reattemptElapsedMs, false)}</strong>
          </div>
        </div>
        <p class="ea-submit-copy"></p>
        <div class="ea-submit-actions">
          <button class="ea-submit-cancel" type="button">Cancel / Return</button>
          <button class="ea-submit-confirm" type="button">Confirm &amp; Submit</button>
        </div>
      </section>
    `;
    safeAppendToBody(reattemptConfirmModal);
    reattemptConfirmModal.querySelector(".ea-submit-copy").textContent = `Are you sure you want to submit your re-attempt?${hasSelected ? ` Selected: ${selectedLabel}.` : " No option selected."}`;

    reattemptConfirmModal.querySelector(".ea-submit-cancel")?.addEventListener("click", () => {
      reattemptConfirmModal?.remove();
      reattemptConfirmModal = null;
    });

    reattemptConfirmModal.querySelector(".ea-submit-confirm")?.addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      btn.disabled = true;
      btn.textContent = "Submitting…";
      await submitReattempt();
    });
  }

  async function submitReattempt() {
    if (!isExtensionValid()) {
      teardownOrphanedScript();
      return;
    }
    const finalDwellMs = Math.max(1000, Date.now() - reattemptStartedAt);

    let outcome = null;
    if (!reattemptSelectedOption) {
      outcome = "Unattempted";
    } else {
      const marksSubmitBtn = Array.from(document.querySelectorAll("button, [role='button']")).find((b) => {
        const txt = b.textContent?.trim().toLowerCase() || "";
        return /^(submit|check\s+answer|save\s*&\s*next|submit\s+answer)$/i.test(txt) && !b.disabled;
      });
      if (marksSubmitBtn && !marksSubmitBtn.dataset.eaReattemptSubmitted) {
        marksSubmitBtn.dataset.eaReattemptSubmitted = "true";
        try { marksSubmitBtn.click(); } catch (_) {}
        for (let attempt = 0; attempt < 10; attempt += 1) {
          await new Promise((r) => setTimeout(r, 80));
          outcome = detectOutcome([getQuestionContentRoot()]);
          if (outcome) break;
        }
      }
      if (!outcome) {
        outcome = detectOutcome([getQuestionContentRoot()]);
      }
      if (!outcome && reattemptSelectedOption) {
        const statusAttr = reattemptSelectedOption.getAttribute("data-status") ||
          reattemptSelectedOption.querySelector?.("[data-status]")?.getAttribute("data-status");
        if (statusAttr === "true") outcome = "Right";
        else if (statusAttr === "false") outcome = "Wrong";
      }
    }

    if (!outcome && reattemptSelectedOption) {
      reattemptConfirmModal?.remove(); reattemptConfirmModal = null;
      showLockoutToast("Marks did not expose an answer result, so the wound was left unchanged.");
      return;
    }

    reattemptConfirmModal?.remove();
    reattemptConfirmModal = null;

    try {
      const qid = reattemptQuestionId || findQuestionId()?.id || "Unknown";
      const res = await send({
        type: "RECORD_REATTEMPT",
        sessionId: reattemptSessionId,
        questionId: qid,
        dwellMs: finalDwellMs,
        outcome: outcome || "Wrong",
        timestamp: Date.now()
      });
      if (!res?.ok) throw new Error(res?.error || "The original question history could not be updated.");

      if (outcome === "Right") {
        showLockoutToast("🌿 WOUND HEALED! The question archive and cultivation debt are updated.", false);
      } else if (outcome === "Wrong") {
        showLockoutToast("Reattempt submitted: Incorrect attempt recorded.", true);
      } else {
        showLockoutToast("Reattempt submitted as Unattempted.", true);
      }
    } catch (err) {
      if (/context invalidated/i.test(err?.message || "")) {
        teardownOrphanedScript();
        return;
      }
      showLockoutToast(`Could not record reattempt: ${err?.message || "Unknown error"}`, true);
    } finally {
      chrome.storage.local.remove("ea_reattempt_target").catch(() => {});
      stopReattemptMode();
    }
  }

  function stopReattemptMode() {
    reattemptActive = false;
    if (reattemptTickTimer) clearInterval(reattemptTickTimer);
    reattemptTickTimer = 0;
    reattemptStartedAt = 0;
    reattemptElapsedMs = 0;
    reattemptSelectedOption = null;
    document.querySelectorAll("[data-ea-reattempt-next='true']").forEach(button => {
      if (button.dataset.eaReattemptOriginalHtml != null) button.innerHTML = button.dataset.eaReattemptOriginalHtml;
      for (const [property, key] of [["background", "eaReattemptOriginalbackground"], ["color", "eaReattemptOriginalcolor"], ["font-weight", "eaReattemptOriginalfontweight"]]) {
        let original = null;
        try { original = JSON.parse(button.dataset[key] || "null"); } catch { /* Ignore malformed page data. */ }
        if (original?.value) button.style.setProperty(property, original.value, original.priority || "");
        else button.style.removeProperty(property);
        delete button.dataset[key];
      }
      delete button.dataset.eaReattemptOriginalHtml;
      delete button.dataset.eaReattemptNext;
    });
    document.getElementById(REATTEMPT_HUD_ID)?.remove();
    document.getElementById(REATTEMPT_CONFIRM_ID)?.remove();
    clearIntentHash();
  }

  function resolveQuestionIntent() {
    if (active) return false;
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const params = hashParams.get("ea-intent") ? hashParams : (activeReattemptIntent || activeConceptIntent || hashParams);
    const intent = params.get("ea-intent");
    if (!/^(reattempt|solution)$/.test(intent || "")) { stopSolutionHashWait(); return false; }

    if (intent === "reattempt") {
      if (lockoutCooldown) {
        clearIntentHash();
        return true;
      }
      if (reattemptActive) return true;

      const targetSession = params.get("ea-session");
      const targetQid = params.get("ea-qid");
      const solutionVisible = solutionViewVisible();

      if (solutionVisible && !questionOptionsVisible()) {
        const backButton = intentButtons(/(?:show\s+question|back\s+to\s+question|hide\s+solution|reattempt|try\s+again|clear\s+response)/i)[0];
        if (backButton && !backButton.dataset.eaIntentClicked) {
          backButton.dataset.eaIntentClicked = "true";
          backButton.click();
        }
        // Marks can briefly render the solution shell before the answer controls.
        // Keep waiting; a disabled Check Answer button is not evidence of lockout.
        return false;
      }

      if (!questionOptionsVisible()) return false;

      reattemptLockoutAttempts = 0;
      clearQuestionAnswerState();
      getQuestionContentRoot()?.querySelectorAll("input, button, [role='radio']").forEach((el) => {
        if (el.hasAttribute("disabled")) el.removeAttribute("disabled");
        el.style.pointerEvents = "auto";
      });
      clearIntentHash();
      stopSolutionHashWait();
      startReattemptMode(targetSession, targetQid);
      activeReattemptIntent = null;
      return true;
    }

    if (solutionViewVisible()) {
      if (conceptAwaitingQuestionRender) {
        if (!questionOptionsVisible()) return false;
        conceptAwaitingQuestionRender=false;
        if (conceptAwaitingQuestionTimer) clearTimeout(conceptAwaitingQuestionTimer);
        conceptAwaitingQuestionTimer=0;
        return false;
      }
      startConceptReviewHud(params); clearIntentHash(); return true;
    }
    showConceptAnswerNote();
    const showButton = intentButtons(/(?:show|view|open|see)\s+(?:the\s+)?(?:step[\s-]*by[\s-]*step\s+)?(?:solution|explanation)|(?:solution|explanation)(?:\s+breakdown)?|marks\s+solution/i)[0];
    if (showButton && !showButton.dataset.eaIntentClicked) { showButton.dataset.eaIntentClicked = "true"; showButton.click(); }
    return false;
  }
  function maybeOpenSolutionFromHash() {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const hashIntent = hashParams.get("ea-intent");
    if (hashIntent === "solution") activeConceptIntent = hashParams;
    if (active || (!hashIntent && !activeReattemptIntent && !activeConceptIntent)) return;
    stopSolutionHashWait();
    if (resolveQuestionIntent()) return;
    conceptObserver = new MutationObserver(() => {
      if (resolveQuestionIntent()) stopSolutionHashWait();
    });
    const observerRoot = document.documentElement || document.body;
    if (observerRoot) conceptObserver.observe(observerRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    else whenBodyReady(() => {
      const readyRoot = document.documentElement || document.body;
      if (conceptObserver && readyRoot) conceptObserver.observe(readyRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    });
    solutionIntentInterval = setInterval(() => {
      if (resolveQuestionIntent()) stopSolutionHashWait();
    }, 100);
  }
  function observeHistoryIntentChanges() {
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      if (original.__examArenaIntentWrapped) continue;
      const wrapped = function (...args) {
        const result = original.apply(this, args);
        queueMicrotask(maybeOpenSolutionFromHash);
        return result;
      };
      wrapped.__examArenaIntentWrapped = true;
      history[method] = wrapped;
    }
  }

  function questionIdsInOrder() {
    const ids = [...(Array.isArray(session.questionOrder) ? session.questionOrder : []), ...Object.keys(session.questions || {})];
    return [...new Set(ids.map(String))];
  }
  function paletteStateKey(value) {
    const questions = value?.questions || {};
    return JSON.stringify({
      order: value?.questionOrder || Object.keys(questions),
      reviews: value?.reviewQuestionIds || [],
      outcomes: Object.fromEntries(Object.entries(questions).map(([id, question]) => [id, value?.outcomes?.[id] || question?.outcome || null])),
      target: value?.targetQuestions || null
    });
  }
  function outcomeForQuestion(id) {
    const question = session.questions?.[id];
    if (id === currentId && (currentOutcome === "Right" || currentOutcome === "Wrong")) return currentOutcome;
    const outcome = session.outcomes?.[id] || question?.outcome;
    return outcome === "Right" || outcome === "Wrong" ? outcome : null;
  }
  function isMarkedForReview(id) {
    return Array.isArray(session.reviewQuestionIds) && session.reviewQuestionIds.includes(id);
  }
  function paintReviewButton() {
    const button = document.querySelector(`#${HUD_ID} .ef-hud-review`);
    if (!button) return;
    const locked = !active || !currentId || Boolean(outcomeForQuestion(currentId));
    const marked = currentId && isMarkedForReview(currentId);
    button.disabled = locked;
    button.textContent = marked ? "Unmark Review" : "Mark for Review";
    button.classList.toggle("is-marked", Boolean(marked));
    button.title = locked ? "Answered questions cannot be marked for review" : "Toggle review flag for this question";
  }
  async function toggleCurrentReview() {
    if (!active || !currentId || outcomeForQuestion(currentId)) return;
    const response = await send({ type: "TOGGLE_REVIEW", questionId: currentId });
    if (!response?.ok) return;
    session.reviewQuestionIds = Array.isArray(response.reviewQuestionIds) ? response.reviewQuestionIds : [];
    paintReviewButton();
    renderPaletteGrid();
  }
  function removePalette() {
    paletteModal?.remove();
    document.getElementById("examarena-palette-modal")?.remove();
    paletteModal = null;
  }
  function questionTileStatus(id) {
    const outcome = id ? outcomeForQuestion(id) : null;
    if (id && isMarkedForReview(id)) return "review";
    const question = id ? session.questions?.[id] : null;
    if (outcome || question?.userSelected || (id === currentId && answerSubmitted)) return "answered";
    return "unattempted";
  }
  function findNativeQuestionControl(id, relativeNumber, question) {
    const label = String(question?.label || "");
    const explicitNumber = label.match(/(?:Question|Q\.?)[\s#]*(\d{1,4})/i)?.[1];
    const currentAbsoluteNumber = String(currentLabel || "").match(/(?:Question|Q\.?)[\s#]*(\d{1,4})/i)?.[1];
    const inferredNumber = currentAbsoluteNumber && relativeIndex
      ? String(Number(currentAbsoluteNumber) + relativeNumber - relativeIndex) : null;
    const numbers = [...new Set([explicitNumber, inferredNumber, String(relativeNumber)].filter((number) => number && Number(number) > 0))];
    const selectors = [
      "[data-question-id]", "[data-question-number]", "[aria-label*='question' i]",
      "[class*='question-palette' i] button", "[class*='question-palette' i] a", "[class*='question-palette' i] [role='button']",
      "[class*='question-drawer' i] button", "[class*='question-drawer' i] a", "[class*='question-drawer' i] [role='button']",
      "[class*='question-navigation' i] button", "[class*='question-navigation' i] a", "[class*='question-navigation' i] [role='button']",
      "[class*='question-list' i] button", "[class*='question-list' i] [role='button']"
    ].join(",");
    for (const control of document.querySelectorAll(selectors)) {
      if (control.closest(`#${HUD_ID}, #examarena-palette-modal, #examarena-submit-confirm-modal`)) continue;
      if (control.getAttribute("data-question-id") === id) return control;
      const haystack = [control.innerText, control.textContent, control.getAttribute("aria-label"), control.getAttribute("data-question-number")]
        .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      for (const number of numbers) {
        if (new RegExp(`^(?:Q\\.?\\s*)?${number}$`, "i").test(haystack) ||
            new RegExp(`\\b(?:question|q\\.?)[\\s#]*${number}\\b`, "i").test(haystack)) return control;
      }
    }
    return null;
  }
  function waitForNativeQuestionControl(id, relativeNumber, question, timeoutMs = 900) {
    return new Promise((resolve) => {
      const find = () => findNativeQuestionControl(id, relativeNumber, question);
      const immediate = find();
      if (immediate) { resolve(immediate); return; }
      let finished = false;
      const finish = (control) => {
        if (finished) return;
        finished = true; localObserver.disconnect(); clearInterval(poll); clearTimeout(timer); resolve(control);
      };
      const check = () => { const control = find(); if (control) finish(control); };
      const localObserver = new MutationObserver(check);
      localObserver.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded", "aria-controls", "data-question-id", "data-question-number"] });
      const poll = setInterval(check, 100);
      const timer = setTimeout(() => finish(null), timeoutMs);
    });
  }
  function clickNativeAction(action) {
    if (!action || action.disabled || action.getAttribute("aria-disabled") === "true") return false;
    replayingNativeNavigation = true;
    try { action.click(); } finally { queueMicrotask(() => { replayingNativeNavigation = false; }); }
    return true;
  }
  function isExpectedQuestionRendered(id, relativeNumber) {
    const found = findQuestionId();
    if (!found) return false;
    if (found.id === id) return true;
    const number = String(found.label || "").match(/(?:Question|Q\.?)[\s#]*(\d{1,4})/i)?.[1];
    return Boolean(number && Number(number) === Number(relativeNumber));
  }
  function waitForRenderedQuestion(id, relativeNumber, timeoutMs = 450) {
    return new Promise((resolve) => {
      let finished = false;
      const finish = (matched) => {
        if (finished) return;
        finished = true; observer?.disconnect(); clearInterval(poll); clearTimeout(timer); resolve(matched);
      };
      const check = () => { if (isExpectedQuestionRendered(id, relativeNumber)) finish(true); };
      const localObserver = new MutationObserver(check);
      if (observerRoot || document.documentElement) localObserver.observe(observerRoot || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-current", "aria-selected", "data-question-id"] });
      const observer = localObserver;
      const poll = setInterval(check, 150);
      const timer = setTimeout(() => finish(false), timeoutMs);
      check();
    });
  }
  function waitForQuestionChange(previousId, timeoutMs = 420) {
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const found = findQuestionId();
        if (found && found.id !== previousId) { clearInterval(timer); resolve(true); }
        else if (Date.now() - started >= timeoutMs) { clearInterval(timer); resolve(false); }
      }, 150);
    });
  }
  function waitForRegisteredQuestion(id, timeoutMs = 1000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (currentId === id) { clearInterval(timer); resolve(true); }
        else if (Date.now() - start >= timeoutMs) { clearInterval(timer); resolve(false); }
      }, 150);
    });
  }
  function waitForRegisteredQuestionChange(previousId, timeoutMs = 500) {
    return new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (currentId && currentId !== previousId) { clearInterval(timer); resolve(true); }
        else if (Date.now() - start >= timeoutMs) { clearInterval(timer); resolve(false); }
      }, 150);
    });
  }
  function findNativePaletteToggle() {
    const candidates = document.querySelectorAll("button, a, [role='button'], summary");
    for (const control of candidates) {
      if (control.closest(`#${HUD_ID}, #examarena-palette-modal, #examarena-submit-confirm-modal`)) continue;
      const text = [control.innerText, control.textContent, control.getAttribute("aria-label"), control.getAttribute("title")].filter(Boolean).join(" ").replace(/\s+/g," ").trim();
      if (!/^(?:check\s+status|question\s*palette|show\s+questions|all\s+questions|question\s+list|questions)$/i.test(text)) continue;
      const expanded = control.getAttribute("aria-expanded");
      const controlledId = control.getAttribute("aria-controls");
      const controlled = controlledId ? document.getElementById(controlledId) : null;
      const className = typeof control.className === "string" ? control.className : "";
      const detailsClosed = control.tagName === "SUMMARY" && !control.parentElement?.open;
      if (expanded === "false" || detailsClosed || /collapsed|closed/i.test(className) || (controlled && (controlled.hidden || controlled.getAttribute("aria-hidden") === "true"))) return control;
    }
    return null;
  }
  function collapseNativePaletteIfOpen(toggle) {
    if (!toggle?.isConnected || toggle.disabled) return;
    const expanded = toggle.getAttribute("aria-expanded");
    const className = typeof toggle.className === "string" ? toggle.className : "";
    if (expanded === "true" || /\b(open|expanded)\b/i.test(className)) clickNativeAction(toggle);
  }
  function findSequentialQuestionControl(direction) {
    const candidates = document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']");
    for (const control of candidates) {
      if (control.closest(`#${HUD_ID}, #examarena-palette-modal, #examarena-submit-confirm-modal, #examfocus-completion-modal`)) continue;
      if (control.disabled || control.getAttribute("aria-disabled") === "true") continue;
      const text = [control.innerText, control.textContent, control.getAttribute("aria-label"), control.getAttribute("title"), control.value].filter(Boolean).join(" ").replace(/\s+/g," ").trim();
      if (direction < 0 ? /\b(previous|prev|back)\b/i.test(text) : /\b(next|continue)\b/i.test(text)) return control;
    }
    return null;
  }
  async function sequentialQuestionFallback(id, relativeNumber) {
    for (let step = 0; step < 110; step += 1) {
      if (isExpectedQuestionRendered(id, relativeNumber)) return true;
      const difference = Number(relativeNumber) - Number(relativeIndex || 1);
      if (!difference) return false;
      const action = findSequentialQuestionControl(difference > 0 ? 1 : -1);
      const previousPageId = findQuestionId()?.id || currentId;
      const previousCurrentId = currentId;
      if (!action || !clickNativeAction(action)) return false;
      const reachedTarget = await waitForRenderedQuestion(id, relativeNumber, 170);
      queueScan();
      if (reachedTarget && await waitForRegisteredQuestion(id, 600)) return true;
      if (!await waitForQuestionChange(previousPageId, 300)) return false;
      await waitForRegisteredQuestionChange(previousCurrentId, 400);
    }
    return false;
  }
  async function jumpToQuestion(id, relativeNumber) {
    const question = id ? session.questions?.[id] : null;
    if (!id) {
      const message = paletteModal?.querySelector(".ea-palette-message");
      if (message) message.textContent = "This question has not been approached yet, so the host page has no saved route for it.";
      return false;
    }
    const message = paletteModal?.querySelector(".ea-palette-message");
    if (message) message.textContent = `Moving to Question ${relativeNumber}…`;
    void snapshotCurrentQuestion()?.catch((error) => console.warn("Study Slash could not save the outgoing question", error));
    if (!active) return false;
    if (id === currentId) { pendingJump = null; removePalette(); return true; }
    pendingJump = { id, relativeNumber };
    let nativeToggle = null;
    let nativeControl = findNativeQuestionControl(id, relativeNumber, question);
    if (!nativeControl) {
      nativeToggle = findNativePaletteToggle();
      if (nativeToggle) {
        clickNativeAction(nativeToggle);
        nativeControl = await waitForNativeQuestionControl(id, relativeNumber, question);
      }
    }
    if (nativeControl) {
      clickNativeAction(nativeControl);
      if (await waitForRenderedQuestion(id, relativeNumber, 500)) {
        queueScan();
        if (await waitForRegisteredQuestion(id, 900)) { pendingJump = null; collapseNativePaletteIfOpen(nativeToggle); removePalette(); return true; }
      }
    }
    const url = question?.url;
    if (typeof url === "string") {
      try {
        const target = new URL(url, window.location.href);
        if (target.origin === window.location.origin && target.href !== window.location.href) {
          history.pushState(null, "", `${target.pathname}${target.search}${target.hash}`);
          window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
          if (await waitForRenderedQuestion(id, relativeNumber, 150)) {
            queueScan();
            if (await waitForRegisteredQuestion(id, 900)) { pendingJump = null; collapseNativePaletteIfOpen(nativeToggle); removePalette(); return true; }
          }
        }
      } catch { /* Ignore malformed stored question URLs and keep the palette available. */ }
    }
    if (await sequentialQuestionFallback(id, relativeNumber)) { pendingJump = null; collapseNativePaletteIfOpen(nativeToggle); removePalette(); return true; }
    pendingJump = null;
    if (message) message.textContent = "The page did not switch to this question. Its palette stays open; use the page’s own question navigation and try again.";
    return false;
  }
  function renderPaletteGrid() {
    if (!paletteModal) return;
    const grid = paletteModal.querySelector(".ea-palette-grid");
    const message = paletteModal.querySelector(".ea-palette-message");
    if (!grid) return;
    grid.replaceChildren(); if (message && !pendingJump) message.textContent = "";
    const ids = questionIdsInOrder();
    const cap = session.mode === "countdown" && Number.isInteger(Number(session.targetQuestions)) ? Number(session.targetQuestions) : 0;
    const count = cap > 0 ? cap : ids.length;
    for (let index = 0; index < count; index += 1) {
      const id = ids[index] || null;
      const status = questionTileStatus(id);
      const tile = document.createElement("button");
      tile.type = "button"; tile.className = `ea-palette-tile is-${status}`;
      if (id && id === currentId) tile.classList.add("is-current");
      tile.textContent = String(index + 1);
      tile.setAttribute("aria-label", `Question ${index + 1}, ${status.replaceAll("-", " ")}${id === currentId ? ", current question" : ""}`);
      tile.addEventListener("click", () => { void jumpToQuestion(id, index + 1).catch((error) => {
        const status = paletteModal?.querySelector(".ea-palette-message");
        if (status) status.textContent = `Could not move to that question: ${error.message || "please try again."}`;
      }); });
      grid.append(tile);
    }
    const countText = paletteModal.querySelector(".ea-palette-count");
    if (countText) countText.textContent = `${ids.length} approached${cap ? ` · target ${cap}` : ""}`;
  }
  async function openQuestionPalette() {
    if (!active || paletteModal || !document.body) return;
    const stored = await chrome.storage.local.get("examSession");
    if (!active) return;
    session = stored.examSession || session;
    paletteModal = document.createElement("div"); paletteModal.id = "examarena-palette-modal";
    paletteModal.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="ea-palette-title">
      <header class="ea-palette-header"><div><span class="ea-palette-eyebrow">STUDY SLASH · STATUS</span><h2 id="ea-palette-title">Question Palette</h2></div><div class="ea-palette-header-actions"><button class="ea-palette-submit" type="button">Submit Exam</button><button class="ea-palette-close" type="button" aria-label="Close question palette">×</button></div></header>
      <div class="ea-palette-legend"><span><i class="legend-answered"></i> Attempted / Answered</span><span><i class="legend-review"></i> Marked for Review</span><span><i class="legend-unattempted"></i> Unattempted</span></div>
      <div class="ea-palette-scroll"><div class="ea-palette-grid"></div><p class="ea-palette-message" role="status" aria-live="polite"></p></div>
      <footer class="ea-palette-footer"><span class="ea-palette-count">0 approached</span><span>The exam timer continues while this panel is open.</span></footer>
    </section>`;
    safeAppendToBody(paletteModal);
    paletteModal.querySelector(".ea-palette-close").addEventListener("click", removePalette);
    paletteModal.querySelector(".ea-palette-submit").addEventListener("click", () => { removePalette(); void openSubmitConfirmation(true); });
    paletteModal.addEventListener("click", (event) => { if (event.target === paletteModal) removePalette(); });
    renderPaletteGrid();
    paletteModal.querySelector(".ea-palette-close").focus();
  }

  function ensureHud() {
    if (!active || !document.body || document.getElementById(HUD_ID)) return;
    const hud = document.createElement("aside");
    hud.id = HUD_ID;
    hud.innerHTML = `<header class="ef-hud-header"><span class="ef-hud-brand"><img src="${chrome.runtime.getURL("assets/study-slash-icon-32.png")}" alt=""> STUDY SLASH</span><button class="ef-hud-minimize" type="button" aria-label="Minimize HUD">−</button></header>
      <div class="ef-hud-content"><div class="ef-hud-label">ELAPSED TIME</div><strong class="ef-hud-timer">00:00:00</strong>
      <div class="ef-hud-grid"><div><span>QUESTION</span><b class="ef-hud-question">Waiting…</b></div><div><span>DWELL</span><b class="ef-hud-dwell">00:00:00</b></div></div>
      <div class="ef-hud-progress"><div class="ef-hud-progress-head"><span>COMPLETED</span><b class="ef-hud-count">0 / ∞</b></div><div class="ef-hud-track"><i></i></div></div>
      <button class="ef-hud-status" type="button"><span aria-hidden="true">▦</span> Check Status</button>
      <button class="ef-hud-review" type="button">Mark for Review</button></div>`;
    safeAppendToBody(hud);
    const position = readPosition();
    if (position) {
      hud.style.setProperty("left", `${position.x}px`, "important"); hud.style.setProperty("top", `${position.y}px`, "important");
      hud.style.setProperty("right", "auto", "important"); hud.style.setProperty("bottom", "auto", "important");
    }
    const header = hud.querySelector(".ef-hud-header");
    header.addEventListener("mousedown", (event) => {
      if (event.target.closest("button")) return;
      const rect = hud.getBoundingClientRect(); const dx = event.clientX - rect.left; const dy = event.clientY - rect.top;
      function move(moveEvent) {
        const x = Math.max(0, Math.min(window.innerWidth - 80, moveEvent.clientX - dx));
        const y = Math.max(0, Math.min(window.innerHeight - 40, moveEvent.clientY - dy));
        hud.style.setProperty("left", `${x}px`, "important"); hud.style.setProperty("top", `${y}px`, "important");
        hud.style.setProperty("right", "auto", "important"); hud.style.setProperty("bottom", "auto", "important");
      }
      function finish() {
        document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", finish);
        const rectNow = hud.getBoundingClientRect();
        try { localStorage.setItem("examfocus-hud-position", JSON.stringify({ x: rectNow.left, y: rectNow.top })); } catch { /* Keep the HUD usable when site storage is disabled. */ }
      }
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", finish);
    });
    hud.querySelector(".ef-hud-minimize").addEventListener("click", (event) => {
      const collapsed = hud.classList.toggle("ef-collapsed");
      event.currentTarget.textContent = collapsed ? "+" : "−";
      event.currentTarget.setAttribute("aria-label", collapsed ? "Maximize HUD" : "Minimize HUD");
    });
    hud.querySelector(".ef-hud-status").addEventListener("click", () => { void openQuestionPalette(); });
    hud.querySelector(".ef-hud-review").addEventListener("click", () => { void toggleCurrentReview(); });
    paintReviewButton();
  }
  function readPosition() {
    try { const pos = JSON.parse(localStorage.getItem("examfocus-hud-position")); return Number.isFinite(pos?.x) && Number.isFinite(pos?.y) ? pos : null; }
    catch { return null; }
  }
  function updateHud() {
    const hud = document.getElementById(HUD_ID);
    if (!hud || !active) return;
    const now = Date.now();
    const elapsed = now - (sessionTimestamp(session) || now);
    const liveDwell = questionDwellMs + (currentId ? Math.max(0, now - lastTickAt) : 0);
    const cap = session.targetQuestions || 0;
    const completedCount = (session.completedQuestionIds || []).length;
    hud.querySelector(".ef-hud-label").textContent = session.mode === "countdown" ? "TIME REMAINING" : "TIME ELAPSED";
    hud.querySelector(".ef-hud-timer").textContent = session.mode === "countdown"
      ? formatDuration(Math.max(0, session.allottedTimeMs - elapsed)) : formatDuration(elapsed);
    hud.querySelector(".ef-hud-question").textContent = currentId ? `${currentLabel || `Question ${relativeIndex || 1}`} · ${relativeIndex}/${cap || "∞"}` : "Waiting…";
    hud.querySelector(".ef-hud-dwell").textContent = formatDuration(liveDwell);
    hud.querySelector(".ef-hud-count").textContent = `${completedCount} / ${cap || "∞"}`;
    hud.querySelector(".ef-hud-progress i").style.width = cap ? `${Math.min(100, completedCount / cap * 100)}%` : "0%";
    paintReviewButton();
  }
  function showCompletionModal(reason, report = session) {
    const reportStartedAt = sessionTimestamp(report);
    if (completionModal || !document.body || !sessionStartedAt || reportStartedAt !== sessionStartedAt || !Number.isFinite(Number(report?.endedAt)) || Number(report.endedAt) < sessionStartedAt) return;
    completionModal = document.createElement("div"); completionModal.id = "examfocus-completion-modal";
    const questions = Object.values(report?.questions || {});
    const right = questions.filter((question) => question.outcome === "Right").length;
    const wrong = questions.filter((question) => question.outcome === "Wrong").length;
    const attempted = right + wrong;
    const unattempted = questions.filter((question) => question.outcome !== "Right" && question.outcome !== "Wrong").length;
    const total = report?.mode === "countdown" ? (report.targetQuestions || questions.length) : questions.length;
    const accuracy = attempted ? `${Math.round(right / attempted * 100)}%` : "—";
    const duration = formatDuration(report?.durationMs || Math.max(0, Date.now() - reportStartedAt));
    const metrics = [["Total Questions", total], ["Attempted", attempted], ["Skipped / Unattempted", unattempted], ["Correct", right], ["Incorrect", wrong], ["Accuracy", accuracy], ["Total Time Taken", duration]];
    const cells = metrics.map(([label, value]) => `<div class="ef-modal-metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
    completionModal.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="ef-modal-title"><span class="ef-modal-eyebrow">SESSION COMPLETE</span><h2 id="ef-modal-title">${reason === "manual" ? "Session Summary" : "Exam Completed"}</h2><div class="ef-modal-grid">${cells}</div><div class="ef-modal-actions"><button class="ef-modal-exit" type="button">Exit</button><button class="ef-modal-details" type="button">View Details</button></div></section>`;
    safeAppendToBody(completionModal);
    completionModal.querySelector(".ef-modal-exit").addEventListener("click", () => {
      completionModal?.remove();
      document.getElementById("examfocus-completion-modal")?.remove();
      completionModal = null;
      completed = false;
      void send({ type: "END_EXAM" });
      stop();
    });
    completionModal.querySelector(".ef-modal-details").addEventListener("click", async () => {
      completionModal?.remove();
      document.getElementById("examfocus-completion-modal")?.remove();
      completionModal = null;
      completed = false;
      await send({ type: "OPEN_DASHBOARD", sessionId: report?.sessionId || session?.sessionId || report?.startedAt || session?.startedAt });
      stop();
    });
  }
  function queueScan(records = []) {
    if (!active || isMutating) return;
    rememberMutationRoots(records);
    if (scanInProgress) { scanAgain = true; return; }
    if (scanQueued) return;
    scanQueued = true;
    const delay = Math.max(0, 150 - (Date.now() - lastLiveScanAt));
    liveScanTimer = setTimeout(() => requestAnimationFrame(() => {
      scanQueued = false; liveScanTimer = 0; lastLiveScanAt = Date.now(); void scan();
    }), delay);
  }
  async function scan() {
    if (!active || isMutating || scanInProgress) return;
    scanInProgress = true;
    try {
      const found = findQuestionId();
      if (found && currentId && found.id === currentId && found.label && found.label !== currentLabel) {
        currentLabel = found.label;
        void recordQuestion(currentId, 0, undefined, { label: currentLabel }, currentUrl);
      }
      if (!found || (currentId && found.id === currentId)) {
        if (transitionTimer) clearTimeout(transitionTimer);
        transitionTimer = 0; transitionCandidate = null; transitionReadyId = null;
      }
      if (found && currentId && found.id !== currentId) {
        if (transitionCandidate !== found.id) {
          if (transitionTimer) clearTimeout(transitionTimer);
          transitionCandidate = found.id;
          transitionReadyId = null;
          transitionTimer = setTimeout(() => {
            transitionTimer = 0;
            transitionReadyId = transitionCandidate;
            queueScan();
          }, 100);
        }
      }
      const transitionAllowed = !currentId || found?.id === transitionReadyId;
      if (found && found.id !== currentId && transitionAllowed) {
        transitionCandidate = null; transitionReadyId = null;
        if (currentId) void snapshotCurrentQuestion()?.catch((error) => console.warn("Study Slash could not save the outgoing question", error));
        currentId = found.id;
        session.questionOrder ||= Object.keys(session.questions || {});
        if (!session.questionOrder.includes(currentId)) session.questionOrder.push(currentId);
        const previousQuestion = session.questions?.[currentId];
        const storedLabel = /^(?:Question\s+\d{1,4}|Q\.?\s*\d{1,4})$/i.test(previousQuestion?.label || "") ? previousQuestion.label : null;
        currentLabel = found.label || storedLabel || `Question ${session.questionOrder.indexOf(currentId) + 1}`;
        currentUrl = window.location.href; currentOutcome = previousQuestion?.outcome || null; selectedOption = null;
        questionInteracted = false; answerSubmitted = currentOutcome === "Right" || currentOutcome === "Wrong";
        relativeIndex = session.questionOrder.indexOf(currentId) + 1; enteredAt = Date.now(); lastTickAt = enteredAt; questionDwellMs = 0;
        // Register immediately so the popup and HUD count Question 1 without waiting for a transition.
        session.questions ||= {};
        session.questions[currentId] ||= { timeMs: 0, visits: 0, label: currentLabel };
        void recordQuestion(currentId, 0, undefined, { entered: true, label: currentLabel })
          .catch((error) => console.warn("Study Slash could not register the current question", error));
        if (pendingJump?.id === currentId) {
          const message = paletteModal?.querySelector(".ea-palette-message");
          if (message) message.textContent = `Question ${pendingJump.relativeNumber} loaded.`;
          pendingJump = null; removePalette();
        }
      }
      const roots = [...pendingMaskRoots]; pendingMaskRoots.clear();
      maskFeedback(roots);
      maskResultBanner(roots);
      const result = active && questionInteracted && Date.now() >= sessionStartedAt ? detectOutcome(roots) : null;
      if (result && result !== currentOutcome) {
        currentOutcome = result;
        answerSubmitted = true;
        session.outcomes ||= {};
        session.outcomes[currentId] = result;
        session.completedQuestionIds ||= [];
        if (!session.completedQuestionIds.includes(currentId)) session.completedQuestionIds.push(currentId);
        questionInteracted = true;
        void recordQuestion(currentId, 0, result, { completed: true });
      }
      ensureHud(); updateHud();
    } finally {
      scanInProgress = false;
      if (scanAgain) { scanAgain = false; queueScan(); }
    }
  }
  function start(data) {
    if (active) return;
    restoreInlineOverrides();
    completionModal?.remove();
    document.getElementById("examfocus-completion-modal")?.remove();
    completionModal = null;
    removeSubmitConfirm();
    removePalette();
    completed = false;
    document.querySelectorAll(".examfocus-solution-cta, .examfocus-hint-cta, .examfocus-solution-copy, .examfocus-result-copy, .examfocus-numeric-evaluation, .examfocus-selected-option, .examfocus-floating-feedback, .examfocus-community-solution, .examfocus-option-result-icon, .examfocus-you-marked")
      .forEach((el) => el.classList.remove("examfocus-solution-cta", "examfocus-hint-cta", "examfocus-solution-copy", "examfocus-result-copy", "examfocus-numeric-evaluation", "examfocus-selected-option", "examfocus-floating-feedback", "examfocus-community-solution", "examfocus-option-result-icon", "examfocus-you-marked"));
    clearNavigationMasks();
    stopSolutionHashWait();
    active = true;
    if (!tickTimer) tickTimer = setInterval(() => { void tick(); }, 1000);
    enableMaskStyles();
    session = data.examSession || {};
    session.reviewQuestionIds ||= [];
    sessionStartedAt = sessionTimestamp(session) || Date.now();
    currentId = null; currentLabel = null; currentUrl = null; questionInteracted = false; answerSubmitted = false; relativeIndex = 0; questionDwellMs = 0;
    observerRoot = document.querySelector("main, [role='main'], #MathJaxWrapper, .question-body") || document.documentElement;
    pendingMaskRoots.add(observerRoot || document);
    observer ||= new MutationObserver((records) => {
      // Ignore the injected HUD, whose live timer updates would otherwise schedule page scans.
      const pageRecords = records.filter((record) => {
        const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        return !target?.closest?.(`#${HUD_ID}`);
      });
      if (pageRecords.length) {
        const numericEvaluated = document.querySelector(".question-options__option_numeric[data-status='true'], .question-options__option_numeric[data-status='false']");
        if (active && (answerSubmitted || numericEvaluated)) inspectMarksOutcome();
        queueScan(pageRecords);
      }
    });
    if (observerRoot) observer.observe(observerRoot, observerOptions);
    queueScan();
  }
  async function tick() {
    if (!isExtensionValid()) { teardownOrphanedScript(); return; }
    if (!active || !currentId || completed) return;
    const now = Date.now(); const delta = Math.max(0, now - lastTickAt); lastTickAt = now; questionDwellMs += delta;
    try {
      await recordQuestion(currentId, delta);
      await send({ type: "SESSION_TICK" });
      const data = await chrome.storage.local.get("examSession");
      session = data?.examSession || session;
      updateHud();
    } catch (err) {
      if (/context invalidated/i.test(err?.message || "")) {
        teardownOrphanedScript();
        return;
      }
      console.warn("Study Slash sync warning:", err);
    }
  }
  function stop() {
    active = false; currentId = null; currentLabel = null; currentUrl = null; observer?.disconnect(); observerRoot = null;
    removeSubmitConfirm();
    removePalette();
    stopReattemptMode();
    completionModal?.remove();
    document.getElementById("examfocus-completion-modal")?.remove();
    completionModal = null;
    questionInteracted = false; answerSubmitted = false;
    if (transitionTimer) clearTimeout(transitionTimer);
    if (liveScanTimer) clearTimeout(liveScanTimer);
    liveScanTimer = 0; scanQueued = false;
    transitionTimer = 0; transitionCandidate = null; transitionReadyId = null;
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = 0;
    disableMaskStyles();
    restoreInlineOverrides();
    document.querySelectorAll(`.${MASK}`).forEach((el) => el.classList.remove(MASK));
    document.querySelectorAll(".examfocus-solution-cta, .examfocus-hint-cta, .examfocus-solution-copy, .examfocus-result-copy, .examfocus-numeric-evaluation, .examfocus-selected-option, .examfocus-floating-feedback, .examfocus-community-solution, .examfocus-option-result-icon, .examfocus-you-marked")
      .forEach((el) => el.classList.remove("examfocus-solution-cta", "examfocus-hint-cta", "examfocus-solution-copy", "examfocus-result-copy", "examfocus-numeric-evaluation", "examfocus-selected-option", "examfocus-floating-feedback", "examfocus-community-solution", "examfocus-option-result-icon", "examfocus-you-marked"));
    clearCustomOptionHighlights();
    document.getElementById(HUD_ID)?.remove();
    if (window.location.hostname.includes("getmarks.app")) {
      setTimeout(() => { if (!active && !isOrphaned) initMarksArenaHoverTile(); }, 300);
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExtensionValid()) { teardownOrphanedScript(); return false; }
    if (message?.type === "FLUSH_QUESTION") {
      flushCurrentQuestion().then(() => { sendResponse({ ok: true }); }, (error) => { sendResponse({ ok: false, error: error.message }); }); return true;
    }
    if (message?.type === "EXAM_COMPLETED") {
      const belongsToCurrentSession = sessionTimestamp(message.report) === sessionStartedAt;
      if (belongsToCurrentSession) {
        completed = true; active = false; observer?.disconnect();
        removeSubmitConfirm();
        removePalette();
        if (tickTimer) clearInterval(tickTimer); tickTimer = 0;
        showCompletionModal(message.reason, message.report);
        if (window.location.hostname.includes("getmarks.app")) setTimeout(() => initMarksArenaHoverTile(), 300);
      }
      sendResponse({ ok: belongsToCurrentSession });
    }
  });
  document.addEventListener("click", handleNextClick, true);
  document.addEventListener("click", handleOptionClick, true);
  document.addEventListener("input", handleMarksAnswerInput, true);
  document.addEventListener("change", handleMarksAnswerInput, true);
  document.addEventListener("keyup", handleMarksAnswerInput, true);
  document.addEventListener("click", (event) => {
    if (!reattemptActive || !(event.target instanceof Element)) return;
    if (event.target.closest(`#${REATTEMPT_HUD_ID}, #${REATTEMPT_CONFIRM_ID}`)) return;
    const option = event.target.closest('[data-option], [role="radio"], input[type="radio"], [class*="question-option" i], [class*="question-options" i] button');
    if (option) {
      reattemptSelectedOption = option;
      const label = option.getAttribute("data-option") || option.innerText?.trim()?.slice(0, 18) || "Option";
      const selEl = document.querySelector(`#${REATTEMPT_HUD_ID} .ea-reattempt-sel-val`);
      if (selEl) selEl.textContent = label;
    }
  }, true);

  let isTilePinned = false;
  let tileHoverTimer = null;
  let tileDragDistance = 0;
  let justFinishedDrag = false;

  const BADGE_SIZE = 56;
  const SCREEN_MARGIN = 8;

  let currentAnchorX = 24;
  let currentAnchorY = 75;
  let isDraggingActive = false;
  let pointerMovedDistance = 0;
  let dragStartX = 0, dragStartY = 0;
  let initialElemX = 0, initialElemY = 0;
  let launcherMountPending = false;
  let launcherObserver = null;

  function initMarksArenaHoverTile() {
    if (active || launcherMountPending || document.getElementById("ea-marks-hover-tile")) return;

    if (!isExtensionValid()) return;
    launcherMountPending = true;
    chrome.storage.local.get(
      ["exam-arena-cultivation-state", "examHistory", "examSession", "streakDays", "monthlyTargetPercent", "configuredSubjects", "examModeActive", "monthlyGoal"],
      (data) => {
        launcherMountPending = false;
        if (!isExtensionValid() || data?.examModeActive || active || document.getElementById("ea-marks-hover-tile")) return;

        const cultivation = CultivationStore.deriveProgressFromHistories(data?.examHistory, data?.dpp_history);

        const history = Array.isArray(data?.examHistory) ? data.examHistory : [];
        const computedStreak = calculateDashboardDailyStreak(history, data?.examSession);
        const computedMonthlyPct = calculateDashboardMonthlyTarget(history, data?.examSession, data?.monthlyGoal || 300);

        // Keep chrome.storage.local synchronized with the real-time streak and progress
        if (data?.streakDays !== computedStreak || typeof data?.monthlyTargetPercent !== "number") {
          chrome.storage.local.set({
            streakDays: computedStreak,
            monthlyTargetPercent: computedMonthlyPct
          }).catch(() => {});
        }

        const storageWithParity = {
          ...data,
          streakDays: computedStreak,
          monthlyTargetPercent: typeof data?.monthlyTargetPercent === "number" ? data.monthlyTargetPercent : computedMonthlyPct
        };

        renderMarksArenaHoverTile(cultivation, storageWithParity);
      }
    );
  }

  function deriveLevelFromTotalXp(totalXp) {
    const xp = Math.max(0, Number(totalXp) || 0);
    if (xp <= 0) return 1;
    const rawLevel = (-60 + Math.sqrt(3600 + 16 * xp)) / 8;
    return Math.min(199, Math.max(1, Math.floor(rawLevel)));
  }

  function localDayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function getQuestionEntries(session) {
    const questions = Object.entries(session?.questions || {}).sort(([, a], [, b]) => Number(a.firstSeenAt || 0) - Number(b.firstSeenAt || 0));
    const padding = (session?.targetPadding || []).map((item) => [item.questionId, { ...item, isPlaceholder: true }]);
    return [...questions, ...padding];
  }

  function statusOf(session, id, question) {
    if (question?.cultivationResolved) return "Right";
    const status = question?.outcome || session?.outcomes?.[id] || "Unattempted";
    if (question?.isPlaceholder || status === "Not Visited") return "Not Visited";
    return ["Right", "Wrong"].includes(status) ? status : "Unattempted";
  }

  function sessionStats(session) {
    const entries = getQuestionEntries(session);
    const visited = entries.filter(([id, question]) => statusOf(session, id, question) !== "Not Visited");
    let right = 0; let wrong = 0;
    for (const [id, question] of visited) {
      const status = statusOf(session, id, question);
      if (status === "Right") right += 1;
      if (status === "Wrong") wrong += 1;
    }
    const net = right * 4 - wrong;
    const marked = right + wrong;
    return {
      entries,
      visited,
      right,
      wrong,
      net,
      marked,
      rawAccuracy: marked ? right / marked * 100 : null,
      scorePercent: visited.length ? net / (visited.length * 4) * 100 : null
    };
  }

  function calculateDashboardDailyStreak(history, activeSession = null) {
    const sessions = Array.isArray(history) ? [...history] : [];
    if (activeSession) sessions.push({ ...activeSession, inProgress: true });

    const streakDays = new Set();
    sessions.forEach((session) => {
      const key = localDayKey(new Date(sessionTimestamp(session) || 0));
      if (sessionStats(session).visited.length) streakDays.add(key);
    });

    let streak = 0;
    const cursor = new Date();
    if (!streakDays.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (streakDays.has(localDayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function calculateMonthlyCultivatedTotal(examHistory, targetMonthKey) {
    const [year, month] = targetMonthKey.split("-").map(Number);
    const cultivatedSet = new Set();

    (Array.isArray(examHistory) ? examHistory : []).forEach((session) => {
      const sDate = new Date(sessionTimestamp(session));
      if (sDate.getFullYear() !== year || (sDate.getMonth() + 1) !== month) return;

      Object.entries(session.questions || {}).forEach(([qid, q]) => {
        if (q.outcome === "Right" || q.outcome === "Wrong") {
          cultivatedSet.add(`${session.sessionId || session.date || session.startedAt || session.timestamp}_${qid}`);
        }
      });

      (session.reattemptLedger || []).forEach((reattempt) => {
        const orig = session.questions?.[reattempt.questionId];
        if (orig && (orig.outcome === "Unattempted" || !orig.outcome)) {
          if (reattempt.outcome === "Right" || reattempt.outcome === "Wrong") {
            cultivatedSet.add(`${session.sessionId || session.date || session.startedAt || session.timestamp}_${reattempt.questionId}`);
          }
        }
      });
    });

    return cultivatedSet.size;
  }

  function calculateDashboardMonthlyTarget(history, activeSession = null, monthlyGoal = 300) {
    const sessions = Array.isArray(history) ? [...history] : [];
    if (activeSession) sessions.push({ ...activeSession, inProgress: true });
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const volume = calculateMonthlyCultivatedTotal(sessions, currentMonthKey);
    const target = Math.max(1, Number(monthlyGoal) || 300);
    return Math.min(100, Math.round(volume / target * 100));
  }

  // --- Official Study Slash Progressive Cultivation Realm System ---
  const CULTIVATION_REALMS_SPEC = [
    { name: "Elementary Profound", color: "#14b8a6", start: 1, end: 10 },
    { name: "Nascent Profound", color: "#06b6d4", start: 11, end: 20 },
    { name: "True Profound", color: "#38bdf8", start: 21, end: 30 },
    { name: "Spirit Profound", color: "#6366f1", start: 31, end: 40 },
    { name: "Earth Profound", color: "#8b5cf6", start: 41, end: 50 },
    { name: "Sky Profound", color: "#a855f7", start: 51, end: 60 },
    { name: "Emperor Profound", color: "#d946ef", start: 61, end: 70 },
    { name: "Tyrant Profound", color: "#ec4899", start: 71, end: 80 },
    { name: "Sovereign Profound", color: "#f43f5e", start: 81, end: 90 },
    { name: "Divine Origin", color: "#f59e0b", start: 91, end: 100 },
    { name: "Divine Soul", color: "#fbbf24", start: 101, end: 110 },
    { name: "Divine Tribulation", color: "#eab308", start: 111, end: 119 },
    { name: "Divine Spirit", color: "#facc15", start: 120, end: 129 },
    { name: "Divine King", color: "#fef08a", start: 130, end: 139 },
    { name: "Divine Sovereign", color: "#ffffff", start: 140, end: 149 },
    { name: "Divine Master", color: "#67e8f9", start: 150, end: 159 },
    { name: "Divine Extinction", color: "#c084fc", start: 160, end: 169 },
    { name: "True God", color: "#fb7185", start: 170, end: 179 },
    { name: "Creation God", color: "#34d399", start: 180, end: 189 },
    { name: "Ancestor God", color: "#ffd700", start: 190, end: 199 }
  ];
  const CULTIVATION_REALMS_CONFIG = CULTIVATION_REALMS_SPEC;

  function toRoman(num) {
    const romanMap = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let res = "";
    let n = Math.max(1, Math.min(10, Number(num) || 1));
    for (const [v, r] of romanMap) {
      while (n >= v) { res += r; n -= v; }
    }
    return res;
  }

  function getRealmMetadata(level = 1) {
    const boundedLevel = Math.max(1, Math.min(199, Math.floor(Number(level) || 1)));
    const realmIndex = CULTIVATION_REALMS_SPEC.findIndex(r => boundedLevel >= r.start && boundedLevel <= r.end);
    const safeIndex = realmIndex === -1 ? 0 : realmIndex;
    const realm = CULTIVATION_REALMS_SPEC[safeIndex];
    const insideLevel = (boundedLevel - realm.start) + 1;
    const romanTier = toRoman(insideLevel);
    return { boundedLevel, realm, realmIndex: safeIndex, insideLevel, romanTier };
  }
  function getCultivationDetails(level = 1) {
    return getRealmMetadata(level);
  }

  function renderAuthenticCultivationBadge(level = 1, size = 56) {
    const { boundedLevel, realm, realmIndex, insideLevel, romanTier } = getRealmMetadata(level);

    // Strategy A: Native CultivationVisuals Engine
    if (typeof window.CultivationVisuals !== "undefined" && typeof window.CultivationVisuals.renderCultivationBadge === "function") {
      const nativeSvg = window.CultivationVisuals.renderCultivationBadge(realmIndex, insideLevel, size);
      nativeSvg.classList.add("cultivation-emblem", `emblem-${realmIndex + 1}`);
      nativeSvg.setAttribute("width", String(size));
      nativeSvg.setAttribute("height", String(size));
      nativeSvg.setAttribute("viewBox", "0 0 100 100");
      if (nativeSvg.outerHTML) {
        return `
          <div class="ea-realm-badge-root" style="width:${size}px; height:${size}px;" title="Cultivation Level ${boundedLevel} (${realm.name} Realm · Tier ${romanTier})">
            <div class="ea-celestial-pulse-aura" style="background: radial-gradient(circle, ${realm.color || "#14b8a6"}66 0%, transparent 70%);"></div>
            ${nativeSvg.outerHTML}
          </div>
        `;
      }
      return nativeSvg.outerHTML;
    }

    // Strategy B: Standalone Hall of Cultivation Multi-Tier Geometry Fallback
    const color = realm.color;
    const filterId = `eaGlow_${boundedLevel}`;
    const metalGradId = `eaMetal_${boundedLevel}`;
    const coreGradId = `eaCore_${boundedLevel}`;

    // Multi-tier heraldic paths matching cultivation-visuals.js exactly
    const pathChevronShield = "M50 4 87 19 78 59 50 94 22 59 13 19z";
    const pathFlankWings = "m16 20-12-9 8 37 14 13zm68 0 12-9-8 37-14 13zM50 16 67 36 50 55 33 36z";
    const pathStruts = "m31 59 19 24 19-24";
    const pathCoreDiamond = "M50 32 65 41 65 59 50 68 35 59 35 41z";

    return `
      <div class="ea-realm-badge-root" style="width:${size}px; height:${size}px;" title="Cultivation Level ${boundedLevel} (${realm.name} Realm · Tier ${romanTier})">
        <div class="ea-celestial-pulse-aura" style="background: radial-gradient(circle, ${color}66 0%, transparent 70%);"></div>
        <svg viewBox="0 0 100 100" width="${size}" height="${size}" class="cultivation-emblem emblem-${realmIndex + 1}" role="img">
          <defs>
            <filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3.5" flood-color="${color}" flood-opacity="0.6"/>
            </filter>
            <linearGradient id="${metalGradId}" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${color}" />
              <stop offset="60%" stop-color="#0f2634" />
              <stop offset="100%" stop-color="#050e14" />
            </linearGradient>
            <linearGradient id="${coreGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#0b1722" />
              <stop offset="100%" stop-color="${color}33" />
            </linearGradient>
          </defs>
          <g filter="url(#${filterId})">
            <!-- Outer Heraldic Shield -->
            <path d="${pathChevronShield}" fill="url(#${metalGradId})" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"></path>
            <!-- Wing Crests & Chevrons -->
            <path d="${pathFlankWings}" fill="#0d9488" stroke="${color}" stroke-width="2" stroke-linejoin="round"></path>
            <!-- Accent Struts -->
            <path d="${pathStruts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"></path>
            <!-- Core Faceted Diamond Gem -->
            <path d="${pathCoreDiamond}" fill="url(#${coreGradId})" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"></path>
            <!-- Roman Numeral Tier Seal -->
            <text x="50" y="55" text-anchor="middle" fill="#f8fafc" font-size="${romanTier.length >= 3 ? 12 : 15}" font-weight="900" font-family="'JetBrains Mono', ui-monospace, monospace" letter-spacing="-0.04em">
              ${romanTier}
            </text>
          </g>
        </svg>
      </div>
    `;
  }

  function renderOfficialCultivationBadgeSvg(level = 1, size = 56) {
    return renderAuthenticCultivationBadge(level, size);
  }
  function getRealmBadgeSvg(level) {
    return renderAuthenticCultivationBadge(level, 56);
  }
  function getRealmNameForLevel(level) {
    return getRealmMetadata(level).realm.name;
  }

  // --- High-Precision Chapter Name Scraping ---
  function extractMarksChapterName() {
    // Priority 1: Top Navigation Breadcrumb (Question Solving Page)
    // Handles: "JEE Main >> Mathematics in Physics" and "JEE Main >> Basic of Mathematics"
    const allNodes = document.querySelectorAll("header, nav, div, span, p");
    for (const node of allNodes) {
      if (node.children.length > 2) continue; // Keep to leaf nodes
      const text = (node.innerText || node.textContent || "").trim();
      if (!text || text.length > 90) continue;

      // Detect >>, », ›, or > separators
      if (/(?:>>|»|›|>)/.test(text)) {
        const segments = text.split(/(?:>>|»|›|>)/);
        if (segments.length >= 2) {
          const candidate = segments[segments.length - 1].trim();
          // Disqualify generic UI buckets, statistics, or site descriptors
          if (
            candidate.length >= 2 &&
            !/^(questions?|beginner\s*qs|rank\s*booster|advanced|must\s*do|top\s*numerical|test\s*history|overview)$/i.test(candidate) &&
            !/marks\s*app/i.test(candidate)
          ) {
            return candidate;
          }
        }
      }
    }

    // Priority 2: Chapter Overview & Topic Header (Left Action Pane)
    // Handles: <svg> (fx icon) followed by bold "Mathematics in Physics"
    const overviewTitles = document.querySelectorAll("h1, h2, h3, [class*='title' i], [class*='header' i], div");
    for (const el of overviewTitles) {
      if (el.children.length > 1) continue;
      const val = (el.innerText || el.textContent || "").trim();
      if (!val || val.length > 60 || val.length < 3) continue;

      // Must be preceded or followed by a Marks context string like "JEE Main » 2026: 3 Qs"
      const parentContainer = el.closest("section, div, aside");
      if (parentContainer) {
        const containerText = (parentContainer.innerText || "").trim();
        if (/(?:jee\s*main|jee\s*adv|neet|cbse)\s*(?:»|>>|›|:)/i.test(containerText)) {
          if (!/^(overview|all\s*pyqs|bookmarks|my\s*mistakes|test\s*history|beginner\s*qs)$/i.test(val)) {
            return val;
          }
        }
      }
    }

    // Priority 3: Specific Sub-Header Pattern under Bucket Headers
    const subtitleNodes = document.querySelectorAll("p, span, div");
    for (const el of subtitleNodes) {
      if (el.children.length > 0) continue;
      const text = (el.innerText || el.textContent || "").trim();
      const match = text.match(/(?:jee\s*main|jee\s*adv|neet|cbse)\s*(?:»|>>|›)\s*(.+)/i);
      if (match && match[1]) {
        const cleaned = match[1].replace(/\s*\d{4}:.*$/i, "").trim(); // Strip year metrics
        if (cleaned.length >= 3 && !/^(questions?|beginner)/i.test(cleaned)) {
          return cleaned;
        }
      }
    }

    // Priority 4: Clean Document Title Fallback
    const docTitle = document.title
      .replace(/MARKS\s*App.*$/i, "")
      .replace(/[-|]\s*IIT\s*JEE.*$/i, "")
      .replace(/[-|]\s*NEET.*$/i, "")
      .trim();

    return (docTitle.length > 2) ? docTitle : "Chapter Practice";
  }

  // Auto-select corresponding subject based on chapter name
  function detectMarksSubject(chapterName, configuredSubjects = []) {
    const combined = `${chapterName} ${document.title} ${window.location.pathname}`.toLowerCase();

    const rules = [
      { subject: "Physics", tokens: ["physics", "fluids", "mechanics", "kinematics", "shm", "optics", "thermodynamics", "rotation", "electrostatics", "magnetism", "gravity", "units", "dimensions", "motion", "work", "power", "energy"] },
      { subject: "Mathematics", tokens: ["mathematics", "math", "calculus", "algebra", "vectors", "matrices", "integration", "differentiation", "trigonometry", "basic of mathematics", "probability", "coordinate", "geometry"] },
      { subject: "Chemistry", tokens: ["chemistry", "organic", "inorganic", "haloalkane", "hydrocarbon", "equilibrium", "bonding", "coordination", "redox", "atomic", "solutions", "kinetics", "p-block", "d-block"] },
      { subject: "Biology", tokens: ["biology", "botany", "zoology", "genetics", "cell", "human physiology", "plant", "ecology", "reproduction", "biotechnology"] }
    ];

    for (const rule of rules) {
      if (rule.tokens.some((token) => combined.includes(token))) {
        const match = configuredSubjects.find((s) => s.toLowerCase() === rule.subject.toLowerCase());
        if (match) return match;
      }
    }

    return configuredSubjects[0] || "Physics";
  }

  async function openMarksSessionSetupModal() {
    document.getElementById("ea-marks-setup-modal")?.remove();

    // Retrieve user configured subjects from storage
    const storage = await new Promise((resolve) => {
      chrome.storage.local.get("configuredSubjects", resolve);
    });
    const configuredSubjects = Array.isArray(storage?.configuredSubjects) && storage.configuredSubjects.length
      ? storage.configuredSubjects
      : ["Physics", "Chemistry", "Mathematics", "Biology"];

    const detectedChapter = extractMarksChapterName();
    const detectedSubject = detectMarksSubject(detectedChapter, configuredSubjects);

    const modal = document.createElement("div");
    modal.id = "ea-marks-setup-modal";
    modal.className = "ea-modal-backdrop";
    modal.innerHTML = `
      <div class="ea-setup-dialog" role="dialog" aria-modal="true">
        <div class="ea-setup-head">
          <div>
            <span class="ea-pill-tag">⚡ FOCUS MODE IGNITION</span>
            <h2>Session Configuration</h2>
          </div>
          <button id="closeMarksSetupModalBtn" class="ea-btn-subtle" type="button">✕</button>
        </div>

        <div class="ea-setup-form">
          <!-- 1. Auto-detected Chapter Name -->
          <div class="ea-setup-field">
            <label for="eaSetupSessionName">Session / Chapter Name</label>
            <input type="text" id="eaSetupSessionName" value="${detectedChapter}" placeholder="e.g. Rotational Motion" />
          </div>

          <!-- 2. Subject & Infinite Target Questions -->
          <div class="ea-setup-grid-2">
            <div class="ea-setup-field">
              <label for="eaSetupSubject">Subject</label>
              <div class="subject-select-wrap">
                <select id="eaSetupSubject">
                  ${configuredSubjects.map((s) => `<option value="${s}" ${s === detectedSubject ? "selected" : ""}>${s}</option>`).join("")}
                  <option value="__ADD_NEW__">＋ Add New Subject...</option>
                </select>
              </div>

              <!-- Inline Add New Subject Form (Hidden until chosen) -->
              <div id="eaNewSubjectInline" class="new-subject-inline" hidden>
                <input type="text" id="eaNewSubjectInput" placeholder="Subject name..." />
                <button id="eaSaveSubjectBtn" type="button" class="ea-btn-sm-teal">Save</button>
                <button id="eaCancelSubjectBtn" type="button" class="ea-btn-sm-ghost">✕</button>
              </div>
            </div>

            <div class="ea-setup-field">
              <label for="eaSetupTargetQ">Target Questions</label>
              <input type="number" id="eaSetupTargetQ" value="" placeholder="No target (Infinite)" min="1" max="300" />
              <span class="field-hint">Leave blank for untargeted practice</span>
            </div>
          </div>

          <!-- 3. Redesigned Practice Mode Segmented Cards -->
          <div class="ea-setup-field">
            <label>Practice Mode</label>
            <div class="ea-practice-mode-grid">
              <div class="mode-card active" data-mode="stopwatch">
                <div class="mode-card-header">
                  <span class="mode-icon">⏱️</span>
                  <span class="mode-title">Open Stopwatch</span>
                  <span class="mode-badge">Untimed</span>
                </div>
                <p class="mode-desc">Live dwell tracking per question without time limits. Practice at your own pace.</p>
              </div>

              <div class="mode-card" data-mode="countdown">
                <div class="mode-card-header">
                  <span class="mode-icon">⏳</span>
                  <span class="mode-title">Countdown Timer</span>
                  <span class="mode-badge">Strict CBT</span>
                </div>
                <p class="mode-desc">Fixed exam countdown. Builds realistic time pressure and speed reflexes.</p>
              </div>
            </div>
          </div>

          <!-- 4. Dynamic Countdown Group -->
          <div class="ea-setup-field" id="eaSetupCountdownGroup" hidden>
            <label for="eaSetupMinutes">Allotted Time (Minutes)</label>
            <input type="number" id="eaSetupMinutes" value="45" min="5" max="360" step="5" />
          </div>

          <!-- Actions -->
          <div class="ea-setup-actions">
            <button id="cancelMarksSetupBtn" class="ea-btn-secondary" type="button">Cancel</button>
            <button id="igniteMarksSessionBtn" class="ea-btn-ignite" type="button">
              <span class="btn-icon">⚔️</span> Ignite Focus Session
            </button>
          </div>
        </div>
      </div>
    `;

    safeAppendToBody(modal);

    // --- Dynamic Subject Addition Handlers ---
    const subjectSelect = modal.querySelector("#eaSetupSubject");
    const newSubjectBox = modal.querySelector("#eaNewSubjectInline");
    const newSubjectInput = modal.querySelector("#eaNewSubjectInput");
    const saveSubjectBtn = modal.querySelector("#eaSaveSubjectBtn");
    const cancelSubjectBtn = modal.querySelector("#eaCancelSubjectBtn");

    subjectSelect.addEventListener("change", () => {
      if (subjectSelect.value === "__ADD_NEW__") {
        newSubjectBox.hidden = false;
        newSubjectInput.focus();
      } else {
        newSubjectBox.hidden = true;
      }
    });

    saveSubjectBtn.addEventListener("click", async () => {
      const name = newSubjectInput.value.trim();
      if (!name) return;
      if (!configuredSubjects.includes(name)) {
        configuredSubjects.push(name);
        await chrome.storage.local.set({ configuredSubjects });

        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        opt.selected = true;
        subjectSelect.insertBefore(opt, subjectSelect.querySelector("option[value='__ADD_NEW__']"));
      }
      newSubjectBox.hidden = true;
      newSubjectInput.value = "";
    });

    cancelSubjectBtn.addEventListener("click", () => {
      newSubjectBox.hidden = true;
      subjectSelect.value = configuredSubjects[0] || "Physics";
    });

    // --- Practice Mode Card Selection ---
    let selectedMode = "stopwatch";
    const modeCards = modal.querySelectorAll(".mode-card");
    const countdownGroup = modal.querySelector("#eaSetupCountdownGroup");

    modeCards.forEach((card) => {
      card.addEventListener("click", () => {
        modeCards.forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        selectedMode = card.dataset.mode;
        countdownGroup.hidden = selectedMode !== "countdown";
      });
    });

    // Close handlers
    modal.querySelector("#closeMarksSetupModalBtn").onclick = () => modal.remove();
    modal.querySelector("#cancelMarksSetupBtn").onclick = () => modal.remove();
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });

    // Ignite Session
    modal.querySelector("#igniteMarksSessionBtn").onclick = () => {
      if (!isExtensionValid()) return;
      const examName = modal.querySelector("#eaSetupSessionName").value.trim() || detectedChapter;
      const subject = subjectSelect.value === "__ADD_NEW__" ? (configuredSubjects[0] || "Physics") : subjectSelect.value;
      const targetQRaw = modal.querySelector("#eaSetupTargetQ").value.trim();
      const targetQuestions = targetQRaw ? (parseInt(targetQRaw, 10) || null) : null;
      const minutes = parseInt(modal.querySelector("#eaSetupMinutes").value, 10) || 45;

      chrome.runtime.sendMessage({
        type: "START_SESSION",
        config: {
          examName,
          subject,
          mode: selectedMode,
          allottedTimeMs: selectedMode === "countdown" ? minutes * 60000 : null,
          allottedMinutes: minutes,
          targetQuestions,
          source: "marks",
          testUrl: window.location.href
        }
      }, () => {
        modal.remove();
        document.getElementById("ea-marks-hover-tile")?.remove();
      });
    };
  }

  function renderMarksArenaHoverTile(cultivation, storageData) {
    if (document.getElementById("ea-marks-hover-tile")) return;

    // Default to MINIMIZED state
    const isMinimized = localStorage.getItem("ea-tile-minimized") !== "false";
    const level = cultivation.level || 1;
    const { realm, romanTier } = getCultivationDetails(level);
    const totalXp = Math.max(0, Number(cultivation.total_xp ?? cultivation.xp) || 0);
    const streak = typeof storageData?.streakDays === "number" ? storageData.streakDays : 0;
    const monthlyPct = typeof storageData?.monthlyTargetPercent === "number" ? storageData.monthlyTargetPercent : 0;

    const tile = document.createElement("div");
    tile.id = "ea-marks-hover-tile";
    tile.className = `ea-marks-tile ${isMinimized ? "minimized" : ""}`;
    tile.innerHTML = `
      <!-- Minimized State: Authentic Progressive Cultivation Realm Crest -->
      <div class="ea-tile-minimized-badge" id="eaTileBadgeHandle">
        ${renderOfficialCultivationBadgeSvg(level, 56)}
      </div>

      <!-- Expanded State Header -->
      <div class="ea-tile-header" id="eaTileHeaderHandle">
        <div class="ea-tile-brand">
          <span class="ea-brand-dot"></span>
          <img class="ea-brand-logo" src="${chrome.runtime.getURL("assets/study-slash-icon-32.png")}" alt="">
          <span class="ea-brand-title">STUDY SLASH</span>
        </div>
        <div class="ea-tile-quick-meta">
          <span class="ea-meta-chip" id="eaTileStreakChip" title="Daily Practice Streak">🔥 ${streak}d</span>
          <span class="ea-meta-chip" id="eaTileMonthlyChip" title="Monthly Goal Progress">🎯 ${monthlyPct}%</span>
        </div>
        <button id="eaTileMinimizeBtn" class="ea-tile-btn-toggle" title="Minimize to Cultivation Badge">–</button>
      </div>

      <!-- Expanded State Body -->
      <div class="ea-tile-body">
        <div class="ea-tile-cultivation">
          <div class="ea-cultivation-head">
            <span class="ea-realm-badge">LVL ${level} · TIER ${romanTier}</span>
            <span class="ea-cultivation-label">Cultivation Level</span>
          </div>
          <div class="ea-realm-title">${realm.name} Realm</div>
          <div class="ea-tile-xp-meta">
            <span id="eaTileXpVal">${totalXp.toLocaleString()} XP</span>
            <span id="eaTileDebtVal">${cultivation.current_debt > 0 
              ? `<span class="debt-warning">⚠️ Debt: -${cultivation.current_debt}</span>` 
              : `<span class="clean-flow">🟢 Unhindered</span>`}</span>
          </div>
        </div>

        <div class="ea-tile-actions">
          <button id="eaTileStartSessionBtn" class="ea-tile-act-primary" type="button">
            ⚡ Start Focus Session
          </button>
          <button id="eaTileOpenDashboardBtn" class="ea-tile-act-secondary" type="button">
            📊 Open Dashboard ↗
          </button>
        </div>
      </div>
    `;

    whenBodyReady(() => {
      if (!document.getElementById("ea-marks-hover-tile")) {
        safeAppendToBody(tile);
      }
    });

    // --- Hover Expand & Contract Mechanics ---
    tile.addEventListener("mouseenter", () => {
      if (!isTilePinned && tile.classList.contains("minimized")) {
        clearTimeout(tileHoverTimer);
        tile.classList.remove("minimized");
      }
    });

    tile.addEventListener("mouseleave", () => {
      if (!isTilePinned && !tile.classList.contains("minimized")) {
        tileHoverTimer = setTimeout(() => {
          if (!isTilePinned) {
            tile.classList.add("minimized");
            localStorage.setItem("ea-tile-minimized", "true");
          }
        }, 280);
      }
    });

    // --- Click to Pin / Unpin with Drag Suppression ---
    const badgeHandle = tile.querySelector("#eaTileBadgeHandle");
    badgeHandle.addEventListener("click", (e) => {
      if (justFinishedDrag) return; // Prevent accidental expansion on drag release
      e.stopPropagation();
      tile.classList.remove("minimized");
      isTilePinned = true;
      localStorage.setItem("ea-tile-minimized", "false");
    });

    tile.querySelector("#eaTileMinimizeBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      isTilePinned = false;
      tile.classList.add("minimized");
      localStorage.setItem("ea-tile-minimized", "true");
    });

    // --- Outside Click to Contract ---
    document.addEventListener("pointerdown", (e) => {
      if (!tile.contains(e.target) && !document.getElementById("ea-marks-setup-modal")?.contains(e.target)) {
        if (!tile.classList.contains("minimized")) {
          isTilePinned = false;
          tile.classList.add("minimized");
          localStorage.setItem("ea-tile-minimized", "true");
        }
      }
    });

    // --- Modal & Dashboard Navigation ---
    tile.querySelector("#eaTileStartSessionBtn").onclick = () => openMarksSessionSetupModal();
    tile.querySelector("#eaTileOpenDashboardBtn").onclick = () => {
      if (!isExtensionValid()) return;
      chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    };

    // Attach 2D Draggable with threshold suppression and 4-quadrant adaptation
    makeTileDraggableEverywhere(tile, badgeHandle);
    makeTileDraggableEverywhere(tile, tile.querySelector("#eaTileHeaderHandle"));
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function applyAdaptiveQuadrantPosition(tile, anchorX, anchorY) {
    if (!tile) return;
    const midX = window.innerWidth / 2;
    const midY = window.innerHeight / 2;

    const isRightQuadrant = (anchorX + BADGE_SIZE / 2) > midX;
    const isBottomQuadrant = (anchorY + BADGE_SIZE / 2) > midY;

    // Clear previous quadrant classes
    tile.classList.remove("quadrant-tl", "quadrant-tr", "quadrant-bl", "quadrant-br");

    if (isBottomQuadrant && isRightQuadrant) {
      // Quadrant 4: Bottom-Right -> Open UP and LEFT
      tile.classList.add("quadrant-br");
      const rightOffset = window.innerWidth - (anchorX + BADGE_SIZE);
      const bottomOffset = window.innerHeight - (anchorY + BADGE_SIZE);
      tile.style.setProperty("right", `${Math.max(SCREEN_MARGIN, rightOffset)}px`, "important");
      tile.style.setProperty("bottom", `${Math.max(SCREEN_MARGIN, bottomOffset)}px`, "important");
      tile.style.setProperty("left", "auto", "important");
      tile.style.setProperty("top", "auto", "important");
    } else if (isBottomQuadrant && !isRightQuadrant) {
      // Quadrant 3: Bottom-Left -> Open UP and RIGHT
      tile.classList.add("quadrant-bl");
      const bottomOffset = window.innerHeight - (anchorY + BADGE_SIZE);
      tile.style.setProperty("left", `${Math.max(SCREEN_MARGIN, anchorX)}px`, "important");
      tile.style.setProperty("bottom", `${Math.max(SCREEN_MARGIN, bottomOffset)}px`, "important");
      tile.style.setProperty("right", "auto", "important");
      tile.style.setProperty("top", "auto", "important");
    } else if (!isBottomQuadrant && isRightQuadrant) {
      // Quadrant 1: Top-Right -> Open DOWN and LEFT
      tile.classList.add("quadrant-tr");
      const rightOffset = window.innerWidth - (anchorX + BADGE_SIZE);
      tile.style.setProperty("right", `${Math.max(SCREEN_MARGIN, rightOffset)}px`, "important");
      tile.style.setProperty("top", `${Math.max(SCREEN_MARGIN, anchorY)}px`, "important");
      tile.style.setProperty("left", "auto", "important");
      tile.style.setProperty("bottom", "auto", "important");
    } else {
      // Quadrant 2: Top-Left -> Open DOWN and RIGHT
      tile.classList.add("quadrant-tl");
      tile.style.setProperty("left", `${Math.max(SCREEN_MARGIN, anchorX)}px`, "important");
      tile.style.setProperty("top", `${Math.max(SCREEN_MARGIN, anchorY)}px`, "important");
      tile.style.setProperty("right", "auto", "important");
      tile.style.setProperty("bottom", "auto", "important");
    }
  }

  function makeTileDraggableEverywhere(tile, handle) {
    if (!tile || !handle) return;

    const forceStopDragging = (pointerId) => {
      const moved = pointerMovedDistance > 6;
      isDraggingActive = false;
      try { tile.classList.remove("ea-is-dragging"); } catch (_) {}

      if (pointerId !== undefined) {
        try {
          if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
        } catch (_) {}
      }

      if (moved) {
        justFinishedDrag = true;
        setTimeout(() => { justFinishedDrag = false; }, 180);
      }

      try {
        localStorage.setItem("ea-tile-anchor-x", String(Math.round(currentAnchorX)));
        localStorage.setItem("ea-tile-anchor-y", String(Math.round(currentAnchorY)));
        applyAdaptiveQuadrantPosition(tile, currentAnchorX, currentAnchorY);
      } catch (err) {
        console.warn("[Study Slash] Could not persist the launcher position:", err);
      }
    };

    // Restore saved coordinates
    if (!tile.dataset.anchorInitialized) {
      tile.dataset.anchorInitialized = "true";
      const savedX = parseInt(localStorage.getItem("ea-tile-anchor-x"), 10);
      const savedY = parseInt(localStorage.getItem("ea-tile-anchor-y"), 10);
      if (!isNaN(savedX) && !isNaN(savedY)) {
        currentAnchorX = clamp(savedX, SCREEN_MARGIN, window.innerWidth - BADGE_SIZE - SCREEN_MARGIN);
        currentAnchorY = clamp(savedY, SCREEN_MARGIN, window.innerHeight - BADGE_SIZE - SCREEN_MARGIN);
      } else {
        currentAnchorX = window.innerWidth - BADGE_SIZE - 24;
        currentAnchorY = 75;
      }
      applyAdaptiveQuadrantPosition(tile, currentAnchorX, currentAnchorY);

      window.addEventListener("resize", () => {
        if (!tile || isDraggingActive) return;
        const maxBoundX = Math.max(SCREEN_MARGIN, window.innerWidth - BADGE_SIZE - SCREEN_MARGIN);
        const maxBoundY = Math.max(SCREEN_MARGIN, window.innerHeight - BADGE_SIZE - SCREEN_MARGIN);
        currentAnchorX = clamp(currentAnchorX, SCREEN_MARGIN, maxBoundX);
        currentAnchorY = clamp(currentAnchorY, SCREEN_MARGIN, maxBoundY);
        applyAdaptiveQuadrantPosition(tile, currentAnchorX, currentAnchorY);
      });
    }

    handle.addEventListener("pointerdown", (e) => {
      if (!(e.target instanceof Element) || e.target.closest("button, select, input")) return;

      isDraggingActive = true;
      pointerMovedDistance = 0;
      tileDragDistance = 0;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const wasExpanded = !tile.classList.contains("minimized");
      // MANDATORY: Force minimized badge presentation during active drag
      tile.classList.add("minimized", "ea-is-dragging");
      isTilePinned = false;

      if (wasExpanded) {
        initialElemX = currentAnchorX;
        initialElemY = currentAnchorY;
      } else {
        const rect = tile.getBoundingClientRect();
        initialElemX = rect.left;
        initialElemY = rect.top;
        currentAnchorX = rect.left;
        currentAnchorY = rect.top;
      }

      // Apply direct coordinates to the badge while dragging
      tile.style.setProperty("left", `${currentAnchorX}px`, "important");
      tile.style.setProperty("top", `${currentAnchorY}px`, "important");
      tile.style.setProperty("right", "auto", "important");
      tile.style.setProperty("bottom", "auto", "important");

      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });

    window.addEventListener("pointermove", (e) => {
      if (!isDraggingActive) return;

      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      pointerMovedDistance = Math.hypot(dx, dy);
      tileDragDistance = pointerMovedDistance;

      // True 4-corner clamping: allow reaching 8px from any edge
      const maxBoundX = window.innerWidth - BADGE_SIZE - SCREEN_MARGIN;
      const maxBoundY = window.innerHeight - BADGE_SIZE - SCREEN_MARGIN;

      currentAnchorX = clamp(initialElemX + dx, SCREEN_MARGIN, maxBoundX);
      currentAnchorY = clamp(initialElemY + dy, SCREEN_MARGIN, maxBoundY);

      // Apply direct coordinates to the badge while dragging
      tile.style.setProperty("left", `${currentAnchorX}px`, "important");
      tile.style.setProperty("top", `${currentAnchorY}px`, "important");
      tile.style.setProperty("right", "auto", "important");
      tile.style.setProperty("bottom", "auto", "important");
    });

    const onDragEnd = (e) => {
      if (!isDraggingActive) return;
      forceStopDragging(e?.pointerId);
    };

    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
    handle.addEventListener("lostpointercapture", () => {
      if (isDraggingActive) forceStopDragging();
    });
    window.addEventListener("blur", () => {
      if (isDraggingActive) forceStopDragging();
    });
    window.addEventListener("mouseup", () => {
      if (isDraggingActive) forceStopDragging();
    });
    window.addEventListener("touchend", () => {
      if (isDraggingActive) forceStopDragging();
    }, { passive: true });
  }

  const makeTileDraggableWithThreshold = makeTileDraggableEverywhere;

  function updateMarksHoverTileMetrics(data) {
    const tile = document.getElementById("ea-marks-hover-tile");
    if (!tile) return;

    if (data.streakDays !== undefined) {
      const streakEl = document.getElementById("eaTileStreakChip");
      if (streakEl) streakEl.textContent = `🔥 ${Number(data.streakDays) || 0}d`;
    }
    if (data.monthlyTargetPercent !== undefined) {
      const monthlyEl = document.getElementById("eaTileMonthlyChip");
      if (monthlyEl) monthlyEl.textContent = `🎯 ${Number(data.monthlyTargetPercent) || 0}%`;
    }
    if (data["exam-arena-cultivation-state"]) {
      const cultivation = data["exam-arena-cultivation-state"];
      const level = cultivation.level || 1;
      const { realm, romanTier } = getCultivationDetails(level);
      const totalXp = Math.max(0, Number(cultivation.total_xp ?? cultivation.xp) || 0);

      const realmBadge = tile.querySelector(".ea-realm-badge");
      if (realmBadge) realmBadge.textContent = `LVL ${level} · TIER ${romanTier}`;

      const realmTitle = tile.querySelector(".ea-realm-title");
      if (realmTitle) realmTitle.textContent = `${realm.name} Realm`;

      const xpSpan = document.getElementById("eaTileXpVal") || tile.querySelector(".ea-tile-xp-meta span:first-child");
      if (xpSpan) xpSpan.textContent = `${totalXp.toLocaleString()} XP`;

      const debtSpan = document.getElementById("eaTileDebtVal") || tile.querySelector(".ea-tile-xp-meta span:last-child");
      if (debtSpan) {
        debtSpan.innerHTML = cultivation.current_debt > 0 
          ? `<span class="debt-warning">⚠️ Debt: -${cultivation.current_debt}</span>` 
          : `<span class="clean-flow">🟢 Unhindered</span>`;
      }

      const badgeHandle = document.getElementById("eaTileBadgeHandle");
      if (badgeHandle) {
        badgeHandle.innerHTML = renderOfficialCultivationBadgeSvg(level, 56);
      }
    }
  }

  if (typeof window !== "undefined") {
    window.calculateDashboardDailyStreak = calculateDashboardDailyStreak;
    window.calculateDashboardMonthlyTarget = calculateDashboardMonthlyTarget;
  }

  if (isExtensionValid()) {
    chrome.storage.local.get(["examModeActive", "examSession"], (data) => {
      if (!isExtensionValid()) return;
      if (data?.examModeActive) {
        document.getElementById("ea-marks-hover-tile")?.remove();
        start(data);
      } else {
        void checkAndLaunchConceptSession();
        if (window.location.hostname.includes("getmarks.app")) {
          initMarksArenaHoverTile();
        }
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area && area !== "local") return;
      if (!isExtensionValid()) { teardownOrphanedScript(); return; }
      if (changes.examModeActive?.newValue) {
        document.getElementById("ea-marks-hover-tile")?.remove();
        chrome.storage.local.get(["examSession"], (data) => start(data));
      }
      if (changes.examModeActive?.newValue === false && !active) {
        void checkAndLaunchConceptSession();
        if (window.location.hostname.includes("getmarks.app")) {
          initMarksArenaHoverTile();
        }
      }
      if (changes.examModeActive?.newValue === false && active) {
        // Accept a storage transition only when its report belongs to this active run.
        const report = changes.lastReport?.newValue;
        if (report && sessionTimestamp(report) === sessionStartedAt && Number(report.endedAt) >= sessionStartedAt) {
          completed = true; active = false; observer?.disconnect();
          removeSubmitConfirm();
          removePalette();
          if (tickTimer) clearInterval(tickTimer); tickTimer = 0;
          showCompletionModal(report.endedReason, report);
          if (window.location.hostname.includes("getmarks.app")) setTimeout(() => initMarksArenaHoverTile(), 300);
        }
      }
      if (changes.examSession?.newValue) {
        const paletteChanged = paletteStateKey(session) !== paletteStateKey(changes.examSession.newValue);
        session = changes.examSession.newValue;
        updateHud();
        if (paletteChanged) renderPaletteGrid();
      }
      // Live-update hover tile metrics
      if (changes.streakDays || changes.monthlyTargetPercent || changes["exam-arena-cultivation-state"]) {
        updateMarksHoverTileMetrics({
          streakDays: changes.streakDays?.newValue,
          monthlyTargetPercent: changes.monthlyTargetPercent?.newValue,
          "exam-arena-cultivation-state": changes["exam-arena-cultivation-state"]?.newValue
        });
      }
      if (changes.examHistory && !changes.streakDays) {
        const history = Array.isArray(changes.examHistory.newValue) ? changes.examHistory.newValue : [];
        chrome.storage.local.get(["examSession", "monthlyGoal"], (s) => {
          const streak = calculateDashboardDailyStreak(history, s?.examSession);
          const monthlyPct = calculateDashboardMonthlyTarget(history, s?.examSession, s?.monthlyGoal || 300);
          updateMarksHoverTileMetrics({
            streakDays: streak,
            monthlyTargetPercent: monthlyPct
          });
          chrome.storage.local.set({ streakDays: streak, monthlyTargetPercent: monthlyPct }).catch(() => {});
        });
      }
    });
  }
  if (window.location.hostname.includes("getmarks.app") && typeof MutationObserver !== "undefined" && document.documentElement) {
    launcherObserver = new MutationObserver(() => {
      if (!active && !isOrphaned && !document.getElementById("ea-marks-hover-tile")) initMarksArenaHoverTile();
    });
    launcherObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && paletteModal) removePalette(); });
  observeHistoryIntentChanges();
  window.addEventListener("popstate", () => { void checkAndLaunchConceptSession(); });
  window.addEventListener("hashchange", () => { void checkAndLaunchConceptSession(); });
  window.addEventListener("pagehide", stopSolutionHashWait, { once: true });
  window.addEventListener("pagehide", () => {
    if (active && currentId) void flushCurrentQuestion().catch(() => {});
  });
  void (async () => {
    if (!window.location.hostname.includes("getmarks.app")) return;
    await ensureBodyReady();
    if (!isExtensionValid()) return;
    void checkAndInitReattemptMode();
    maybeOpenSolutionFromHash();
    if (!active) initMarksArenaHoverTile();
  })();
})();

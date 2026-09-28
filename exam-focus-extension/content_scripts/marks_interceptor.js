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
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
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
  function safeMount(element) {
    if (!element) return;
    const existing = element.id ? document.getElementById(element.id) : null;
    if (existing && existing !== element) existing.remove();
    if (document.body) {
      document.body.append(element);
    } else if (document.documentElement) {
      document.documentElement.append(element);
      document.addEventListener("DOMContentLoaded", () => {
        if (document.body && element.isConnected && element.parentElement !== document.body) document.body.append(element);
      }, { once: true });
    } else {
      whenBodyReady(() => document.body?.append(element));
    }
  }

  function teardownOrphanedScript() {
    if (isOrphaned) return;
    isOrphaned = true;
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
    try { solutionWaitObserver?.disconnect(); } catch (_) {}
    try { conceptObserver?.disconnect(); } catch (_) {}

    // Remove injected floating HUD and modals to prevent further user actions on dead context
    try {
      document.getElementById(HUD_ID)?.remove();
      document.getElementById("examarena-palette-modal")?.remove();
      document.getElementById("examarena-submit-confirm-modal")?.remove();
      document.getElementById(REATTEMPT_HUD_ID)?.remove();
      document.getElementById(REATTEMPT_CONFIRM_ID)?.remove();
      document.getElementById(REATTEMPT_TOAST_ID)?.remove();
      document.getElementById("ea-concept-answer-prompt")?.remove();
    } catch (_) {}
  }

  // Only explicit solution nodes and result banners may receive the broad mask class.
  const solutionSelector = ".question-solution, [class*='question-solution']";
  const chipSelector = "div[class*='absolute'][class*='items-center']";
  const solutionActionText = /show\s+(?:the\s+)?(?:solution|correct\s+answer)|marks\s+solution|solutions\s+by\s+others|view\s+(?:the\s+)?explanation/i;
  const hintActionText = /view\s+hint/i;

  function send(payload) {
    if (!isExtensionValid()) {
      teardownOrphanedScript();
      return Promise.reject(new Error("Extension context invalidated"));
    }

    const message = typeof payload === "string" ? { type: payload } : payload;

    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const error = chrome.runtime.lastError;
          if (error) {
            if (/context invalidated|invoked a callback on a discarded/i.test(error.message)) {
              teardownOrphanedScript();
            }
            reject(error);
          } else if (response?.ok === false) {
            reject(new Error(response.error || "Request failed"));
          } else {
            resolve(response);
          }
        });
      } catch (err) {
        if (/context invalidated/i.test(err.message)) {
          teardownOrphanedScript();
        }
        reject(err);
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
    document.body.appendChild(submitConfirmModal);
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
    const raw = value?.startedAt;
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
  function neutralizeOptionCards(root) {
    if (!active) return;
    for (const card of matchingNodes(root, '.question-options__option, [class*="question-options__option"]')) {
      const isSelected = isOptionCardSelected(card);
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
    group.querySelectorAll(".examfocus-selected-option").forEach((el) => {
      if (el !== card) el.classList.remove("examfocus-selected-option");
    });
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
    if (question) { delete question.outcome; question.userSelected = false; question.lastInteractedAt = Date.now(); }
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
  function handleOptionClick(event) {
    if (!active || completed || !currentId || !(event.target instanceof Element) ||
        event.target.closest(`#${HUD_ID}, #examarena-palette-modal, #examarena-submit-confirm-modal, #examfocus-completion-modal`)) return;
    const option = event.target.closest('[data-option], [role="radio"], input[type="radio"], [class*="question-option" i], [class*="question-options" i] button');
    const card = option?.closest?.('.question-options__option, [class*="question-options__option"]');
    if (option && card) {
      const questionId = currentId;
      const wasSelected = isOptionCardSelected(card);
      const interactedAt = Date.now();
      questionInteracted = true; answerSubmitted = true;
      const question = session.questions?.[questionId] || (session.questions[questionId] = { timeMs: 0, visits: 0, label: currentLabel });
      question.lastInteractedAt = interactedAt;
      if (wasSelected) {
        queueMicrotask(() => { void persistDeselection(questionId, card, option); });
      } else {
        selectedOption = option; question.userSelected = true; setSelectedOption(option);
        void recordQuestion(questionId, 0, undefined, { userSelected: true, lastInteractedAt: interactedAt }, currentUrl);
        queueMicrotask(() => {
          if (currentId !== questionId) return;
          const result = detectOutcome([getQuestionContentRoot()]);
          if (result === "Right" || result === "Wrong") {
            currentOutcome = result; session.outcomes ||= {}; session.outcomes[questionId] = result;
            session.completedQuestionIds ||= [];
            if (!session.completedQuestionIds.includes(questionId)) session.completedQuestionIds.push(questionId);
            void recordQuestion(questionId, 0, result, { completed: true, userSelected: true, lastInteractedAt: interactedAt }, currentUrl);
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
    if (submitText) answerSubmitted = true;
    // A selection or submit click is not a final outcome. Unresolved visits remain Unattempted.
  }
  function handleNextClick(event) {
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
    void snapshotCurrentQuestion()?.catch((error) => console.warn("Exam Arena could not save the outgoing question", error));
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
    const optionArea = [...document.querySelectorAll(".question-options, [class*='question-options']")]
      .some((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
    if (optionArea) return true;
    return [...document.querySelectorAll("[data-option], [role='radio'], input[type='radio']")]
      .some((el) => (el.getClientRects().length > 0 || el.closest(".question-options, [class*='question-options']")?.getClientRects().length > 0) && getComputedStyle(el).visibility !== "hidden");
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
      document.body.appendChild(toast);
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
          <strong>REATTEMPT MODE</strong>
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
        <button type="button" class="ea-reattempt-submit-btn">Submit Reattempt</button>
      </div>
    `;
    document.body.appendChild(hud);

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
    reattemptElapsedMs = Math.max(0, Date.now() - reattemptStartedAt);
    const timer = document.querySelector(`#${REATTEMPT_HUD_ID} .ea-reattempt-timer`);
    if (timer) {
      timer.textContent = formatDuration(reattemptElapsedMs, false);
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
        <p class="ea-submit-copy">
          ${hasSelected
            ? `You have selected <strong>${selectedLabel}</strong>. Confirming will evaluate your answer, log it in your session reattempt ledger, and heal your cultivation wound if correct.`
            : `⚠️ <strong>No option selected.</strong> If you confirm, this reattempt will be submitted as unattempted.`}
        </p>
        <div class="ea-submit-actions">
          <button class="ea-submit-cancel" type="button">Cancel / Return</button>
          <button class="ea-submit-confirm" type="button">Confirm &amp; Submit</button>
        </div>
      </section>
    `;
    document.body.appendChild(reattemptConfirmModal);

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
        else {
          const classes = `${reattemptSelectedOption.className || ""} ${reattemptSelectedOption.outerHTML.slice(0, 500)}`;
          if (/green|success|correct/i.test(classes)) outcome = "Right";
          else if (/red|danger|incorrect/i.test(classes)) outcome = "Wrong";
          else outcome = "Right";
        }
      }
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

      if (outcome === "Right") {
        showLockoutToast("✨ Reattempt Solved! Cultivation wound healed, +4 marks & +10 XP refunded.", false);
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
    document.getElementById(REATTEMPT_HUD_ID)?.remove();
    document.getElementById(REATTEMPT_CONFIRM_ID)?.remove();
    clearIntentHash();
  }

  function resolveQuestionIntent() {
    if (active) return false;
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const params = hashParams.get("ea-intent") ? hashParams : (activeConceptIntent || hashParams);
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

      if (solutionVisible) {
        const backButton = intentButtons(/(?:show\s+question|back\s+to\s+question|hide\s+solution|reattempt|try\s+again|clear\s+response)/i)[0];
        if (backButton && !backButton.dataset.eaIntentClicked) {
          backButton.dataset.eaIntentClicked = "true";
          backButton.click();
        }
        reattemptLockoutAttempts += 1;
        if (reattemptLockoutAttempts >= 18) {
          showLockoutToast("Host Lockout: Marks has locked this question into solution mode. Interactive reattempt is blocked.");
          lockoutCooldown = true;
          if (lockoutCooldownTimer) clearTimeout(lockoutCooldownTimer);
          lockoutCooldownTimer = setTimeout(() => { lockoutCooldown = false; }, 8000);
          clearIntentHash();
          stopSolutionHashWait();
          reattemptLockoutAttempts = 0;
          return true;
        }
        return false;
      }

      if (!questionOptionsVisible()) {
        reattemptLockoutAttempts += 1;
        if (reattemptLockoutAttempts >= 18) {
          showLockoutToast("Host Lockout: Question input is unavailable or locked by Marks.");
          lockoutCooldown = true;
          if (lockoutCooldownTimer) clearTimeout(lockoutCooldownTimer);
          lockoutCooldownTimer = setTimeout(() => { lockoutCooldown = false; }, 8000);
          clearIntentHash();
          stopSolutionHashWait();
          reattemptLockoutAttempts = 0;
          return true;
        }
        return false;
      }

      reattemptLockoutAttempts = 0;
      clearQuestionAnswerState();
      getQuestionContentRoot()?.querySelectorAll("input, button, [role='radio']").forEach((el) => {
        if (el.hasAttribute("disabled")) el.removeAttribute("disabled");
        el.style.pointerEvents = "auto";
      });
      clearIntentHash();
      stopSolutionHashWait();
      startReattemptMode(targetSession, targetQid);
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
    if (active || (!hashIntent && !activeConceptIntent)) return;
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
    if (outcome) return "answered";
    if (id && isMarkedForReview(id)) return "review";
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
    void snapshotCurrentQuestion()?.catch((error) => console.warn("Exam Arena could not save the outgoing question", error));
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
      <header class="ea-palette-header"><div><span class="ea-palette-eyebrow">EXAM ARENA · STATUS</span><h2 id="ea-palette-title">Question Palette</h2></div><div class="ea-palette-header-actions"><button class="ea-palette-submit" type="button">Submit Exam</button><button class="ea-palette-close" type="button" aria-label="Close question palette">×</button></div></header>
      <div class="ea-palette-legend"><span><i class="legend-answered"></i> Attempted / Answered</span><span><i class="legend-review"></i> Marked for Review</span><span><i class="legend-unattempted"></i> Unattempted</span></div>
      <div class="ea-palette-scroll"><div class="ea-palette-grid"></div><p class="ea-palette-message" role="status" aria-live="polite"></p></div>
      <footer class="ea-palette-footer"><span class="ea-palette-count">0 approached</span><span>The exam timer continues while this panel is open.</span></footer>
    </section>`;
    document.body.appendChild(paletteModal);
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
    hud.innerHTML = `<header class="ef-hud-header"><span class="ef-hud-brand"><i></i> EXAM ARENA</span><button class="ef-hud-minimize" type="button" aria-label="Minimize HUD">−</button></header>
      <div class="ef-hud-content"><div class="ef-hud-label">ELAPSED TIME</div><strong class="ef-hud-timer">00:00:00</strong>
      <div class="ef-hud-grid"><div><span>QUESTION</span><b class="ef-hud-question">Waiting…</b></div><div><span>DWELL</span><b class="ef-hud-dwell">00:00:00</b></div></div>
      <div class="ef-hud-progress"><div class="ef-hud-progress-head"><span>COMPLETED</span><b class="ef-hud-count">0 / ∞</b></div><div class="ef-hud-track"><i></i></div></div>
      <button class="ef-hud-status" type="button"><span aria-hidden="true">▦</span> Check Status</button>
      <button class="ef-hud-review" type="button">Mark for Review</button></div>`;
    document.body.appendChild(hud);
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
    document.body.appendChild(completionModal);
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
        if (currentId) void snapshotCurrentQuestion()?.catch((error) => console.warn("Exam Arena could not save the outgoing question", error));
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
          .catch((error) => console.warn("Exam Arena could not register the current question", error));
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
      if (pageRecords.length) queueScan(pageRecords);
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
      console.warn("Exam Arena sync warning:", err);
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
    document.getElementById(HUD_ID)?.remove();
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
      }
      sendResponse({ ok: belongsToCurrentSession });
    }
  });
  document.addEventListener("click", handleNextClick, true);
  document.addEventListener("click", handleOptionClick, true);
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

  if (isExtensionValid()) {
    chrome.storage.local.get(["examModeActive", "examSession"], (data) => {
      if (!isExtensionValid()) return;
      if (data?.examModeActive) start(data);
      else void checkAndLaunchConceptSession();
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (!isExtensionValid()) { teardownOrphanedScript(); return; }
      if (changes.examModeActive?.newValue) chrome.storage.local.get(["examSession"], (data) => start(data));
      if (changes.examModeActive?.newValue === false && !active) void checkAndLaunchConceptSession();
      if (changes.examModeActive?.newValue === false && active) {
        // Accept a storage transition only when its report belongs to this active run.
        const report = changes.lastReport?.newValue;
        if (report && sessionTimestamp(report) === sessionStartedAt && Number(report.endedAt) >= sessionStartedAt) {
          completed = true; active = false; observer?.disconnect();
          removeSubmitConfirm();
          removePalette();
          if (tickTimer) clearInterval(tickTimer); tickTimer = 0;
          showCompletionModal(report.endedReason, report);
        }
      }
      if (changes.examSession?.newValue) {
        const paletteChanged = paletteStateKey(session) !== paletteStateKey(changes.examSession.newValue);
        session = changes.examSession.newValue;
        updateHud();
        if (paletteChanged) renderPaletteGrid();
      }
    });
  }
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && paletteModal) removePalette(); });
  observeHistoryIntentChanges();
  window.addEventListener("popstate", () => { void checkAndLaunchConceptSession(); });
  window.addEventListener("hashchange", () => { void checkAndLaunchConceptSession(); });
  window.addEventListener("pagehide", stopSolutionHashWait, { once: true });
  window.addEventListener("pagehide", () => {
    if (active && currentId) void flushCurrentQuestion().catch(() => {});
  });
})();

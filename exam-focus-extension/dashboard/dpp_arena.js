/**
 * DPP Arena Controller
 * Full-featured CBT Exam Workspace with PDF.js rendering, live dwell timer,
 * keyboard controls, question palette, auto-grading, and solution autopsy navigation.
 */
(() => {
  'use strict';

  // Configure PDF.js Worker
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdfjs/pdf.worker.min.js';
  }

  // DOM Elements
  const $ = (id) => document.getElementById(id);
  const elements = {
    // Views
    setupView: $('setupView'),
    arenaWorkspace: $('arenaWorkspace'),
    solutionModeBanner: $('solutionModeBanner'),
    
    // Topbar
    arenaSessionChip: $('arenaSessionChip'),
    arenaExamTitleBadge: $('arenaExamTitleBadge'),
    arenaSubjectBadge: $('arenaSubjectBadge'),
    examLiveMetrics: $('examLiveMetrics'),
    liveQuestionTimer: $('liveQuestionTimer'),
    liveTotalTimer: $('liveTotalTimer'),
    liveTotalTimerLabel: $('liveTotalTimerLabel'),
    exitArenaBtn: $('exitArenaBtn'),

    // Setup
    dropZone: $('dropZone'),
    pdfFileInput: $('pdfFileInput'),
    browseFileBtn: $('browseFileBtn'),
    demoPdfNotice: $('demoPdfNotice'),
    loadTestPdfBtn: $('loadTestPdfBtn'),
    parsingOverlay: $('parsingOverlay'),
    parsingStatusText: $('parsingStatusText'),
    configCard: $('configCard'),
    keyDetectionBadge: $('keyDetectionBadge'),
    examTitleInput: $('examTitleInput'),
    subjectSelect: $('subjectSelect'),
    modeSelect: $('modeSelect'),
    countdownConfigGroup: $('countdownConfigGroup'),
    countdownMinutesInput: $('countdownMinutesInput'),
    questionCountInput: $('questionCountInput'),
    keyStatusSummary: $('keyStatusSummary'),
    toggleKeyEditorBtn: $('toggleKeyEditorBtn'),
    keyEditorDrawer: $('keyEditorDrawer'),
    rawKeyInput: $('rawKeyInput'),
    applyRawKeyBtn: $('applyRawKeyBtn'),
    keyGrid: $('keyGrid'),
    startArenaBtn: $('startArenaBtn'),

    // Arena PDF Pane
    pdfPane: $('pdfPane'),
    splitResizer: $('splitResizer'),
    consolePane: $('consolePane'),
    pdfViewport: $('pdfViewport'),
    pdfPagesHost: $('pdfPagesHost'),
    pdfZoomOutBtn: $('pdfZoomOutBtn'),
    pdfZoomInBtn: $('pdfZoomInBtn'),
    pdfZoomLabel: $('pdfZoomLabel'),
    pdfFitWidthBtn: $('pdfFitWidthBtn'),
    pdfPrevPageBtn: $('pdfPrevPageBtn'),
    pdfNextPageBtn: $('pdfNextPageBtn'),
    pdfPageInput: $('pdfPageInput'),
    pdfTotalPages: $('pdfTotalPages'),
    jumpQuestionsBtn: $('jumpQuestionsBtn'),
    jumpSolutionsBtn: $('jumpSolutionsBtn'),

    // Arena Console Pane
    activeQuestionEyebrow: $('activeQuestionEyebrow'),
    activeQuestionTitle: $('activeQuestionTitle'),
    qDwellBadge: $('qDwellBadge'),
    qStatusBadge: $('qStatusBadge'),
    optionsGrid: $('optionsGrid'),
    clearAnswerBtn: $('clearAnswerBtn'),
    toggleReviewBtn: $('toggleReviewBtn'),
    prevQuestionBtn: $('prevQuestionBtn'),
    nextQuestionBtn: $('nextQuestionBtn'),
    paletteCountSummary: $('paletteCountSummary'),
    paletteGrid: $('paletteGrid'),
    paletteSection: $('paletteSection'),
    examSubmitSection: $('examSubmitSection'),
    submitExamBtn: $('submitExamBtn'),

    // Reattempt Mode Controls
    reattemptActions: $('reattemptActions'),
    reattemptHelpText: $('reattemptHelpText'),
    submitReattemptBtn: $('submitReattemptBtn'),
    cancelReattemptBtn: $('cancelReattemptBtn'),

    // Solution Mode Banner
    solutionQuestionInfo: $('solutionQuestionInfo'),
    solutionScoreBadge: $('solutionScoreBadge'),
    solutionKeyCompare: $('solutionKeyCompare'),
    solPrevBtn: $('solPrevBtn'),
    solNextBtn: $('solNextBtn'),
    exitSolModeBtn: $('exitSolModeBtn'),

    // Solution Floating Action Button & Panel
    eaSolutionFab: $('ea-solution-fab'),
    eaSolutionFabPanel: $('ea-solution-fab-panel'),
    fabCurrentQText: $('fabCurrentQText'),
    fabCloseBtn: $('fabCloseBtn'),
    fabOutcomeBadge: $('fabOutcomeBadge'),
    fabChoicesText: $('fabChoicesText'),
    fabPaletteGrid: $('fabPaletteGrid'),
    fabBackToAutopsyBtn: $('fabBackToAutopsyBtn'),

    // Modals
    submitModal: $('submitModal'),
    modalTotalQ: $('modalTotalQ'),
    modalAnsweredQ: $('modalAnsweredQ'),
    modalUnattemptedQ: $('modalUnattemptedQ'),
    modalReviewQ: $('modalReviewQ'),
    modalCancelBtn: $('modalCancelBtn'),
    modalConfirmBtn: $('modalConfirmBtn'),
    exitModal: $('exitModal'),
    exitCancelBtn: $('exitCancelBtn'),
    exitConfirmBtn: $('exitConfirmBtn'),
    dppToast: $('dppToast')
  };

  // State
  const state = {
    pdfDoc: null,
    pdfBuffer: null,
    storageBuffer: null,
    fileName: 'dpp.pdf',
    parsedData: null,
    totalPages: 0,
    maxExamPage: null,
    zoomScale: 1.25,
    renderedPages: new Set(),
    isRendering: false,
    
    // Exam Config
    examConfig: {
      examName: 'DPP Practice',
      subject: 'Physics',
      mode: 'stopwatch',
      allottedMinutes: 45,
      allottedTimeMs: null,
      totalQuestions: 25,
      answerKey: {},
      solutionPages: {},
      firstSolutionPage: null,
      keyPageNumber: null
    },

    // Live Exam State
    examActive: false,
    solutionMode: false,
    reattemptMode: false,
    reattemptTargetQ: null,
    sessionId: null,
    startedAtMs: 0,
    currentQ: 1,
    userAnswers: {}, // { "1": "B", ... }
    reviewQIds: new Set(),
    visitedQIds: new Set(),
    dwellMs: {}, // { "1": 15000, ... }
    firstSeenAt: {},
    visits: {},
    currentQEnterTime: 0,
    totalTimerInterval: null,
    questionTimerInterval: null,

    // Loaded autopsy session (if in solution or reattempt mode)
    autopsySession: null
  };
  let conceptTimerStartedAt = 0;
  let conceptTimerInterval = null;

  // Helper: Format Milliseconds to MM:SS or HH:MM:SS
  function formatTime(ms, includeHours = false) {
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (includeHours || hours > 0) {
      return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }

  // Helper: Show Toast notification
  function showToast(message, isError = false) {
    if (!elements.dppToast) return;
    elements.dppToast.textContent = message;
    elements.dppToast.className = `toast shown${isError ? ' toast-error' : ''}`;
    setTimeout(() => {
      elements.dppToast.classList.remove('shown');
    }, 3200);
  }

  // ----------------------------------------------------
  // Initial Page Load & Route Handling
  // ----------------------------------------------------
  async function init() {
    setupEventListeners();
    setupSplitResizer();

    // Check query params:
    // Solution Mode: ?sessionId=...&view=solution&qid=...
    // Reattempt Mode: ?sessionId=...&mode=reattempt&qid=...
    const urlParams = new URLSearchParams(window.location.search);
    const view = urlParams.get('view');
    const mode = urlParams.get('mode');
    const sessionId = urlParams.get('sessionId');
    const qid = urlParams.get('qid') || '1';

    if (mode === 'full-reattempt' && sessionId) {
      await enterFullReattemptMode(sessionId);
      return;
    }

    if (mode === 'reattempt' && sessionId) {
      await enterReattemptMode(sessionId, parseInt(qid, 10));
      return;
    }

    if (view === 'solution' && sessionId) {
      await enterSolutionMode(sessionId, parseInt(qid, 10));
      return;
    }

    // Default setup mode: check if test PDF exists or prompt user
    elements.setupView.hidden = false;
    elements.arenaWorkspace.hidden = true;
  }

  // ----------------------------------------------------
  // Full DPP Reattempt Mode Workflow
  // ----------------------------------------------------
  async function enterFullReattemptMode(sessionId) {
    try {
      showToast('Loading Full DPP Reattempt...');
      const stored = await chrome.storage.local.get(['examHistory', 'lastReport']);
      const history = Array.isArray(stored.examHistory) ? stored.examHistory : [];
      let session = history.find((s) => s.sessionId === sessionId);
      if (!session && stored.lastReport?.sessionId === sessionId) {
        session = stored.lastReport;
      }

      if (!session) {
        showToast('DPP Session not found in history.', true);
        elements.setupView.hidden = false;
        return;
      }

      // Load PDF from IndexedDB
      const dbRecord = await DPPStorage.getPdfSession(sessionId);
      if (!dbRecord || !dbRecord.pdfBuffer) {
        showToast('Stored PDF binary not found in local cache.', true);
        elements.setupView.hidden = false;
        return;
      }

      // Prepare state for full reattempt
      state.examActive = true;
      state.solutionMode = false;
      state.reattemptMode = false;
      state.isFullReattempt = true;
      state.sessionId = `dpp_reattempt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      state.autopsySession = session;
      state.pdfBuffer = dbRecord.pdfBuffer;
      state.storageBuffer = dbRecord.pdfBuffer;
      state.fileName = dbRecord.fileName;

      state.examConfig = {
        examName: session.examName || 'DPP Session',
        subject: session.subject || 'Physics',
        mode: session.mode || 'stopwatch',
        allottedMinutes: session.allottedTimeMs ? Math.round(session.allottedTimeMs / 60000) : 45,
        allottedTimeMs: session.allottedTimeMs || null,
        totalQuestions: session.targetQuestions || Object.keys(session.questions || {}).length || 25,
        answerKey: session.answerKey || dbRecord.answerKey || {},
        solutionPages: session.solutionPages || dbRecord.solutionPages || {},
        firstSolutionPage: dbRecord.metadata?.firstSolutionPage || session.firstSolutionPage || 4,
        keyPageNumber: dbRecord.metadata?.keyPageNumber || session.keyPageNumber || 3
      };

      // Reset answers and dwell times for full reattempt
      state.currentQ = 1;
      state.userAnswers = {};
      state.reviewQIds.clear();
      state.visitedQIds.clear();
      state.dwellMs = {};
      state.firstSeenAt = {};
      state.visits = {};

      // Gatekeeper ceiling: strictly block answer key and solutions during reattempt!
      const keyPage = dbRecord.metadata?.keyPageNumber || session.keyPageNumber || 3;
      const solPage = dbRecord.metadata?.firstSolutionPage || session.firstSolutionPage || 4;
      state.maxExamPage = Math.min((keyPage || 999) - 1, (solPage || 999) - 1);
      if (!state.maxExamPage || state.maxExamPage < 1) {
        state.maxExamPage = 2;
      }

      // Pre-save PDF binary with new sessionId so it is cached in IndexedDB
      if (state.storageBuffer) {
        try {
          await DPPStorage.savePdfSession(state.sessionId, {
            fileName: state.fileName,
            pdfBuffer: state.storageBuffer,
            totalPages: dbRecord.totalPages || 0,
            metadata: dbRecord.metadata || {},
            answerKey: state.examConfig.answerKey,
            solutionPages: state.examConfig.solutionPages
          });
        } catch (e) {
          console.warn('Pre-save for full reattempt PDF failed:', e);
        }
      }

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(state.pdfBuffer) });
      state.pdfDoc = await loadingTask.promise;
      state.totalPages = state.pdfDoc.numPages;

      // Switch to Arena View
      elements.setupView.hidden = true;
      elements.arenaWorkspace.hidden = false;
      elements.arenaWorkspace.classList.remove('full-solution-mode');
      elements.solutionModeBanner.hidden = true;
      elements.arenaSessionChip.hidden = false;
      elements.arenaExamTitleBadge.textContent = `${state.examConfig.examName} (Full Reattempt)`;
      elements.arenaSubjectBadge.textContent = state.examConfig.subject;
      elements.examLiveMetrics.hidden = false;
      elements.liveTotalTimerLabel.textContent = state.examConfig.mode === 'countdown' ? 'TIME REMAINING' : 'TOTAL TIME';
      elements.jumpSolutionsBtn.hidden = true; // Gatekeeper ceiling
      if (elements.examSubmitSection) elements.examSubmitSection.hidden = false;
      if (elements.reattemptActions) elements.reattemptActions.hidden = true;
      if (elements.paletteSection) elements.paletteSection.hidden = false;
      const navRow = document.querySelector('.q-nav-row');
      if (navRow) navRow.hidden = false;
      if (elements.eaSolutionFab) elements.eaSolutionFab.hidden = true;
      if (elements.eaSolutionFabPanel) elements.eaSolutionFabPanel.hidden = true;

      // Render PDF pages (restricted to maxExamPage)
      await renderAllPdfPages();

      // Render Question Palette
      renderPalette();

      // Start timer
      state.startedAtMs = Date.now();
      state.currentQEnterTime = Date.now();
      startTimers();

      // Set active question 1
      setActiveQuestion(1);

      showToast('Full Reattempt Active! Pacing & responses reset.');
    } catch (err) {
      console.error('Error entering full reattempt mode:', err);
      showToast(`Could not load full reattempt view: ${err.message}`, true);
      elements.setupView.hidden = false;
    }
  }

  // ----------------------------------------------------
  // Reattempt Mode Workflow
  // ----------------------------------------------------
  async function enterReattemptMode(sessionId, targetQ = 1) {
    try {
      showToast('Loading DPP Session Reattempt...');
      const stored = await chrome.storage.local.get(['examHistory', 'lastReport']);
      const history = Array.isArray(stored.examHistory) ? stored.examHistory : [];
      let session = history.find((s) => s.sessionId === sessionId);
      if (!session && stored.lastReport?.sessionId === sessionId) {
        session = stored.lastReport;
      }

      if (!session) {
        showToast('DPP Session not found in history.', true);
        elements.setupView.hidden = false;
        return;
      }

      // Load PDF from IndexedDB
      const dbRecord = await DPPStorage.getPdfSession(sessionId);
      if (!dbRecord || !dbRecord.pdfBuffer) {
        showToast('Stored PDF binary not found in local cache.', true);
        elements.setupView.hidden = false;
        return;
      }

      state.reattemptMode = true;
      state.examActive = false;
      state.solutionMode = false;
      state.sessionId = sessionId;
      state.autopsySession = session;
      state.pdfBuffer = dbRecord.pdfBuffer;
      state.storageBuffer = dbRecord.pdfBuffer;
      state.fileName = dbRecord.fileName;
      state.reattemptTargetQ = targetQ;

      state.examConfig = {
        examName: session.examName || 'DPP Session',
        subject: session.subject || 'Physics',
        mode: 'stopwatch',
        totalQuestions: session.targetQuestions || Object.keys(session.questions || {}).length || 25,
        answerKey: session.answerKey || dbRecord.answerKey || {},
        solutionPages: session.solutionPages || dbRecord.solutionPages || {},
        firstSolutionPage: dbRecord.metadata?.firstSolutionPage || session.firstSolutionPage || 4,
        keyPageNumber: dbRecord.metadata?.keyPageNumber || session.keyPageNumber || 3
      };

      // Gatekeeper ceiling: strictly block answer key and solutions during reattempt!
      const keyPage = dbRecord.metadata?.keyPageNumber || session.keyPageNumber || 3;
      const solPage = dbRecord.metadata?.firstSolutionPage || session.firstSolutionPage || 4;
      state.maxExamPage = Math.min((keyPage || 999) - 1, (solPage || 999) - 1);
      if (!state.maxExamPage || state.maxExamPage < 1) {
        state.maxExamPage = 2;
      }

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(state.pdfBuffer) });
      state.pdfDoc = await loadingTask.promise;
      state.totalPages = state.pdfDoc.numPages;

      // Switch to Arena View
      elements.setupView.hidden = true;
      elements.arenaWorkspace.hidden = false;
      elements.arenaWorkspace.classList.remove('full-solution-mode');
      elements.solutionModeBanner.hidden = true;
      elements.arenaSessionChip.hidden = false;
      elements.arenaExamTitleBadge.textContent = `${state.examConfig.examName} (Reattempt Q${targetQ})`;
      elements.arenaSubjectBadge.textContent = state.examConfig.subject;
      elements.examLiveMetrics.hidden = false;
      elements.liveTotalTimerLabel.textContent = 'REATTEMPT TIME';
      elements.jumpSolutionsBtn.hidden = true; // Gatekeeper: hidden!
      if (elements.examSubmitSection) elements.examSubmitSection.hidden = true;
      if (elements.reattemptActions) elements.reattemptActions.hidden = false;
      if (elements.paletteSection) elements.paletteSection.hidden = true;
      const navRow = document.querySelector('.q-nav-row');
      if (navRow) navRow.hidden = true;
      if (elements.submitReattemptBtn) {
        elements.submitReattemptBtn.textContent = `Submit Reattempt for Q${targetQ} ↗`;
      }
      if (elements.eaSolutionFab) elements.eaSolutionFab.hidden = true;
      if (elements.eaSolutionFabPanel) elements.eaSolutionFabPanel.hidden = true;

      // Render PDF pages (restricted to maxExamPage)
      await renderAllPdfPages();

      // Render Question Palette
      renderPalette();

      // Start timer for reattempt
      state.startedAtMs = Date.now();
      state.currentQEnterTime = Date.now();
      startTimers();

      // Clear previous answer for reattempt question so user selects afresh
      delete state.userAnswers[String(targetQ)];

      // Set active question
      setActiveQuestion(targetQ);

    } catch (err) {
      console.error('Error entering reattempt mode:', err);
      showToast(`Could not load reattempt view: ${err.message}`, true);
      elements.setupView.hidden = false;
    }
  }

  async function handleReattemptSubmit() {
    const qid = String(state.reattemptTargetQ || state.currentQ);
    const selected = state.userAnswers[qid];
    if (!selected) {
      showToast('Please select an option before submitting reattempt.', true);
      return;
    }

    const dwellMs = Math.max(1000, Date.now() - (state.currentQEnterTime || state.startedAtMs));
    const correctKey = (state.examConfig.answerKey[qid] || state.autopsySession?.answerKey?.[qid] || state.autopsySession?.questions?.[qid]?.correctAnswer || '').toUpperCase();
    const isRight = selected.toUpperCase() === correctKey;
    const outcome = isRight ? 'Right' : 'Wrong';

    try {
      // 1. Send RECORD_REATTEMPT message to background
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'RECORD_REATTEMPT',
          sessionId: state.sessionId,
          questionId: qid,
          dwellMs,
          outcome,
          timestamp: Date.now()
        }, () => resolve());
      });

      // 2. Also update session locally in examHistory to ensure immediate consistency
      const stored = await chrome.storage.local.get(['examHistory', 'lastReport']);
      const history = Array.isArray(stored.examHistory) ? [...stored.examHistory] : [];
      let sIdx = history.findIndex((s) => s.sessionId === state.sessionId);
      let session = sIdx >= 0 ? history[sIdx] : stored.lastReport;

      if (session) {
        session.questions ||= {};
        const qObj = session.questions[qid] || {};
        const prevOutcome = qObj.outcome || session.outcomes?.[qid] || 'Unattempted';
        const wasAlreadyRight = prevOutcome === 'Right' || session.outcomes?.[qid] === 'Right';
        const wasAlreadyResolved = Boolean(qObj.cultivationResolved);

        qObj.userChoice = selected;
        qObj.reattemptSelected = selected;
        qObj.reattemptOutcome = outcome;
        qObj.reattemptDwellMs = dwellMs;

        // Anti-exploit: only heal wound and adjust score if was not already correct or resolved
        if (isRight && !wasAlreadyRight && !wasAlreadyResolved) {
          qObj.outcome = 'Right';
          session.outcomes ||= {};
          session.outcomes[qid] = 'Right';
          qObj.cultivationResolved = true;
          qObj.reattemptSuccess = true;

          session.stats ||= {};
          if (prevOutcome === 'Wrong') {
            session.stats.totalWrong = Math.max(0, (session.stats.totalWrong || 0) - 1);
            session.stats.totalRight = (session.stats.totalRight || 0) + 1;
            session.stats.netScore = (session.stats.netScore || 0) + 5;
          } else if (prevOutcome === 'Unattempted') {
            session.stats.totalUnattempted = Math.max(0, (session.stats.totalUnattempted || 0) - 1);
            session.stats.totalRight = (session.stats.totalRight || 0) + 1;
            session.stats.netScore = (session.stats.netScore || 0) + 4;
          }
        }

        session.reattempts ||= {};
        session.reattempts[qid] = {
          questionId: qid,
          dwellMs,
          outcome,
          timestamp: Date.now()
        };

        session.reattemptLedger ||= [];
        session.reattemptLedger.push({
          questionId: qid,
          dwellMs,
          outcome,
          timestamp: Date.now()
        });

        if (sIdx >= 0) {
          history[sIdx] = session;
        }

        const updates = { examHistory: history };
        if (stored.lastReport?.sessionId === state.sessionId) {
          updates.lastReport = session;
        }
        await chrome.storage.local.set(updates);
      }

      if (isRight) {
        showToast('🎉 Reattempt Correct! Cultivation wound healed (+4 marks). Returning to autopsy...');
      } else {
        showToast('❌ Reattempt Incorrect. Keep analyzing! Returning to autopsy...', true);
      }

      setTimeout(() => {
        window.location.href = `dashboard.html?sessionId=${encodeURIComponent(state.sessionId)}`;
      }, 1200);

    } catch (err) {
      console.error('Error submitting reattempt:', err);
      showToast(`Reattempt submission error: ${err.message}`, true);
    }
  }

  // ----------------------------------------------------
  // Solution Mode Autopsy View
  // ----------------------------------------------------
  async function enterSolutionMode(sessionId, targetQ = 1) {
    try {
      showToast('Loading DPP Session Autopsy...');
      const stored = await chrome.storage.local.get(['examHistory', 'lastReport']);
      const history = Array.isArray(stored.examHistory) ? stored.examHistory : [];
      let session = history.find((s) => s.sessionId === sessionId);
      if (!session && stored.lastReport?.sessionId === sessionId) {
        session = stored.lastReport;
      }

      if (!session) {
        showToast('DPP Session not found in history.', true);
        elements.setupView.hidden = false;
        return;
      }

      // Load PDF from IndexedDB
      const dbRecord = await DPPStorage.getPdfSession(sessionId);
      if (!dbRecord || !dbRecord.pdfBuffer) {
        showToast('Stored PDF binary not found in local cache.', true);
        elements.setupView.hidden = false;
        return;
      }

      state.solutionMode = true;
      state.examActive = false;
      state.reattemptMode = false;
      state.maxExamPage = null; // Unlocks all pages
      state.sessionId = sessionId;
      state.autopsySession = session;
      state.pdfBuffer = dbRecord.pdfBuffer;
      state.storageBuffer = dbRecord.pdfBuffer;
      state.fileName = dbRecord.fileName;

      state.examConfig = {
        examName: session.examName || 'DPP Session',
        subject: session.subject || 'Physics',
        mode: session.mode || 'stopwatch',
        totalQuestions: session.targetQuestions || Object.keys(session.questions || {}).length || 25,
        answerKey: session.answerKey || dbRecord.answerKey || {},
        solutionPages: session.solutionPages || dbRecord.solutionPages || {},
        firstSolutionPage: dbRecord.metadata?.firstSolutionPage || session.firstSolutionPage || 4,
        keyPageNumber: dbRecord.metadata?.keyPageNumber || session.keyPageNumber || 3
      };

      state.userAnswers = session.userAnswers || {};
      state.dwellMs = {};
      for (const [qid, q] of Object.entries(session.questions || {})) {
        state.dwellMs[qid] = q.timeMs || 0;
        if (q.userChoice) state.userAnswers[qid] = q.userChoice;
      }

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(state.pdfBuffer) });
      state.pdfDoc = await loadingTask.promise;
      state.totalPages = state.pdfDoc.numPages;

      // Switch to Arena View
      elements.setupView.hidden = true;
      elements.arenaWorkspace.hidden = false;
      elements.arenaWorkspace.classList.add('full-solution-mode');
      elements.solutionModeBanner.hidden = false;
      elements.arenaSessionChip.hidden = false;
      elements.arenaExamTitleBadge.textContent = state.examConfig.examName;
      elements.arenaSubjectBadge.textContent = state.examConfig.subject;
      elements.pdfTotalPages.textContent = state.totalPages;
      if (elements.examSubmitSection) elements.examSubmitSection.hidden = true;
      if (elements.reattemptActions) elements.reattemptActions.hidden = true;

      if (state.examConfig.firstSolutionPage) {
        elements.jumpSolutionsBtn.hidden = false;
      }

      // Render all PDF pages
      await renderAllPdfPages();

      // Show and setup Floating Action Button
      if (elements.eaSolutionFab) {
        elements.eaSolutionFab.hidden = false;
      }
      setupSolutionFab();

      // Set active question in solution mode
      setSolutionQuestion(targetQ);

    } catch (err) {
      console.error('Error entering solution mode:', err);
      showToast(`Could not load solution view: ${err.message}`, true);
      elements.setupView.hidden = false;
    }
  }

  function setSolutionQuestion(qNum) {
    const total = state.examConfig.totalQuestions;
    const questionNumbers = sortedSolutionQuestionNumbers();
    const requested = Number(qNum);
    const resolvedQ = questionNumbers.length
      ? (questionNumbers.includes(requested) ? requested : questionNumbers.find((number) => number >= requested) ?? questionNumbers[questionNumbers.length - 1])
      : Math.max(1, Math.min(total, requested));
    if (state.solutionMode && conceptTimerStartedAt && resolvedQ !== state.currentQ) void recordConceptReview('Visited');
    state.currentQ = resolvedQ;
    startConceptReviewTimer(state.currentQ);
    const qid = String(state.currentQ);
    const qData = state.autopsySession?.questions?.[qid] || {};
    const outcome = qData.outcome || (state.autopsySession?.outcomes?.[qid]) || 'Unattempted';
    const userChoice = state.userAnswers[qid] || 'None';
    const correctKey = state.examConfig.answerKey[qid] || '—';

    // Update Banner
    elements.solutionQuestionInfo.textContent = `Question ${state.currentQ} of ${total}`;
    elements.solutionScoreBadge.textContent = outcome === 'Right' ? '+4 Right' : outcome === 'Wrong' ? '-1 Wrong' : '0 Unattempted';
    elements.solutionScoreBadge.className = `solution-score-badge ${outcome === 'Right' ? '' : outcome === 'Wrong' ? 'badge-wrong' : 'badge-unattempted'}`;
    elements.solutionKeyCompare.innerHTML = `Your Choice: <b>${userChoice}</b> · Correct Key: <b>${correctKey}</b>`;

    // Update Console
    elements.activeQuestionTitle.textContent = `Question ${state.currentQ}`;
    elements.activeQuestionEyebrow.textContent = 'SOLUTION AUDIT';
    elements.qDwellBadge.textContent = `⏱ ${formatTime(qData.timeMs || 0)}`;
    elements.qStatusBadge.textContent = outcome;
    elements.qStatusBadge.className = `q-status-badge ${outcome === 'Right' ? 'status-answered' : outcome === 'Wrong' ? 'status-unattempted' : 'status-unvisited'}`;

    // Mark Options in console
    const optionBtns = elements.optionsGrid.querySelectorAll('.option-btn');
    optionBtns.forEach((btn) => {
      const opt = btn.dataset.option;
      btn.classList.remove('selected');
      if (opt === userChoice) {
        btn.classList.add('selected');
      }
    });

    // Highlight palette button
    updatePaletteActiveIndicator();

    // Update Floating Action Button Quick-Nav
    updateFabPanel();

    // Scroll PDF to solution page if available, or fallback to Answer Key page
    const solPage = state.examConfig.solutionPages[qid] || state.examConfig.firstSolutionPage || state.examConfig.keyPageNumber || state.parsedData?.keyPageNumber;
    if (solPage) {
      scrollToPage(solPage);
    }
    spotlightQuestionInPdf(state.currentQ, solPage);
  }

  function sortedSolutionQuestionNumbers() {
    return Object.entries(state.autopsySession?.questions || {})
      .map(([key, question]) => {
        const source = question?.label || key;
        const match = String(source).match(/\d+/);
        return match ? Number(match[0]) : null;
      })
      .filter((number) => Number.isFinite(number))
      .sort((a, b) => a - b);
  }

  function navigateSolutionQuestion(direction) {
    const questions = sortedSolutionQuestionNumbers();
    const index = questions.indexOf(state.currentQ);
    const next = questions[index + direction];
    if (next != null) setSolutionQuestion(next);
  }

  function startConceptReviewTimer(qNum) {
    const hud = $('ea-concept-timer-hud');
    if (!state.solutionMode || !hud) return;
    clearInterval(conceptTimerInterval);
    conceptTimerStartedAt = Date.now();
    hud.hidden = false;
    $('hudActiveQuestionLabel').textContent = `Q${qNum} Review`;
    $('conceptLiveTimer').textContent = '00:00';
    conceptTimerInterval = setInterval(() => {
      $('conceptLiveTimer').textContent = formatTime(Date.now() - conceptTimerStartedAt);
    }, 1000);
  }

  async function recordConceptReview(status) {
    if (!state.solutionMode || !state.autopsySession || !conceptTimerStartedAt) return;
    clearInterval(conceptTimerInterval); conceptTimerInterval = null;
    const qid = String(state.currentQ), elapsed = Math.max(0, Date.now() - conceptTimerStartedAt), at = Date.now();
    const session = state.autopsySession;
    session.conceptReview ||= {};
    const prev = session.conceptReview[qid] || { dwellMs: 0 };
    session.conceptReview[qid] = { dwellMs: Math.max(0, Number(prev.dwellMs) || 0) + elapsed, status: status === 'Completed' || prev.status === 'Completed' ? 'Completed' : 'Visited', lastReviewedAt: at };
    conceptTimerStartedAt = 0;
    const stored = await chrome.storage.local.get(['examHistory', 'lastReport']);
    const history = Array.isArray(stored.examHistory) ? stored.examHistory : [];
    let found = false;
    const updated = history.map(item => {
      if (item?.sessionId !== state.sessionId) return item;
      found = true; return { ...item, conceptReview: session.conceptReview };
    });
    if (!found) updated.unshift({ ...session });
    const payload = { examHistory: updated };
    if (stored.lastReport?.sessionId === state.sessionId) payload.lastReport = { ...stored.lastReport, conceptReview: session.conceptReview };
    await chrome.storage.local.set(payload);
  }

  async function conceptReviewNext(status) {
    await recordConceptReview(status);
    const questions = sortedSolutionQuestionNumbers();
    const currentIndex = questions.indexOf(state.currentQ);
    const nextQuestion = currentIndex >= 0 ? questions[currentIndex + 1] : null;
    if (nextQuestion != null) setSolutionQuestion(nextQuestion);
    else { $('ea-concept-timer-hud').hidden = true; showToast('Concept review finished for all questions.'); }
  }

  // ----------------------------------------------------
  // Floating Action Button (FAB) & Solution Quick-Nav
  // ----------------------------------------------------
  let fabInitialized = false;
  function setupSolutionFab() {
    const fab = elements.eaSolutionFab;
    const panel = elements.eaSolutionFabPanel;
    if (!fab || !panel || fabInitialized) return;
    fabInitialized = true;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let hasMoved = false;

    fab.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = fab.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      try {
        fab.setPointerCapture(e.pointerId);
      } catch (_) {}
      e.preventDefault();
    });

    fab.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!hasMoved && Math.hypot(dx, dy) > 4) {
        hasMoved = true;
      }

      if (hasMoved) {
        const fabWidth = fab.offsetWidth || 120;
        const fabHeight = fab.offsetHeight || 44;
        const minX = 10;
        const maxX = window.innerWidth - fabWidth - 10;
        const minY = 10;
        const maxY = window.innerHeight - fabHeight - 10;

        const newLeft = Math.max(minX, Math.min(maxX, initialLeft + dx));
        const newTop = Math.max(minY, Math.min(maxY, initialTop + dy));

        fab.style.left = `${Math.round(newLeft)}px`;
        fab.style.top = `${Math.round(newTop)}px`;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';

        if (!panel.hidden) {
          positionFabPanel();
        }
      }
    });

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        fab.releasePointerCapture(e.pointerId);
      } catch (_) {}

      if (!hasMoved) {
        toggleFabPanel();
      } else if (!panel.hidden) {
        positionFabPanel();
      }
    };

    fab.addEventListener('pointerup', onPointerUp);
    fab.addEventListener('pointercancel', onPointerUp);

    elements.fabCloseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.hidden = true;
    });

    elements.fabBackToAutopsyBtn?.addEventListener('click', () => {
      if (state.sessionId) {
        window.location.href = `dashboard.html?sessionId=${encodeURIComponent(state.sessionId)}`;
      } else {
        window.location.href = 'dashboard.html';
      }
    });

    // Dismiss panel on outside click
    document.addEventListener('pointerdown', (e) => {
      if (!panel.hidden && !panel.contains(e.target) && !fab.contains(e.target)) {
        panel.hidden = true;
      }
    });
  }

  function toggleFabPanel() {
    if (!elements.eaSolutionFabPanel) return;
    const isHidden = elements.eaSolutionFabPanel.hidden;
    elements.eaSolutionFabPanel.hidden = !isHidden;
    if (!elements.eaSolutionFabPanel.hidden) {
      updateFabPanel();
      positionFabPanel();
    }
  }

  function positionFabPanel() {
    const fab = elements.eaSolutionFab;
    const panel = elements.eaSolutionFabPanel;
    if (!fab || !panel) return;

    const fabRect = fab.getBoundingClientRect();
    const panelWidth = Math.min(320, window.innerWidth - 32);
    const panelHeight = Math.min(380, window.innerHeight - 40);

    let top;
    if (fabRect.top >= panelHeight + 16) {
      top = fabRect.top - panelHeight - 10;
    } else if (window.innerHeight - fabRect.bottom >= panelHeight + 16) {
      top = fabRect.bottom + 10;
    } else {
      top = Math.max(16, (window.innerHeight - panelHeight) / 2);
    }

    let left = fabRect.right - panelWidth;
    if (left < 16) left = 16;
    if (left + panelWidth > window.innerWidth - 16) {
      left = window.innerWidth - panelWidth - 16;
    }

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function updateFabPanel() {
    const qid = String(state.currentQ);
    const qData = state.autopsySession?.questions?.[qid] || {};
    const outcome = qData.outcome || (state.autopsySession?.outcomes?.[qid]) || 'Unattempted';
    const userChoice = state.userAnswers[qid] || 'None';
    const correctKey = state.examConfig.answerKey[qid] || '—';

    if (elements.fabCurrentQText) {
      elements.fabCurrentQText.textContent = `Question ${state.currentQ} Solution`;
    }

    if (elements.fabOutcomeBadge) {
      elements.fabOutcomeBadge.textContent = outcome === 'Right' ? '+4 Right' : outcome === 'Wrong' ? '-1 Wrong' : '0 Unattempted';
      elements.fabOutcomeBadge.className = `solution-score-badge ${outcome === 'Right' ? '' : outcome === 'Wrong' ? 'badge-wrong' : 'badge-unattempted'}`;
    }

    if (elements.fabChoicesText) {
      elements.fabChoicesText.textContent = `Your: ${userChoice} · Key: ${correctKey}`;
    }

    if (elements.fabPaletteGrid) {
      elements.fabPaletteGrid.replaceChildren();
      const total = state.examConfig.totalQuestions;
      for (let i = 1; i <= total; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const qNumStr = String(i);
        const qOutcome = state.autopsySession?.questions?.[qNumStr]?.outcome || state.autopsySession?.outcomes?.[qNumStr] || 'Unattempted';
        const outcomeClass = qOutcome === 'Right' ? 'q-right' : qOutcome === 'Wrong' ? 'q-wrong' : 'q-unattempted';
        btn.className = `fab-q-btn ${outcomeClass}${i === state.currentQ ? ' active' : ''}`;
        btn.textContent = String(i);
        btn.title = `Question ${i} (${qOutcome})`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          setSolutionQuestion(i);
        });
        elements.fabPaletteGrid.appendChild(btn);
      }
    }

    if (elements.eaSolutionFabPanel && !elements.eaSolutionFabPanel.hidden) {
      positionFabPanel();
    }
  }

  // ----------------------------------------------------
  // Event Listeners Setup
  // ----------------------------------------------------
  function setupEventListeners() {
    // Dropzone / File Browse
    elements.browseFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.pdfFileInput.click();
    });

    elements.dropZone.addEventListener('click', () => {
      elements.pdfFileInput.click();
    });

    elements.pdfFileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handlePdfFile(file);
    });

    // Drag and Drop
    elements.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      elements.dropZone.classList.add('drag-active');
    });

    elements.dropZone.addEventListener('dragleave', () => {
      elements.dropZone.classList.remove('drag-active');
    });

    elements.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      elements.dropZone.classList.remove('drag-active');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type === 'application/pdf') {
        handlePdfFile(file);
      } else if (file) {
        showToast('Please drop a valid PDF file.', true);
      }
    });

    // Demo Test PDF loader
    if (elements.demoPdfNotice && elements.loadTestPdfBtn) {
      elements.demoPdfNotice.hidden = false;
      elements.loadTestPdfBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          elements.parsingOverlay.hidden = false;
          elements.parsingStatusText.textContent = 'Loading test PDF (Shm_1200366_1_1790344384.pdf)...';
          const resp = await fetch('../assets/sample-dpp.pdf');
          const blob = await resp.blob();
          const file = new File([blob], 'Shm_1200366_1_1790344384.pdf', { type: 'application/pdf' });
          await handlePdfFile(file);
        } catch (err) {
          elements.parsingOverlay.hidden = true;
          showToast('Failed to load test PDF: ' + err.message, true);
        }
      });
    }

    // Pre-Exam Config Controls
    elements.modeSelect.addEventListener('change', () => {
      const isCountdown = elements.modeSelect.value === 'countdown';
      elements.countdownConfigGroup.hidden = !isCountdown;
    });

    elements.toggleKeyEditorBtn.addEventListener('click', () => {
      elements.keyEditorDrawer.hidden = !elements.keyEditorDrawer.hidden;
    });

    elements.applyRawKeyBtn.addEventListener('click', () => {
      const raw = elements.rawKeyInput.value.trim();
      if (!raw) return;
      const parsed = DPPParser.parseRawAnswerKeyText(raw, parseInt(elements.questionCountInput.value, 10) || 25);
      const keysCount = Object.keys(parsed).length;
      if (keysCount > 0) {
        state.examConfig.answerKey = { ...state.examConfig.answerKey, ...parsed };
        renderKeyGrid();
        showToast(`Applied ${keysCount} answers from text.`);
      } else {
        showToast('Could not extract answer pairs. Try format like 1-B 2-C or B B C D.', true);
      }
    });

    elements.startArenaBtn.addEventListener('click', startExamSession);

    // Arena PDF Controls
    elements.pdfZoomInBtn.addEventListener('click', () => zoomPdf(0.2));
    elements.pdfZoomOutBtn.addEventListener('click', () => zoomPdf(-0.2));
    elements.pdfFitWidthBtn.addEventListener('click', fitPdfToWidth);
    elements.pdfPrevPageBtn.addEventListener('click', () => navigatePdfPage(-1));
    elements.pdfNextPageBtn.addEventListener('click', () => navigatePdfPage(1));
    elements.pdfPageInput.addEventListener('change', () => {
      const p = parseInt(elements.pdfPageInput.value, 10);
      if (p >= 1 && p <= state.totalPages) scrollToPage(p);
    });

    elements.jumpQuestionsBtn.addEventListener('click', () => scrollToPage(1));
    elements.jumpSolutionsBtn.addEventListener('click', () => {
      if (state.examConfig.firstSolutionPage) scrollToPage(state.examConfig.firstSolutionPage);
    });

    // Viewport Scroll Listener for page number updating
    elements.pdfViewport.addEventListener('scroll', onPdfViewportScroll, { passive: true });

    // Arena CBT Console Controls
    elements.optionsGrid.querySelectorAll('.option-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state.solutionMode) return;
        const opt = btn.dataset.option;
        toggleOptionSelection(opt);
      });
    });

    elements.clearAnswerBtn.addEventListener('click', () => {
      if (state.solutionMode) return;
      clearCurrentAnswer();
    });

    elements.toggleReviewBtn.addEventListener('click', () => {
      if (state.solutionMode) return;
      toggleCurrentReview();
    });

    elements.prevQuestionBtn.addEventListener('click', () => navigateQuestion(-1));
    elements.nextQuestionBtn.addEventListener('click', () => navigateQuestion(1));

    // Submit Modal Triggers
    elements.submitExamBtn.addEventListener('click', openSubmitModal);
    elements.modalCancelBtn.addEventListener('click', () => { elements.submitModal.hidden = true; });
    elements.modalConfirmBtn.addEventListener('click', finalizeAndGradeExam);

    // Exit Triggers
    elements.exitArenaBtn.addEventListener('click', () => {
      if (state.examActive) {
        elements.exitModal.hidden = false;
      } else if (state.sessionId) {
        window.location.href = `dashboard.html?sessionId=${encodeURIComponent(state.sessionId)}`;
      } else {
        window.location.href = 'dashboard.html';
      }
    });

    elements.exitCancelBtn.addEventListener('click', () => { elements.exitModal.hidden = true; });
    elements.exitConfirmBtn.addEventListener('click', () => {
      clearInterval(state.totalTimerInterval);
      clearInterval(state.questionTimerInterval);
      window.location.href = 'dashboard.html';
    });

    // Reattempt Button Triggers
    elements.submitReattemptBtn?.addEventListener('click', handleReattemptSubmit);
    elements.cancelReattemptBtn?.addEventListener('click', () => {
      if (state.sessionId) {
        window.location.href = `dashboard.html?sessionId=${encodeURIComponent(state.sessionId)}`;
      } else {
        window.location.href = 'dashboard.html';
      }
    });

    // Solution Banner Nav
    elements.solPrevBtn?.addEventListener('click', () => navigateSolutionQuestion(-1));
    elements.solNextBtn?.addEventListener('click', () => navigateSolutionQuestion(1));
    $('conceptCompleteNextBtn')?.addEventListener('click', () => { void conceptReviewNext('Completed'); });
    $('conceptSkipNextBtn')?.addEventListener('click', () => { void conceptReviewNext('Visited'); });
    $('conceptCloseHudBtn')?.addEventListener('click', async () => {
      await recordConceptReview('Visited');
      $('ea-concept-timer-hud').hidden = true;
    });
    elements.exitSolModeBtn?.addEventListener('click', () => {
      if (state.sessionId) {
        window.location.href = `dashboard.html?sessionId=${encodeURIComponent(state.sessionId)}`;
      } else {
        window.location.href = 'dashboard.html';
      }
    });

    // Global Keyboard Shortcuts (1-4, A-D, P/N, Arrows)
    window.addEventListener('keydown', onGlobalKeyDown);
  }

  // ----------------------------------------------------
  // Draggable Split Resizer
  // ----------------------------------------------------
  function setupSplitResizer() {
    let isDragging = false;

    elements.splitResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      elements.splitResizer.classList.add('is-dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const containerRect = $('splitContainer').getBoundingClientRect();
      const minLeft = 320;
      const minRight = 280;
      let leftWidth = e.clientX - containerRect.left;
      if (leftWidth < minLeft) leftWidth = minLeft;
      if (containerRect.width - leftWidth < minRight) leftWidth = containerRect.width - minRight;

      const pct = (leftWidth / containerRect.width) * 100;
      elements.pdfPane.style.width = `${pct}%`;
      elements.consolePane.style.width = `${100 - pct}%`;
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      elements.splitResizer.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  // ----------------------------------------------------
  // File Handling & Parsing Pipeline
  // ----------------------------------------------------
  async function handlePdfFile(file) {
    try {
      state.fileName = file.name;
      elements.parsingOverlay.hidden = false;
      elements.parsingStatusText.textContent = 'Reading PDF binary buffer...';

      const originalBuffer = await file.arrayBuffer();
      // Keep an independent, untransferred clone specifically for IndexedDB storage
      state.storageBuffer = originalBuffer.slice(0);
      state.pdfBuffer = originalBuffer;

      elements.parsingStatusText.textContent = 'Loading PDF document into PDF.js...';
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(originalBuffer) });
      state.pdfDoc = await loadingTask.promise;
      state.totalPages = state.pdfDoc.numPages;

      elements.parsingStatusText.textContent = `Analyzing ${state.totalPages} pages for metadata & answer key...`;
      const parsed = await DPPParser.parseDPPDocument(state.pdfDoc, (curr, total) => {
        elements.parsingStatusText.textContent = `Analyzing page ${curr} of ${total}...`;
      });
      state.parsedData = parsed;

      // Update examConfig from parsed results
      state.examConfig.examName = parsed.metadata.suggestedTitle || file.name.replace(/\.pdf$/i, '');
      state.examConfig.subject = parsed.metadata.subject || 'Physics';
      state.examConfig.totalQuestions = parsed.totalQuestions || 25;
      state.examConfig.answerKey = parsed.answerKey || {};
      state.examConfig.solutionPages = parsed.solutionPages || {};
      state.examConfig.firstSolutionPage = parsed.firstSolutionPage;

      // Populate Config Card
      elements.examTitleInput.value = state.examConfig.examName;
      elements.subjectSelect.value = ['Physics', 'Chemistry', 'Mathematics', 'Biology'].includes(state.examConfig.subject)
        ? state.examConfig.subject
        : 'Physics';
      elements.questionCountInput.value = state.examConfig.totalQuestions;

      const keyCount = Object.keys(state.examConfig.answerKey).length;
      if (keyCount > 0) {
        elements.keyDetectionBadge.textContent = `${keyCount} Answers Auto-Detected (Page ${parsed.keyPageNumber || 'Key'})`;
        elements.keyDetectionBadge.style.color = '#58d4b1';
        elements.keyStatusSummary.textContent = `${keyCount} / ${state.examConfig.totalQuestions} verified`;
      } else {
        elements.keyDetectionBadge.textContent = 'No Answer Key Detected (Manual Key)';
        elements.keyDetectionBadge.style.color = '#ff9a58';
        elements.keyStatusSummary.textContent = '0 verified (Use editor below)';
      }

      renderKeyGrid();

      // Show Config Card
      elements.parsingOverlay.hidden = true;
      elements.configCard.hidden = false;
      showToast(`PDF parsed successfully: ${keyCount} questions extracted.`);

    } catch (err) {
      console.error('Failed to parse PDF:', err);
      elements.parsingOverlay.hidden = true;
      showToast(`Error reading PDF: ${err.message}`, true);
    }
  }

  // Render the editable key grid in the setup drawer
  function renderKeyGrid() {
    elements.keyGrid.replaceChildren();
    const count = parseInt(elements.questionCountInput.value, 10) || 25;
    for (let i = 1; i <= count; i++) {
      const qid = String(i);
      const chip = document.createElement('div');
      chip.className = 'key-chip';

      const label = document.createElement('span');
      label.textContent = `Q${i}`;

      const sel = document.createElement('select');
      ['A', 'B', 'C', 'D'].forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        sel.append(o);
      });
      sel.value = state.examConfig.answerKey[qid] || 'A';
      state.examConfig.answerKey[qid] = sel.value;

      sel.addEventListener('change', () => {
        state.examConfig.answerKey[qid] = sel.value;
      });

      chip.append(label, sel);
      elements.keyGrid.append(chip);
    }
  }

  // ----------------------------------------------------
  // Launching the Exam Session
  // ----------------------------------------------------
  async function startExamSession() {
    // Collect user configurations
    state.examConfig.examName = elements.examTitleInput.value.trim() || 'DPP Practice';
    state.examConfig.subject = elements.subjectSelect.value;
    state.examConfig.mode = elements.modeSelect.value;
    state.examConfig.allottedMinutes = parseInt(elements.countdownMinutesInput.value, 10) || 45;
    state.examConfig.allottedTimeMs = state.examConfig.mode === 'countdown' ? state.examConfig.allottedMinutes * 60000 : null;
    state.examConfig.totalQuestions = parseInt(elements.questionCountInput.value, 10) || 25;

    // Reset Exam State
    state.sessionId = crypto.randomUUID();
    state.startedAtMs = Date.now();
    state.examActive = true;
    state.solutionMode = false;
    state.reattemptMode = false;
    state.currentQ = 1;
    state.userAnswers = {};
    state.reviewQIds.clear();
    state.visitedQIds.clear();
    state.dwellMs = {};
    state.firstSeenAt = {};
    state.visits = {};
    state.currentQEnterTime = Date.now();

    // Compute Anti-Cheat Gatekeeper Ceiling:
    // Strictly block answer key and solutions during active exam!
    const keyPage = state.parsedData?.keyPageNumber;
    const solPage = state.parsedData?.firstSolutionPage;
    state.maxExamPage = Math.min((keyPage || state.totalPages + 1) - 1, (solPage || state.totalPages + 1) - 1);
    if (!state.maxExamPage || state.maxExamPage < 1 || isNaN(state.maxExamPage)) {
      state.maxExamPage = state.totalPages;
    }

    // Pre-save PDF binary into IndexedDB at session launch so it is immediately safe
    if (state.storageBuffer) {
      try {
        await DPPStorage.savePdfSession(state.sessionId, {
          fileName: state.fileName,
          pdfBuffer: state.storageBuffer,
          totalPages: state.totalPages,
          metadata: state.parsedData?.metadata || {},
          answerKey: state.examConfig.answerKey,
          solutionPages: state.examConfig.solutionPages
        });
      } catch (err) {
        console.warn('Pre-save PDF session failed:', err);
      }
    }

    // Mark Q1 visited
    state.visitedQIds.add('1');
    state.visits['1'] = 1;
    state.firstSeenAt['1'] = Date.now();

    // Update Topbar
    elements.arenaSessionChip.hidden = false;
    elements.arenaExamTitleBadge.textContent = state.examConfig.examName;
    elements.arenaSubjectBadge.textContent = state.examConfig.subject;
    elements.examLiveMetrics.hidden = false;
    elements.liveTotalTimerLabel.textContent = state.examConfig.mode === 'countdown' ? 'TIME REMAINING' : 'TOTAL TIME';
    
    // Gatekeeper: strictly hide solutions jump button during exam!
    elements.jumpSolutionsBtn.hidden = true;
    if (elements.examSubmitSection) elements.examSubmitSection.hidden = false;
    if (elements.reattemptActions) elements.reattemptActions.hidden = true;
    if (elements.paletteSection) elements.paletteSection.hidden = false;
    const navRow = document.querySelector('.q-nav-row');
    if (navRow) navRow.hidden = false;

    // Switch Views
    elements.setupView.hidden = true;
    elements.arenaWorkspace.hidden = false;
    elements.arenaWorkspace.classList.remove('full-solution-mode');
    elements.solutionModeBanner.hidden = true;
    if (elements.eaSolutionFab) elements.eaSolutionFab.hidden = true;
    if (elements.eaSolutionFabPanel) elements.eaSolutionFabPanel.hidden = true;

    // Render PDF Pages (restricted to maxExamPage)
    await renderAllPdfPages();

    // Render Question Palette
    renderPalette();

    // Set Active Question 1
    setActiveQuestion(1);

    // Start Live Timers
    startTimers();

    showToast('Arena Active! Good luck with your practice.');
  }

  // ----------------------------------------------------
  // Timers: Session & Question Dwell
  // ----------------------------------------------------
  function startTimers() {
    clearInterval(state.totalTimerInterval);
    clearInterval(state.questionTimerInterval);

    state.totalTimerInterval = setInterval(() => {
      const elapsed = Date.now() - state.startedAtMs;
      if (state.examConfig.mode === 'countdown') {
        const remaining = Math.max(0, state.examConfig.allottedTimeMs - elapsed);
        elements.liveTotalTimer.textContent = formatTime(remaining);
        if (remaining <= 0) {
          clearInterval(state.totalTimerInterval);
          showToast('Time is up! Submitting exam...', true);
          finalizeAndGradeExam();
        }
      } else {
        elements.liveTotalTimer.textContent = formatTime(elapsed);
      }
    }, 1000);

    state.questionTimerInterval = setInterval(() => {
      const qid = String(state.currentQ);
      const prevDwell = state.dwellMs[qid] || 0;
      const currentSegment = state.currentQEnterTime ? (Date.now() - state.currentQEnterTime) : 0;
      const totalQuestionTime = prevDwell + currentSegment;
      elements.liveQuestionTimer.textContent = formatTime(totalQuestionTime);
      elements.qDwellBadge.textContent = `⏱ ${formatTime(totalQuestionTime)}`;
    }, 500);
  }

  // Flush dwell time for active question
  function flushCurrentQuestionDwell() {
    if (state.currentQEnterTime) {
      const qid = String(state.currentQ);
      const segment = Date.now() - state.currentQEnterTime;
      state.dwellMs[qid] = (state.dwellMs[qid] || 0) + segment;
      state.currentQEnterTime = Date.now();
    }
  }

  // ----------------------------------------------------
  // PDF Viewer Rendering & Zoom
  // ----------------------------------------------------
  async function renderAllPdfPages() {
    elements.pdfPagesHost.replaceChildren();
    state.renderedPages.clear();

    const pagesCount = (state.examActive || state.reattemptMode)
      ? Math.min(state.totalPages, state.maxExamPage || state.totalPages)
      : state.totalPages;

    elements.pdfTotalPages.textContent = pagesCount;
    elements.pdfPageInput.max = pagesCount;

    for (let i = 1; i <= pagesCount; i++) {
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'pdf-page-wrapper';
      pageWrapper.id = `pdfPageWrapper-${i}`;
      pageWrapper.dataset.pageNumber = String(i);

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas';
      pageWrapper.append(canvas);
      elements.pdfPagesHost.append(pageWrapper);

      // Render page on canvas + text layer
      await renderPageCanvas(i, canvas, pageWrapper);
    }
  }

  async function renderPageCanvas(pageNumber, canvas, pageWrapper) {
    if (!state.pdfDoc) return;
    try {
      const page = await state.pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: state.zoomScale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext('2d');
      const renderContext = {
        canvasContext: ctx,
        transform: [dpr, 0, 0, dpr, 0, 0],
        viewport
      };

      await page.render(renderContext).promise;

      // Mount Text Layer for text selection and question coordinate mapping
      try {
        const textContent = await page.getTextContent();
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        // Set the mandatory scale factor property expected by PDF.js
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
        textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
        textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;
        pageWrapper.append(textLayerDiv);

        await pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: viewport
        }).promise;
      } catch (textErr) {
        console.warn(`Text layer render skipped for page ${pageNumber}:`, textErr);
      }

      state.renderedPages.add(pageNumber);
    } catch (err) {
      console.error(`Error rendering page ${pageNumber}:`, err);
    }
  }

  async function zoomPdf(delta) {
    state.zoomScale = Math.max(0.6, Math.min(3.0, state.zoomScale + delta));
    elements.pdfZoomLabel.textContent = `${Math.round(state.zoomScale * 100)}%`;
    await renderAllPdfPages();
    if (state.solutionMode) {
      const qid = String(state.currentQ);
      const solPage = state.examConfig.solutionPages[qid] || state.examConfig.firstSolutionPage || state.examConfig.keyPageNumber;
      spotlightQuestionInPdf(state.currentQ, solPage);
    } else if (state.examActive || state.reattemptMode) {
      spotlightQuestionInPdf(state.currentQ);
    }
  }

  async function fitPdfToWidth() {
    const viewportWidth = elements.pdfViewport.clientWidth - 48; // padding
    if (viewportWidth > 200 && state.pdfDoc) {
      const page = await state.pdfDoc.getPage(1);
      const standardViewport = page.getViewport({ scale: 1.0 });
      state.zoomScale = Math.max(0.6, Math.min(2.5, viewportWidth / standardViewport.width));
      elements.pdfZoomLabel.textContent = `${Math.round(state.zoomScale * 100)}%`;
      await renderAllPdfPages();
      if (state.solutionMode) {
        const qid = String(state.currentQ);
        const solPage = state.examConfig.solutionPages[qid] || state.examConfig.firstSolutionPage || state.examConfig.keyPageNumber;
        spotlightQuestionInPdf(state.currentQ, solPage);
      } else if (state.examActive || state.reattemptMode) {
        spotlightQuestionInPdf(state.currentQ);
      }
    }
  }

  function scrollToPage(pageNumber) {
    const maxAllowed = (state.examActive || state.reattemptMode)
      ? Math.min(state.totalPages, state.maxExamPage || state.totalPages)
      : state.totalPages;
    const safePage = Math.max(1, Math.min(maxAllowed, pageNumber));

    const targetWrapper = document.getElementById(`pdfPageWrapper-${safePage}`);
    if (targetWrapper) {
      targetWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      elements.pdfPageInput.value = safePage;
    }
  }

  function navigatePdfPage(direction) {
    const curr = parseInt(elements.pdfPageInput.value, 10) || 1;
    const maxAllowed = (state.examActive || state.reattemptMode)
      ? Math.min(state.totalPages, state.maxExamPage || state.totalPages)
      : state.totalPages;
    const next = Math.max(1, Math.min(maxAllowed, curr + direction));
    scrollToPage(next);
  }

  function onPdfViewportScroll() {
    const wrappers = elements.pdfPagesHost.querySelectorAll('.pdf-page-wrapper');
    const viewportTop = elements.pdfViewport.scrollTop;
    const viewportMid = viewportTop + elements.pdfViewport.clientHeight / 3;

    for (const wrap of wrappers) {
      const top = wrap.offsetTop;
      const bottom = top + wrap.offsetHeight;
      if (top <= viewportMid && bottom >= viewportMid) {
        const pageNum = wrap.dataset.pageNumber;
        if (elements.pdfPageInput.value !== pageNum) {
          elements.pdfPageInput.value = pageNum;
        }
        break;
      }
    }
  }

  // ----------------------------------------------------
  // Visual Focus: Active Question PDF Spotlight & Auto-Scroll
  // ----------------------------------------------------
  let spotlightFadeTimeout = null;
  let spotlightRemoveTimeout = null;

  function spotlightQuestionInPdf(qNum, targetPageHint = null) {
    clearTimeout(spotlightFadeTimeout);
    clearTimeout(spotlightRemoveTimeout);
    document.querySelectorAll('.dpp-question-focus-highlight').forEach((el) => el.remove());

    const qRegex = new RegExp('(?:^|\\s)(?:\\(' + qNum + '\\)|Q(?:uestion)?\\.?\\s*' + qNum + '(?:\\b|\\)|:|-|\\.)|' + qNum + '\\s*[-:.)])', 'i');

    let matchingSpan = null;
    let matchingWrapper = null;

    // Search target page hint first if supplied
    if (targetPageHint) {
      const wrapper = document.getElementById(`pdfPageWrapper-${targetPageHint}`);
      if (wrapper) {
        const spans = wrapper.querySelectorAll('.textLayer span');
        for (const span of spans) {
          if (qRegex.test(span.textContent || '')) {
            matchingSpan = span;
            matchingWrapper = wrapper;
            break;
          }
        }
      }
    }

    // If not found, scan all rendered page wrappers sequentially
    if (!matchingSpan) {
      const wrappers = elements.pdfPagesHost.querySelectorAll('.pdf-page-wrapper');
      for (const wrapper of wrappers) {
        const spans = wrapper.querySelectorAll('.textLayer span');
        for (const span of spans) {
          if (qRegex.test(span.textContent || '')) {
            matchingSpan = span;
            matchingWrapper = wrapper;
            break;
          }
        }
        if (matchingSpan) break;
      }
    }

    if (matchingSpan && matchingWrapper) {
      const highlight = document.createElement('div');
      highlight.className = 'dpp-question-focus-highlight';
      const wrapperWidth = matchingWrapper.clientWidth || 800;
      const spanLeft = matchingSpan.offsetLeft;
      const spanTop = matchingSpan.offsetTop;
      const spanWidth = matchingSpan.offsetWidth;
      const spanHeight = matchingSpan.offsetHeight;

      highlight.style.left = `${Math.max(8, spanLeft - 10)}px`;
      highlight.style.top = `${Math.max(0, spanTop - 6)}px`;
      highlight.style.width = `${Math.min(wrapperWidth - spanLeft - 16, Math.max(spanWidth + 40, 320))}px`;
      highlight.style.height = `${Math.max(spanHeight + 12, 36)}px`;
      matchingWrapper.appendChild(highlight);

      // Auto-scroll PDF viewport smoothly so question appears in the upper-third
      const viewportRect = elements.pdfViewport.getBoundingClientRect();
      const spanRect = matchingSpan.getBoundingClientRect();
      const targetScrollTop = elements.pdfViewport.scrollTop + (spanRect.top - viewportRect.top) - 80;
      elements.pdfViewport.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });

      const pageNum = matchingWrapper.dataset.pageNumber;
      if (pageNum && elements.pdfPageInput.value !== pageNum) {
        elements.pdfPageInput.value = pageNum;
      }

      spotlightFadeTimeout = setTimeout(() => {
        highlight.classList.add('fading-out');
      }, 2800);
      spotlightRemoveTimeout = setTimeout(() => {
        highlight.remove();
      }, 3500);
    }
  }

  // ----------------------------------------------------
  // CBT Console Logic: Questions & Options
  // ----------------------------------------------------
  function setActiveQuestion(qNum) {
    if (state.reattemptMode && state.reattemptTargetQ) {
      qNum = state.reattemptTargetQ;
    }
    const total = state.examConfig.totalQuestions;
    if (qNum < 1 || qNum > total) return;

    // Flush dwell on previous question
    flushCurrentQuestionDwell();

    state.currentQ = qNum;
    state.currentQEnterTime = Date.now();
    const qid = String(qNum);

    // Record visit
    state.visitedQIds.add(qid);
    state.visits[qid] = (state.visits[qid] || 0) + 1;
    if (!state.firstSeenAt[qid]) state.firstSeenAt[qid] = Date.now();

    // Update Question Title & Badges
    elements.activeQuestionTitle.textContent = `Question ${qNum}`;
    elements.activeQuestionEyebrow.textContent = `ACTIVE QUESTION (${qNum} / ${total})`;
    
    // Update Option Selection
    const selected = state.userAnswers[qid] || null;
    elements.optionsGrid.querySelectorAll('.option-btn').forEach((btn) => {
      const opt = btn.dataset.option;
      if (opt === selected) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });

    // Update Review button
    const isMarked = state.reviewQIds.has(qid);
    if (isMarked) {
      elements.toggleReviewBtn.classList.add('is-marked');
      elements.toggleReviewBtn.innerHTML = '<span class="bookmark-icon">★</span> Marked for Review';
    } else {
      elements.toggleReviewBtn.classList.remove('is-marked');
      elements.toggleReviewBtn.innerHTML = '<span class="bookmark-icon">☆</span> Mark for Review';
    }

    // Update Status Badge
    updateQuestionStatusBadge(qid);

    // Update Palette active state and colors
    updatePaletteActiveIndicator();
    updatePaletteCounts();

    // Spotlight question in PDF
    spotlightQuestionInPdf(qNum);
  }

  function updateQuestionStatusBadge(qid) {
    const isAnswered = Boolean(state.userAnswers[qid]);
    const isReview = state.reviewQIds.has(qid);

    if (isReview && isAnswered) {
      elements.qStatusBadge.textContent = 'Marked & Answered';
      elements.qStatusBadge.className = 'q-status-badge status-review';
    } else if (isReview) {
      elements.qStatusBadge.textContent = 'Marked for Review';
      elements.qStatusBadge.className = 'q-status-badge status-review';
    } else if (isAnswered) {
      elements.qStatusBadge.textContent = 'Answered';
      elements.qStatusBadge.className = 'q-status-badge status-answered';
    } else {
      elements.qStatusBadge.textContent = 'Unattempted';
      elements.qStatusBadge.className = 'q-status-badge status-unattempted';
    }
  }

  function toggleOptionSelection(option) {
    const qid = String(state.currentQ);
    const prevSelected = state.userAnswers[qid];

    if (prevSelected === option) {
      // Toggle off / deselect
      delete state.userAnswers[qid];
    } else {
      // Select option
      state.userAnswers[qid] = option;
    }

    // Re-render active question option state
    setActiveQuestion(state.currentQ);
  }

  function clearCurrentAnswer() {
    const qid = String(state.currentQ);
    delete state.userAnswers[qid];
    setActiveQuestion(state.currentQ);
    showToast(`Response cleared for Question ${state.currentQ}.`);
  }

  function toggleCurrentReview() {
    const qid = String(state.currentQ);
    if (state.reviewQIds.has(qid)) {
      state.reviewQIds.delete(qid);
    } else {
      state.reviewQIds.add(qid);
    }
    setActiveQuestion(state.currentQ);
  }

  function navigateQuestion(direction) {
    const nextQ = state.currentQ + direction;
    const total = state.examConfig.totalQuestions;
    if (nextQ >= 1 && nextQ <= total) {
      setActiveQuestion(nextQ);
    }
  }

  // ----------------------------------------------------
  // Question Palette
  // ----------------------------------------------------
  function renderPalette() {
    elements.paletteGrid.replaceChildren();
    const total = state.examConfig.totalQuestions;

    for (let i = 1; i <= total; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-btn unvisited';
      btn.id = `paletteBtn-${i}`;
      btn.textContent = String(i);
      btn.dataset.questionNumber = String(i);

      btn.addEventListener('click', () => {
        if (state.solutionMode) {
          setSolutionQuestion(i);
        } else {
          setActiveQuestion(i);
        }
      });

      elements.paletteGrid.append(btn);
    }

    updatePaletteActiveIndicator();
    updatePaletteCounts();
  }

  function updatePaletteActiveIndicator() {
    const total = state.examConfig.totalQuestions;
    for (let i = 1; i <= total; i++) {
      const btn = document.getElementById(`paletteBtn-${i}`);
      if (!btn) continue;
      const qid = String(i);

      if (state.solutionMode) {
        // Solution mode colors based on outcome
        const outcome = state.autopsySession?.outcomes?.[qid] || 'Unattempted';
        btn.className = `palette-btn ${outcome === 'Right' ? 'answered' : outcome === 'Wrong' ? 'visited' : 'unvisited'}`;
      } else {
        const isAnswered = Boolean(state.userAnswers[qid]);
        const isReview = state.reviewQIds.has(qid);
        const isVisited = state.visitedQIds.has(qid);

        if (isReview && isAnswered) {
          btn.className = 'palette-btn review-answered';
        } else if (isReview) {
          btn.className = 'palette-btn review';
        } else if (isAnswered) {
          btn.className = 'palette-btn answered';
        } else if (isVisited) {
          btn.className = 'palette-btn visited';
        } else {
          btn.className = 'palette-btn unvisited';
        }
      }

      if (i === state.currentQ) {
        btn.classList.add('active-q');
      }
    }
  }

  function updatePaletteCounts() {
    const total = state.examConfig.totalQuestions;
    const answeredCount = Object.keys(state.userAnswers).length;
    elements.paletteCountSummary.textContent = `${answeredCount} / ${total} Answered`;
  }

  // ----------------------------------------------------
  // Global Keyboard Navigation
  // ----------------------------------------------------
  function onGlobalKeyDown(e) {
    if (elements.setupView.hidden === false) return;
    const targetTag = e.target?.tagName?.toLowerCase();
    if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;

    const key = e.key;

    // Solution Mode shortcuts
    if (state.solutionMode) {
      if (key === 'ArrowLeft' || key.toLowerCase() === 'p') {
        e.preventDefault();
        navigateSolutionQuestion(-1);
      } else if (key === 'ArrowRight' || key.toLowerCase() === 'n') {
        e.preventDefault();
        navigateSolutionQuestion(1);
      }
      return;
    }

    // Exam or Reattempt Mode shortcuts
    if (!state.examActive && !state.reattemptMode) return;

    // Options: 1, 2, 3, 4 or A, B, C, D
    if (['1', 'a', 'A'].includes(key)) {
      e.preventDefault();
      toggleOptionSelection('A');
    } else if (['2', 'b', 'B'].includes(key)) {
      e.preventDefault();
      toggleOptionSelection('B');
    } else if (['3', 'c', 'C'].includes(key)) {
      e.preventDefault();
      toggleOptionSelection('C');
    } else if (['4', 'd', 'D'].includes(key)) {
      e.preventDefault();
      toggleOptionSelection('D');
    } else if (key.toLowerCase() === 'p' || key === 'ArrowLeft') {
      e.preventDefault();
      if (!state.reattemptMode) navigateQuestion(-1);
    } else if (key.toLowerCase() === 'n' || key === 'ArrowRight' || key === 'Enter') {
      e.preventDefault();
      if (!state.reattemptMode) navigateQuestion(1);
    } else if (key.toLowerCase() === 'm' || key.toLowerCase() === 'r') {
      e.preventDefault();
      if (!state.reattemptMode) toggleCurrentReview();
    }
  }

  // ----------------------------------------------------
  // Final Submission & Auto-Grading Pipeline
  // ----------------------------------------------------
  function openSubmitModal() {
    flushCurrentQuestionDwell();
    const total = state.examConfig.totalQuestions;
    const answered = Object.keys(state.userAnswers).length;
    const unattempted = total - answered;
    const review = state.reviewQIds.size;

    elements.modalTotalQ.textContent = String(total);
    elements.modalAnsweredQ.textContent = String(answered);
    elements.modalUnattemptedQ.textContent = String(unattempted);
    elements.modalReviewQ.textContent = String(review);

    elements.submitModal.hidden = false;
  }

  async function finalizeAndGradeExam() {
    try {
      elements.submitModal.hidden = true;
      clearInterval(state.totalTimerInterval);
      clearInterval(state.questionTimerInterval);
      flushCurrentQuestionDwell();

      state.examActive = false;
      const endedAt = Date.now();
      const durationMs = Math.max(0, endedAt - state.startedAtMs);
      const total = state.examConfig.totalQuestions;

      // Build Questions & Outcomes maps matching Exam Arena schema
      const questions = {};
      const outcomes = {};
      const completedQuestionIds = [];
      let totalRight = 0;
      let totalWrong = 0;
      let totalUnattempted = 0;

      for (let i = 1; i <= total; i++) {
        const qid = String(i);
        const userChoice = state.userAnswers[qid] || null;
        const keyAnswer = state.examConfig.answerKey[qid] || null;

        let outcome = 'Unattempted';
        if (userChoice) {
          if (keyAnswer && userChoice.toUpperCase() === keyAnswer.toUpperCase()) {
            outcome = 'Right';
            totalRight += 1;
          } else {
            outcome = 'Wrong';
            totalWrong += 1;
          }
          completedQuestionIds.push(qid);
        } else {
          totalUnattempted += 1;
        }

        const dwell = state.dwellMs[qid] || 0;
        questions[qid] = {
          questionId: qid,
          label: `Question ${i}`,
          timeMs: dwell,
          outcome,
          userSelected: Boolean(userChoice),
          userChoice,
          correctAnswer: keyAnswer,
          firstSeenAt: state.firstSeenAt[qid] || state.startedAtMs,
          lastSeenAt: endedAt,
          visits: state.visits[qid] || 1
        };

        outcomes[qid] = outcome;
      }

      const netScore = totalRight * 4 - totalWrong * 1;

      // Build complete Session Object
      const session = {
        sessionId: state.sessionId,
        examName: state.examConfig.examName,
        subject: state.examConfig.subject,
        source: 'dpp',
        mode: state.examConfig.mode,
        startedAt: new Date(state.startedAtMs).toISOString(),
        startedAtMs: state.startedAtMs,
        endedAt,
        endedReason: 'user-confirmed',
        durationMs,
        targetQuestions: total,
        allottedTimeMs: state.examConfig.allottedTimeMs,
        answerKey: state.examConfig.answerKey,
        userAnswers: state.userAnswers,
        solutionPages: state.examConfig.solutionPages,
        firstSolutionPage: state.examConfig.firstSolutionPage,
        questions,
        outcomes,
        completedQuestionIds,
        reviewQuestionIds: Array.from(state.reviewQIds),
        stats: {
          totalRight,
          totalWrong,
          totalUnattempted,
          netScore,
          rawAccuracy: completedQuestionIds.length ? (totalRight / completedQuestionIds.length) * 100 : 0
        }
      };

      // 1. Sanitize session payload: ensure pure JSON-serializable primitives
      const sanitizedSession = JSON.parse(JSON.stringify(session));

      // 2. Verify PDF is in IndexedDB without re-putting detached buffers
      const existingPdf = await DPPStorage.getPdfSession(sanitizedSession.sessionId).catch(() => null);
      if (!existingPdf && state.storageBuffer && state.storageBuffer.byteLength > 0 && !state.storageBuffer.detached) {
        // Store as a Blob (immune to detachment issues)
        try {
          const blob = new Blob([state.storageBuffer.slice(0)], { type: 'application/pdf' });
          await DPPStorage.savePdfBlob(sanitizedSession.sessionId, blob, {
            fileName: state.fileName,
            totalPages: state.totalPages,
            metadata: state.parsedData?.metadata || {},
            answerKey: state.examConfig.answerKey,
            solutionPages: state.examConfig.solutionPages
          });
        } catch (blobErr) {
          console.warn('Fallback savePdfBlob failed:', blobErr);
        }
      }

      // 3. Save Session to chrome.storage.local (examHistory, lastReport)
      const data = await chrome.storage.local.get(['examHistory', 'exam_arena_subjects', 'exam_arena_recent_names']);
      const history = Array.isArray(data.examHistory) ? data.examHistory : [];
      const updatedHistory = [sanitizedSession, ...history.filter(s => s && s.sessionId !== sanitizedSession.sessionId)].slice(0, 25);

      const subjects = new Set(Array.isArray(data.exam_arena_subjects) ? data.exam_arena_subjects : []);
      if (sanitizedSession.subject) subjects.add(sanitizedSession.subject);

      const recentNames = new Set(Array.isArray(data.exam_arena_recent_names) ? data.exam_arena_recent_names : []);
      if (sanitizedSession.examName) recentNames.add(sanitizedSession.examName);

      await chrome.storage.local.set({
        examHistory: updatedHistory,
        lastReport: sanitizedSession,
        exam_arena_subjects: Array.from(subjects),
        exam_arena_recent_names: Array.from(recentNames).slice(0, 10)
      });

      showToast(`Exam completed! Score: ${netScore} (${totalRight}R / ${totalWrong}W). Redirecting to Autopsy...`);

      // 4. Redirect to Tier 2 Autopsy Room
      setTimeout(() => {
        const dest = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
          ? chrome.runtime.getURL(`dashboard/dashboard.html?sessionId=${encodeURIComponent(sanitizedSession.sessionId)}`)
          : `dashboard.html?sessionId=${encodeURIComponent(sanitizedSession.sessionId)}`;
        window.location.href = dest;
      }, 1200);

    } catch (err) {
      console.error('Failed to grade and save exam:', {
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
        raw: err
      });
      showToast(`Error grading session: ${err?.message || err?.name || 'Storage Error'}`, true);
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

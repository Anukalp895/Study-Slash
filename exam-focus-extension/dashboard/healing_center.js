let activeSubjectFilter = "ALL";
let bleedItems = [];
const $ = id => document.getElementById(id);

async function loadHealingCenter() {
  const data = await chrome.storage.local.get(["examHistory", "dpp_history"]);
  const exams = Array.isArray(data.examHistory) ? data.examHistory : [];
  const dpps = Array.isArray(data.dpp_history) ? data.dpp_history : [];
  bleedItems = CultivationStore.extractAllTimeBleeds(exams, dpps);
  renderHealingCenter();
}

function renderHealingCenter() {
  const active = bleedItems.filter(item => !item.healed);
  const healedCount = bleedItems.length - active.length;
  $("activeBleedsCount").textContent = String(active.length);
  $("healedQuestionsCount").textContent = String(healedCount);

  const subjects = ["ALL", ...new Set(active.map(item => item.subject))];
  if (!subjects.includes(activeSubjectFilter)) activeSubjectFilter = "ALL";
  const tabs = $("healingTabsNav");
  tabs.replaceChildren();
  subjects.forEach(subject => {
    const count = subject === "ALL" ? active.length : active.filter(item => item.subject === subject).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `healing-tab-btn${subject === activeSubjectFilter ? " active" : ""}`;
    button.setAttribute("aria-pressed", String(subject === activeSubjectFilter));
    button.textContent = `${subject} (${count})`;
    button.addEventListener("click", () => { activeSubjectFilter = subject; renderHealingCenter(); });
    tabs.append(button);
  });

  const visible = activeSubjectFilter === "ALL" ? active : active.filter(item => item.subject === activeSubjectFilter);
  const list = $("healingListContainer");
  list.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("div"); empty.className = "healing-empty";
    const title = document.createElement("h2"); title.textContent = active.length ? "No active wounds in this subject." : "Your archive is clear.";
    const copy = document.createElement("p"); copy.textContent = active.length ? "Choose another subject to continue." : "There are no unresolved wrong answers in your saved history.";
    empty.append(title, copy); list.append(empty); return;
  }
  visible.forEach(item => list.append(createBleedCard(item)));
}

function createBleedCard(bleed) {
  const article = document.createElement("article"); article.className = "healing-entry-card";
  const left = document.createElement("div"); left.className = "h-entry-left";
  const heading = document.createElement("div"); heading.className = "h-entry-header";
  const title = document.createElement("h2"); title.className = "h-entry-title"; title.textContent = `${bleed.examTitle} · ${bleed.label}`;
  const subject = document.createElement("span"); subject.className = "h-entry-subject"; subject.textContent = bleed.subject;
  heading.append(title, subject);
  const meta = document.createElement("div"); meta.className = "h-entry-meta";
  const timestamp = typeof bleed.date === "number" ? bleed.date : Date.parse(bleed.date);
  const date = new Date(timestamp || Date.now()).toLocaleDateString();
  meta.append(document.createTextNode(`Logged ${date} · Your answer: `));
  const answer = document.createElement("b"); answer.textContent = bleed.userChoice || "—";
  meta.append(answer, document.createTextNode(" · −1 mark"));
  left.append(heading, meta);
  const actions = document.createElement("div"); actions.className = "h-entry-actions";
  const heal = document.createElement("button"); heal.type = "button"; heal.className = "btn-heal-action btn-heal-primary"; heal.textContent = "⚡ Heal";
  const review = document.createElement("button"); review.type = "button"; review.className = "btn-heal-action btn-review-concept"; review.textContent = "📖 Review Concept";
  const canTarget = Boolean(bleed.question && (bleed.source === "dpp" || /\/question\//i.test(bleed.url || "")));
  heal.disabled = review.disabled = !canTarget;
  if (!canTarget) heal.title = review.title = "Exact question details are unavailable in this legacy archive record.";
  heal.addEventListener("click", () => void openReattempt(bleed));
  review.addEventListener("click", () => void openConceptReview(bleed));
  actions.append(heal, review); article.append(left, actions);
  return article;
}

function exactMarksQuestionUrl(bleed) {
  const question = bleed.question || {};
  const raw = question.url || bleed.url;
  let url;
  try { url = new URL(raw || "https://web.getmarks.app/"); }
  catch { url = new URL("https://web.getmarks.app/"); }
  if (!/\.getmarks\.app$/i.test(url.hostname)) url = new URL("https://web.getmarks.app/");
  if (!/\/question\//i.test(url.pathname)) {
    url.pathname = `/cpyqbV3/question/${encodeURIComponent(String(question.questionId || bleed.questionId))}/`;
  }
  return url;
}

async function openReattempt(bleed) {
  if (bleed.source === "dpp") {
    const url = chrome.runtime.getURL(`dashboard/dpp_arena.html?sessionId=${encodeURIComponent(bleed.sessionId)}&mode=reattempt&qid=${encodeURIComponent(bleed.questionId)}`);
    await chrome.tabs.create({ url }); return;
  }
  const url = exactMarksQuestionUrl(bleed);
  url.hash = new URLSearchParams({ "ea-intent": "reattempt", "ea-session": bleed.sessionId, "ea-qid": bleed.questionId }).toString();
  await new Promise((resolve, reject) => chrome.storage.local.set({ ea_reattempt_target: {
    sessionId: bleed.sessionId, questionId: bleed.questionId, examTitle: bleed.examTitle,
    label: bleed.label, subject: bleed.subject, url: url.toString()
  } }, () => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()));
  await chrome.tabs.create({ url: url.toString() });
}

async function openConceptReview(bleed) {
  if (bleed.source === "dpp") {
    const url = chrome.runtime.getURL(`dashboard/dpp_arena.html?sessionId=${encodeURIComponent(bleed.sessionId)}&view=solution&qid=${encodeURIComponent(bleed.questionId)}`);
    await chrome.tabs.create({ url }); return;
  }
  const question = bleed.question || {};
  const baseUrl = exactMarksQuestionUrl(bleed);
  const stored = await chrome.storage.local.get(["examHistory", "lastReport"]);
  const history = Array.isArray(stored.examHistory) ? stored.examHistory : [];
  const qid = bleed.questionId;
  const session = history.find(item => String(item.sessionId) === bleed.sessionId) || bleed.session;
  const questionNumber = Number(String(qid).match(/\d+/)?.[0]) || 1;
  const nextUrl = new URL(baseUrl.toString());
  nextUrl.hash = new URLSearchParams({ "ea-intent": "solution", "ea-session": bleed.sessionId, "ea-qid": qid, "ea-qnum": String(questionNumber) }).toString();
  const conceptReview = { ...(session.conceptReview || {}) };
  const prev = conceptReview[qid] || {};
  conceptReview[qid] = { ...prev, status: prev.status === "Completed" ? "Completed" : "Visited", lastReviewedAt: Date.now() };
  const updated = history.map(item => String(item.sessionId) === bleed.sessionId ? { ...item, conceptReview } : item);
  const payload = { examHistory: updated, pendingConceptReview: { sessionId: bleed.sessionId, qid, qnum: questionNumber, targetUrl: baseUrl.toString(), timestamp: Date.now() } };
  if (stored.lastReport && String(stored.lastReport.sessionId) === bleed.sessionId) payload.lastReport = { ...stored.lastReport, conceptReview };
  await chrome.storage.local.set(payload);
  await chrome.tabs.create({ url: nextUrl.toString() });
}

document.addEventListener("DOMContentLoaded", () => {
  void loadHealingCenter();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.examHistory || changes.dpp_history)) {
      $("healingSyncStatus").classList.add("syncing");
      void loadHealingCenter().finally(() => { $("healingSyncStatus").classList.remove("syncing"); });
    }
  });
});

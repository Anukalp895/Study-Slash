const state = { history: [], session: null, active: false, selected: null };
let pacingMode = "session";
let questionTableMode = "decisions";
const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";
const TARGET_KEY = "exam-arena-monthly-target";
const CULTIVATION_KEY = "exam-arena-cultivation-state";
const CULTIVATION_REALMS = [
  { name: "Elementary Profound", start: 1, end: 10, volume: 100 },
  { name: "Nascent Profound", start: 11, end: 20, volume: 250, rule: "Must have exactly 0 Negative Bleed." },
  { name: "True Profound", start: 21, end: 30, volume: 400, rule: "Overall raw accuracy must be > 35%." },
  { name: "Spirit Profound", start: 31, end: 40, volume: 600, rule: "Positive net score over the last 3 logged sessions." },
  { name: "Earth Profound", start: 41, end: 50, volume: 850, rule: "Level 50: one continuous session > 1 hour and net score >= 40%." },
  { name: "Sky Profound", start: 51, end: 60, volume: 1150, rule: "At least 1 subject with >= 60% grasp." },
  { name: "Emperor Profound", start: 61, end: 70, volume: 1500, rule: "At least 2 subjects with >= 65% grasp." },
  { name: "Tyrant Profound", start: 71, end: 80, volume: 1900, rule: "At least 3 subjects with >= 70% grasp." },
  { name: "Sovereign Profound", start: 81, end: 90, volume: 2400, rule: "3-subject grasp and net score efficiency >= 60%." },
  { name: "Divine Origin", start: 91, end: 100, volume: 3000, rule: "Active, unbroken 3-day study streak." },
  { name: "Divine Soul", start: 101, end: 110, volume: 3700, rule: "3 subjects at 75% grasp. Wrong answers inflict 2x XP damage." },
  { name: "Divine Tribulation", start: 111, end: 119, volume: 4500, rule: "Pass a timed 30-question mock at each level; below historical average demotes." },
  { name: "Divine Spirit", start: 120, end: 129, volume: 5400, rule: "7 correct answers in a row without a negative mark." },
  { name: "Divine King", start: 130, end: 139, volume: 6400, rule: "3-subject grasp and average solution time < 1.5x global average." },
  { name: "Divine Sovereign", start: 140, end: 149, volume: 7500, rule: "Correct answers earn progression XP only when faster than global average." },
  { name: "Divine Master", start: 150, end: 159, volume: 8800, rule: "3 subjects at 80% grasp, 10-day streak and 90% pacing efficiency." },
  { name: "Divine Extinction", start: 160, end: 169, volume: 10300, rule: "Wounds cost 5x XP to heal (-25 XP)." },
  { name: "True God", start: 170, end: 179, volume: 12000, rule: "Consistent 90%+ net score on full-length mixed-subject mocks." },
  { name: "Creation God", start: 180, end: 189, volume: 14000, rule: "3 subjects at 95% grasp and a 30-day unbroken streak." },
  { name: "Ancestor God", start: 190, end: 199, volume: 16500, rule: "99% reattempt accuracy, flawless pacing, and exactly 0 negative bleed over the last 500 questions." }
];
const CULTIVATION_LORE = ["The Iron Chevron", "The Emerald Twin Blades", "The Cobalt Vanguard Shield", "The Spectral Wing Talisman", "The Amber Bastion Plate", "The Azure Wing Crest", "The Cinnabar Martial Sovereign", "The Obsidian Overlord Crest", "The Astral Monarch Compass", "The Blooming Vitality Lotus", "The Sacred Soul Sigil", "The Tribulation Lightning Seal", "The Prismatic Spirit Star", "The Solar Mandala Crest", "The Midnight Celestial Star", "The Divine Sun-Gear", "The Gravitational Void", "The Eternal Golden Flame", "The Iridescent Nebula Vortex", "The Primordial Cosmic Eye"];
let cultivationSnapshot = null;
let hallRealmIndex = 0;
let hallSublevel = 1;

function getCumulativeXpForLevel(level) {
  const boundedLevel = Math.min(199, Math.max(1, Math.floor(Number(level) || 1)));
  if (boundedLevel <= 1) return 0;
  return Math.floor(4 * Math.pow(boundedLevel, 2) + 60 * boundedLevel);
}
function getXpForNextSubLevel(currentLevel) {
  const level = Math.min(199, Math.max(1, Math.floor(Number(currentLevel) || 1)));
  if (level >= 199) return 0;
  return getCumulativeXpForLevel(level + 1) - getCumulativeXpForLevel(level);
}
function deriveLevelFromTotalXp(totalXp) {
  const xp = Math.max(0, Number(totalXp) || 0);
  if (xp <= 0) return 1;
  const rawLevel = (-60 + Math.sqrt(3600 + 16 * xp)) / 8;
  let level = Math.min(199, Math.max(1, Math.floor(rawLevel)));
  while (level < 199 && xp >= getCumulativeXpForLevel(level + 1)) level += 1;
  while (level > 1 && xp < getCumulativeXpForLevel(level)) level -= 1;
  return level;
}

function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function sessionTimestamp(session) {
  if (Number(session?.startedAtMs) > 0) return Number(session.startedAtMs);
  const raw = session?.startedAt;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && /^\d{10,13}$/.test(raw)) return Number(raw);
  return Date.parse(raw) || 0;
}
function sessionIdentity(session) { return String(session?.sessionId || sessionTimestamp(session)); }
function localGet(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function localSet(key, value) { try { localStorage.setItem(key, value); } catch { /* Keep the current page usable without localStorage. */ } }
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
function initialStatusOf(session, id, question) {
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
  return { entries, visited, right, wrong, net, marked, rawAccuracy: marked ? right / marked * 100 : null,
    scorePercent: visited.length ? net / (visited.length * 4) * 100 : null };
}
function realmForLevel(level) { return CULTIVATION_REALMS.find((realm) => level >= realm.start && level <= realm.end) || CULTIVATION_REALMS.at(-1); }
function orderedCultivationQuestions(sessions) {
  return sessions.flatMap((session) => getQuestionEntries(session).filter(([id, question]) => statusOf(session, id, question) !== "Not Visited")
    .map(([id, question]) => ({ id, question, session, status: statusOf(session, id, question), at: Number(question.firstSeenAt || sessionTimestamp(session) || 0) }))
    .filter((item) => Number(item.question.timeMs) >= 15000))
    .sort((a, b) => a.at - b.at);
}
function buildCultivationState(sessions) {
  const questions = orderedCultivationQuestions(sessions);
  const attempted = questions.filter((item) => item.status === "Right" || item.status === "Wrong");
  let streak = 0; const correctRunByQuestion = new Map(); let lastWrongAt = -Infinity;
  questions.forEach((item) => {
    if (item.status === "Wrong") { streak = 0; lastWrongAt = item.at; }
    else if (item.status === "Right" && item.at - lastWrongAt >= 15000 && Number(item.question.timeMs) >= 15000) streak += 1;
    correctRunByQuestion.set(item, streak);
  });
  const subjectRecords = new Map();
  questions.forEach((item) => {
    const subject = String(item.session.subject || "").trim(); if (!subject) return;
    if (!subjectRecords.has(subject)) subjectRecords.set(subject, []);
    subjectRecords.get(subject).push(item);
  });
  const subjectGrasp = Object.fromEntries([...subjectRecords].map(([subject, records]) => {
    const recent = records.slice(-100), evaluated = recent.filter((item) => item.status === "Right" || item.status === "Wrong");
    return [subject, { accuracy: evaluated.length ? evaluated.filter((item) => item.status === "Right").length / evaluated.length * 100 : 0, count: evaluated.length }];
  }));
  const right = attempted.filter((item) => item.status === "Right").length;
  const wrong = attempted.filter((item) => item.status === "Wrong").length;
  const rawAccuracy = attempted.length ? right / attempted.length * 100 : 0;
  const recentSessions = sessions.slice().sort((a, b) => sessionTimestamp(a) - sessionTimestamp(b)).slice(-3);
  const recentPositiveNet = recentSessions.length === 3 && recentSessions.every((session) => sessionStats(session).net > 0);
  const positiveEfficiency = attempted.length ? right * 4 - wrong >= attempted.length * 4 * .6 : false;
  const dayKeys = new Set(sessions.filter((session) => sessionStats(session).visited.length).map((session) => localDayKey(new Date(sessionTimestamp(session)))));
  let currentStreak = 0; const cursor = new Date();
  if (!dayKeys.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dayKeys.has(localDayKey(cursor))) { currentStreak += 1; cursor.setDate(cursor.getDate() - 1); }
  let currentDebt = 0; let lifetimeEarnedXp = 0; let netAvailableXp = 0;
  questions.forEach((item, index) => {
    const duration = Number(item.question.timeMs) || 0;
    if (duration < 15000) return;
    if (item.status === "Wrong" && !item.question.cultivationResolved) {
      const damage = index + 1 >= 16000 ? 25 : index + 1 >= 10000 ? 10 : 5;
      currentDebt += damage; return;
    }
    let award = item.question.cultivationResolved ? 10 : item.status === "Right" ? (duration < 45000 ? 15 : 10) : item.status === "Unattempted" && duration < 45000 ? 2 : 0;
    const atLevel = deriveLevelFromTotalXp(netAvailableXp);
    if (atLevel >= 140 && item.status === "Right") award = 0; // No trustworthy global time limit is currently available.
    lifetimeEarnedXp += award;
    const paid = Math.min(currentDebt, award); currentDebt -= paid; award -= paid; netAvailableXp += award;
  });
  const cultivation = {
    total_questions_logged: questions.length, current_debt: currentDebt, rolling_accuracy: rawAccuracy,
    subject_grasp: subjectGrasp, current_streak: currentStreak, xp: netAvailableXp,
    total_xp: netAvailableXp, lifetime_xp: lifetimeEarnedXp,
    questions, attempted, recentPositiveNet, positiveEfficiency, sessions, dayKeys, right, wrong, rawAccuracy,
    maxCorrectRun: Math.max(0, ...correctRunByQuestion.values()),
    last3NetPositive: recentPositiveNet
  };
  localSet(CULTIVATION_KEY, JSON.stringify({ total_questions_logged: cultivation.total_questions_logged, current_debt: currentDebt, rolling_accuracy: rawAccuracy, subject_grasp: subjectGrasp, current_streak: currentStreak, xp: cultivation.xp, total_xp: cultivation.total_xp, lifetime_xp: cultivation.lifetime_xp }));
  return cultivation;
}
function checkRealmConditions(realm, level, cultivation) {
  const passed = [];
  for (let number = 1; number <= CULTIVATION_REALMS.indexOf(realm) + 1; number += 1) {
    const gate = CULTIVATION_REALMS[number - 1];
    let ok = true;
    if (number === 2) ok = cultivation.current_debt === 0;
    if (number === 3) ok = cultivation.rawAccuracy > 35;
    if (number === 4) ok = cultivation.last3NetPositive;
    if (number === 5) {
      const earthSession = cultivation.sessions.some((session) => sessionDuration(session) > 3600000 && sessionStats(session).scorePercent >= 40);
      if (level >= 50) ok = earthSession;
    }
    if (number === 6) ok = Object.values(cultivation.subject_grasp).filter((subject) => subject.accuracy >= 60 && subject.count >= 100).length >= 1;
    if (number === 7) ok = Object.values(cultivation.subject_grasp).filter((subject) => subject.accuracy >= 65 && subject.count >= 100).length >= 2;
    if (number === 8) ok = Object.values(cultivation.subject_grasp).filter((subject) => subject.accuracy >= 70 && subject.count >= 100).length >= 3;
    if (number === 9) ok = Object.values(cultivation.subject_grasp).filter((subject) => subject.accuracy >= 70 && subject.count >= 100).length >= 3 && cultivation.positiveEfficiency;
    if (number === 10) ok = cultivation.current_streak >= 3;
    if (number === 11) ok = Object.values(cultivation.subject_grasp).filter((subject) => subject.accuracy >= 75 && subject.count >= 100).length >= 3;
    if (number === 12) ok = false; // No timed mock result is recorded yet.
    if (number === 13) ok = cultivation.maxCorrectRun >= 7;
    if (number === 14) ok = false; // The app does not retain a global solution-time baseline.
    if (number === 15) ok = false; // A global average time limit is not available in stored sessions.
    if (number === 16) ok = Object.values(cultivation.subject_grasp).filter((subject) => subject.accuracy >= 80 && subject.count >= 100).length >= 3 && cultivation.current_streak >= 10;
    if (number === 18 || number === 20) ok = false; // Full-mock/review history is not represented by current session records.
    if (number === 19) ok = Object.values(cultivation.subject_grasp).filter((subject) => subject.accuracy >= 95 && subject.count >= 100).length >= 3 && cultivation.current_streak >= 30;
    if (!ok) return { eligible: false, gate, number };
    passed.push(gate);
  }
  return { eligible: cultivation.total_questions_logged >= realm.volume && cultivation.current_debt === 0, gate: realm, number: CULTIVATION_REALMS.indexOf(realm) + 1, passed };
}
function checkTrueProfoundConditions(cultivation, level = 21) { return checkRealmConditions(CULTIVATION_REALMS[2], level, cultivation); }
function checkAllCultivationConditions(cultivation, level) { return checkRealmConditions(realmForLevel(level), level, cultivation); }
function getSubLevelDirective(cultivation, level) {
  if (level >= 199) return { tasks: ["All 199 sub-levels are complete."], nextLevel: null, remainingXp: 0 };
  const nextLevel = level + 1;
  const xpThreshold = getCumulativeXpForLevel(nextLevel);
  const remainingXp = Math.max(0, xpThreshold - cultivation.xp);
  const nextRealm = realmForLevel(nextLevel);
  const tasks = [];
  if (cultivation.current_debt > 0) tasks.push(`Heal ${cultivation.current_debt.toLocaleString()} XP of cultivation debt before progression can resume.`);
  if (cultivation.total_questions_logged < nextRealm.volume) tasks.push(`Log ${(nextRealm.volume - cultivation.total_questions_logged).toLocaleString()} more eligible questions (${cultivation.total_questions_logged.toLocaleString()} / ${nextRealm.volume.toLocaleString()}) for the ${nextRealm.name} volume gate.`);
  if (remainingXp > 0) tasks.push(`Earn ${remainingXp.toLocaleString()} XP to reach the Level ${nextLevel} threshold.`);
  const nextGate = checkAllCultivationConditions(cultivation, nextLevel);
  if (!nextGate.eligible && !nextGate.passed && nextGate.gate?.rule) tasks.push(`Meet the ${nextGate.gate.name} condition: ${nextGate.gate.rule}`);
  if (!tasks.length) tasks.push(`Breakthrough to Level ${nextLevel} is ready.`);
  return { tasks, nextLevel, remainingXp, nextGate };
}
function renderCultivation(cultivation) {
  const previousLevel = Number(localGet("exam-arena-last-cultivation-level", "0")) || 0;
  const xpLevel = deriveLevelFromTotalXp(cultivation.xp);
  let level = 1;
  for (let candidate = 2; candidate <= xpLevel; candidate += 1) {
    if (!checkAllCultivationConditions(cultivation, candidate).eligible) break;
    level = candidate;
  }
  const realm = realmForLevel(level); const insideLevel = level - realm.start + 1;
  const xpThreshold = getCumulativeXpForLevel(level);
  const nextLevelXp = getXpForNextSubLevel(level);
  const levelXp = Math.max(0, cultivation.xp - xpThreshold);
  const displayedLevelXp = level >= 199 ? nextLevelXp : Math.min(nextLevelXp, levelXp);
  const progress = level >= 199 ? 100 : nextLevelXp ? Math.min(100, displayedLevelXp / nextLevelXp * 100) : 100;
  const gate = checkAllCultivationConditions(cultivation, level);
  const directive = getSubLevelDirective(cultivation, level);
  const newRealmIndex = CULTIVATION_REALMS.indexOf(realm);
  cultivationSnapshot = { cultivation, level, realm, realmIndex: newRealmIndex, insideLevel, levelXp: displayedLevelXp, nextLevelXp, progress, gate, directive };
  const totalXp = Math.max(0, Number(cultivation.total_xp ?? cultivation.xp) || 0);
  const xpLabel = `${totalXp.toLocaleString()} XP`;
  $("dashboardTotalXp").textContent = xpLabel;
  $("hallTotalXp").textContent = xpLabel;
  $("cultivationTitle").textContent = `${realm.name} Realm - Level ${level}`;
  $("cultivationLevelLabel").textContent = `LEVEL ${level} / 199`;
  const badge = $("cultivationBadge"); badge.className = `cultivation-badge ${level >= 160 ? "god" : level >= 91 ? "divine" : "mortal"}`;
  badge.setAttribute("aria-label", `${realm.name} Realm, level ${level}, sub-level ${CultivationVisuals.toRoman(insideLevel)}`);
  const emblem = CultivationVisuals.renderCultivationBadge(CULTIVATION_REALMS.indexOf(realm), insideLevel, 52);
  const oldRealmIndex = CULTIVATION_REALMS.findIndex((item) => previousLevel >= item.start && previousLevel <= item.end);
  const isMinorAscension = previousLevel > 0 && level > previousLevel && oldRealmIndex === newRealmIndex;
  const isMajorAscension = previousLevel > 0 && level > previousLevel && oldRealmIndex !== newRealmIndex;
  badge.dataset.level = String(level);
  if (isMajorAscension && badge.querySelector("svg")) {
    const previousEmblem = badge.querySelector("svg").cloneNode(true);
    badge.replaceChildren(previousEmblem);
    CultivationVisuals.playBreakthrough({ badge, level: newRealmIndex + 1, realmName: realm.name, incomingEmblem: emblem });
  } else if (isMinorAscension && badge.querySelector("svg")) {
    const fadingEmblem = badge.querySelector("svg").cloneNode(true); fadingEmblem.querySelector(".badge-numeral")?.classList.add("numeral-shatter");
    badge.replaceChildren(fadingEmblem);
    setTimeout(() => {
      if (badge.dataset.level !== String(level)) return;
      badge.replaceChildren(emblem); const numeral = emblem.querySelector(".badge-numeral"); numeral?.classList.add("numeral-impact");
      setTimeout(() => numeral?.classList.remove("numeral-impact"), 380);
    }, 350);
  } else badge.replaceChildren(emblem);
  $("cultivationVolume").textContent = cultivation.total_questions_logged.toLocaleString();
  $("cultivationPercent").textContent = `${Math.round(progress)}%`;
  $("cultivationXp").textContent = level >= 199
    ? `MAX · ${getCumulativeXpForLevel(199).toLocaleString()} XP`
    : `${displayedLevelXp.toLocaleString()} / ${nextLevelXp.toLocaleString()} XP`;
  $("cultivationTrack").setAttribute("aria-valuenow", String(Math.round(progress)));
  $("cultivationProgressFill").style.width = `${progress}%`;
  const wounded = cultivation.current_debt > 0;
  $("cultivationTrack").classList.toggle("wounded", wounded);
  $("cultivationWound").className = `cultivation-flow${wounded ? " wounded" : ""}`;
  $("cultivationWound").textContent = wounded ? `🩸 WOUNDED: Offset -${cultivation.current_debt} XP debt to resume cultivation.` : "🟢 Flow: Unhindered";
  $("cultivationVolumeCondition").textContent = level >= 199 ? "🎯 Pinnacle reached" : `🎯 Next: +${directive.remainingXp.toLocaleString()} XP · Level ${level + 1}`;
  $("cultivationSkillCondition").textContent = `📊 ${directive.tasks[0]}`;
  const fill = $("cultivationProgressFill"); fill.classList.toggle("wounded", wounded);
  renderCultivationRoadmap(cultivation, level, realm, gate);
  $("heroCultivationEyebrow").textContent = `CURRENT REALM · TIER ${CultivationVisuals.toRoman(insideLevel)}`;
  $("heroCultivationTitle").textContent = `${realm.name} Realm`;
  $("heroCultivationLevel").textContent = `Level ${level} / 199 · Tier ${CultivationVisuals.toRoman(insideLevel)}`;
  $("heroCultivationXp").textContent = level >= 199
    ? `MAX · ${getCumulativeXpForLevel(199).toLocaleString()} XP`
    : `${displayedLevelXp.toLocaleString()} / ${nextLevelXp.toLocaleString()} XP`;
  $("heroCultivationFill").style.width = `${progress}%`;
  $("heroCultivationWound").className = `hero-flow${wounded ? " wounded" : ""}`;
  $("heroCultivationWound").textContent = wounded ? `🩸 Wounded (-${cultivation.current_debt} XP)` : "🟢 Unhindered";
  const heroBadge = $("heroCultivationBadge"); heroBadge.replaceChildren(CultivationVisuals.renderCultivationBadge(newRealmIndex, insideLevel, 54));
  if (!cultivationGallery.hidden) renderCultivationRoadmap(cultivation, level, realm, gate);
  $("hallUserSummary").textContent = `LEVEL ${level} · ${realm.name.toUpperCase()}`;
  localSet("exam-arena-last-cultivation-level", String(level));
}
function renderCultivationRoadmap(cultivation, level, currentRealm, gate) {
  if (!cultivationGallery || cultivationGallery.hidden) return;
  hallRealmIndex = Math.max(0, Math.min(CULTIVATION_REALMS.length - 1, hallRealmIndex));
  const realm = CULTIVATION_REALMS[hallRealmIndex];
  const maxSublevel = realm.end - realm.start + 1;
  hallSublevel = Math.max(1, Math.min(maxSublevel, hallSublevel));
  const realmLevel = realm.start + hallSublevel - 1;
  const isLocked = realm.start > level;
  const isPastRealm = realm.end < level;
  const isCurrentLevel = realmLevel === level;
  const tierGroup = hallRealmIndex < 9 ? "MORTAL REALMS" : hallRealmIndex < 16 ? "DIVINE REALMS" : "ANCIENT / TRUE GOD REALMS";
  const stage = $("realmShowcaseStage"); stage.replaceChildren();
  $("gallerySummary").textContent = `Ascension Level ${level} of 199 · ${currentRealm.name} Realm`;
  $("realmPrevBtn").disabled = hallRealmIndex === 0;
  $("realmNextBtn").disabled = hallRealmIndex === CULTIVATION_REALMS.length - 1;

  const feature = document.createElement("div"); feature.className = `realm-feature${isLocked ? " veiled" : ""}`;
  feature.style.setProperty("--realm-color", CultivationVisuals.realms[hallRealmIndex][1][1]);
  const emblemWrap = document.createElement("div"); emblemWrap.className = "realm-feature-emblem";
  const emblem = CultivationVisuals.renderCultivationBadge(hallRealmIndex, hallSublevel, 200);
  if (isLocked) emblem.classList.add("shadow-emblem");
  emblemWrap.append(emblem);
  if (isLocked) { const lock = document.createElement("span"); lock.className = "realm-lock-overlay"; lock.setAttribute("aria-hidden", "true"); lock.textContent = "🔒"; emblemWrap.append(lock); }
  feature.append(emblemWrap);

  const codex = document.createElement("div"); codex.className = "realm-codex";
  const tier = document.createElement("p"); tier.className = "eyebrow"; tier.textContent = `${tierGroup} · REALM ${String(hallRealmIndex + 1).padStart(2,"0")}`;
  const title = document.createElement("h3"); title.className = "realm-codex-title"; title.textContent = `Realm ${String(hallRealmIndex + 1).padStart(2,"0")}: ${realm.name} Realm${isLocked ? " · [Locked]" : ""}`;
  const lore = document.createElement("p"); lore.className = "realm-lore"; lore.textContent = CULTIVATION_LORE[hallRealmIndex];
  codex.append(tier, title, lore);

  if (isLocked) {
    const tabs = document.createElement("div"); tabs.className = "realm-level-tabs locked-tabs";
    for (let sub = 1; sub <= maxSublevel; sub += 1) { const button = document.createElement("button"); button.type = "button"; button.disabled = true; button.textContent = CultivationVisuals.toRoman(sub); tabs.append(button); }
    const mystery = document.createElement("aside"); mystery.className = "realm-mandate mystery-mandate";
    const veil = document.createElement("p"); veil.textContent = "The celestial veils conceal this realm’s trials. Ascend through prior bottlenecks to unlock this realm’s breakthrough conditions.";
    const target = document.createElement("strong"); target.textContent = `🔒 Requires ${realm.volume.toLocaleString()} cumulative attempts to challenge`;
    mystery.append(veil, target); codex.append(tabs, mystery);
  } else {
    const tabs = document.createElement("div"); tabs.className = "realm-level-tabs"; tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", `${realm.name} sub-levels`);
    for (let sub = 1; sub <= maxSublevel; sub += 1) {
      const absoluteLevel = realm.start + sub - 1;
      const button = document.createElement("button"); button.type = "button"; button.className = "realm-level-tab";
      button.textContent = absoluteLevel < level ? `✓ ${CultivationVisuals.toRoman(sub)}` : CultivationVisuals.toRoman(sub);
      button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(sub === hallSublevel)); button.setAttribute("aria-label", `Level ${absoluteLevel}, sub-level ${CultivationVisuals.toRoman(sub)}`);
      if (absoluteLevel < level) button.classList.add("ascended");
      if (absoluteLevel === level) button.classList.add("active");
      if (absoluteLevel > level) button.classList.add("upcoming");
      button.addEventListener("click", () => { hallSublevel = sub; renderCultivationRoadmap(cultivation, level, currentRealm, gate); });
      tabs.append(button);
    }
    const mandate = document.createElement("aside"); mandate.className = `realm-mandate${isPastRealm ? " mandate-complete" : ""}`;
    const mandateTitle = document.createElement("h4"); mandateTitle.textContent = isPastRealm ? "Ascended Mandate" : realmLevel >= 199 ? "Pinnacle Mandate · Level 199" : isCurrentLevel ? `Active Quest · Level ${realmLevel} → ${realmLevel + 1}` : `Sub-level Directive · Level ${realmLevel} → ${realmLevel + 1}`;
    const directive = isCurrentLevel ? getSubLevelDirective(cultivation, level) : getSubLevelDirective(cultivation, realmLevel);
    const questCopy = document.createElement("p"); questCopy.className = "mandate-quest-copy";
    questCopy.textContent = isPastRealm ? "This realm has been ascended." : directive.tasks[0];
    const taskList = document.createElement("ul"); taskList.className = "mandate-task-list";
    if (!isPastRealm) directive.tasks.slice(1).forEach((task) => { const item = document.createElement("li"); item.textContent = task; taskList.append(item); });
    const metrics = document.createElement("div"); metrics.className = "mandate-metrics";
    const makeMetric = (label, value, detail, className = "") => {
      const card = document.createElement("article"); card.className = `mandate-metric${className ? ` ${className}` : ""}`;
      const caption = document.createElement("span"); caption.textContent = label;
      const amount = document.createElement("strong"); amount.textContent = value;
      card.append(caption, amount);
      if (detail) { const note = document.createElement("small"); note.textContent = detail; card.append(note); }
      return card;
    };
    const volumeRemaining = Math.max(0, realm.volume - cultivation.total_questions_logged);
    const xpStart = getCumulativeXpForLevel(realmLevel);
    const xpTarget = realmLevel < 199 ? getCumulativeXpForLevel(realmLevel + 1) : getCumulativeXpForLevel(199);
    const xpDelta = realmLevel < 199 ? getXpForNextSubLevel(realmLevel) : 0;
    const xpEarnedAtLevel = Math.max(0, cultivation.xp - xpStart);
    const xpFill = xpDelta ? Math.min(100, xpEarnedAtLevel / xpDelta * 100) : 100;
    const conditionText = CULTIVATION_REALMS.slice(0, hallRealmIndex + 1).map((item) => item.rule).filter(Boolean);
    const volumeCard = makeMetric("🎯 Cumulative volume", `${cultivation.total_questions_logged.toLocaleString()} / ${realm.volume.toLocaleString()} questions`, volumeRemaining ? `${volumeRemaining.toLocaleString()} more eligible questions` : "Realm volume cleared");
    const xpCard = makeMetric("⚡ Sub-level experience", realmLevel >= 199 ? `MAX · ${getCumulativeXpForLevel(199).toLocaleString()} XP` : `${Math.min(xpDelta, xpEarnedAtLevel).toLocaleString()} / ${xpDelta.toLocaleString()} XP`, realmLevel >= 199 ? "Final level threshold" : `${Math.max(0, xpTarget - cultivation.xp).toLocaleString()} XP to Level ${realmLevel + 1}`);
    const progressTrack = document.createElement("span"); progressTrack.className = "mandate-xp-track";
    const progressFill = document.createElement("i"); progressFill.style.width = `${xpFill}%`; progressTrack.append(progressFill); xpCard.append(progressTrack);
    const conditionCard = makeMetric("📊 Stacked breakthrough conditions", conditionText.length ? conditionText.join(" · ") : "Build the habit; no extra realm constraints.", "Conditions accumulate from every prior realm.", "mandate-condition-card");
    const woundCard = makeMetric("🩸 Wound status", cultivation.current_debt ? `Wounded · ${cultivation.current_debt.toLocaleString()} XP debt` : "Flow unhindered · 0 XP debt", cultivation.current_debt ? "Progression remains locked until healed." : "No cultivation debt.", cultivation.current_debt ? "metric-wounded" : "metric-healthy");
    metrics.append(volumeCard, xpCard, conditionCard, woundCard);
    mandate.append(mandateTitle, questCopy, taskList, metrics); codex.append(tabs); feature.append(codex, mandate);
  }
  if (!feature.contains(codex)) feature.append(codex);
  stage.append(feature);
}
function sessionDuration(session) {
  if (session?.inProgress) return Math.max(0, Date.now() - sessionTimestamp(session));
  return Number(session?.durationMs) || (session?.endedAt ? Math.max(0, Number(session.endedAt) - sessionTimestamp(session)) : 0);
}
function formatDuration(ms, hours = true) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const s = total % 60;
  return hours ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(h * 60 + m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function exactDate(time) {
  const numeric = Number(time);
  const timestamp = Number.isFinite(numeric) && numeric > 0 ? numeric : Date.parse(time);
  return new Date(timestamp || Date.now()).toLocaleString([], { dateStyle: "full", timeStyle: "short" });
}
function sessionsForView() {
  const sessions = Array.isArray(state.history) ? [...state.history] : [];
  if (state.active && state.session) sessions.push({ ...state.session, inProgress: true });
  return sessions.sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a));
}
function visibleQuestions(session) {
  return sessionStats(session).entries;
}
function getSolutionTargetUrl(session, rawId, question, questionIndex) {
  const isDpp = Boolean(session.source === "dpp" || session.isDpp || session.pdfSessionId || session.subject === "DPP" || session.examName?.includes("DPP"));
  const sessionKey = session.sessionId || sessionIdentity(session);
  const parsedNumber = parseQuestionNumber(rawId, question);
  const safeNum = Number.isFinite(parsedNumber) ? parsedNumber : questionIndex + 1;
  if (isDpp) {
    return chrome.runtime.getURL(`dashboard/dpp_arena.html?sessionId=${encodeURIComponent(sessionKey)}&view=solution&qid=${encodeURIComponent(safeNum)}`);
  }
  const targetBaseUrl = question.url || session.testUrl || "https://web.getmarks.app";
  const hashParams = new URLSearchParams({ "ea-intent": "solution", "ea-session": String(sessionKey), "ea-qid": String(rawId), "ea-qnum": String(safeNum) });
  return actionUrl(targetBaseUrl, hashParams.toString());
}
async function handleViewSolutionClick(session, rawId, question, questionIndex, targetUrl) {
  const url = targetUrl || getSolutionTargetUrl(session, rawId, question, questionIndex);
  if (!url) return;
  const isDpp = Boolean(session.source === "dpp" || session.isDpp || session.pdfSessionId || session.subject === "DPP" || session.examName?.includes("DPP"));
  if (isDpp) { await chrome.tabs.create({ url }); return; }

  const sessionKey = String(session.sessionId || sessionIdentity(session));
  const parsedNumber = parseQuestionNumber(rawId, question);
  const safeNum = Number.isFinite(parsedNumber) ? parsedNumber : questionIndex + 1;
  const stored = await chrome.storage.local.get(["examHistory", "lastReport"]);
  const history = Array.isArray(stored.examHistory) ? stored.examHistory : [];
  const update = (item) => {
    if (String(item.sessionId || sessionIdentity(item)) !== sessionKey) return item;
    const conceptReview = { ...(item.conceptReview || {}) };
    const prev = conceptReview[rawId] || conceptReview[String(safeNum)] || { dwellMs: 0 };
    const record = { dwellMs: Number(prev.dwellMs) || 0, status: prev.status === "Completed" ? "Completed" : "Visited", lastReviewedAt: Date.now() };
    conceptReview[rawId] = record;
    conceptReview[String(safeNum)] = record;
    return { ...item, conceptReview };
  };
  const targetBaseUrl = question.url || session.testUrl || "https://web.getmarks.app";
  const pendingConceptReview = { sessionId: sessionKey, qid: String(rawId), qnum: safeNum, targetUrl: targetBaseUrl, timestamp: Date.now() };
  const updates = { examHistory: history.map(update), pendingConceptReview };
  if (stored.lastReport && String(stored.lastReport.sessionId || sessionIdentity(stored.lastReport)) === sessionKey) updates.lastReport = update(stored.lastReport);
  await chrome.storage.local.set(updates);
  await chrome.tabs.create({ url });
}
function createViewSolutionButton(session, rawId, question, questionIndex, disabled = false) {
  const targetUrl = getSolutionTargetUrl(session, rawId, question, questionIndex);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "row-action";
  button.textContent = "View solution";
  button.disabled = disabled || !targetUrl;
  button.addEventListener("click", () => { if (targetUrl) void handleViewSolutionClick(session, rawId, question, questionIndex, targetUrl); });
  return button;
}
function safeQuestionUrl(raw) {
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) && (url.hostname === "getmarks.app" || url.hostname.endsWith(".getmarks.app")) ? url : null;
  } catch { return null; }
}
function actionUrl(raw, hash) { const url = safeQuestionUrl(raw); if (!url) return null; url.hash = hash; return url.toString(); }
function svgElement(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}
function renderLineChart(host, points, options = {}) {
  host.replaceChildren();
  const width = 760; const height = options.height || 220;
  const margin = { top: 16, right: 22, bottom: 35, left: 42 };
  const plotW = width - margin.left - margin.right; const plotH = height - margin.top - margin.bottom;
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "presentation", preserveAspectRatio: "none" });
  const defs = svgElement("defs"); const gradient = svgElement("linearGradient", { id: "chartGlow", x1: "0", y1: "0", x2: "0", y2: "1" });
  gradient.append(svgElement("stop", { offset: "0%", "stop-color": "var(--teal)", "stop-opacity": ".46" }));
  gradient.append(svgElement("stop", { offset: "100%", "stop-color": "var(--teal)", "stop-opacity": "0" }));
  defs.append(gradient); svg.append(defs);
  const yTicks = [0, 25, 50, 75, 100];
  for (const tick of yTicks) {
    const y = margin.top + plotH * (1 - tick / 100);
    svg.append(svgElement("line", { x1: margin.left, y1: y, x2: width - margin.right, y2: y, class: "chart-gridline" }));
    const label = svgElement("text", { x: margin.left - 10, y: y + 3, "text-anchor": "end", class: "chart-axis-label" });
    label.textContent = `${tick}%`; svg.append(label);
  }
  const available = points.filter((point) => point.value != null && Number.isFinite(point.value));
  const secondary = Array.isArray(options.secondaryPoints) ? options.secondaryPoints.filter((point) => point.value != null && Number.isFinite(point.value)) : [];

  if (!available.length && !secondary.length) {
    const empty = svgElement("text", { x: width / 2, y: height / 2, "text-anchor": "middle", class: "chart-empty-label" });
    empty.textContent = options.emptyText || "A few sessions will reveal your trend."; svg.append(empty);
  } else {
    const range = options.timeRange || Math.max(1, points.length - 1);
    const tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    tooltip.hidden = true;
    tooltip.setAttribute("role", "tooltip");
    function positionTooltip(event, node) {
      const bounds = host.getBoundingClientRect();
      const pointBounds = node.getBoundingClientRect();
      const clientX = Number.isFinite(event?.clientX) && event.clientX ? event.clientX : pointBounds.left + pointBounds.width / 2;
      const clientY = Number.isFinite(event?.clientY) && event.clientY ? event.clientY : pointBounds.top + pointBounds.height / 2;
      const x = Math.max(8, Math.min(bounds.width - tooltip.offsetWidth - 8, clientX - bounds.left + 12));
      const y = Math.max(5, Math.min(bounds.height - tooltip.offsetHeight - 5, clientY - bounds.top - tooltip.offsetHeight - 12));
      tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`;
    }
    function showTooltip(point, node, event) {
      tooltip.replaceChildren();
      (point.tooltip || [point.label, `${Number(point.value).toFixed(1)}%`]).forEach((line, index) => {
        const row = document.createElement(index === 0 ? "strong" : "span");
        row.textContent = line; tooltip.append(row);
      });
      tooltip.hidden = false;
      positionTooltip(event, node);
    }

    if (available.length) {
      const coords = available.map((point) => {
        const x = margin.left + (options.timeValues ? (point.x / range) : (point.index / Math.max(1, points.length - 1))) * plotW;
        const value = Math.max(0, Math.min(100, point.value));
        return { ...point, x, y: margin.top + plotH * (1 - value / 100) };
      });
      if (coords.length > 1) {
        const path = svgElement("path", { d: coords.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" "), class: "chart-line" });
        svg.append(path);
        if (!options.timeValues) {
          const fill = svgElement("path", { d: `M${coords[0].x},${height - margin.bottom} ${coords.map((point) => `L${point.x},${point.y}`).join(" ")} L${coords.at(-1).x},${height - margin.bottom} Z`, class: "chart-area" });
          svg.insertBefore(fill, path);
        }
      }
      coords.forEach((point) => {
        const circle = svgElement("circle", { cx: point.x, cy: point.y, r: coords.length < 10 ? 6 : 4.5, class: "chart-point" });
        circle.setAttribute("tabindex", "0");
        circle.setAttribute("role", "img");
        circle.setAttribute("aria-label", (point.tooltip || [point.label, `${Number(point.value).toFixed(1)}%`]).join(". "));
        circle.addEventListener("pointerenter", (event) => showTooltip(point, circle, event));
        circle.addEventListener("pointermove", (event) => { if (!tooltip.hidden) positionTooltip(event, circle); });
        circle.addEventListener("pointerleave", () => { tooltip.hidden = true; });
        circle.addEventListener("focus", () => showTooltip(point, circle));
        circle.addEventListener("blur", () => { tooltip.hidden = true; });
        svg.append(circle);
      });
    }

    if (secondary.length) {
      const coordsSecondary = secondary.map((point) => {
        const x = margin.left + (options.timeValues ? (point.x / range) : (point.index / Math.max(1, secondary.length - 1))) * plotW;
        const value = Math.max(0, Math.min(100, point.value));
        return { ...point, x, y: margin.top + plotH * (1 - value / 100) };
      });
      if (coordsSecondary.length > 1) {
        const secPath = svgElement("path", {
          d: coordsSecondary.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" "),
          class: "chart-line chart-line-reattempt"
        });
        svg.append(secPath);
      }
      coordsSecondary.forEach((point) => {
        const circle = svgElement("circle", {
          cx: point.x,
          cy: point.y,
          r: coordsSecondary.length < 10 ? 6 : 4.5,
          class: "chart-point chart-point-reattempt"
        });
        circle.setAttribute("tabindex", "0");
        circle.setAttribute("role", "img");
        circle.setAttribute("aria-label", (point.tooltip || [point.label, `${Number(point.value).toFixed(1)}%`]).join(". "));
        circle.addEventListener("pointerenter", (event) => showTooltip(point, circle, event));
        circle.addEventListener("pointermove", (event) => { if (!tooltip.hidden) positionTooltip(event, circle); });
        circle.addEventListener("pointerleave", () => { tooltip.hidden = true; });
        circle.addEventListener("focus", () => showTooltip(point, circle));
        circle.addEventListener("blur", () => { tooltip.hidden = true; });
        svg.append(circle);
      });
    }

    host.append(tooltip);
  }
  if (options.timeValues) {
    const maxMinutes = Math.round((options.timeRange || 0) / 60);
    [0, 0.5, 1].forEach((fraction) => {
      const x = margin.left + plotW * fraction;
      const label = svgElement("text", { x, y: height - 9, "text-anchor": fraction === 0 ? "start" : fraction === 1 ? "end" : "middle", class: "chart-axis-label" });
      label.textContent = `${Math.round(maxMinutes * fraction)} min`; svg.append(label);
    });
  } else {
    points.forEach((point, index) => {
      const x = margin.left + (index / Math.max(1, points.length - 1)) * plotW;
      const label = svgElement("text", { x, y: height - 9, "text-anchor": "middle", class: "chart-axis-label" });
      label.textContent = point.label; svg.append(label);
    });
  }
  host.append(svg);
}
function allDailySessions(sessions) {
  const map = new Map();
  for (const session of sessions) {
    const key = localDayKey(new Date(sessionTimestamp(session) || Date.now()));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(session);
  }
  return map;
}
function renderWeeklyAnalytics(sessions) {
  const days = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(); date.setDate(date.getDate() - offset);
    days.push({ date, key: localDayKey(date), value: null, label: date.toLocaleDateString([], { weekday: "short" }) });
  }
  const map = allDailySessions(sessions);
  days.forEach((day, index) => {
    const daySessions = map.get(day.key) || [];
    const stats = daySessions.map(sessionStats);
    const values = stats.map((item) => item.rawAccuracy).filter((value) => value != null);
    const accuracy = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const net = stats.reduce((sum, item) => sum + item.net, 0);
    const dayLabel = day.date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    days[index] = { ...day, value: accuracy, tooltip: [dayLabel, `Net score: ${net > 0 ? "+" : ""}${net}`, `Exact accuracy: ${accuracy == null ? "—" : `${accuracy.toFixed(1)}%`}`] };
  });
  renderLineChart($("weeklyChart"), days.map((day, index) => ({ ...day, index })), { emptyText: "Your weekly trend will appear after a session." });
}
function renderSubjectMastery(sessions) {
  const totals = new Map();
  for (const session of sessions) {
    const subject = typeof session.subject === "string" ? session.subject.trim() : "";
    if (!subject) continue;
    for (const [id, question] of getQuestionEntries(session)) {
      const status = statusOf(session, id, question);
      // Countdown padding is not an approached question and is not part of subject accuracy.
      if (status === "Not Visited") continue;
      if (!totals.has(subject)) totals.set(subject, { subject, right: 0, wrong: 0, unattempted: 0 });
      const record = totals.get(subject);
      if (status === "Right") record.right += 1;
      else if (status === "Wrong") record.wrong += 1;
      else record.unattempted += 1;
    }
  }

  const subjects = [...totals.values()].map((record) => {
    const encountered = record.right + record.wrong + record.unattempted;
    return { ...record, encountered, accuracy: encountered ? record.right / encountered * 100 : 0 };
  }).sort((a, b) => b.accuracy - a.accuracy || a.subject.localeCompare(b.subject));
  const rows = $("subjectMasteryRows"); const badges = $("subjectMasteryBadges");
  rows.replaceChildren(); badges.replaceChildren();
  if (!subjects.length) {
    const empty = document.createElement("p"); empty.className = "mastery-empty";
    empty.textContent = "Subject accuracy will appear here after questions are logged in a named session.";
    rows.append(empty); return;
  }

  const top = subjects[0]; const focus = subjects.at(-1);
  for (const [className, icon, label, record] of [
    ["top-subject", "🏆", "Top Subject", top],
    ["priority-focus", "⚠️", "Priority Focus", focus]
  ]) {
    const badge = document.createElement("span"); badge.className = `mastery-badge ${className}`;
    badge.textContent = `${icon} ${label}: ${record.subject} ${Math.round(record.accuracy)}%`;
    badges.append(badge);
  }

  subjects.forEach((record) => {
    const row = document.createElement("div"); row.className = "mastery-row";
    const copy = document.createElement("div"); copy.className = "mastery-row-copy";
    const name = document.createElement("span"); name.className = "mastery-subject"; name.textContent = record.subject;
    const accuracy = document.createElement("span"); accuracy.className = "mastery-accuracy"; accuracy.textContent = `${Math.round(record.accuracy)}%`;
    copy.append(name, accuracy);
    const track = document.createElement("div"); track.className = "mastery-track"; track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", `${record.subject} accuracy`); track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100"); track.setAttribute("aria-valuenow", String(Math.round(record.accuracy)));
    const fill = document.createElement("div"); fill.className = "mastery-fill"; fill.style.width = `${Math.max(0, Math.min(100, record.accuracy))}%`;
    track.append(fill); row.append(copy, track); rows.append(row);
  });
}

function calculateMonthlyCultivatedTotal(examHistory, targetMonthKey) {
  const [year, month] = targetMonthKey.split("-").map(Number);
  const cultivatedSet = new Set();

  (Array.isArray(examHistory) ? examHistory : []).forEach((session) => {
    const sDate = new Date(session.date || session.startTime || session.timestamp || session.startedAt || session.startedAtMs || 0);
    if (sDate.getFullYear() !== year || (sDate.getMonth() + 1) !== month) return;

    Object.entries(session.questions || {}).forEach(([qid, q]) => {
      // Must have registered a concrete answer
      if (q.outcome === "Right" || q.outcome === "Wrong") {
        cultivatedSet.add(`${session.sessionId || session.date || session.startedAt || session.timestamp}_${qid}`);
      }
    });

    // Check reattempt sub-ledger for newly cultivated unattempted questions
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

function generateMonthlyReport(monthKey, examHistory, monthlyGoal) {
  const [year, month] = monthKey.split("-").map(Number);
  const monthName = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  
  const monthSessions = (Array.isArray(examHistory) ? examHistory : []).filter((s) => {
    const sDate = new Date(s.date || s.startTime || s.timestamp || s.startedAt || s.startedAtMs || 0);
    return sDate.getFullYear() === year && (sDate.getMonth() + 1) === month;
  });

  // Calculate day-by-day activity
  const dailyBreakdown = {};
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    dailyBreakdown[d] = { questions: 0, right: 0, wrong: 0, timeMs: 0 };
  }

  let totalDwellMs = 0;
  let totalXP = 0;
  const uniqueCultivatedQuestions = new Set();
  let rightCount = 0;
  let wrongCount = 0;

  monthSessions.forEach((session) => {
    const sDate = new Date(session.date || session.startTime || session.timestamp || session.startedAt || session.startedAtMs || 0);
    const day = sDate.getDate();
    const sessionDwell = Number(session.durationMs) || Number(session.elapsedMs) || 0;
    totalDwellMs += sessionDwell;

    let sessionCalculatedDwell = 0;
    Object.entries(session.questions || {}).forEach(([qid, q]) => {
      const qTime = Number(q.timeMs) || 0;
      sessionCalculatedDwell += qTime;
      if (q.outcome === "Right" || q.outcome === "Wrong") {
        const uniqueKey = `${session.sessionId || session.date || session.startedAt || session.timestamp}_${qid}`;
        if (!uniqueCultivatedQuestions.has(uniqueKey)) {
          uniqueCultivatedQuestions.add(uniqueKey);
          if (dailyBreakdown[day]) dailyBreakdown[day].questions++;
          if (q.outcome === "Right") {
            rightCount++;
            if (dailyBreakdown[day]) dailyBreakdown[day].right++;
          } else {
            wrongCount++;
            if (dailyBreakdown[day]) dailyBreakdown[day].wrong++;
          }
        }
      }
    });

    if (sessionDwell === 0) {
      totalDwellMs += sessionCalculatedDwell;
    }

    // Check reattempt sub-ledger for newly cultivated unattempted questions
    (session.reattemptLedger || []).forEach((reattempt) => {
      const orig = session.questions?.[reattempt.questionId];
      if (orig && (orig.outcome === "Unattempted" || !orig.outcome)) {
        if (reattempt.outcome === "Right" || reattempt.outcome === "Wrong") {
          const uniqueKey = `${session.sessionId || session.date || session.startedAt || session.timestamp}_${reattempt.questionId}`;
          if (!uniqueCultivatedQuestions.has(uniqueKey)) {
            uniqueCultivatedQuestions.add(uniqueKey);
            if (dailyBreakdown[day]) dailyBreakdown[day].questions++;
            if (reattempt.outcome === "Right") {
              rightCount++;
              if (dailyBreakdown[day]) dailyBreakdown[day].right++;
            } else {
              wrongCount++;
              if (dailyBreakdown[day]) dailyBreakdown[day].wrong++;
            }
          }
        }
      }
    });

    let sXP = session.cultivationXpGained || 0;
    if (!sXP) {
      Object.values(session.questions || {}).forEach((q) => {
        if (q.outcome === "Right") sXP += 10;
        else if (q.cultivationResolved) sXP += 10;
      });
      (session.reattemptLedger || []).forEach((r) => {
        const orig = session.questions?.[r.questionId];
        if (orig && (orig.outcome === "Unattempted" || !orig.outcome) && r.outcome === "Right") sXP += 10;
      });
    }
    totalXP += sXP;
  });

  const cultivatedCount = uniqueCultivatedQuestions.size;
  const accuracy = cultivatedCount > 0 ? Math.round((rightCount / cultivatedCount) * 100) : 0;
  const goalAchieved = cultivatedCount >= monthlyGoal;

  return {
    monthKey,
    monthName,
    goalTarget: monthlyGoal,
    cultivatedCount,
    goalAchieved,
    percentComplete: Math.min(100, Math.round((cultivatedCount / monthlyGoal) * 100)),
    rightCount,
    wrongCount,
    accuracy,
    totalDwellMs,
    totalXP,
    monthSessionsCount: monthSessions.length,
    dailyBreakdown,
    generatedAt: Date.now()
  };
}

async function checkMonthlyRollover() {
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  
  const { lastActiveMonth, monthlyReports = {}, examHistory = [], monthlyGoal = 500 } = 
    await chrome.storage.local.get(["lastActiveMonth", "monthlyReports", "examHistory", "monthlyGoal"]);

  const targetMonthlyGoal = Number(localGet(TARGET_KEY, String(monthlyGoal))) || monthlyGoal || 500;

  if (!lastActiveMonth) {
    // Initial run: establish baseline
    await chrome.storage.local.set({ lastActiveMonth: currentMonthKey });
    return;
  }

  if (lastActiveMonth !== currentMonthKey) {
    // The previous month has concluded: compile official Report Card
    const concludedReport = generateMonthlyReport(lastActiveMonth, examHistory, targetMonthlyGoal);
    monthlyReports[lastActiveMonth] = concludedReport;

    await chrome.storage.local.set({
      lastActiveMonth: currentMonthKey,
      monthlyReports
    });

    // Display the Report Card celebration modal on first visit
    openMonthlyReportModal(concludedReport);
  }
}

let activeReportCard = null;
let currentStoryCardType = "realm";
const STORY_CARD_TYPES = ["realm", "combat", "focus", "summary"];

function getActiveRealmInfo() {
  if (cultivationSnapshot) {
    return {
      realmName: cultivationSnapshot.realm?.name || "Spirit Profound",
      realmIndex: cultivationSnapshot.realmIndex != null ? cultivationSnapshot.realmIndex : 3,
      insideLevel: cultivationSnapshot.insideLevel || 1,
      subLevels: (cultivationSnapshot.realm?.end - cultivationSnapshot.realm?.start + 1) || 10,
      level: cultivationSnapshot.level || 1,
      woundText: cultivationSnapshot.cultivation?.current_debt > 0 
        ? `🩸 Wounded (-${cultivationSnapshot.cultivation.current_debt} XP)` 
        : "🟢 Flow: Unhindered",
      currentStreak: cultivationSnapshot.cultivation?.current_streak || 1
    };
  }
  return {
    realmName: "Spirit Profound",
    realmIndex: 3,
    insideLevel: 4,
    subLevels: 10,
    level: 34,
    woundText: "🟢 Flow: Unhindered",
    currentStreak: 1
  };
}

function renderStoryCardView(report, cardType, realmInfo) {
  const host = $("cardDynamicContent");
  if (!host) return;

  $("cardMonthTag").textContent = (report.monthName || "MONTH").toUpperCase();

  // Update tabs
  document.querySelectorAll("#storyTabsBar .story-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.card === cardType);
  });

  const cardIdx = STORY_CARD_TYPES.indexOf(cardType);
  document.querySelectorAll("#storyIndicators .dot").forEach((dot, idx) => {
    dot.classList.toggle("active", idx === cardIdx);
  });

  const titles = {
    realm: "Card 1 of 4: Realm Ascension & Qi Harvest",
    combat: "Card 2 of 4: Combat Mastery & Precision",
    focus: "Card 3 of 4: Deep Focus & Grind",
    summary: "Card 4 of 4: Monthly Chronicle Overview"
  };
  if ($("storyCardCounter")) $("storyCardCounter").textContent = titles[cardType] || "Story Card";

  if (cardType === "realm") {
    const realmIdx = Math.max(0, Math.min(19, (realmInfo.realmIndex != null ? realmInfo.realmIndex : 0)));
    const badgeSvg = window.CultivationVisuals?.renderCultivationBadge?.(realmIdx, realmInfo.insideLevel || 1, 88);
    const badgeMarkup = badgeSvg ? badgeSvg.outerHTML : "⚔️";

    host.innerHTML = `
      <div class="story-emblem-wrap">
        <div id="cardRealmEmblem" class="story-realm-emblem">${badgeMarkup}</div>
        <h2 id="cardRealmTitle" class="story-realm-name">${realmInfo.realmName || "Spirit Profound Realm"}</h2>
        <div class="story-stage-tag">STAGE ${realmInfo.insideLevel || 1} / ${realmInfo.subLevels || 10} · LEVEL ${realmInfo.level || 1}</div>
        <div id="cardGoalBadge" class="story-goal-banner ${report.goalAchieved ? "achieved" : "in-progress"}">
          ${report.goalAchieved ? "★ MONTHLY GOAL TRANSCENDED ★" : "MONTHLY TRIAL RECORD"}
        </div>
      </div>
      <div class="story-bento-dual">
        <div class="story-stat-box highlight">
          <span class="stat-num" id="cardCultivatedQ">${report.cultivatedCount}</span>
          <span class="stat-lbl">Questions Cultivated</span>
          <span class="stat-sub">${report.percentComplete}% of ${report.goalTarget} target</span>
        </div>
        <div class="story-stat-box highlight">
          <span class="stat-num" id="cardXpEarned">+${report.totalXP.toLocaleString()}</span>
          <span class="stat-lbl">Qi Harvested</span>
          <span class="stat-sub">Cultivation Experience</span>
        </div>
      </div>
      <div class="story-callout-panel">
        <span>✨ Ascending Flow · <b>${realmInfo.woundText || "🟢 Flow: Unhindered"}</b></span>
      </div>
    `;
    $("cardFooterTagline").textContent = "TRACKED WITH FOCUS · ZERO DISTRACTIONS";

  } else if (cardType === "combat") {
    host.innerHTML = `
      <div class="story-hero-metric-wrap">
        <span class="story-metric-caption">Combat Precision Meter</span>
        <div class="story-giant-metric">${report.accuracy}%</div>
        <span class="story-tier-pill">${report.accuracy >= 80 ? "S-TIER PRECISION" : report.accuracy >= 65 ? "A-TIER EFFICIENCY" : "B-TIER COMBATANT"}</span>
      </div>
      <div class="story-metric-grid">
        <div class="story-stat-box" style="border-color: rgba(16, 185, 129, 0.4);">
          <span class="stat-num" style="color: #10b981;">${report.rightCount}</span>
          <span class="stat-lbl">Confirmed Right</span>
          <span class="stat-sub">+4 marks each</span>
        </div>
        <div class="story-stat-box" style="border-color: rgba(239, 68, 68, 0.4);">
          <span class="stat-num" style="color: #ef4444;">${report.wrongCount}</span>
          <span class="stat-lbl">Negative Bleed</span>
          <span class="stat-sub">−1 marks lost</span>
        </div>
        <div class="story-stat-box" style="grid-column: span 2; border-color: rgba(56, 189, 248, 0.4);">
          <span class="stat-num" style="color: #38bdf8;">+${(report.rightCount * 4 - report.wrongCount)}</span>
          <span class="stat-lbl">Net Scoring Marks</span>
          <span class="stat-sub">Exam Marking Efficiency</span>
        </div>
      </div>
      <div class="story-callout-panel">
        <span>⚔️ Every mark defended. Every mistake analyzed.</span>
      </div>
    `;
    $("cardFooterTagline").textContent = "COMBAT ACCURACY · CALCULATED SKIPS";

  } else if (cardType === "focus") {
    const hours = (report.totalDwellMs / 3600000).toFixed(1);
    host.innerHTML = `
      <div class="story-hero-metric-wrap">
        <div class="streak-orbit" style="width: 72px; height: 72px; margin-bottom: 4px;">
          <svg viewBox="0 0 72 72" style="width: 44px; height: 44px; fill: var(--orange); filter: drop-shadow(0 0 8px #ff7a33);"><path d="M38 8c3 13-8 15-4 26 2-5 7-8 11-11 10 14 15 22 9 34-4 8-12 12-21 11-13-1-22-11-21-24 1-9 7-17 16-26-1 10 0 14 3 17C36 27 39 20 38 8Z"/><path class="flame-core" d="M38 38c2 7-4 9-2 15 1-3 3-4 5-6 5 7 6 11 3 16-2 4-6 6-10 5-7-1-11-6-10-12 0-5 4-9 8-13 0 5 0 7 2 9 2-4 3-8 4-14Z" fill="#ffd18a"/></svg>
        </div>
        <div class="story-giant-metric" style="color: #f59e0b; text-shadow: 0 0 25px rgba(245, 158, 11, 0.4);">${hours}h</div>
        <span class="story-metric-caption">In Pure Deep Focus</span>
      </div>
      <div class="story-metric-grid">
        <div class="story-stat-box" style="border-color: rgba(245, 158, 11, 0.4);">
          <span class="stat-num" style="color: #fbbf24;">${realmInfo.currentStreak || 1}d</span>
          <span class="stat-lbl">Active Streak</span>
          <span class="stat-sub">Consecutive Days</span>
        </div>
        <div class="story-stat-box">
          <span class="stat-num" style="color: #f8fafc;">${report.monthSessionsCount || 1}</span>
          <span class="stat-lbl">Arena Sessions</span>
          <span class="stat-sub">Completed Trials</span>
        </div>
      </div>
      <div class="story-callout-panel" style="border-color: rgba(245, 158, 11, 0.3);">
        <b style="color: #fdba74; letter-spacing: 0.08em;">CONSISTENCY OVER INTENSITY</b><br>
        <span>Zero Social Media Leaks · Shielded Exam Mode</span>
      </div>
    `;
    $("cardFooterTagline").textContent = "TRACKED WITH FOCUS · ZERO DISTRACTIONS";

  } else {
    // Summary Overview
    const hours = (report.totalDwellMs / 3600000).toFixed(1) + "h";
    host.innerHTML = `
      <div class="story-emblem-wrap" style="gap: 4px;">
        <h2 class="story-realm-name" style="font-size: 20px;">${realmInfo.realmName || "Spirit Profound Realm"}</h2>
        <div class="story-stage-tag">STAGE ${realmInfo.insideLevel || 1} · LEVEL ${realmInfo.level || 1} / 199</div>
        <div class="story-goal-banner ${report.goalAchieved ? "achieved" : "in-progress"}" style="margin-top: 2px;">
          ${report.goalAchieved ? "★ MONTHLY GOAL ACHIEVED ★" : "MONTHLY TRIAL RECORD"}
        </div>
      </div>
      <div class="story-metric-grid" style="gap: 8px;">
        <div class="story-stat-box highlight">
          <span class="stat-num" style="font-size: 22px;">${report.cultivatedCount}</span>
          <span class="stat-lbl">Cultivated</span>
        </div>
        <div class="story-stat-box">
          <span class="stat-num" style="font-size: 22px; color: #38bdf8;">${report.accuracy}%</span>
          <span class="stat-lbl">Accuracy</span>
        </div>
        <div class="story-stat-box">
          <span class="stat-num" style="font-size: 22px; color: #f8fafc;">${hours}</span>
          <span class="stat-lbl">Dwell Time</span>
        </div>
        <div class="story-stat-box">
          <span class="stat-num" style="font-size: 22px; color: #a855f7;">+${report.totalXP}</span>
          <span class="stat-lbl">Qi Harvested</span>
        </div>
      </div>
      <div class="story-callout-panel">
        <span>Logged ${report.monthSessionsCount || 1} sessions with ${report.rightCount} correct answers.</span>
      </div>
    `;
    $("cardFooterTagline").textContent = "PURE ACADEMIC FOCUS · ZERO DISTRACTIONS";
  }
}

function openMonthlyReportModal(report, initialCard = "realm") {
  activeReportCard = report;
  currentStoryCardType = initialCard;
  const modal = $("monthlyReportModal");
  if (!modal) return;
  modal.hidden = false;
  renderStoryCardView(report, currentStoryCardType, getActiveRealmInfo());
}

function closeMonthlyReportModal() {
  const modal = $("monthlyReportModal");
  if (modal) modal.hidden = true;
}

async function openMonthlyReportsArchiveModal() {
  const modal = $("monthlyReportsArchiveModal");
  if (!modal) return;
  modal.hidden = false;

  const data = await chrome.storage.local.get(["monthlyReports", "examHistory", "monthlyGoal", "lastActiveMonth"]);
  const reports = data.monthlyReports || {};
  const list = $("monthlyReportsArchiveList");
  const empty = $("monthlyReportsArchiveEmpty");

  if (!list || !empty) return;
  list.replaceChildren();

  const entries = Object.entries(reports).sort(([a], [b]) => b.localeCompare(a));
  if (!entries.length) {
    empty.hidden = false;
    list.hidden = true;
    return;
  }

  empty.hidden = true;
  list.hidden = false;

  entries.forEach(([monthKey, report]) => {
    const card = document.createElement("div");
    card.className = "ea-archive-card";
    const hours = (report.totalDwellMs / 3600000).toFixed(1) + "h";

    card.innerHTML = `
      <div class="ea-archive-card-header">
        <span class="ea-archive-month">${report.monthName || monthKey}</span>
        <span class="ea-archive-badge ${report.goalAchieved ? "achieved" : "concluded"}">
          ${report.goalAchieved ? "★ Goal Transcended" : "Trial Concluded"}
        </span>
      </div>
      <div class="ea-archive-stats-row">
        <div class="ea-archive-stat">
          <span class="ea-archive-stat-val">${report.cultivatedCount}</span>
          <span class="ea-archive-stat-lbl">Cultivated</span>
        </div>
        <div class="ea-archive-stat">
          <span class="ea-archive-stat-val">${report.accuracy}%</span>
          <span class="ea-archive-stat-lbl">Accuracy</span>
        </div>
        <div class="ea-archive-stat">
          <span class="ea-archive-stat-val">${hours}</span>
          <span class="ea-archive-stat-lbl">Focus Time</span>
        </div>
        <div class="ea-archive-stat">
          <span class="ea-archive-stat-val">+${report.totalXP}</span>
          <span class="ea-archive-stat-lbl">Qi Harvest</span>
        </div>
      </div>
      <button class="ea-btn-primary" style="margin-top: 6px;" type="button">📸 Open Flex Cards</button>
    `;

    card.querySelector("button")?.addEventListener("click", () => {
      modal.hidden = true;
      openMonthlyReportModal(report, "realm");
    });

    list.append(card);
  });
}

function closeMonthlyReportsArchiveModal() {
  const modal = $("monthlyReportsArchiveModal");
  if (modal) modal.hidden = true;
}

async function exportStatusCardToPng(report, realmInfo, cardType = "realm") {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");

  // Helper for rounded rectangles with fallback
  function drawRoundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
    }
  }

  // 1. Celestial Deep Dark Gradient Background
  const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
  bgGrad.addColorStop(0, "#020817");
  bgGrad.addColorStop(0.5, "#0b1528");
  bgGrad.addColorStop(1, "#020817");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1080, 1920);

  // 2. Ambient Neon Glow
  const glowCenterY = cardType === "focus" ? 640 : 540;
  const glow = ctx.createRadialGradient(540, glowCenterY, 50, 540, glowCenterY, 550);
  if (cardType === "focus") {
    glow.addColorStop(0, "rgba(245, 158, 11, 0.25)");
  } else if (cardType === "combat") {
    glow.addColorStop(0, "rgba(56, 189, 248, 0.22)");
  } else {
    glow.addColorStop(0, "rgba(20, 184, 166, 0.25)");
  }
  glow.addColorStop(1, "rgba(2, 8, 23, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 1920);

  // 3. Subtle Hexagonal / Grid Matrix Accents
  ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
  ctx.lineWidth = 1;
  for (let x = 60; x < 1020; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 60);
    ctx.lineTo(x, 1860);
    ctx.stroke();
  }

  // 4. Double Precision Border Stroke
  ctx.strokeStyle = cardType === "focus" ? "rgba(245, 158, 11, 0.4)" : cardType === "combat" ? "rgba(56, 189, 248, 0.4)" : "rgba(20, 184, 166, 0.45)";
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, 1000, 1840);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  ctx.strokeRect(52, 52, 976, 1816);

  // 5. Header Branding
  ctx.fillStyle = cardType === "focus" ? "#f59e0b" : cardType === "combat" ? "#38bdf8" : "#14b8a6";
  ctx.font = "bold 38px 'SF Mono', ui-monospace, monospace, sans-serif";
  ctx.textAlign = "left";
  const brandSub = cardType === "combat" ? "COMBAT INTEL" : cardType === "focus" ? "DISCIPLINE DOSSIER" : cardType === "summary" ? "MONTHLY CHRONICLE" : "CULTIVATION LOG";
  ctx.fillText(`⚔️ EXAM ARENA · ${brandSub}`, 90, 140);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText((report.monthName || "MONTH").toUpperCase(), 990, 140);
  ctx.textAlign = "left";

  // Helper function to draw Stat Cards
  const drawStatCard = (x, y, w, h, label, val, sub = "", color = "#ffffff", borderGlow = "rgba(255,255,255,0.1)") => {
    ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
    ctx.strokeStyle = borderGlow;
    ctx.lineWidth = 3;
    drawRoundRect(x, y, w, h, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = "bold 64px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(val, x + w / 2, y + (sub ? 82 : 96));

    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(label, x + w / 2, y + (sub ? 126 : 142));

    if (sub) {
      ctx.fillStyle = "#64748b";
      ctx.font = "20px 'SF Mono', monospace";
      ctx.fillText(sub, x + w / 2, y + 162);
    }
  };

  // 6. Draw Content by Card Type
  if (cardType === "realm") {
    // Large Realm Insignia Vector Crest
    const cx = 540, cy = 380;
    // Outer glowing circles
    ctx.strokeStyle = "rgba(20, 184, 166, 0.3)";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, 110, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#14b8a6";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, 95, 0, Math.PI * 2); ctx.stroke();
    // Inner filled core
    const coreGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 80);
    coreGrad.addColorStop(0, "#5eead4");
    coreGrad.addColorStop(0.6, "#14b8a6");
    coreGrad.addColorStop(1, "#0d9488");
    ctx.fillStyle = coreGrad;
    ctx.beginPath(); ctx.arc(cx, cy, 80, 0, Math.PI * 2); ctx.fill();
    // Crest Emblem Center text
    ctx.fillStyle = "#020817";
    ctx.font = "900 48px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(window.CultivationVisuals?.toRoman?.(realmInfo.insideLevel || 1) || String(realmInfo.insideLevel || 1), cx, cy + 18);

    // Realm Title & Sublevel
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 68px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(realmInfo.realmName || "Spirit Profound Realm", 540, 560);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 36px 'SF Mono', ui-monospace, monospace";
    ctx.fillText(`STAGE ${realmInfo.insideLevel || 1} / ${realmInfo.subLevels || 10} · LEVEL ${realmInfo.level || 1} / 199`, 540, 620);

    // Goal Banner
    ctx.fillStyle = report.goalAchieved ? "#10b981" : "#f59e0b";
    drawRoundRect(240, 670, 600, 72, 36);
    ctx.fill();
    ctx.fillStyle = "#020817";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText(report.goalAchieved ? "★ MONTHLY GOAL TRANSCENDED ★" : "MONTHLY TRIAL RECORD", 540, 718);

    // Two Giant Stat Cards
    drawStatCard(100, 800, 420, 220, "Cultivated Questions", String(report.cultivatedCount), `${report.percentComplete}% of target`, "#14b8a6", "rgba(20, 184, 166, 0.4)");
    drawStatCard(560, 800, 420, 220, "Qi Harvested", `+${report.totalXP.toLocaleString()}`, "Cultivation Experience", "#a855f7", "rgba(168, 85, 247, 0.4)");

    // Milestone Highlight Panel
    ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
    ctx.strokeStyle = "rgba(20, 184, 166, 0.25)";
    ctx.lineWidth = 2;
    drawRoundRect(100, 1070, 880, 200, 20);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = "#5eead4";
    ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ASCENDING FLOW STATE", 540, 1140);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "26px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(`Qi Flow: ${realmInfo.woundText || "🟢 Unhindered Flow · Zero Cultivation Debt"}`, 540, 1195);
    ctx.fillText(`${report.cultivatedCount} questions logged with ${report.accuracy}% accuracy in ${report.monthName}.`, 540, 1235);

  } else if (cardType === "combat") {
    // Combat Precision & Accuracy Focus
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 32px 'SF Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("ACCURACY & COMBAT PRECISION", 540, 310);

    // Giant Glowing Accuracy Ring
    const cx = 540, cy = 490;
    ctx.strokeStyle = "rgba(56, 189, 248, 0.15)";
    ctx.lineWidth = 24;
    ctx.beginPath(); ctx.arc(cx, cy, 130, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.arc(cx, cy, 130, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * (report.accuracy / 100)));
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 96px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${report.accuracy}%`, cx, cy + 32);

    // Tier Pill
    const tierText = report.accuracy >= 80 ? "S-TIER PRECISION" : report.accuracy >= 65 ? "A-TIER EFFICIENCY" : "B-TIER COMBATANT";
    ctx.fillStyle = "#0284c7";
    drawRoundRect(360, 670, 360, 54, 27);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(tierText, 540, 706);

    // 3 Stat Cards
    drawStatCard(100, 780, 420, 200, "Confirmed Solves", `${report.rightCount} Right`, "+4 marks each", "#10b981", "rgba(16, 185, 129, 0.4)");
    drawStatCard(560, 780, 420, 200, "Negative Bleed", `${report.wrongCount} Wrong`, "−1 marks lost", "#ef4444", "rgba(239, 68, 68, 0.4)");
    drawStatCard(100, 1020, 880, 200, "Net Scoring Marks", `+${(report.rightCount * 4 - report.wrongCount)} Net Marks`, "Competitive Exam Efficiency", "#38bdf8", "rgba(56, 189, 248, 0.4)");

    // Callout Box
    ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
    ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
    ctx.lineWidth = 2;
    drawRoundRect(100, 1260, 880, 160, 20);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⚔️ Every mark defended. Every mistake analyzed.", 540, 1330);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "24px sans-serif";
    ctx.fillText("Calculated skips protected rank from unforced penalties.", 540, 1375);

  } else if (cardType === "focus") {
    // Deep Focus & Grind Card
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 32px 'SF Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText("DEEP WORK & DISCIPLINE DOSSIER", 540, 310);

    const hours = (report.totalDwellMs / 3600000).toFixed(1);
    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 130px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${hours}h`, 540, 490);

    ctx.fillStyle = "#fdba74";
    ctx.font = "bold 32px 'SF Mono', monospace";
    ctx.fillText("HOURS IN PURE ACADEMIC FOCUS", 540, 560);

    // Consistency Banner
    ctx.fillStyle = "#b45309";
    drawRoundRect(280, 620, 520, 60, 30);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("CONSISTENCY OVER INTENSITY", 540, 660);

    // 2 Giant Stat Cards
    drawStatCard(100, 740, 420, 220, "Daily Practice Streak", `${realmInfo.currentStreak || 1} Days`, "Unbroken Consistency", "#fbbf24", "rgba(245, 158, 11, 0.4)");
    drawStatCard(560, 740, 420, 220, "Completed Trials", `${report.monthSessionsCount || 1} Sessions`, "Timed Arena Simulations", "#f8fafc", "rgba(255, 255, 255, 0.2)");

    // Shield Callout Box
    ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
    ctx.strokeStyle = "rgba(245, 158, 11, 0.3)";
    ctx.lineWidth = 2;
    drawRoundRect(100, 1020, 880, 240, 20);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = "#fde68a";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🛡️ ZERO DISTRACTIONS VERIFIED", 540, 1100);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "26px sans-serif";
    ctx.fillText("Social feeds, video leaks, and short-form algorithms neutralized.", 540, 1160);
    ctx.fillText("Protected by Exam Arena Focus Guard & Study Shield.", 540, 1205);

  } else {
    // Summary Overview Card
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 70px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(realmInfo.realmName || "Spirit Profound Realm", 540, 480);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 44px 'JetBrains Mono', monospace";
    ctx.fillText(`STAGE ${realmInfo.insideLevel || 1} / 199`, 540, 560);

    // Goal Banner
    ctx.fillStyle = report.goalAchieved ? "#10b981" : "#f59e0b";
    drawRoundRect(240, 640, 600, 70, 35);
    ctx.fill();

    ctx.fillStyle = "#020817";
    ctx.font = "bold 34px sans-serif";
    ctx.fillText(report.goalAchieved ? "★ MONTHLY GOAL ACHIEVED ★" : "MONTHLY TRIAL RECORD", 540, 688);

    // 4 Bento Stat Cards
    const hours = (report.totalDwellMs / 3600000).toFixed(1) + "h";
    drawStatCard(100, 780, 420, 200, "Questions Cultivated", String(report.cultivatedCount), "", "#14b8a6", "rgba(20, 184, 166, 0.4)");
    drawStatCard(560, 780, 420, 200, "Combat Accuracy", `${report.accuracy}%`, "", "#38bdf8", "rgba(56, 189, 248, 0.4)");
    drawStatCard(100, 1020, 420, 200, "Time Invested", hours, "", "#f8fafc", "rgba(255, 255, 255, 0.2)");
    drawStatCard(560, 1020, 420, 200, "Qi Harvested", `+${report.totalXP}`, "", "#a855f7", "rgba(168, 85, 247, 0.4)");

    // Bottom Brief
    ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    drawRoundRect(100, 1260, 880, 150, 20);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Concluded with ${report.rightCount} solves and ${report.monthSessionsCount || 1} logged arena trials.`, 540, 1345);
  }

  // 7. Footer Watermark
  ctx.fillStyle = "#64748b";
  ctx.font = "bold 28px 'SF Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("PURE ACADEMIC FOCUS · ZERO DISTRACTIONS", 540, 1780);

  ctx.fillStyle = "#14b8a6";
  ctx.font = "bold 24px 'SF Mono', monospace";
  ctx.fillText("examarena.app", 540, 1820);

  // Trigger Download
  const dataUrl = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.download = `ExamArena_${report.monthKey}_${cardType.toUpperCase()}_ReportCard.png`;
  link.href = dataUrl;
  document.body.append(link);
  link.click();
  link.remove();
}

async function downloadAllStoryCards(report, realmInfo) {
  showToast("Generating all 4 story cards...");
  for (const t of STORY_CARD_TYPES) {
    await exportStatusCardToPng(report, realmInfo, t);
    await new Promise((r) => setTimeout(r, 260));
  }
  showToast("All 4 story cards downloaded!");
}

function renderGlobal(sessions) {
  const todayKey = localDayKey(new Date()); const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = localDayKey(yesterdayDate); const daily = allDailySessions(sessions);
  const todaySessions = daily.get(todayKey) || []; const yesterdaySessions = daily.get(yesterdayKey) || [];
  function dailyScore(group) {
    const stats = group.map(sessionStats);
    const encountered = stats.reduce((sum, item) => sum + item.visited.length, 0);
    const marks = stats.reduce((sum, item) => sum + item.net, 0);
    return { percent: encountered ? marks / (encountered * 4) * 100 : null, marks, encountered };
  }
  const today = dailyScore(todaySessions); const yesterday = dailyScore(yesterdaySessions);
  $("todayLabel").textContent = new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }).toUpperCase();
  const scoreVal = today.percent == null ? "—" : `${Math.round(today.percent)}`;
  if ($("todayScoreValue")) $("todayScoreValue").textContent = scoreVal;
  if ($("todayScore")) $("todayScore").textContent = today.percent == null ? "—" : `${scoreVal}%`;
  const scorePct = Math.max(0, Math.min(100, today.percent || 0));
  $("todayScoreProgressBar").style.width = `${scorePct}%`;
  $("yesterdayScore").textContent = yesterday.percent == null ? "—" : `${Math.round(yesterday.percent)}%`;
  $("todayNet").textContent = `${today.marks > 0 ? "+" : ""}${today.marks}`;
  $("todayCount").textContent = `${today.encountered} ${today.encountered === 1 ? "question" : "questions"}`;
  const delta = today.percent == null || yesterday.percent == null ? null : today.percent - yesterday.percent;
  const deltaEl = $("scoreDelta"); deltaEl.className = "score-delta-badge";
  if (delta == null) deltaEl.textContent = "— vs yesterday";
  else { deltaEl.textContent = `${delta >= 0 ? "▲" : "▼"} ${delta >= 0 ? "+" : ""}${Math.round(delta)}% vs yesterday (${Math.round(yesterday.percent)}%)`; deltaEl.classList.add(delta >= 0 ? "positive" : "negative"); }
  $("scoreContext").textContent = today.percent == null ? "Your score appears after you log a session today." : `${today.encountered} encountered · ${today.marks} net marks · unattempted = 0.`;

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const volume = calculateMonthlyCultivatedTotal(sessions, currentMonthKey);
  const target = Math.max(1, Number(localGet(TARGET_KEY, "300")) || 300);
  $("targetInput").value = String(target); $("volumeCount").textContent = String(volume);
  const monthlyProgress = Math.min(100, volume / target * 100);
  $("volumePercent").textContent = `${Math.round(monthlyProgress)}%`;
  $("monthlyPercentNumber").textContent = String(Math.round(monthlyProgress));
  $("monthlyProgressFill").style.width = `${monthlyProgress}%`;
  document.querySelector(".progress-panel:not(.cultivation-panel) .progress-track")?.setAttribute("aria-valuenow", String(Math.round(monthlyProgress)));
  $("monthlyTargetRemaining").textContent = `${Math.max(0, target - volume)} to go`;
  $("monthlyProgressCaption").textContent = volume >= target ? "Monthly cultivation target reached. Keep your rhythm." : "Every cultivated question moves the line.";
  const cultivation = buildCultivationState(sessions);
  if (!cultivation.total_questions_logged) {
    cultivation.xp = getCumulativeXpForLevel(34) + Math.round(getXpForNextSubLevel(34) * 0.85);
    cultivation.total_xp = cultivation.xp;
    cultivation.lifetime_xp = cultivation.xp;
    cultivation.total_questions_logged = 650;
    cultivation.current_debt = 0;
    cultivation.rawAccuracy = 85;
    cultivation.rolling_accuracy = 85;
    cultivation.last3NetPositive = true;
    cultivation.recentPositiveNet = true;
  }
  renderCultivation(cultivation);

  const recentKeys = new Set(Array.from({ length: 7 }, (_, offset) => { const d = new Date(); d.setDate(d.getDate() - offset); return localDayKey(d); }));
  let wrong7d = 0; let streakDays = new Set();
  sessions.forEach((session) => {
    const key = localDayKey(new Date(sessionTimestamp(session) || 0));
    if (recentKeys.has(key)) wrong7d += sessionStats(session).wrong;
    if (sessionStats(session).visited.length) streakDays.add(key);
  });
  $("negativeMarks").textContent = `−${wrong7d}`; $("wrongCount7d").textContent = `${wrong7d} ${wrong7d === 1 ? "wrong answer" : "wrong answers"}`;
  let streak = 0; const cursor = new Date();
  if (!streakDays.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (streakDays.has(localDayKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  $("streakCount").textContent = String(streak);
  $("streakCaption").textContent = streak ? (streak === 1 ? "One day in motion. Come back tomorrow." : "A steady habit is taking shape.") : "Log a session to start your run.";
  renderWeeklyAnalytics(sessions);
}
function renderHistory(sessions) {
  const webList = $("historyList"); webList.replaceChildren();
  const dppList = $("dppHistoryList"); if (dppList) dppList.replaceChildren();

  const webSessions = sessions.filter((s) => s.source !== "dpp");
  const dppSessions = sessions.filter((s) => s.source === "dpp");

  $("archiveCount").textContent = `${webSessions.length} ${webSessions.length === 1 ? "session" : "sessions"}`;
  if ($("dppArchiveCount")) {
    $("dppArchiveCount").textContent = `${dppSessions.length} ${dppSessions.length === 1 ? "session" : "sessions"}`;
  }

  function renderList(targetList, sessionItems, isDppArchive) {
    if (!sessionItems.length) {
      const empty = document.createElement("p"); empty.className = "archive-empty";
      empty.textContent = isDppArchive ? "No recorded DPP practice sessions yet." : "No recorded web sessions yet.";
      targetList.append(empty); return;
    }
    sessionItems.forEach((session) => {
      const stats = sessionStats(session); const item = document.createElement("button"); item.type = "button"; item.className = "history-row";
      const primary = document.createElement("span"); primary.className = "history-primary";
      const name = document.createElement("strong"); name.className = "history-exam-name";
      if (session.source === "dpp") {
        const badge = document.createElement("span");
        badge.style.cssText = "background:#0d9488; color:#fff; font-size:9px; font-weight:800; padding:1px 5px; border-radius:3px; margin-right:6px;";
        badge.textContent = "DPP";
        name.append(badge);
      }
      name.append(document.createTextNode(session.examName || "Practice session"));
      const date = document.createElement("span"); date.className = "history-date"; date.textContent = exactDate(session.startedAtMs || session.startedAt);
      primary.append(name, date);

      const time = document.createElement("span"); time.className = "history-duration"; time.textContent = formatDuration(sessionDuration(session), false);
      const count = document.createElement("span"); count.className = "history-questions"; count.textContent = `${stats.visited.length} questions`;

      // Dedicated Bleed Count Column
      const bleed = document.createElement("span");
      bleed.className = `history-bleed ${stats.wrong === 0 ? "bleed-clean" : "bleed-bleeding"}`;
      bleed.textContent = stats.wrong === 0 ? "🟢 Clean" : `🩸 ${stats.wrong} Bleeds (-${stats.wrong})`;

      const score = document.createElement("span"); score.className = `history-net ${stats.net < 0 ? "below-zero" : ""}`; score.textContent = `${stats.net > 0 ? "+" : ""}${stats.net} net`;
      const arrow = document.createElement("span"); arrow.className = "history-arrow"; arrow.textContent = "↗";
      
      if (isDppArchive) {
        const reattemptBtn = document.createElement("button");
        reattemptBtn.type = "button";
        reattemptBtn.className = "dpp-row-reattempt-btn";
        reattemptBtn.dataset.sessionId = session.sessionId || "";
        reattemptBtn.title = "Reattempt Entire DPP";
        reattemptBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          <span>Reattempt</span>
        `;
        reattemptBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          window.location.href = chrome.runtime.getURL(`dashboard/dpp_arena.html?sessionId=${encodeURIComponent(session.sessionId || sessionIdentity(session))}&mode=full-reattempt`);
        });
        item.append(primary, time, count, bleed, score, reattemptBtn, arrow);
      } else {
        item.append(primary, time, count, bleed, score, arrow);
      }

      item.addEventListener("click", () => openAutopsy(session, sessions.indexOf(session))); targetList.append(item);
    });
  }

  renderList(webList, webSessions, false);
  if (dppList) renderList(dppList, dppSessions, true);
}

function parseQuestionNumber(id, question) {
  const label = typeof question?.label === "string" ? question.label : "";
  const labelMatch = label.match(/(?:Question|Q\.?|Relative\s*#)?\s*(\d+)/i);
  if (labelMatch && labelMatch[1]) {
    return parseInt(labelMatch[1], 10);
  }
  const idMatch = String(id || "").match(/^(?:question\s*|q\s*)?(\d+)$/i);
  if (idMatch) return parseInt(idMatch[1], 10);
  return Infinity;
}

function renderQuestionTable(session) {
  const body = $("questionRows"); body.replaceChildren();
  const conceptMode = questionTableMode === "concept";
  const head = $("questionTableHead");
  if (head) head.innerHTML = conceptMode ? "<tr><th>Question</th><th>Concept time spent</th><th>Concept status</th><th>Actions</th></tr>" : "<tr><th>Question</th><th>Time spent</th><th>Status</th><th>Marks</th><th>Actions</th></tr>";
  const rawEntries = visibleQuestions(session);
  const entries = [...rawEntries].sort(([idA, qA], [idB, qB]) => {
    const numA = parseQuestionNumber(idA, qA);
    const numB = parseQuestionNumber(idB, qB);
    if (numA !== numB) return numA - numB;
    return (Number(qA.firstSeenAt) || 0) - (Number(qB.firstSeenAt) || 0)
      || String(idA).localeCompare(String(idB), undefined, { numeric: true });
  });

  $("questionCountDetail").textContent = `${entries.length} ${entries.length === 1 ? "question" : "questions"}`;
  if (!entries.length) {
    const row = document.createElement("tr"); const cell = document.createElement("td");
    cell.colSpan = conceptMode ? 4 : 5; cell.className = "table-empty"; cell.textContent = "No questions were detected in this session.";
    row.append(cell); body.append(row); return;
  }
  entries.forEach(([id, question], index) => {
    const row = document.createElement("tr");
    const qNum = parseQuestionNumber(id, question);
    const safeNum = Number.isFinite(qNum) ? qNum : index + 1;
    const label = typeof question.label === "string" && /^(?:Question\s+\d{1,4}|Q\.?\s*\d{1,4}|Relative\s+#\d+)$/i.test(question.label.trim())
      ? question.label.trim()
      : `Question ${safeNum}`;
    const questionCell = document.createElement("td"); questionCell.className = "question-label"; questionCell.textContent = label;
    const review = session.conceptReview?.[id] || session.conceptReview?.[String(safeNum)];
    const timeCell = document.createElement("td"); timeCell.className = "time-cell"; timeCell.textContent = conceptMode ? (review ? formatDuration(review.dwellMs, false) : "—") : formatDuration(question.timeMs, false);
    if (conceptMode) {
      const conceptStatus = review?.status || "Unvisited";
      const statusCell = document.createElement("td"); const pill = document.createElement("span");
      pill.className = `concept-status-pill concept-${conceptStatus.toLowerCase()}`; pill.textContent = `${conceptStatus === "Completed" ? "🟢" : conceptStatus === "Visited" ? "🟡" : "⚪"} ${conceptStatus}`; statusCell.append(pill);
      const actionCell = document.createElement("td"); const actions = document.createElement("div"); actions.className = "question-actions";
      const button = createViewSolutionButton(session, id, question, index);
      actions.append(button); actionCell.append(actions);
      row.append(questionCell, timeCell, statusCell, actionCell); body.append(row); return;
    }
    const status = statusOf(session, id, question); const statusCell = document.createElement("td"); const pill = document.createElement("span");
    const reattemptRecord = session.reattempts?.[id];
    let pillText = status;
    if (question.cultivationResolved) {
      pillText = reattemptRecord ? "Reattempt Solved +4" : "Resolved +4";
    }
    pill.className = `status-pill status-${status.toLowerCase().replaceAll(" ", "-")}`; pill.textContent = pillText; statusCell.append(pill);
    const isDpp = session.source === "dpp";
    if (isDpp && (question.userChoice || question.correctAnswer)) {
      const choiceChip = document.createElement("div");
      choiceChip.className = `dpp-choice-chip ${status === "Wrong" ? "choice-mismatch" : ""}`;
      const userPart = question.userChoice ? `<b class="${status === 'Wrong' ? 'user-bad' : ''}">${question.userChoice}</b>` : "—";
      const keyPart = question.correctAnswer ? `<b>${question.correctAnswer}</b>` : "—";
      choiceChip.innerHTML = `Your: ${userPart} · Key: ${keyPart}`;
      questionCell.append(choiceChip);
    }
    const marksCell = document.createElement("td");
    const marks = document.createElement("strong");
    marks.className = `marks-value marks-${status.toLowerCase().replaceAll(" ", "-")}`;
    marks.textContent = question.cultivationResolved ? "+4" : status === "Right" ? "+4" : status === "Wrong" ? "-1" : "0";
    marksCell.append(marks);
    const actionCell = document.createElement("td"); const actions = document.createElement("div"); actions.className = "question-actions";
    const reattemptHash = `ea-intent=reattempt&ea-session=${encodeURIComponent(session.sessionId || sessionIdentity(session))}&ea-qid=${encodeURIComponent(id)}`;
    const dppReattemptUrl = isDpp
      ? chrome.runtime.getURL(`dashboard/dpp_arena.html?sessionId=${encodeURIComponent(session.sessionId || sessionIdentity(session))}&mode=reattempt&qid=${encodeURIComponent(id)}`)
      : null;
    const reattemptUrl = status === "Not Visited" ? null : (isDpp ? dppReattemptUrl : actionUrl(question.url, reattemptHash));
    const reattemptButton = document.createElement("button"); reattemptButton.type = "button";
    reattemptButton.className = "row-action"; reattemptButton.textContent = reattemptRecord ? "Reattempted" : "Reattempt";
    reattemptButton.disabled = !reattemptUrl;
    if (question.cultivationResolved) reattemptButton.title = "Question resolved (+4 marks). Click to practice again.";
    reattemptButton.addEventListener("click", () => { if (reattemptUrl) chrome.tabs.create({ url: reattemptUrl }); });
    actions.append(reattemptButton);

    const solutionButton = createViewSolutionButton(session, id, question, index, status === "Not Visited");
    actions.append(solutionButton);
    actionCell.append(actions); row.append(questionCell, timeCell, statusCell, marksCell, actionCell); body.append(row);
  });
}

function renderRecovery(session) {
  const stats = sessionStats(session); const items = stats.visited;
  const average = items.length ? items.reduce((sum, [, question]) => sum + Math.max(0, Number(question.timeMs) || 0), 0) / items.length : 0;
  
  // Two-Pronged Time Sinks:
  // 1. Wrong with dwell > 1.2x average and > 60s
  // 2. Right with dwell > 2.0x average and > 120s (Costly Solves)
  const sinks = items.filter(([id, question]) => {
    const status = statusOf(session, id, question);
    const dwell = Math.max(0, Number(question.timeMs) || 0);
    const isWrongSink = status === "Wrong" && dwell > average * 1.2 && dwell > 60000;
    const isCostlySolve = status === "Right" && dwell > average * 2.0 && dwell > 120000;
    return isWrongSink || isCostlySolve;
  }).sort((a, b) => Number(b[1].timeMs || 0) - Number(a[1].timeMs || 0));

  // Calculated Skips:
  // Only questions with dwellMs >= 8000 && dwellMs <= 45000 and unattempted status.
  // Exclude any question with dwell < 8s (classify as untouched).
  const skips = items.filter(([id, question]) => {
    const status = statusOf(session, id, question);
    const dwell = Math.max(0, Number(question.timeMs) || 0);
    return status === "Unattempted" && dwell >= 8000 && dwell <= 45000;
  }).sort((a, b) => Number(b[1].timeMs || 0) - Number(a[1].timeMs || 0));

  function renderInsightList(host, values, type) {
    host.replaceChildren();
    if (!values.length) {
      const blank = document.createElement("p");
      blank.className = "insight-empty";
      blank.textContent = type === "sink" ? "No time sinks identified." : "No calculated skips recorded (8s–45s).";
      host.append(blank);
      return;
    }
    values.forEach(([id, question], index) => {
      const row = document.createElement("div"); row.className = "insight-row";
      const left = document.createElement("span"); left.className = "insight-question";
      const qNum = parseQuestionNumber(id, question);
      const safeNum = Number.isFinite(qNum) ? qNum : index + 1;
      const baseLabel = typeof question.label === "string" && question.label.trim() ? question.label.trim() : `Question ${safeNum}`;
      const status = statusOf(session, id, question);
      if (type === "sink") {
        if (status === "Wrong") {
          left.textContent = `${baseLabel} · Trap (Lost Marks)`;
        } else if (status === "Right") {
          left.textContent = `${baseLabel} · Costly Solve (>2x Avg)`;
        } else {
          left.textContent = baseLabel;
        }
      } else {
        left.textContent = baseLabel;
      }
      const right = document.createElement("span"); right.className = "insight-time"; right.textContent = formatDuration(question.timeMs, false);
      row.append(left, right); host.append(row);
    });
  }
  renderInsightList($("timeSinkList"), sinks, "sink"); renderInsightList($("skipList"), skips, "skip");
  const savedMs = skips.reduce((sum, [, question]) => sum + Math.max(0, Number(question.timeMs) || 0), 0);
  $("savedTime").textContent = formatDuration(savedMs, false);
}

function getOptimalDwellStep(maxSeconds, targetTicks = 5) {
  if (maxSeconds <= 0) return 30;
  const rawStep = maxSeconds / targetTicks;

  // Standard readable time intervals in seconds
  const niceSteps = [
    15, 30, 45, 60,                 // 15s to 1m
    120, 180, 300, 600, 900, 1200,  // 2m, 3m, 5m, 10m, 15m, 20m
    1800, 3600, 7200, 10800, 14400, // 30m, 1h, 2h, 3h, 4h
    21600, 28800, 36000             // 6h, 8h, 10h+
  ];

  for (const step of niceSteps) {
    if (rawStep <= step) return step;
  }

  // Fallback for massive hours: round to nearest multiple of 1 hour (3600s)
  return Math.ceil(rawStep / 3600) * 3600;
}

function formatDwellAxisLabel(seconds) {
  if (seconds === 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (mins < 60) {
    return remSec > 0 ? `${mins}m ${remSec}s` : `${mins}m`;
  }
  const hours = (seconds / 3600).toFixed(1).replace(/\.0$/, "");
  return `${hours}h`;
}

function renderConceptPacing(session) {
  const host = $("pacingChart");
  if (!host) return;
  host.replaceChildren();
  const entries = getQuestionEntries(session).sort(([a, qa], [b, qb]) => parseQuestionNumber(a, qa) - parseQuestionNumber(b, qb));
  const points = entries.map(([id, q], index) => {
    const n = parseQuestionNumber(id, q);
    const review = session.conceptReview?.[id] || session.conceptReview?.[String(n)];
    return { n: Number.isFinite(n) ? n : index + 1, ms: Math.max(0, Number(review?.dwellMs) || 0), status: review?.status || "Unvisited" };
  });
  const title = $("pacingGraphTitle"), subtitle = $("pacingGraphSubtitle");
  if (title) title.textContent = "Concept pacing";
  if (subtitle) subtitle.textContent = "Review dwell time per question against a 180s concept target.";
  const legend = $("pacingLegend"); if (legend) legend.innerHTML = '<span class="chart-key"><i style="background:#10b981"></i> COMPLETED</span><span class="chart-key"><i style="background:#f59e0b"></i> VISITED</span><span class="chart-key"><i style="background:#475569"></i> UNVISITED</span><span class="chart-key"><i style="background:#64748b;width:12px;height:2px;border-radius:0"></i> 180s TARGET</span>';
  if (!points.length) { host.textContent = "Concept timing will build as you review solutions."; return; }
  const W=760,H=240,m={t:22,r:28,b:40,l:58},pw=W-m.l-m.r,ph=H-m.t-m.b;
  const maxSec=Math.max(180,...points.map(p=>p.ms/1000))*1.15;
  const svg=svgElement("svg",{viewBox:`0 0 ${W} ${H}`,role:"presentation",preserveAspectRatio:"none"});
  [0,.25,.5,.75,1].forEach(f=>{const y=m.t+ph*(1-f);svg.append(svgElement("line",{x1:m.l,y1:y,x2:W-m.r,y2:y,class:"chart-grid-line"}));const label=svgElement("text",{x:m.l-9,y:y+4,"text-anchor":"end",class:"chart-axis-label"});label.textContent=formatDwellAxisLabel(Math.round(maxSec*f));svg.append(label);});
  const targetY=m.t+ph*(1-180/maxSec);svg.append(svgElement("line",{x1:m.l,y1:targetY,x2:W-m.r,y2:targetY,stroke:"#64748b","stroke-dasharray":"5 5"}));
  points.forEach((p,i)=>{const x=points.length===1?m.l+pw/2:m.l+pw*i/(points.length-1);const sec=p.ms/1000,y=m.t+ph*(1-sec/maxSec);const color=p.status==="Completed"?"#10b981":p.status==="Visited"?"#f59e0b":"#475569";const c=svgElement("circle",{cx:x,cy:y,r:5,fill:color,stroke:"#0b1329","stroke-width":2});const tip=svgElement("title",{});tip.textContent=`Q${p.n} · Concept Time: ${formatDuration(p.ms,false)} · Status: ${p.status}`;c.append(tip);svg.append(c);if(points.length<18||i%Math.ceil(points.length/18)===0){const label=svgElement("text",{x,y:H-12,"text-anchor":"middle",class:"chart-axis-label"});label.textContent=`Q${p.n}`;svg.append(label);}});
  host.append(svg);
}

function renderPacing(session) {
  if (pacingMode === "concept") return renderConceptPacing(session);
  if ($("pacingGraphTitle")) $("pacingGraphTitle").textContent = "Session pacing";
  if ($("pacingGraphSubtitle")) $("pacingGraphSubtitle").textContent = "Dwell time per question against 120s standard pace target.";
  if ($("pacingLegend")) $("pacingLegend").innerHTML = '<span class="chart-key key-right"><i style="background:#10b981"></i> RIGHT</span><span class="chart-key key-wrong"><i style="background:#ef4444"></i> WRONG</span><span class="chart-key key-skipped"><i style="background:#94a3b8"></i> SKIPPED</span><span class="chart-key key-target"><i style="background:#f59e0b;width:12px;height:2px;border-radius:0"></i> 120s TARGET</span><span id="reattemptLegendKey" class="chart-key key-reattempt" hidden><i style="background:#a855f7"></i> REATTEMPT</span>';
  const host = $("pacingChart");
  if (!host) return;
  host.replaceChildren();

  const rawEntries = sessionStats(session).visited;
  const sortedEntries = [...rawEntries].sort(([idA, qA], [idB, qB]) => {
    const numA = parseQuestionNumber(idA, qA);
    const numB = parseQuestionNumber(idB, qB);
    if (numA !== numB) return numA - numB;
    return String(idA).localeCompare(String(idB), undefined, { numeric: true });
  });

  if (!sortedEntries.length) {
    const emptySvg = svgElement("svg", { viewBox: "0 0 760 220", role: "presentation", preserveAspectRatio: "none" });
    const emptyText = svgElement("text", { x: 380, y: 110, "text-anchor": "middle", class: "chart-empty-label" });
    emptyText.textContent = "Question timing will build your pacing curve.";
    emptySvg.append(emptyText);
    host.append(emptySvg);
    return;
  }

  const primaryPoints = sortedEntries.map(([id, question], index) => {
    const qNum = index + 1;
    const dwellMs = Math.max(0, Number(question.timeMs) || 0);
    const dwellSec = dwellMs / 1000;
    const status = initialStatusOf(session, id, question);
    const displayStatus = status === "Unattempted" ? "Skipped" : status;
    const label = typeof question.label === "string" && question.label.trim() ? question.label.trim() : `Question ${qNum}`;
    const diffSec = Math.round(dwellSec - 120);
    const paceDiff = diffSec > 0 ? `+${diffSec}s over 120s pace` : `${diffSec}s under 120s pace`;
    return {
      id,
      qNum,
      dwellMs,
      dwellSec,
      status,
      label,
      tooltip: [
        `Q${qNum} · Dwell: ${formatDuration(dwellMs, false)} · Status: ${displayStatus} · Target: 02:00`,
        `${label} (${paceDiff})`
      ]
    };
  });

  const reattemptsLedger = Array.isArray(session.reattemptLedger) && session.reattemptLedger.length > 0
    ? session.reattemptLedger
    : (session.reattempts ? Object.values(session.reattempts) : []);
  const sortedReattempts = [...reattemptsLedger].sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));

  const secondaryPoints = sortedReattempts.map((r, index) => {
    const qId = String(r.questionId || "");
    const targetIdx = sortedEntries.findIndex(([id]) => id === qId);
    const qNum = targetIdx >= 0 ? targetIdx + 1 : (parseQuestionNumber(qId, session.questions?.[qId]) || index + 1);
    const dwellMs = Math.max(0, Number(r.dwellMs || r.timeMs) || 0);
    const dwellSec = dwellMs / 1000;
    const label = session.questions?.[qId]?.label || `Question ${qNum}`;
    return {
      qNum,
      dwellMs,
      dwellSec,
      outcome: r.outcome,
      label,
      tooltip: [
        `Reattempt · Q${qNum} (${label})`,
        `Outcome: ${r.outcome}`,
        `Reattempt Dwell: ${formatDuration(dwellMs, false)} (${Math.round(dwellSec)}s)`
      ]
    };
  }).sort((a, b) => a.qNum - b.qNum);

  const reattemptLegend = $("reattemptLegendKey");
  if (reattemptLegend) reattemptLegend.hidden = secondaryPoints.length === 0;

  // Graph Layout
  const width = 760;
  const height = 240;
  const margin = { top: 22, right: 35, bottom: 40, left: 60 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "presentation", preserveAspectRatio: "none" });

  const allDwells = [
    ...primaryPoints.map(p => p.dwellSec),
    ...secondaryPoints.map(p => p.dwellSec),
    120 // standard pace target
  ];
  const maxDwellSeconds = Math.max(120, ...allDwells);

  // Calculate dynamic step to guarantee strictly 4 to 6 tick marks
  const stepSeconds = getOptimalDwellStep(maxDwellSeconds, 5);
  const roundedMaxSeconds = Math.ceil(maxDwellSeconds / stepSeconds) * stepSeconds;
  const maxY = roundedMaxSeconds;

  // Y-Axis Ticks & Gridlines
  for (let s = 0; s <= roundedMaxSeconds; s += stepSeconds) {
    const y = margin.top + plotH * (1 - s / roundedMaxSeconds);
    if (isNaN(y)) continue;

    svg.append(svgElement("line", {
      x1: margin.left,
      y1: y,
      x2: width - margin.right,
      y2: y,
      class: "chart-gridline"
    }));

    const label = svgElement("text", {
      x: margin.left - 10,
      y: y + 3,
      "text-anchor": "end",
      class: "chart-axis-label"
    });
    label.textContent = formatDwellAxisLabel(s);
    svg.append(label);
  }

  // 120s Standard Pace Target Line
  const targetY = margin.top + plotH * (1 - 120 / maxY);
  const targetLine = svgElement("line", {
    x1: margin.left,
    y1: targetY,
    x2: width - margin.right,
    y2: targetY,
    class: "chart-target-line"
  });
  svg.append(targetLine);

  const targetLabel = svgElement("text", {
    x: width - margin.right,
    y: targetY - 5,
    "text-anchor": "end",
    class: "chart-target-label"
  });
  targetLabel.textContent = "120s Standard Pace";
  svg.append(targetLabel);

  // X-Axis Question Scaling
  const totalQ = primaryPoints.length;
  const getX = (qNum) => {
    if (totalQ <= 1) return margin.left + plotW / 2;
    return margin.left + ((qNum - 1) / (totalQ - 1)) * plotW;
  };
  const getY = (sec) => margin.top + plotH * (1 - Math.min(maxY, sec) / maxY);

  // X-Axis Ticks & Labels
  primaryPoints.forEach((point) => {
    const showLabel = totalQ <= 15 || point.qNum === 1 || point.qNum === totalQ || (point.qNum % (totalQ > 30 ? 5 : 2) === 0);
    if (showLabel) {
      const x = getX(point.qNum);
      const text = svgElement("text", {
        x,
        y: height - margin.bottom + 18,
        "text-anchor": "middle",
        class: "chart-axis-label"
      });
      text.textContent = `Q${point.qNum}`;
      svg.append(text);
    }
  });

  // Tooltip Setup
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  tooltip.hidden = true;
  tooltip.setAttribute("role", "tooltip");
  host.append(tooltip);

  function positionTooltip(event, node) {
    const bounds = host.getBoundingClientRect();
    const pointBounds = node.getBoundingClientRect();
    const clientX = Number.isFinite(event?.clientX) && event.clientX ? event.clientX : pointBounds.left + pointBounds.width / 2;
    const clientY = Number.isFinite(event?.clientY) && event.clientY ? event.clientY : pointBounds.top + pointBounds.height / 2;
    const x = Math.max(8, Math.min(bounds.width - tooltip.offsetWidth - 8, clientX - bounds.left + 12));
    const y = Math.max(5, Math.min(bounds.height - tooltip.offsetHeight - 5, clientY - bounds.top - tooltip.offsetHeight - 12));
    tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`;
  }

  function showTooltip(lines, node, event) {
    tooltip.replaceChildren();
    lines.forEach((line, idx) => {
      const el = document.createElement(idx === 0 ? "strong" : "span");
      el.textContent = line;
      tooltip.append(el);
    });
    tooltip.hidden = false;
    positionTooltip(event, node);
  }

  // Draw Primary Path
  if (primaryPoints.length > 1) {
    const pathD = primaryPoints.map((p, idx) => `${idx === 0 ? "M" : "L"}${getX(p.qNum)},${getY(p.dwellSec)}`).join(" ");
    const linePath = svgElement("path", { d: pathD, class: "chart-line" });
    svg.append(linePath);
  }

  // Draw Primary Nodes (Green: Right, Red: Wrong, Gray: Skipped)
  primaryPoints.forEach((point) => {
    const x = getX(point.qNum);
    const y = getY(point.dwellSec);
    const statusClass = point.status === "Right" ? "chart-point-right" : point.status === "Wrong" ? "chart-point-wrong" : "chart-point-skipped";
    const circle = svgElement("circle", {
      cx: x,
      cy: y,
      r: primaryPoints.length > 25 ? 4 : 5.5,
      class: `chart-point ${statusClass}`
    });
    circle.setAttribute("tabindex", "0");
    circle.setAttribute("role", "img");
    circle.setAttribute("aria-label", point.tooltip.join(". "));
    circle.addEventListener("pointerenter", (e) => showTooltip(point.tooltip, circle, e));
    circle.addEventListener("pointermove", (e) => { if (!tooltip.hidden) positionTooltip(e, circle); });
    circle.addEventListener("pointerleave", () => { tooltip.hidden = true; });
    circle.addEventListener("focus", () => showTooltip(point.tooltip, circle));
    circle.addEventListener("blur", () => { tooltip.hidden = true; });
    svg.append(circle);
  });

  // Draw Secondary Reattempt Curve & Nodes (Violet: #a855f7)
  if (secondaryPoints.length > 1) {
    const secD = secondaryPoints.map((p, idx) => `${idx === 0 ? "M" : "L"}${getX(p.qNum)},${getY(p.dwellSec)}`).join(" ");
    const secLine = svgElement("path", { d: secD, class: "chart-line-reattempt" });
    svg.append(secLine);
  }
  secondaryPoints.forEach((point) => {
    const x = getX(point.qNum);
    const y = getY(point.dwellSec);
    const circle = svgElement("circle", {
      cx: x,
      cy: y,
      r: 5.5,
      class: "chart-point chart-point-reattempt"
    });
    circle.setAttribute("tabindex", "0");
    circle.setAttribute("role", "img");
    circle.setAttribute("aria-label", point.tooltip.join(". "));
    circle.addEventListener("pointerenter", (e) => showTooltip(point.tooltip, circle, e));
    circle.addEventListener("pointermove", (e) => { if (!tooltip.hidden) positionTooltip(e, circle); });
    circle.addEventListener("pointerleave", () => { tooltip.hidden = true; });
    circle.addEventListener("focus", () => showTooltip(point.tooltip, circle));
    circle.addEventListener("blur", () => { tooltip.hidden = true; });
    svg.append(circle);
  });

  host.append(svg);
}

function openAutopsy(session, index, push = true) {
  state.selected = session;
  $("homeView").hidden = true; $("autopsyView").hidden = false; $("cultivationHallView").hidden = true;
  document.body.classList.remove("hall-open");
  $("autopsyTitle").textContent = session.examName || (session.inProgress ? "Session in progress" : "Practice session");
  $("autopsyDate").textContent = [exactDate(session.startedAtMs || session.startedAt), session.subject].filter(Boolean).join(" · ");
  const timerBadge = $("sessionTimerType") || $("autopsyMode");
  if (timerBadge) {
    timerBadge.textContent = session.mode === "countdown" ? `COUNTDOWN · ${session.targetQuestions || "—"} Q` : "STOPWATCH";
  }
  
  const dppReattemptBtn = $("autopsyDppReattemptBtn");
  if (dppReattemptBtn) {
    if (session.source === "dpp") {
      dppReattemptBtn.style.display = "inline-flex";
      dppReattemptBtn.onclick = () => {
        window.location.href = chrome.runtime.getURL(`dashboard/dpp_arena.html?sessionId=${encodeURIComponent(session.sessionId || sessionIdentity(session))}&mode=full-reattempt`);
      };
    } else {
      dppReattemptBtn.style.display = "none";
    }
  }

  const stats = sessionStats(session); $("sessionDuration").textContent = formatDuration(sessionDuration(session), false);
  $("sessionNet").textContent = `${stats.net > 0 ? "+" : ""}${stats.net}`;
  if ($("sessionBleed")) {
    $("sessionBleed").textContent = stats.wrong === 0 ? "0 (Clean)" : `${stats.wrong} (-${stats.wrong})`;
    $("sessionBleed").style.color = stats.wrong === 0 ? "#34d399" : "#fb7185";
  }
  $("sessionAccuracy").textContent = stats.rawAccuracy == null ? "—" : `${Math.round(stats.rawAccuracy)}%`;
  $("sessionQuestions").textContent = String(stats.visited.length);
  renderRecovery(session); renderPacing(session); renderQuestionTable(session);
  if (push) { const url = new URL(location.href); url.searchParams.set("sessionId", sessionIdentity(session) || String(index)); url.hash = ""; history.pushState({ autopsy: true }, "", url); }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function returnHome(updateHistory = true) {
  $("autopsyView").hidden = true; $("homeView").hidden = false; $("cultivationHallView").hidden = true; document.body.classList.remove("hall-open"); state.selected = null;
  if (updateHistory) { const url = new URL(location.href); url.searchParams.delete("sessionId"); url.hash = ""; history.pushState({ home: true }, "", url); }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function showToast(message, error = false) {
  const toast = $("toast"); if (!toast) return;
  toast.textContent = message; toast.classList.toggle("is-error", error); toast.classList.add("shown");
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("shown"), 3600);
}
async function load() {
  const data = await chrome.storage.local.get(["examHistory", "examSession", "examModeActive"]);
  state.history = Array.isArray(data.examHistory) ? data.examHistory : [];
  state.session = data.examSession || null; state.active = Boolean(data.examModeActive);
  const sessions = sessionsForView();
  $("sessionSource").textContent = "LOCAL SESSION DATA";
  renderGlobal(sessions); renderSubjectMastery(sessions); renderHistory(sessions);
  await checkMonthlyRollover().catch((err) => console.error("Monthly rollover check failed:", err));
  if (location.hash === "#/hall-of-cultivation") { openCultivationHall(false); return; }
  const requested = new URLSearchParams(location.search).get("sessionId");
  if (requested) {
    const found = sessions.find((session) => sessionIdentity(session) === requested || String(sessionTimestamp(session)) === requested);
    if (found) openAutopsy(found, sessions.indexOf(found), false);
    else if (!$("autopsyView").hidden) returnHome(false);
  } else if (!$("autopsyView").hidden) returnHome(false);
  if (new URLSearchParams(location.search).get("focus_blocked") === "1") {
    showToast("🛡️ Focus Shield: Distraction blocked. Streak protected.");
  }
}
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  return new Promise((resolve) => setTimeout(() => { URL.revokeObjectURL(url); resolve(); }, 250));
}
function allStoredSessions() { return sessionsForView().map(({ inProgress, ...session }) => session); }
$("launchDppBtn")?.addEventListener("click", () => { window.location.href = "dpp_arena.html"; });
$("exportAll").addEventListener("click", async () => {
  await downloadJson({ exportedAt: Date.now(), sessions: allStoredSessions() }, `exam-arena-backup-${new Date().toISOString().slice(0, 10)}.json`);
  showToast("Backup export started.");
});
$("importAll").addEventListener("click", () => $("importFileInput").click());
$("importFileInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()); const imported = Array.isArray(parsed) ? parsed : (parsed.sessions || parsed.examHistory);
    if (!Array.isArray(imported)) throw new Error("Backup must contain a sessions array.");
    const valid = imported.filter((item) => item && sessionTimestamp(item) > 0 && item.questions && typeof item.questions === "object" && !Array.isArray(item.questions));
    if (valid.length !== imported.length) throw new Error("Backup contains invalid session records.");
    const stored = await chrome.storage.local.get("examHistory"); const map = new Map((Array.isArray(stored.examHistory) ? stored.examHistory : []).map((session) => [sessionIdentity(session), session]));
    let added = 0;
    valid.forEach((item) => { const key = sessionIdentity(item); if (!map.has(key)) { const clean = { ...item }; delete clean.id; delete clean.inProgress; map.set(key, clean); added += 1; } });
    await chrome.storage.local.set({ examHistory: [...map.values()].sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a)) });
    await load(); showToast(`Imported ${added} ${added === 1 ? "session" : "sessions"}.`);
  } catch (error) { showToast(`Import failed: ${error.message}`, true); }
});
$("clearAll")?.addEventListener("click", () => {
  const dialog = $("clearConfirm"); const cancel = $("clearCancel");
  if (!dialog || !cancel) return;
  dialog.hidden = false; cancel.focus();
});
$("clearCancel")?.addEventListener("click", () => { const dialog = $("clearConfirm"); if (dialog) dialog.hidden = true; });
$("clearConfirm")?.addEventListener("click", (event) => {
  const dialog = $("clearConfirm");
  if (dialog && event.target === dialog) dialog.hidden = true;
});
$("confirmClear")?.addEventListener("click", async (event) => {
  const button = event.currentTarget; button.disabled = true;
  try {
    await downloadJson({ exportedAt: Date.now(), sessions: allStoredSessions() }, `exam-arena-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" }, (response) => {
      if (chrome.runtime.lastError || response?.ok === false) reject(chrome.runtime.lastError || new Error("Could not clear history")); else resolve();
    }));
    await window.DPPStorage?.clearAllPdfSessions?.().catch(() => {});
    const dialog = $("clearConfirm"); if (dialog) dialog.hidden = true;
    await load(); showToast("Archive cleared. Your backup was downloaded.");
  } catch (error) { showToast(`Couldn't clear archive: ${error.message}`, true); }
  finally { button.disabled = false; }
});
$("targetInput").value = localGet(TARGET_KEY, "300");
$("targetInput").addEventListener("change", (event) => {
  const value = Math.max(1, Math.min(100000, Math.floor(Number(event.currentTarget.value) || 300)));
  event.currentTarget.value = String(value); localSet(TARGET_KEY, String(value)); void load();
});
$("backHome").addEventListener("click", () => returnHome());
$("brandHome").addEventListener("click", (event) => { event.preventDefault(); returnHome(); });
window.addEventListener("popstate", () => {
  if (location.hash === "#/hall-of-cultivation") { openCultivationHall(false); return; }
  const id = new URLSearchParams(location.search).get("sessionId");
  if (!id) { returnHome(false); return; }
  const found = sessionsForView().find((session) => sessionIdentity(session) === id || String(sessionTimestamp(session)) === id);
  if (found) openAutopsy(found, 0, false);
});
function setTheme(theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", theme);
  localSet("examfocus-theme", theme);
  const hallThemeSelect = $("hallThemeSelect"); if (hallThemeSelect) hallThemeSelect.value = theme;
}
const themeSelect = $("themeSelect"); const initialTheme = localGet("examfocus-theme", "dark");
themeSelect.value = ["system", "light", "dark"].includes(initialTheme) ? initialTheme : "system";
setTheme(themeSelect.value); themeSelect.addEventListener("change", () => setTheme(themeSelect.value));
$("hallThemeSelect").value = themeSelect.value;
$("hallThemeSelect").addEventListener("change", () => { themeSelect.value = $("hallThemeSelect").value; setTheme(themeSelect.value); });
const cultivationGallery = $("cultivationHallView");
function openCultivationHall(push = true) {
  if (cultivationGallery.hidden && cultivationSnapshot) { hallRealmIndex = cultivationSnapshot.realmIndex; hallSublevel = cultivationSnapshot.insideLevel; }
  $("homeView").hidden = true; $("autopsyView").hidden = true; cultivationGallery.hidden = false;
  document.body.classList.add("hall-open");
  if (push && location.hash !== "#/hall-of-cultivation") {
    const url = new URL(location.href); url.searchParams.delete("sessionId"); url.hash = "/hall-of-cultivation";
    history.pushState({ hall: true }, "", url);
  }
  if (cultivationSnapshot) renderCultivationRoadmap(cultivationSnapshot.cultivation, cultivationSnapshot.level, cultivationSnapshot.realm, cultivationSnapshot.gate);
  $("backToDashboardBtn").focus(); window.scrollTo({ top: 0, behavior: "smooth" });
}
$("openCultivationGallery").addEventListener("click", () => openCultivationHall());
$("heroCultivationCard").addEventListener("click", () => openCultivationHall());
$("heroCultivationCard").addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openCultivationHall(); }
});
function returnFromCultivationHall(push = true) {
  if (cultivationGallery.hidden) return;
  cultivationGallery.hidden = true; $("homeView").hidden = false; $("autopsyView").hidden = true;
  document.body.classList.remove("hall-open");
  if (push) {
    const url = new URL(location.href); url.searchParams.delete("sessionId"); url.hash = "";
    history.pushState({ home: true }, "", url);
  }
  $("heroCultivationCard").focus(); window.scrollTo({ top: 0, behavior: "smooth" });
}
$("backToDashboardBtn").addEventListener("click", () => returnFromCultivationHall());
$("realmPrevBtn").addEventListener("click", () => {
  if (hallRealmIndex <= 0) return;
  hallRealmIndex -= 1; hallSublevel = CULTIVATION_REALMS[hallRealmIndex].end - CULTIVATION_REALMS[hallRealmIndex].start + 1;
  if (cultivationSnapshot) renderCultivationRoadmap(cultivationSnapshot.cultivation, cultivationSnapshot.level, cultivationSnapshot.realm, cultivationSnapshot.gate);
});
$("realmNextBtn").addEventListener("click", () => {
  if (hallRealmIndex >= CULTIVATION_REALMS.length - 1) return;
  hallRealmIndex += 1; hallSublevel = 1;
  if (cultivationSnapshot) renderCultivationRoadmap(cultivationSnapshot.cultivation, cultivationSnapshot.level, cultivationSnapshot.realm, cultivationSnapshot.gate);
});
$("jumpCurrentRealm").addEventListener("click", () => {
  if (!cultivationSnapshot) return;
  hallRealmIndex = cultivationSnapshot.realmIndex; hallSublevel = cultivationSnapshot.insideLevel;
  renderCultivationRoadmap(cultivationSnapshot.cultivation, cultivationSnapshot.level, cultivationSnapshot.realm, cultivationSnapshot.gate);
});
$("openMonthlyReportsBtn")?.addEventListener("click", () => openMonthlyReportsArchiveModal());
$("closeArchiveModalBtn")?.addEventListener("click", () => closeMonthlyReportsArchiveModal());
$("viewCurrentMonthLiveBtn")?.addEventListener("click", () => {
  closeMonthlyReportsArchiveModal();
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const target = Math.max(1, Number(localGet(TARGET_KEY, "300")) || 300);
  const currentReport = generateMonthlyReport(currentMonthKey, state.history, target);
  openMonthlyReportModal(currentReport, "realm");
});

$("closeReportModalBtn")?.addEventListener("click", () => closeMonthlyReportModal());
$("monthlyReportModal")?.addEventListener("click", (e) => {
  if (e.target === $("monthlyReportModal")) closeMonthlyReportModal();
});
$("monthlyReportsArchiveModal")?.addEventListener("click", (e) => {
  if (e.target === $("monthlyReportsArchiveModal")) closeMonthlyReportsArchiveModal();
});

$("prevStoryCardBtn")?.addEventListener("click", () => {
  if (!activeReportCard) return;
  const idx = STORY_CARD_TYPES.indexOf(currentStoryCardType);
  const newIdx = (idx - 1 + STORY_CARD_TYPES.length) % STORY_CARD_TYPES.length;
  currentStoryCardType = STORY_CARD_TYPES[newIdx];
  renderStoryCardView(activeReportCard, currentStoryCardType, getActiveRealmInfo());
});

$("nextStoryCardBtn")?.addEventListener("click", () => {
  if (!activeReportCard) return;
  const idx = STORY_CARD_TYPES.indexOf(currentStoryCardType);
  const newIdx = (idx + 1) % STORY_CARD_TYPES.length;
  currentStoryCardType = STORY_CARD_TYPES[newIdx];
  renderStoryCardView(activeReportCard, currentStoryCardType, getActiveRealmInfo());
});

$("storyTabsBar")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".story-tab");
  if (!btn || !activeReportCard) return;
  const card = btn.dataset.card;
  if (card && STORY_CARD_TYPES.includes(card)) {
    currentStoryCardType = card;
    renderStoryCardView(activeReportCard, currentStoryCardType, getActiveRealmInfo());
  }
});

$("storyIndicators")?.addEventListener("click", (e) => {
  const dot = e.target.closest(".dot");
  if (!dot || !activeReportCard) return;
  const idx = Number(dot.dataset.index);
  if (!isNaN(idx) && STORY_CARD_TYPES[idx]) {
    currentStoryCardType = STORY_CARD_TYPES[idx];
    renderStoryCardView(activeReportCard, currentStoryCardType, getActiveRealmInfo());
  }
});

$("downloadStatusImageBtn")?.addEventListener("click", () => {
  if (!activeReportCard) return;
  exportStatusCardToPng(activeReportCard, getActiveRealmInfo(), currentStoryCardType);
});

$("downloadAllCardsBtn")?.addEventListener("click", () => {
  if (!activeReportCard) return;
  downloadAllStoryCards(activeReportCard, getActiveRealmInfo());
});

$("toggleSessionPacingBtn")?.addEventListener("click", () => {
  pacingMode = "session"; $("toggleSessionPacingBtn").classList.add("active"); $("toggleConceptPacingBtn").classList.remove("active");
  if (state.selected) renderPacing(state.selected);
});
$("toggleConceptPacingBtn")?.addEventListener("click", () => {
  pacingMode = "concept"; $("toggleConceptPacingBtn").classList.add("active"); $("toggleSessionPacingBtn").classList.remove("active");
  if (state.selected) renderPacing(state.selected);
});
$("viewExamDecisionsBtn")?.addEventListener("click", () => {
  questionTableMode = "decisions"; $("viewExamDecisionsBtn").classList.add("active"); $("viewConceptBreakdownBtn").classList.remove("active");
  if (state.selected) renderQuestionTable(state.selected);
});
$("viewConceptBreakdownBtn")?.addEventListener("click", () => {
  questionTableMode = "concept"; $("viewConceptBreakdownBtn").classList.add("active"); $("viewExamDecisionsBtn").classList.remove("active");
  if (state.selected) renderQuestionTable(state.selected);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMonthlyReportModal();
    closeMonthlyReportsArchiveModal();
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (["examHistory", "examSession", "examModeActive"].some((key) => key in changes)) void load();
});
load().catch((error) => showToast(`Could not load practice data: ${error.message}`, true));

const renderPacingDwellChart = renderPacing;

if (typeof window !== "undefined") {
  window.getOptimalDwellStep = getOptimalDwellStep;
  window.formatDwellAxisLabel = formatDwellAxisLabel;
  window.renderPacingDwellChart = renderPacingDwellChart;
  window.renderPacing = renderPacing;
  window.calculateMonthlyCultivatedTotal = calculateMonthlyCultivatedTotal;
  window.generateMonthlyReport = generateMonthlyReport;
  window.checkMonthlyRollover = checkMonthlyRollover;
  window.exportStatusCardToPng = exportStatusCardToPng;
  window.downloadAllStoryCards = downloadAllStoryCards;
  window.openMonthlyReportModal = openMonthlyReportModal;
  window.openMonthlyReportsArchiveModal = openMonthlyReportsArchiveModal;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getOptimalDwellStep,
    formatDwellAxisLabel,
    renderPacing,
    renderPacingDwellChart,
    parseQuestionNumber,
    calculateMonthlyCultivatedTotal,
    generateMonthlyReport,
    checkMonthlyRollover,
    exportStatusCardToPng,
    downloadAllStoryCards
  };
}

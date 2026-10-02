const fs = require("fs");
const path = require("path");

const TOTAL_QUESTIONS_TARGET = 16550;
const SESSIONS_COUNT = 40;
const QUESTIONS_PER_SESSION = Math.ceil(TOTAL_QUESTIONS_TARGET / SESSIONS_COUNT);

const SUBJECTS = ["Physics", "Chemistry", "Mathematics"];
const now = Date.now();
const DAY_MS = 86400000;

console.log(`Generating ${TOTAL_QUESTIONS_TARGET} questions across ${SESSIONS_COUNT} daily sessions...`);

const sessions = [];
let globalQuestionCounter = 1;

for (let s = 0; s < SESSIONS_COUNT; s++) {
  const sessionTime = now - (SESSIONS_COUNT - 1 - s) * DAY_MS;
  const subject = SUBJECTS[s % SUBJECTS.length];
  const qCount = s === SESSIONS_COUNT - 1
    ? TOTAL_QUESTIONS_TARGET - (QUESTIONS_PER_SESSION * (SESSIONS_COUNT - 1))
    : QUESTIONS_PER_SESSION;

  const questions = {};
  const outcomes = {};
  const questionOrder = [];
  const isEnduranceMock = s === 5;
  const durationMs = isEnduranceMock ? 7200000 : 3600000;

  for (let q = 0; q < qCount; q++) {
    const qId = `q_godmode_${globalQuestionCounter++}`;
    questionOrder.push(qId);
    outcomes[qId] = "Right";

    const questionTime = 22000;
    const firstSeenAt = sessionTime + q * questionTime;
    const lastSeenAt = firstSeenAt + questionTime;

    questions[qId] = {
      firstSeenAt,
      lastSeenAt,
      label: `Question ${q + 1}`,
      outcome: "Right",
      timeMs: questionTime,
      visits: 1,
      url: `https://web.getmarks.app/cpyqbV3/question/${qId}/`
    };
  }

  sessions.push({
    sessionId: `session-unlocked-${s + 1}`,
    examName: `${subject} All-India Pinnacle Mastery Mock ${s + 1}`,
    subject,
    mode: "countdown",
    allottedTimeMs: durationMs,
    durationMs,
    startedAt: new Date(sessionTime).toISOString(),
    startedAtMs: sessionTime,
    endedAt: sessionTime + durationMs,
    endedReason: "question-limit-confirmed",
    targetQuestions: qCount,
    countdownSettings: {
      allottedMinutes: Math.floor(durationMs / 60000),
      questionCap: qCount
    },
    completedQuestionIds: questionOrder,
    questionOrder,
    outcomes,
    questions,
    reviewQuestionIds: [],
    targetPadding: []
  });
}

const backupData = { exportedAt: now, sessions };
const outputPath = path.join(__dirname, "exam-arena-full-unlocked.json");
fs.writeFileSync(outputPath, JSON.stringify(backupData, null, 2), "utf-8");

console.log(`Successfully generated: ${outputPath}`);
console.log(`File size: ${(fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2)} MB`);
console.log("Import this JSON file into Study Slash to inspect high-volume cultivation progress.");

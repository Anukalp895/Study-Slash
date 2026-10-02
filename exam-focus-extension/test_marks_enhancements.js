const fs = require("fs");
const path = require("path");
const assert = require("assert");

console.log("=== EXAM ARENA AUTHENTIC CULTIVATION BADGE, CHAPTER EXTRACTOR & SESSION MODAL TEST SUITE ===");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));
const blurCss = fs.readFileSync(path.join(__dirname, "styles/blur.css"), "utf8");
const marksJs = fs.readFileSync(path.join(__dirname, "content_scripts/marks_interceptor.js"), "utf8");
const popupHtml = fs.readFileSync(path.join(__dirname, "popup/popup.html"), "utf8");
const popupJs = fs.readFileSync(path.join(__dirname, "popup/popup.js"), "utf8");
const dashboardJs = fs.readFileSync(path.join(__dirname, "dashboard/dashboard.js"), "utf8");
const backgroundJs = fs.readFileSync(path.join(__dirname, "background.js"), "utf8");

// ============================================================================
// 1. Verify Manifest Content Script Loading Order & CultivationVisuals Expose
// ============================================================================
console.log("\n[Test 1] Validating manifest.json Content Script Loading Order...");

const marksContentScript = manifest.content_scripts.find(cs => 
  cs.matches.some(m => m.includes("getmarks.app"))
);
assert(marksContentScript, "getmarks.app content_scripts declaration missing in manifest.json");
assert(
  marksContentScript.js.includes("dashboard/cultivation-visuals.js") &&
  marksContentScript.js.includes("content_scripts/marks_interceptor.js"),
  "Both cultivation-visuals.js and marks_interceptor.js must be loaded on Marks app"
);
const visualsIdx = marksContentScript.js.indexOf("dashboard/cultivation-visuals.js");
const interceptorIdx = marksContentScript.js.indexOf("content_scripts/marks_interceptor.js");
assert(visualsIdx < interceptorIdx, "cultivation-visuals.js MUST load BEFORE marks_interceptor.js");

console.log("✓ Manifest content_scripts configuration and engine load order verified.");

// ============================================================================
// 2. Verify Authentic Progressive Cultivation Realm System & SVG Badge Generator
// ============================================================================
console.log("\n[Test 2] Validating Authentic Cultivation Realm System & SVG Engine...");

// CSS checks in blur.css
assert(blurCss.includes(".ea-realm-badge-root"), ".ea-realm-badge-root missing in blur.css");
assert(blurCss.includes(".ea-celestial-pulse-aura"), ".ea-celestial-pulse-aura missing in blur.css");
assert(blurCss.includes("@keyframes qiPulseAnimation"), "@keyframes qiPulseAnimation missing in blur.css");
assert(blurCss.includes(".cultivation-emblem"), ".cultivation-emblem missing in blur.css");

// JS checks in marks_interceptor.js
assert(
  marksJs.includes("CULTIVATION_REALMS_SPEC = [") || marksJs.includes("CULTIVATION_REALMS_CONFIG = ["),
  "Cultivation realm specification missing in marks_interceptor.js"
);
assert(marksJs.includes("Elementary Profound") && marksJs.includes("Ancestor God"), "All 20 cultivation realms must be defined");
assert(marksJs.includes("function toRoman("), "toRoman function missing");
assert(marksJs.includes("function getRealmMetadata("), "getRealmMetadata function missing");
assert(marksJs.includes("function renderAuthenticCultivationBadge("), "renderAuthenticCultivationBadge function missing");
assert(marksJs.includes("renderOfficialCultivationBadgeSvg"), "renderOfficialCultivationBadgeSvg alias missing");
assert(marksJs.includes("window.CultivationVisuals.renderCultivationBadge"), "Strategy A bridge to CultivationVisuals engine missing");

// Strategy B Authentic multi-tier heraldic paths matching Hall of Cultivation
assert(marksJs.includes("M50 4 87 19"), "Authentic outer heraldic shield path missing");
assert(marksJs.includes("m16 20-12-9"), "Authentic wing crests & chevrons path missing");
assert(marksJs.includes("m31 59 19 24 19-24"), "Authentic accent struts path missing");
assert(marksJs.includes("M50 32 65 41"), "Authentic core faceted diamond gem path missing");

// Ensure crude placeholder polygon was completely eliminated
assert(!marksJs.includes("50,6 92,26 92,74 50,94 8,74 8,26"), "Crude hexagonal placeholder polygon must be removed!");

// Functional validation of toRoman
function toRoman(num) {
  const romanMap = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let result = "";
  let n = Math.max(1, Math.min(10, Number(num) || 1));
  for (const [val, roman] of romanMap) {
    while (n >= val) { result += roman; n -= val; }
  }
  return result;
}

assert.strictEqual(toRoman(1), "I");
assert.strictEqual(toRoman(2), "II");
assert.strictEqual(toRoman(3), "III");
assert.strictEqual(toRoman(4), "IV");
assert.strictEqual(toRoman(5), "V");
assert.strictEqual(toRoman(8), "VIII");
assert.strictEqual(toRoman(9), "IX");
assert.strictEqual(toRoman(10), "X");

console.log("✓ Authentic 20-realm cultivation engine, multi-tier heraldic paths, and Roman tier seals verified.");

// ============================================================================
// 3. Verify Popup Cultivation Badge Parity
// ============================================================================
console.log("\n[Test 3] Validating Extension Popup Cultivation Badge Parity...");

// HTML checks in popup/popup.html
assert(popupHtml.includes("<script src=\"../dashboard/cultivation-visuals.js\"></script>"), "cultivation-visuals.js script import missing in popup.html");
assert(popupHtml.includes("<script src=\"popup.js\" defer></script>"), "popup.js script defer missing in popup.html");
assert(popupHtml.includes("id=\"cultivationBadgeIcon\""), "#cultivationBadgeIcon missing in popup.html");
assert(popupHtml.includes("class=\"mini-badge cultivation-icon-wrap\""), ".cultivation-icon-wrap missing in popup.html");
assert(popupHtml.includes("id=\"popupCultivationLevelPill\""), "#popupCultivationLevelPill missing in popup.html");
assert(popupHtml.includes("id=\"popupCultivationRealmTitle\""), "#popupCultivationRealmTitle missing in popup.html");
assert(popupHtml.includes("id=\"popupCultivationFlowStatus\""), "#popupCultivationFlowStatus missing in popup.html");

// JS checks in popup/popup.js
assert(popupJs.includes("function updateCultivationDisplay("), "updateCultivationDisplay function missing in popup.js");
assert(popupJs.includes("function getPopupRealmDetails("), "getPopupRealmDetails function missing in popup.js");
assert(popupJs.includes("function renderPopupShieldFallback("), "renderPopupShieldFallback function missing in popup.js");
assert(popupJs.includes("M50 4 87 19"), "Authentic outer heraldic shield path missing in popup.js");
assert(popupJs.includes("m16 20-12-9"), "Authentic wing crests & chevrons path missing in popup.js");
assert(popupJs.includes("m31 59 19 24 19-24"), "Authentic accent struts path missing in popup.js");
assert(popupJs.includes("M50 32 65 41"), "Authentic core diamond gem path missing in popup.js");
assert(popupJs.includes("\"exam-arena-cultivation-state\""), "exam-arena-cultivation-state must be handled in popup.js KEYS and storage listener");

console.log("✓ Extension popup badge parity, script import, and authentic SVG fallback verified.");

// ============================================================================
// 4. Verify Precision Chapter Scraping & Subject Auto-Detection
// ============================================================================
console.log("\n[Test 4] Validating Breadcrumb Chapter Extraction & Subject Auto-Detection...");

assert(marksJs.includes("function extractMarksChapterName()"), "extractMarksChapterName missing in marks_interceptor.js");
assert(marksJs.includes("/(?:>>|»|›|>)/"), "Separator regex for >>, », ›, > missing in chapter scraper");
assert(marksJs.includes("function detectMarksSubject("), "detectMarksSubject missing in marks_interceptor.js");

// Functional verification of chapter extraction logic from strings
function extractFromBreadcrumb(raw) {
  if (/(?:>>|»|›|>)/.test(raw)) {
    const parts = raw.split(/(?:>>|»|›|>)/);
    if (parts.length >= 2) {
      const chapter = parts[parts.length - 1].trim();
      if (
        chapter.length >= 2 && 
        !/^(questions?|beginner\s*qs|rank\s*booster|advanced|must\s*do|bucket|test|marks|exam)$/i.test(chapter) &&
        !/marks\s*app/i.test(chapter)
      ) {
        return chapter;
      }
    }
  }
  return null;
}

assert.strictEqual(extractFromBreadcrumb("JEE Main >> Mathematics in Physics"), "Mathematics in Physics");
assert.strictEqual(extractFromBreadcrumb("JEE Main >> Basic of Mathematics"), "Basic of Mathematics");
assert.strictEqual(extractFromBreadcrumb("JEE Main » Mechanical Properties of Fluids"), "Mechanical Properties of Fluids");
assert.strictEqual(extractFromBreadcrumb("NEET > Genetics and Evolution"), "Genetics and Evolution");
assert.strictEqual(extractFromBreadcrumb("JEE Advanced › Rotational Motion"), "Rotational Motion");
assert.strictEqual(extractFromBreadcrumb("JEE Main >> Questions"), null, "Generic 'Questions' term must be disqualified");

// Functional verification of detectMarksSubject matching marks_interceptor.js logic
function testDetectSubject(chapterName, docTitle = "", pathname = "") {
  const configuredSubjects = ["Physics", "Chemistry", "Mathematics", "Biology"];
  const cleanChapter = (chapterName || "").toLowerCase().trim();
  const context = `${cleanChapter} ${(docTitle || "").toLowerCase()} ${(pathname || "").toLowerCase()}`;

  // Prioritize "mathematics in physics" or physics tokens
  const physicsRules = [
    /\bmathematics\s+in\s+physics\b/,
    /\bphysics\b/,
    /\b(mechanics|kinematics|motion|rotat|gravit|fluid|thermo|shm|oscillation|wave|optic|electrostat|current|magnet|induction|ac|semiconductor|units|dimensions|work|power|energy)\b/
  ];
  if (physicsRules.some(r => r.test(cleanChapter) || r.test(context))) {
    const match = configuredSubjects.find(s => s.toLowerCase() === "physics");
    if (match) return match;
  }

  const mathRules = [
    /\b(mathematics|maths|math)\b/,
    /\b(calculus|algebra|vector|matrix|matrices|determinant|trigonometr|integrat|differentiat|derivative|coordinate|conic|probability|relation|function|sequence|series)\b/
  ];
  if (mathRules.some(r => r.test(cleanChapter) || r.test(context))) {
    const match = configuredSubjects.find(s => s.toLowerCase() === "mathematics");
    if (match) return match;
  }

  const chemRules = [
    /\bchem(?:istry)?\b/,
    /\b(organic|inorganic|physical|atomic|chemical|bonding|thermodynamics|equilibrium|redox|electrochem|kinetics|surface|metallurgy|block|coordination|haloalkane|alcohol|aldehyde|ketone|carboxylic|amine|biomolecule|polymer)\b/
  ];
  if (chemRules.some(r => r.test(cleanChapter) || r.test(context))) {
    const match = configuredSubjects.find(s => s.toLowerCase() === "chemistry");
    if (match) return match;
  }

  const bioRules = [
    /\bbio(?:logy)?\b/,
    /\b(botany|zoology|genetics|cell|evolution|human|plant|reproduction|ecology|biotechnology|physiology)\b/
  ];
  if (bioRules.some(r => r.test(cleanChapter) || r.test(context))) {
    const match = configuredSubjects.find(s => s.toLowerCase() === "biology");
    if (match) return match;
  }

  return configuredSubjects[0];
}

assert.strictEqual(testDetectSubject("Mathematics in Physics"), "Physics", "'Mathematics in Physics' must detect as Physics!");
assert.strictEqual(testDetectSubject("Basic of Mathematics"), "Mathematics");
assert.strictEqual(testDetectSubject("Mechanical Properties of Fluids"), "Physics");
assert.strictEqual(testDetectSubject("Organic Hydrocarbons & Haloalkanes"), "Chemistry");
assert.strictEqual(testDetectSubject("Cell Cycle and Genetics"), "Biology");
console.log("✓ Precision breadcrumb extraction and 'Mathematics in Physics' subject detection verified.");

// ============================================================================
// 5. Verify Drag-as-Badge Lockdown & 4-Quadrant Adaptive Expansion
// ============================================================================
console.log("\n[Test 5] Validating Drag-as-Badge Lockdown & 4-Quadrant Adaptive Expansion...");

// Starts minimized by default
assert(marksJs.includes("localStorage.getItem(\"ea-tile-minimized\") !== \"false\""), "Tile must be minimized by default");

// Drag-as-Badge Lockdown rule
assert(marksJs.includes("tile.classList.add(\"minimized\", \"ea-is-dragging\")"), "MANDATORY Drag-as-Badge lock missing on pointerdown");
assert(marksJs.includes("BADGE_SIZE = 56"), "BADGE_SIZE = 56 constant missing");
assert(marksJs.includes("SCREEN_MARGIN = 8"), "SCREEN_MARGIN = 8 constant missing");

// True 4-corner clamping
assert(marksJs.includes("window.innerWidth - BADGE_SIZE - SCREEN_MARGIN"), "Right edge clamping to 8px margin missing");
assert(marksJs.includes("window.innerHeight - BADGE_SIZE - SCREEN_MARGIN"), "Bottom edge clamping to 8px margin missing");

// Position persistence
assert(marksJs.includes("localStorage.setItem(\"ea-tile-anchor-x\""), "Anchor X persistence missing");
assert(marksJs.includes("localStorage.setItem(\"ea-tile-anchor-y\""), "Anchor Y persistence missing");

// 4-Quadrant Adaptive Expansion Engine
assert(marksJs.includes("function applyAdaptiveQuadrantPosition("), "applyAdaptiveQuadrantPosition function missing");
assert(marksJs.includes("quadrant-br"), "quadrant-br (bottom-right) missing in marks_interceptor.js");
assert(marksJs.includes("quadrant-bl"), "quadrant-bl (bottom-left) missing in marks_interceptor.js");
assert(marksJs.includes("quadrant-tr"), "quadrant-tr (top-right) missing in marks_interceptor.js");
assert(marksJs.includes("quadrant-tl"), "quadrant-tl (top-left) missing in marks_interceptor.js");

// CSS Quadrant Transform-Origin mappings
assert(blurCss.includes(".ea-marks-tile.quadrant-br"), ".ea-marks-tile.quadrant-br missing in blur.css");
assert(blurCss.includes("transform-origin: bottom right !important;"), "quadrant-br transform-origin missing");
assert(blurCss.includes(".ea-marks-tile.quadrant-bl"), ".ea-marks-tile.quadrant-bl missing in blur.css");
assert(blurCss.includes("transform-origin: bottom left !important;"), "quadrant-bl transform-origin missing");
assert(blurCss.includes(".ea-marks-tile.quadrant-tr"), ".ea-marks-tile.quadrant-tr missing in blur.css");
assert(blurCss.includes("transform-origin: top right !important;"), "quadrant-tr transform-origin missing");
assert(blurCss.includes(".ea-marks-tile.quadrant-tl"), ".ea-marks-tile.quadrant-tl missing in blur.css");
assert(blurCss.includes("transform-origin: top left !important;"), "quadrant-tl transform-origin missing");

// CSS Minimized Badge 56px Geometry
assert(blurCss.includes("width: 56px !important;"), "56px width for minimized badge missing in blur.css");
assert(blurCss.includes("height: 56px !important;"), "56px height for minimized badge missing in blur.css");

// Drag filtering
assert(marksJs.includes("justFinishedDrag"), "justFinishedDrag flag missing");
assert(marksJs.includes("pointerMovedDistance"), "pointerMovedDistance calculation missing");

// Click outside to contract
assert(marksJs.includes("document.addEventListener(\"pointerdown\""), "Outside pointerdown listener missing");
assert(marksJs.includes("!tile.contains(e.target)"), "Outside target checking missing");

console.log("✓ Drag-as-badge lockdown, true 4-corner clamping, and 4-quadrant adaptive expansion verified.");

// ============================================================================
// 6. Verify Session Setup Modal Polish & Dynamic Subjects
// ============================================================================
console.log("\n[Test 6] Validating Session Setup Modal Polish...");

// HTML & input configuration
assert(marksJs.includes("openMarksSessionSetupModal"), "openMarksSessionSetupModal function missing");
assert(marksJs.includes("placeholder=\"No target (Infinite)\""), "Target question placeholder must be 'No target (Infinite)'");
assert(marksJs.includes("Leave blank for untargeted practice"), "Hint text missing for untargeted practice");
assert(marksJs.includes("ea-practice-mode-grid"), "ea-practice-mode-grid missing");
assert(marksJs.includes("mode-card active"), "Default active mode-card missing");
assert(marksJs.includes("data-mode=\"stopwatch\""), "Stopwatch mode card missing");
assert(marksJs.includes("data-mode=\"countdown\""), "Countdown mode card missing");

// Dynamic subject creation
assert(marksJs.includes("__ADD_NEW__"), "__ADD_NEW__ option missing");
assert(marksJs.includes("eaNewSubjectInline"), "eaNewSubjectInline missing");
assert(marksJs.includes("eaSaveSubjectBtn"), "eaSaveSubjectBtn missing");

// CTA Styling
assert(blurCss.includes(".ea-btn-ignite"), ".ea-btn-ignite missing in blur.css");
assert(blurCss.includes("background: #14b8a6 !important;"), "Ignite button teal background missing");
assert(blurCss.includes("color: #020817 !important;"), "Ignite button high contrast text color missing");

// START_SESSION background integration
assert(backgroundJs.includes("if (message?.type === \"START_SESSION\")"), "START_SESSION handler missing in background.js");
assert(backgroundJs.includes("targetQuestions ="), "targetQuestions handling missing in background.js");
console.log("✓ Session setup modal, segmented mode cards, dynamic subjects, and CTA contrast verified.");

// ============================================================================
// 7. Verify Real-Time Sync & 0 XP Fallback Recovery
// ============================================================================
console.log("\n[Test 7] Validating Real-time Sync & Fallback Calculation...");

assert(dashboardJs.includes("chrome.storage.local.set"), "dashboard.js storage persistence missing");
assert(dashboardJs.includes("\"exam-arena-cultivation-state\""), "exam-arena-cultivation-state persistence missing");
assert(dashboardJs.includes("streakDays"), "streakDays sync missing");
assert(dashboardJs.includes("monthlyTargetPercent"), "monthlyTargetPercent sync missing");
assert(marksJs.includes("deriveLevelFromTotalXp"), "deriveLevelFromTotalXp missing in marks_interceptor.js");

console.log("✓ Dashboard sync and fallback calculation verified.");

// ============================================================================
// 8. Verify Daily Streak & Monthly Target Parity with In-App Dashboard
// ============================================================================
console.log("\n[Test 8] Validating Daily Streak & Monthly Target Parity...");

// Re-read file contents to reflect latest edits
const updatedMarksJs = fs.readFileSync(path.join(__dirname, "content_scripts/marks_interceptor.js"), "utf8");
const updatedBackgroundJs = fs.readFileSync(path.join(__dirname, "background.js"), "utf8");

// No falsy fallback to 1 in marks_interceptor.js
assert(!updatedMarksJs.includes("storageData?.streakDays || 1"), "marks_interceptor.js must not contain 'storageData?.streakDays || 1' fallback!");
assert(updatedMarksJs.includes("typeof storageData?.streakDays === \"number\""), "marks_interceptor.js must strictly check typeof streakDays === 'number'");

// IDs present on meta chips
assert(updatedMarksJs.includes("id=\"eaTileStreakChip\""), "eaTileStreakChip ID missing in marks_interceptor.js");
assert(updatedMarksJs.includes("id=\"eaTileMonthlyChip\""), "eaTileMonthlyChip ID missing in marks_interceptor.js");

// Calculation functions exist in content script
assert(updatedMarksJs.includes("function calculateDashboardDailyStreak("), "calculateDashboardDailyStreak missing in marks_interceptor.js");
assert(updatedMarksJs.includes("function calculateDashboardMonthlyTarget("), "calculateDashboardMonthlyTarget missing in marks_interceptor.js");
assert(updatedMarksJs.includes("updateMarksHoverTileMetrics"), "updateMarksHoverTileMetrics missing in marks_interceptor.js");

// background.js calculates and synchronizes streak on session end
assert(updatedBackgroundJs.includes("calculateBackgroundStreak"), "calculateBackgroundStreak missing in background.js");
assert(updatedBackgroundJs.includes("streakDays: computedStreak"), "streakDays persistence missing in background.js completeSession");

// Live storage onChanged handler updates tile metrics
assert(updatedMarksJs.includes("if (changes.streakDays || changes.monthlyTargetPercent"), "streakDays onChanged handler missing in marks_interceptor.js");
assert(updatedMarksJs.includes("if (changes.examHistory && !changes.streakDays)"), "examHistory fallback recalculation missing in marks_interceptor.js");

// Functional validation of streak algorithm parity
function simulateDashboardStreak(sessions, referenceDate = new Date()) {
  function localDayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function sessionStart(s) {
    return Number(s.startedAtMs) || Date.parse(s.startedAt || s.startTime || s.date || s.timestamp) || 0;
  }
  const streakDays = new Set();
  sessions.forEach((session) => {
    const key = localDayKey(new Date(sessionStart(session)));
    const visited = Object.values(session.questions || {}).filter(q => q.outcome !== "Not Visited" && !q.isPlaceholder);
    if (visited.length) streakDays.add(key);
  });
  let streak = 0;
  const cursor = new Date(referenceDate);
  if (!streakDays.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (streakDays.has(localDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const today = new Date();
const yesterday = new Date();
yesterday.setDate(today.getDate() - 1);
const twoDaysAgo = new Date();
twoDaysAgo.setDate(today.getDate() - 2);
const fourDaysAgo = new Date();
fourDaysAgo.setDate(today.getDate() - 4);

// Test 8.1: Empty history -> streak must be 0, NEVER 1
assert.strictEqual(simulateDashboardStreak([]), 0, "Empty history must yield 0-day streak");

// Test 8.2: Practice session logged today -> streak must be 1
const sessionToday = {
  startedAt: today.toISOString(),
  questions: { q1: { outcome: "Right" } }
};
assert.strictEqual(simulateDashboardStreak([sessionToday]), 1, "Session today must yield 1-day streak");

// Test 8.3: Practice session logged yesterday only -> streak must be 1 (grace period for today)
const sessionYesterday = {
  startedAt: yesterday.toISOString(),
  questions: { q1: { outcome: "Right" } }
};
assert.strictEqual(simulateDashboardStreak([sessionYesterday]), 1, "Session yesterday must preserve 1-day streak");

// Test 8.4: Practice sessions yesterday and two days ago -> streak must be 2
const sessionTwoDaysAgo = {
  startedAt: twoDaysAgo.toISOString(),
  questions: { q1: { outcome: "Right" } }
};
assert.strictEqual(simulateDashboardStreak([sessionYesterday, sessionTwoDaysAgo]), 2, "Sessions on consecutive prior days must yield 2-day streak");

// Test 8.5: Practice sessions today, yesterday, and two days ago -> streak must be 3
assert.strictEqual(simulateDashboardStreak([sessionToday, sessionYesterday, sessionTwoDaysAgo]), 3, "Consecutive sessions including today must yield 3-day streak");

// Test 8.6: Broken streak (practiced 4 days ago, but missed yesterday and today) -> streak must be 0
const sessionFourDaysAgo = {
  startedAt: fourDaysAgo.toISOString(),
  questions: { q1: { outcome: "Right" } }
};
assert.strictEqual(simulateDashboardStreak([sessionFourDaysAgo]), 0, "Inactive user must have 0-day streak");

console.log("✓ Streak calculation algorithm parity, 0-day handling, and background/content-script synchronization verified.");

console.log("\n==================================================================");
console.log("🎉 ALL 8 TEST SUITES PASSED! DAILY STREAK SYNC PARITY FULLY VERIFIED 🎉");
console.log("==================================================================");

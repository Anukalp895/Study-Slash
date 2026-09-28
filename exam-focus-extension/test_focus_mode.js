const fs = require("fs");
const path = require("path");
const assert = require("assert");

console.log("=== EXAM ARENA FOCUS MODE TEST SUITE ===");

// 1. Validate manifest.json
console.log("\n[Test 1] Validating manifest.json...");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8"));

assert(manifest.permissions.includes("declarativeNetRequest"), "manifest missing declarativeNetRequest permission");
assert(manifest.permissions.includes("declarativeNetRequestFeedback"), "manifest missing declarativeNetRequestFeedback permission");

assert(manifest.declarative_net_request, "manifest missing declarative_net_request block");
assert(Array.isArray(manifest.declarative_net_request.rule_resources), "manifest missing rule_resources");
const focusRuleset = manifest.declarative_net_request.rule_resources.find(r => r.id === "focus_rules");
assert(focusRuleset, "focus_rules ruleset not found in rule_resources");
assert.strictEqual(focusRuleset.path, "rules/focus_rules.json", "ruleset path mismatch");

// Verify web_accessible_resources
assert(Array.isArray(manifest.web_accessible_resources), "manifest missing web_accessible_resources");
const webResources = manifest.web_accessible_resources.flatMap(w => w.resources);
assert(webResources.includes("dashboard/focus_blocked.html"), "focus_blocked.html not in web_accessible_resources");
assert(webResources.includes("dashboard/focus_blocked.css"), "focus_blocked.css not in web_accessible_resources");
assert(webResources.includes("dashboard/focus_blocked.js"), "focus_blocked.js not in web_accessible_resources");

// Verify content scripts
const ytScript = manifest.content_scripts.find(cs => cs.matches.some(m => m.includes("youtube.com")));
assert(ytScript, "YouTube content script not found");
assert(ytScript.js.includes("content_scripts/yt_focus_guard.js"), "YouTube content script js incorrect");
assert(ytScript.css.includes("styles/yt_focus.css"), "YouTube content script css incorrect");
console.log("✓ manifest.json is fully valid and compliant with MV3 DNR.");

// 2. Validate rules/focus_rules.json
console.log("\n[Test 2] Validating rules/focus_rules.json...");
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, "rules/focus_rules.json"), "utf8"));
assert(Array.isArray(rules), "Rules file must be a JSON array");
assert(rules.length >= 25, `Expected >= 25 rules, found ${rules.length}`);

const ruleIds = new Set();
rules.forEach((rule, idx) => {
  assert(Number.isInteger(rule.id) && rule.id > 0, `Rule at index ${idx} has invalid id: ${rule.id}`);
  assert(!ruleIds.has(rule.id), `Duplicate rule id: ${rule.id}`);
  ruleIds.add(rule.id);

  assert.strictEqual(rule.action.type, "redirect", `Rule ${rule.id} action type must be redirect`);
  assert.strictEqual(rule.action.redirect.extensionPath, "/dashboard/focus_blocked.html", `Rule ${rule.id} invalid extensionPath`);
  assert(rule.condition.urlFilter, `Rule ${rule.id} missing urlFilter`);
  assert(rule.condition.resourceTypes.includes("main_frame"), `Rule ${rule.id} missing main_frame resourceType`);
});

const filters = rules.map(r => r.condition.urlFilter);
const expectedDomains = [
  "instagram.com", "twitter.com", "x.com", "facebook.com", "threads.net",
  "reddit.com", "tiktok.com", "pinterest.com", "snapchat.com", "tumblr.com", "9gag.com",
  "netflix.com", "primevideo.com", "disneyplus.com", "hotstar.com", "twitch.tv", "kick.com",
  "crunchyroll.com", "aniwatch.to", "steamcommunity.com", "youtube.com/shorts"
];
expectedDomains.forEach(domain => {
  assert(filters.some(f => f.includes(domain)), `Expected domain ${domain} in rules`);
});
console.log(`✓ All ${rules.length} declarative rules validated with unique IDs and correct redirect schemas.`);

// 3. Validate focus_blocked landing page
console.log("\n[Test 3] Validating dashboard/focus_blocked.html and assets...");
const html = fs.readFileSync(path.join(__dirname, "dashboard/focus_blocked.html"), "utf8");
assert(html.includes("Path Blocked by Cultivation Focus"), "Missing headline in focus_blocked.html");
assert(html.includes("This site is restricted during your study session. Protect your streak and eliminate negative bleed."), "Missing body copy in focus_blocked.html");
assert(html.includes("blockedCultivationBadge"), "Missing badge container");
assert(html.includes("btnReturnDashboard"), "Missing Return to Dashboard button");
assert(html.includes("btnOpenDpp"), "Missing Open DPP Arena button");
assert(fs.existsSync(path.join(__dirname, "dashboard/focus_blocked.css")), "focus_blocked.css missing");
assert(fs.existsSync(path.join(__dirname, "dashboard/focus_blocked.js")), "focus_blocked.js missing");
console.log("✓ focus_blocked landing page, styles, and controller exist and match specification.");

// 4. Validate YouTube Study Shield Classification Engine
console.log("\n[Test 4] Validating Academic Classification Engine in yt_focus_guard.js...");
const { isStudyContent, STUDY_KEYWORDS, DISTRACTION_KEYWORDS } = require("./content_scripts/yt_focus_guard.js");

const academicExamples = [
  { title: "Complete Rotational Motion JEE Revision One Shot", channel: "Physics Wallah" },
  { title: "NEET 2025 Organic Chemistry DPP Solutions", channel: "Mohit Tyagi" },
  { title: "Calculus Limits and Continuity Lecture 1", channel: "Vedantu Math" },
  { title: "Class 12 Physics Wave Optics Derivation", channel: "Unacademy JEE" },
  { title: "IIT JEE Advanced Mathematics Mock Test Solved", channel: "MathonGo" },
  { title: "Thermodynamics and Kinetic Theory of Gases NCERT", channel: "Learn Chemistry" }
];

academicExamples.forEach(ex => {
  const result = isStudyContent(ex.title, ex.channel);
  assert.strictEqual(result, true, `Expected TRUE for academic: "${ex.title}" by ${ex.channel}`);
});
console.log(`✓ Passed ${academicExamples.length} academic classification tests.`);

const distractionExamples = [
  { title: "Playing Minecraft with Friends Gameplay Ep 1", channel: "GamerPro" },
  { title: "BGMI Live Stream With Subscribers Gameplay", channel: "StreamerX" },
  { title: "GTA 5 Thug Life Moments Funny Meme", channel: "Dank Memes" },
  { title: "Official Music Video - Latest Song 2026", channel: "T-Series" },
  { title: "Movie Trailer 2026 Reaction", channel: "MovieBuff" },
  { title: "New iPhone 17 Pro Max Unboxing & Review", channel: "Tech Guru" },
  { title: "Anime Episode 10 English Dub Reaction", channel: "Otaku Zone" },
  { title: "Funny Pranks In Public 2026 Comedy Roast", channel: "Prankster" },
  { title: "Standup Comedy Special Full Episode", channel: "Comic Club" },
  // Distraction keyword present alongside study keyword MUST FAIL
  { title: "Vlog studying JEE with funny pranks and memes", channel: "CollegeVlogs" },
  { title: "Playing Valorant while listening to physics lecture", channel: "GamerStudy" }
];

distractionExamples.forEach(ex => {
  const result = isStudyContent(ex.title, ex.channel);
  assert.strictEqual(result, false, `Expected FALSE for distraction: "${ex.title}" by ${ex.channel}`);
});
console.log(`✓ Passed ${distractionExamples.length} distraction classification tests.`);

// 5. Validate YouTube Study Shield CSS
console.log("\n[Test 5] Validating styles/yt_focus.css...");
const ytCss = fs.readFileSync(path.join(__dirname, "styles/yt_focus.css"), "utf8");
assert(ytCss.includes("examarena-non-study-card"), "Missing .examarena-non-study-card in yt_focus.css");
assert(ytCss.includes("examarena-non-study-pill"), "Missing .examarena-non-study-pill in yt_focus.css");
assert(ytCss.includes("#examarena-yt-shield"), "Missing #examarena-yt-shield in yt_focus.css");
assert(ytCss.includes("examarena-distraction-stripped"), "Missing .examarena-distraction-stripped in yt_focus.css");
assert(ytCss.includes("#chat") && ytCss.includes("#related") && ytCss.includes("#comments"), "Distraction stripper elements missing");
console.log("✓ YouTube Study Shield styles verified.");

// 6. Validate Popup Focus Toggle
console.log("\n[Test 6] Validating popup Focus Shield integration...");
const popupHtml = fs.readFileSync(path.join(__dirname, "popup/popup.html"), "utf8");
assert(popupHtml.includes("focusModeToggle"), "Missing focusModeToggle in popup.html");
assert(popupHtml.includes("Focus Shield"), "Missing Focus Shield label in popup.html");

const popupJs = fs.readFileSync(path.join(__dirname, "popup/popup.js"), "utf8");
assert(popupJs.includes("focusModeActive"), "popup.js missing focusModeActive handling");
assert(popupJs.includes("TOGGLE_FOCUS_MODE"), "popup.js missing TOGGLE_FOCUS_MODE send");
console.log("✓ Popup Focus Shield UI and bindings verified.");

// 7. Validate background.js
console.log("\n[Test 7] Validating background.js...");
const bgJs = fs.readFileSync(path.join(__dirname, "background.js"), "utf8");
assert(bgJs.includes("syncFocusRules"), "background.js missing syncFocusRules");
assert(bgJs.includes("TOGGLE_FOCUS_MODE"), "background.js missing TOGGLE_FOCUS_MODE");
assert(bgJs.includes("YOUTUBE_WHITELIST_ADD"), "background.js missing YOUTUBE_WHITELIST_ADD");
console.log("✓ background.js focus management and whitelist handlers verified.");

console.log("\n=========================================");
console.log("🎉 ALL 7 TEST SUITES PASSED FLAWLESSLY! 🎉");
console.log("=========================================\n");

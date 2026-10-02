(() => {
  // Hard Disqualification: If any of these tokens appear, it is immediately flagged as NON-STUDY
  const HARD_DISQUALIFICATION_KEYWORDS = [
    // Pop-Science & Clickbait Curiosity
    "alien", "futuristic", "dark web", "vaping", "psychedelic", "drugs", "dopamine",
    "serotonin", "biohack", "brainfo", "split-brain", "what they don't teach", "tour of",
    "scicology", "unsolved mystery", "conspiracy", "secret behind", "quantum computer",
    "fake gravity", "time travel", "multiverse", "simulation theory",

    // Tech News, AI Hype & Hustle
    "ai side hustle", "make money", "earn crores", "salary", "100x faster", "claude",
    "chatgpt", "agi", "openai", "gemini", "hustle", "freelance", "passive income",
    "rich", "crypto", "trading", "dropshipping", "agency", "iman gadzhi", "sisinty",

    // Entertainment, Gaming & Vlogs
    "gameplay", "gaming", "vlog", "prank", "trailer", "teaser", "roast", "standup",
    "comedy", "funny", "meme", "song", "official music video", "music video", "movie",
    "episode", "highlights", "reaction", "unboxing", "review", "anime", "web series",
    "bgmi", "gta", "minecraft", "valorant", "slushly",

    // Politics, Clickbait Commentary & Social Scandals
    "taliban", "moral police", "politics", "political", "modi", "rahul gandhi",
    "election", "bjp", "congress", "scam", "controversy", "drama", "news",
    "debate", "geopolitics", "expose", "exposed", "scandal", "propaganda",
    "minister", "parliament", "riot", "arrested", "court case", "media"
  ];

  // Strict Curriculum Tokens: Must contain at least one to be considered genuine study content
  const SYLLABUS_ACADEMIC_KEYWORDS = [
    "jee", "neet", "cbse", "ncert", "pyq", "dpp", "mock test", "sample paper",
    "class 11", "class 12", "class 10", "one shot", "oneshot", "revision lecture",
    "full chapter", "complete chapter", "derivation", "formula revision", "crash course",
    "physics wallah", "allen", "aakash", "unacademy jee", "vedantu", "mohit tyagi",
    "mathongo", "iit", "iit jee", "advanced",
    "shm", "thermodynamics", "optics", "kinematics", "rotational motion", "electrostatics",
    "haloalkanes", "hydrocarbons", "coordination compounds", "organic chemistry",
    "inorganic chemistry", "calculus", "integration", "differentiation", "matrices"
  ];

  const DEFAULT_ALLOWED_CHANNELS = [
    "physics wallah",
    "allen",
    "aakash",
    "unacademy",
    "vedantu",
    "mohit tyagi",
    "mathongo"
  ];

  const state = {
    focusModeActive: false,
    customAllowedChannels: [...DEFAULT_ALLOWED_CHANNELS]
  };

  function isStudyContent(title, channel = "", description = "") {
    const text = `${title} ${channel} ${description}`.toLowerCase();

    // 1. Whitelisted Channels Always Pass
    if (state.customAllowedChannels && state.customAllowedChannels.some(c => channel.toLowerCase().includes(c.toLowerCase()))) {
      return true;
    }

    // 2. Disqualify immediately if any non-study/hype/pop-science/drama token is present
    const hasDisqualification = HARD_DISQUALIFICATION_KEYWORDS.some(kw => text.includes(kw));
    if (hasDisqualification) {
      return false;
    }

    // 3. Must match a strict syllabus / entrance exam curriculum keyword
    const hasSyllabusMatch = SYLLABUS_ACADEMIC_KEYWORDS.some(kw => text.includes(kw));
    return hasSyllabusMatch;
  }

  let active = false;
  let whitelistedVideos = new Set();
  let observer = null;
  let rafPending = false;
  let currentVideoId = null;
  let isCurrentVideoAllowed = false;

  function getCurrentVideoId() {
    return new URLSearchParams(window.location.search).get("v") || null;
  }

  function isWatchPage() {
    return window.location.pathname === "/watch";
  }

  function checkShortsRedirect() {
    if (!active) return;
    if (window.location.pathname.startsWith("/shorts/")) {
      window.location.replace(chrome.runtime.getURL("dashboard/focus_blocked.html?type=shorts"));
    }
  }

  // 1. Universal Feed, Channel Shelves & Recommendation Sanitizer
  function scanAndEvaluateAllCards() {
    if (!active && !state.focusModeActive) return;
    if (document.body) {
      document.body.classList.toggle("ea-focus-active", true);
    }
    const cardSelectors = [
      "ytd-rich-item-renderer",
      "ytd-grid-video-renderer",
      "ytd-video-renderer",
      "ytd-compact-video-renderer",
      "ytd-reel-item-renderer"
    ];
    const cards = document.querySelectorAll(cardSelectors.join(", "));
    cards.forEach((card) => {
      // Avoid re-processing already classified cards unless page changed
      if (card.dataset.eaEvaluated === "true") return;

      const titleEl = card.querySelector("#video-title, #video-title-link, .yt-core-attributed-string, a#video-title, h3 a, #title");
      const channelEl = card.querySelector("#channel-name, .ytd-channel-name, #byline, ytd-channel-name a, #text.ytd-channel-name");
      
      const title = (titleEl?.textContent || "").trim();
      const channel = (channelEl?.textContent || "").trim();

      // Do not mark evaluated until YouTube renders text
      if (!title) return;

      card.dataset.eaEvaluated = "true";

      const isStudy = isStudyContent(title, channel);

      if (isStudy) {
        card.classList.add("ea-verified-study");
        card.classList.remove("ea-blocked-study");
        card.classList.remove("examarena-non-study-card");
        const existingPill = card.querySelector(".examarena-non-study-pill");
        if (existingPill) existingPill.remove();
      } else {
        card.classList.add("ea-blocked-study");
        card.classList.remove("ea-verified-study");
        card.classList.add("examarena-non-study-card");
        let pill = card.querySelector(".examarena-non-study-pill");
        if (!pill) {
          pill = document.createElement("div");
          pill.className = "examarena-non-study-pill";
          pill.innerHTML = `<span>🛡️</span><span>Non-Study Content Hidden</span>`;
          card.appendChild(pill);
        }
      }
    });
  }

  const sanitizeCards = scanAndEvaluateAllCards;

  // 2. Watch Page Guard
  function guardWatchPage() {
    if (!active) return;
    const watchFlexy = document.querySelector("ytd-watch-flexy");
    if (!isWatchPage()) {
      removeShieldOverlay();
      watchFlexy?.removeAttribute("ea-whitelisted");
      document.documentElement.classList.remove("examarena-distraction-stripped");
      return;
    }

    const videoId = getCurrentVideoId();
    if (!videoId) return;
    currentVideoId = videoId;

    if (whitelistedVideos.has(videoId)) {
      isCurrentVideoAllowed = true;
      watchFlexy?.setAttribute("ea-whitelisted", "true");
      removeShieldOverlay();
      applyDistractionStripping();
      return;
    }

    // Extract watch metadata
    const titleEl = document.querySelector("h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string");
    const rawTitle = titleEl?.textContent?.trim() || document.title.replace(/\s*-\s*YouTube$/i, "").trim();
    const channelEl = document.querySelector("#channel-name a, ytd-channel-name a, #upload-info #channel-name a");
    const channel = channelEl?.textContent?.trim() || "";
    const descEl = document.querySelector("#description-inline-expander, #description");
    const desc = descEl?.textContent?.trim() || "";

    const isStudy = isStudyContent(rawTitle, channel, desc);

    if (isStudy) {
      isCurrentVideoAllowed = true;
      watchFlexy?.setAttribute("ea-whitelisted", "true");
      removeShieldOverlay();
      applyDistractionStripping();
    } else {
      isCurrentVideoAllowed = false;
      watchFlexy?.removeAttribute("ea-whitelisted");
      document.documentElement.classList.remove("examarena-distraction-stripped");
      blockPlayback(rawTitle, channel);
    }
  }

  // 3. Channel Page Guard
  function isChannelPage() {
    const p = window.location.pathname;
    return /^\/@|^\/channel\/|^\/c\//.test(p);
  }

  function handleChannelPageEnforcement() {
    if (!active && !state.focusModeActive) return;
    if (document.body) {
      document.body.classList.add("ea-focus-active");
    }

    // Extract channel name from page metadata
    const channelHeaderEl = document.querySelector("#channel-header #text, ytd-channel-name #text, #channel-name, h1.ytd-c4-tabbed-header-renderer");
    const channelTitle = channelHeaderEl?.textContent?.trim() || "";

    // If channel matches approved whitelist, unblur entire view
    if (channelTitle && state.customAllowedChannels.some(c => channelTitle.toLowerCase().includes(c.toLowerCase()))) {
      document.querySelectorAll("ytd-browse[page-subtype='channels'] ytd-rich-item-renderer, ytd-browse[page-subtype='channels'] ytd-grid-video-renderer, ytd-browse[page-subtype='channels'] ytd-video-renderer")
        .forEach(el => {
          el.classList.add("ea-verified-study");
          el.classList.remove("ea-blocked-study");
          el.classList.remove("examarena-non-study-card");
        });
      return;
    }

    // Otherwise, pause channel trailer video if playing
    const trailerVideo = document.querySelector("ytd-channel-video-player-renderer video");
    if (trailerVideo && !trailerVideo.paused) {
      trailerVideo.pause();
    }

    // Run continuous evaluation over the channel shelves
    scanAndEvaluateAllCards();
  }

  const guardChannelPage = handleChannelPageEnforcement;

  function blockPlayback(title, channel) {
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    if (video) {
      video.pause();
      if (!video._eaBound) {
        video._eaBound = true;
        const preventPlay = (e) => {
          if (active && isWatchPage() && !isCurrentVideoAllowed) {
            video.pause();
            e.stopImmediatePropagation();
          }
        };
        video.addEventListener("play", preventPlay, true);
        video.addEventListener("playing", preventPlay, true);
      }
    }

    injectShieldOverlay(title, channel);
  }

  function injectShieldOverlay(title, channel) {
    const player = document.querySelector("#movie_player") || document.querySelector(".html5-video-player") || document.querySelector("#player");
    if (!player) return;

    if (document.getElementById("examarena-yt-shield")) return;

    const overlay = document.createElement("div");
    overlay.id = "examarena-yt-shield";
    overlay.innerHTML = `
      <div class="shield-card">
        <div class="shield-badge">🛡️ STUDY SLASH FOCUS</div>
        <h2>Non-Study Video Blocked</h2>
        <p>Focus Mode is active. Only academic lectures, concept explanations, and problem-solving sessions are permitted.</p>
        <div class="shield-actions">
          <button id="eaShieldGoBack" type="button">Go Back to Study</button>
          <button id="eaShieldWhitelist" class="secondary" type="button">Allow Once (Educational)</button>
        </div>
      </div>
    `;

    player.style.position = "relative";
    player.appendChild(overlay);

    document.getElementById("eaShieldGoBack")?.addEventListener("click", () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.replace("https://www.youtube.com/");
      }
    });

    document.getElementById("eaShieldWhitelist")?.addEventListener("click", () => {
      const vid = currentVideoId || getCurrentVideoId();
      if (vid) {
        whitelistedVideos.add(vid);
        chrome.storage.local.get(["whitelistedVideos"], (data) => {
          const list = Array.isArray(data.whitelistedVideos) ? data.whitelistedVideos : [];
          if (!list.includes(vid)) {
            chrome.storage.local.set({ whitelistedVideos: [...list, vid] });
          }
        });
        chrome.runtime.sendMessage({
          type: "YOUTUBE_WHITELIST_ADD",
          videoId: vid,
          title: title || document.title,
          channel: channel || "",
          timestamp: Date.now()
        }, () => { void chrome.runtime.lastError; });
      }

      isCurrentVideoAllowed = true;
      document.querySelector("ytd-watch-flexy")?.setAttribute("ea-whitelisted", "true");
      removeShieldOverlay();
      applyDistractionStripping();

      const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
      if (video) {
        video.play().catch(() => {});
      }
    });
  }

  function removeShieldOverlay() {
    const overlay = document.getElementById("examarena-yt-shield");
    if (overlay) overlay.remove();
  }

  function applyDistractionStripping() {
    document.documentElement.classList.add("examarena-distraction-stripped");
  }

  function onPageTransition() {
    if (!active && !state.focusModeActive) return;

    if (document.body) {
      document.body.classList.add("ea-focus-active");
    }

    // Reset evaluated markers on route transition so fresh elements are classified
    document.querySelectorAll("[data-ea-evaluated]").forEach((el) => {
      delete el.dataset.eaEvaluated;
    });

    checkShortsRedirect();

    if (isWatchPage()) {
      guardWatchPage();
    } else if (isChannelPage()) {
      handleChannelPageEnforcement();
    } else {
      scanAndEvaluateAllCards();
    }
  }

  function scheduleScan() {
    if ((!active && !state.focusModeActive) || rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      checkShortsRedirect();
      if (isWatchPage()) {
        guardWatchPage();
      } else if (isChannelPage()) {
        handleChannelPageEnforcement();
      } else {
        scanAndEvaluateAllCards();
      }
    });
  }

  function startObserving() {
    if (document.body) {
      document.body.classList.add("ea-focus-active");
    }
    checkShortsRedirect();
    if (isWatchPage()) {
      guardWatchPage();
    } else if (isChannelPage()) {
      handleChannelPageEnforcement();
    } else {
      scanAndEvaluateAllCards();
    }

    if (!observer) {
      observer = new MutationObserver(scheduleScan);
      if (document.documentElement) {
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
    }
  }

  function stopObserving() {
    if (document.body) {
      document.body.classList.remove("ea-focus-active");
    }
    document.querySelector("ytd-watch-flexy")?.removeAttribute("ea-whitelisted");
    observer?.disconnect();
    observer = null;
    removeShieldOverlay();
    document.documentElement.classList.remove("examarena-distraction-stripped");
    document.querySelectorAll(".examarena-non-study-card").forEach((card) => card.classList.remove("examarena-non-study-card"));
    document.querySelectorAll(".ea-blocked-study").forEach((card) => card.classList.remove("ea-blocked-study"));
    document.querySelectorAll(".ea-verified-study").forEach((card) => card.classList.remove("ea-verified-study"));
    document.querySelectorAll("[data-ea-evaluated]").forEach((el) => delete el.dataset.eaEvaluated);
    document.querySelectorAll(".examarena-non-study-pill").forEach((pill) => pill.remove());
  }

  function updateActiveState(newActive) {
    if (active === newActive) return;
    active = newActive;
    state.focusModeActive = newActive;
    if (active) {
      startObserving();
    } else {
      stopObserving();
    }
  }

  // Load initial settings
  if (typeof chrome !== "undefined" && chrome.storage) {
    chrome.storage.local.get(["focusModeActive", "examModeActive", "whitelistedVideos", "customAllowedChannels"], (data) => {
      if (Array.isArray(data.whitelistedVideos)) {
        whitelistedVideos = new Set(data.whitelistedVideos);
      }
      if (Array.isArray(data.customAllowedChannels)) {
        state.customAllowedChannels = Array.from(new Set([...DEFAULT_ALLOWED_CHANNELS, ...data.customAllowedChannels]));
      }
      const isFocus = Boolean(data.focusModeActive || data.examModeActive);
      updateActiveState(isFocus);
    });

    // Listen to storage changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.whitelistedVideos) {
        const list = Array.isArray(changes.whitelistedVideos.newValue) ? changes.whitelistedVideos.newValue : [];
        whitelistedVideos = new Set(list);
      }
      if (changes.customAllowedChannels && Array.isArray(changes.customAllowedChannels.newValue)) {
        state.customAllowedChannels = Array.from(new Set([...DEFAULT_ALLOWED_CHANNELS, ...changes.customAllowedChannels.newValue]));
      }
      if (changes.focusModeActive || changes.examModeActive) {
        chrome.storage.local.get(["focusModeActive", "examModeActive"], (data) => {
          const isFocus = Boolean(data.focusModeActive || data.examModeActive);
          updateActiveState(isFocus);
          if (isFocus) scheduleScan();
        });
      }
    });
  }

  // YouTube SPA navigation events
  if (typeof window !== "undefined") {
    window.addEventListener("yt-navigate-finish", onPageTransition);
    window.addEventListener("yt-page-data-updated", onPageTransition);
    window.addEventListener("popstate", onPageTransition);
  }

  // Export isStudyContent for testability if in Node environment
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      isStudyContent,
      HARD_DISQUALIFICATION_KEYWORDS,
      SYLLABUS_ACADEMIC_KEYWORDS,
      STUDY_KEYWORDS: SYLLABUS_ACADEMIC_KEYWORDS,
      DISTRACTION_KEYWORDS: HARD_DISQUALIFICATION_KEYWORDS,
      ACADEMIC_KEYWORDS: SYLLABUS_ACADEMIC_KEYWORDS,
      CONTROVERSY_DISTRACTION_KEYWORDS: HARD_DISQUALIFICATION_KEYWORDS,
      state,
      scanAndEvaluateAllCards,
      handleChannelPageEnforcement
    };
  }
})();

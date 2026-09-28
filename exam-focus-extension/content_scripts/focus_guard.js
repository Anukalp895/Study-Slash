/**
 * Exam Arena — Universal Entertainment Web Filter (focus_guard.js)
 * Implements smart keyword and DOM heuristics to block unlisted gaming, anime,
 * and entertainment streaming platforms (e.g. Poki, AnimeDekho) during Focus / Exam Mode.
 */
(() => {
  'use strict';

  // 1. Whitelist of Academic, Educational, and Productive Platforms
  const WHITELIST_DOMAINS = [
    // Exam & Prep Portals
    'getmarks.app',
    'youtube.com',
    'physicswallah.live',
    'pw.live',
    'vedantu.com',
    'unacademy.com',
    'allen.in',
    'aakash.ac.in',
    'byjus.com',
    'doubtnut.com',
    'embibe.com',
    'neetprep.com',
    'mathongo.com',
    'esaral.com',
    'khanacademy.org',
    'coursera.org',
    'edx.org',
    'nptel.ac.in',
    'ncert.nic.in',
    'jeemain.nta.ac.in',
    'nta.ac.in',
    'ntaresults.nic.in',
    // Reference, Science & Math Tools
    'desmos.com',
    'geogebra.org',
    'symbolab.com',
    'wolframalpha.com',
    'wikipedia.org',
    'wikimedia.org',
    'chemguide.co.uk',
    'hyperphysics.phy-astr.gsu.edu',
    'libretexts.org',
    'openstax.org',
    // Technical & General Study
    'github.com',
    'stackoverflow.com',
    'stackexchange.com',
    'w3schools.com',
    'developer.mozilla.org',
    // Core Productivity
    'google.com',
    'accounts.google.com',
    'drive.google.com',
    'docs.google.com',
    'classroom.google.com'
  ];

  // 2. High-Confidence Entertainment / Gaming / Anime Hostname Tokens
  const RESTRICTED_HOST_KEYWORDS = [
    // Online Web Games & Emulators
    'poki',
    'crazygames',
    'y8.com',
    'kizi.com',
    'friv.com',
    'miniclip',
    'roblox',
    'unblockedgames',
    'unblocked-games',
    'gameflare',
    'silvergames',
    'armorgames',
    'kongregate',
    'now.gg',
    'geforcenow',
    'playgame',
    'freeonlinegames',
    'coolmathgames',
    // Anime & Manga Platforms
    'animedekho',
    'gogoanime',
    '9anime',
    'zoro.to',
    'aniwatch',
    'anikai',
    'animepahe',
    'crunchyroll',
    'mangakakalot',
    'manganelo',
    'mangadex',
    'asurascans',
    'reaper-scans',
    'flamecomics',
    'webtoons',
    'manhwafreak',
    // Video Streaming & Piracy
    '123movies',
    'fmovies',
    'soap2day',
    'hdtoday',
    'solarmovie',
    'sflix',
    'cineb',
    'lookmovie',
    'flixtor',
    'myflixer',
    'moviesjoy',
    'cinezone',
    'streamlord',
    'filmyzilla',
    'vegamovies',
    'bollyflix',
    'katmoviehd',
    'topmovies',
    'mp4moviez',
    'ibomma'
  ];

  // 3. Metadata & Page Content Heuristic Phrases
  const ENTERTAINMENT_META_PHRASES = [
    'free online games',
    'play online games',
    'play free games',
    'unblocked games',
    'play game online',
    'play in browser',
    'watch anime online',
    'stream anime',
    'free anime streaming',
    'english sub anime',
    'watch movies online',
    'stream free movies',
    'watch full movie',
    'watch web series',
    'download full movie',
    'read manga online',
    'read manhwa online',
    'latest anime episodes'
  ];

  // Evaluate if current URL / Page constitutes a restricted entertainment site
  function isRestrictedEntertainmentSite(url, title = '', metaText = '', domText = '') {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return false;
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    // 1. Check if Whitelisted
    if (WHITELIST_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return false;
    }

    // 2. Exact Hostname Token Matches (e.g. poki, animedekho, crazygames)
    if (RESTRICTED_HOST_KEYWORDS.some((kw) => hostname.includes(kw) || pathname.includes(`/${kw}`))) {
      return true;
    }

    // 3. Metadata & Title Heuristics
    const combinedSignals = `${title} ${metaText} ${domText}`.toLowerCase();
    if (ENTERTAINMENT_META_PHRASES.some((phrase) => combinedSignals.includes(phrase))) {
      return true;
    }

    // 4. OpenGraph metadata check
    if (typeof document !== 'undefined') {
      const ogType = document.querySelector('meta[property="og:type"]')?.getAttribute('content')?.toLowerCase() || '';
      if (ogType === 'video.movie' || ogType === 'video.tv_show' || ogType === 'game') {
        return true;
      }
    }

    return false;
  }

  let isBlocked = false;

  function executeBlock() {
    if (isBlocked) return;
    isBlocked = true;

    // Stop execution and blank out DOM immediately
    try {
      window.stop();
      if (document.documentElement) {
        document.documentElement.innerHTML = '';
      }
    } catch (_) {}

    // Redirect to Focus Blocked dashboard
    const redirectUrl = chrome.runtime.getURL(
      `dashboard/focus_blocked.html?domain=${encodeURIComponent(location.hostname)}&url=${encodeURIComponent(location.href)}`
    );
    window.location.replace(redirectUrl);
  }

  function evaluatePage(active) {
    if (!active) return;
    if (!location.protocol.startsWith('http')) return;

    // 1. Instant Hostname Check
    if (isRestrictedEntertainmentSite(location.href)) {
      executeBlock();
      return;
    }

    // 2. Inspect Head Metadata (Title, Meta Tags)
    const title = document.title || '';
    const metas = Array.from(document.querySelectorAll('meta[name="description"], meta[name="keywords"], meta[property="og:title"], meta[property="og:description"]'))
      .map((m) => m.getAttribute('content') || '')
      .join(' ');

    if (isRestrictedEntertainmentSite(location.href, title, metas)) {
      executeBlock();
      return;
    }

    // 3. DOM Game/Canvas Signature Check
    const hasGameCanvas = Boolean(document.querySelector('canvas#unity-canvas, canvas#game-canvas, #game-container, #game-player, .game-iframe, #embed-player, .anime-player'));
    if (hasGameCanvas && isRestrictedEntertainmentSite(location.href, title, metas, 'game canvas player')) {
      executeBlock();
    }
  }

  // Check state and bind listeners
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['focusModeActive', 'examModeActive'], (data) => {
      const active = Boolean(data.focusModeActive || data.examModeActive);
      evaluatePage(active);
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.focusModeActive || changes.examModeActive) {
        chrome.storage.local.get(['focusModeActive', 'examModeActive'], (data) => {
          const active = Boolean(data.focusModeActive || data.examModeActive);
          evaluatePage(active);
        });
      }
    });

    // Schedule re-check once DOM is parsed
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        chrome.storage.local.get(['focusModeActive', 'examModeActive'], (data) => {
          evaluatePage(Boolean(data.focusModeActive || data.examModeActive));
        });
      });
    }
  }

  // Export for test suite
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      isRestrictedEntertainmentSite,
      WHITELIST_DOMAINS,
      RESTRICTED_HOST_KEYWORDS,
      ENTERTAINMENT_META_PHRASES
    };
  }
})();

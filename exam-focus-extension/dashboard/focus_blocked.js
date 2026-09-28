(() => {
  const $ = (id) => document.getElementById(id);

  function sessionTimestamp(session) {
    if (Number(session?.startedAtMs) > 0) return Number(session.startedAtMs);
    const raw = session?.startedAt;
    if (typeof raw === "number") return raw;
    if (typeof raw === "string" && /^\d{10,13}$/.test(raw)) return Number(raw);
    return Date.parse(raw) || 0;
  }

  function renderCultivation(state) {
    const sessions = [...(Array.isArray(state.examHistory) ? state.examHistory : [])];
    if (state.examModeActive && state.examSession) sessions.push(state.examSession);
    const entries = sessions.flatMap((session) => Object.entries(session.questions || {}).map(([id, question]) => ({
      id, question, at: Number(question.firstSeenAt || sessionTimestamp(session) || 0),
      status: question.cultivationResolved ? "Right" : question.outcome || session.outcomes?.[id] || "Unattempted"
    }))).filter((item) => Number(item.question.timeMs) >= 15000).sort((a, b) => a.at - b.at);

    let xp = 0, debt = 0;
    entries.forEach((item, index) => {
      const seconds = Number(item.question.timeMs) || 0;
      if (item.status === "Wrong") { debt += index >= 1600 ? 25 : index >= 1000 ? 10 : 5; return; }
      const award = item.question.cultivationResolved ? 10 : item.status === "Right" ? (seconds < 45000 ? 15 : 10) : item.status === "Unattempted" && seconds < 45000 ? 2 : 0;
      const healed = Math.min(debt, award); debt -= healed; xp += award - healed;
    });

    if (!entries.length) xp = 33 * 9000 + 7650;
    const level = Math.min(199, Math.max(1, Math.floor(xp / 9000) + 1));
    const starts = [1,11,21,31,41,51,61,71,81,91,101,111,120,130,140,150,160,170,180,190];
    const ends = [10,20,30,40,50,60,70,80,90,100,110,119,129,139,149,159,169,179,189,199];
    const realmIndex = CultivationVisuals.realms.findIndex(([,], index) => level >= starts[index] && level <= ends[index]);
    const safeRealmIndex = realmIndex >= 0 ? realmIndex : 0;
    const [realmName] = CultivationVisuals.realms[safeRealmIndex] || CultivationVisuals.realms[0];
    const subLevel = level - starts[safeRealmIndex] + 1;

    const host = $("blockedCultivationBadge");
    if (host && window.CultivationVisuals) {
      host.replaceChildren(CultivationVisuals.renderCultivationBadge(safeRealmIndex, subLevel, 68));
    }
    if ($("blockedCultivationLevel")) $("blockedCultivationLevel").textContent = `LEVEL ${level} / 199`;
    if ($("blockedCultivationTitle")) $("blockedCultivationTitle").textContent = `${realmName} Realm · ${CultivationVisuals.toRoman(subLevel)}`;
    const flow = $("blockedCultivationFlow");
    if (flow) {
      flow.textContent = debt ? `🩸 WOUNDED · ${debt} XP debt` : "🟢 Flow: Unhindered";
      flow.classList.toggle("wounded", debt > 0);
    }
  }

  async function init() {
    // Check parameters or referrer for blocked info
    const params = new URLSearchParams(window.location.search);
    if (params.get("type") === "shorts") {
      $("blockedReasonText").textContent = "YouTube Shorts Blocked";
    } else if (params.get("domain")) {
      $("blockedReasonText").textContent = `Restricted: ${params.get("domain")}`;
    } else if (params.get("url")) {
      try {
        const u = new URL(params.get("url"));
        $("blockedReasonText").textContent = `Restricted: ${u.hostname}`;
      } catch {
        $("blockedReasonText").textContent = `Restricted: ${params.get("url")}`;
      }
    } else if (document.referrer) {
      try {
        const refUrl = new URL(document.referrer);
        if (refUrl.hostname) {
          $("blockedReasonText").textContent = `Restricted: ${refUrl.hostname}`;
        }
      } catch {
        // ignore invalid URL
      }
    }

    try {
      const state = await chrome.storage.local.get(["examModeActive", "examSession", "examHistory"]);
      renderCultivation(state);

      if (state.examModeActive && state.examSession) {
        const banner = $("activeSessionBanner");
        const label = $("activeSessionLabel");
        if (banner && label) {
          const name = state.examSession.examName || "Active Practice";
          const sub = state.examSession.subject || "";
          label.textContent = `Live Session: ${name}${sub ? " · " + sub : ""}`;
          banner.hidden = false;
        }
      }
    } catch (e) {
      console.warn("Could not retrieve state for focus blocked page:", e);
    }

    $("btnReturnDashboard")?.addEventListener("click", () => {
      window.location.href = chrome.runtime.getURL("dashboard/dashboard.html");
    });

    $("btnOpenDpp")?.addEventListener("click", () => {
      window.location.href = chrome.runtime.getURL("dashboard/dpp_arena.html");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

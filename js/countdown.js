(function () {
  const els = {
    days: document.getElementById("cdDays"),
    hours: document.getElementById("cdHours"),
    minutes: document.getElementById("cdMinutes"),
    seconds: document.getElementById("cdSeconds"),
    note: document.getElementById("countdownNote")
  };

  const API_URL = window.AIRDROP_CONFIG?.scheduleApiUrl ?? "/schedule";

  let serverOffset = 0;
  let targetTs = null;
  let ticker = null;
  let refreshTimeout = null;

  function pad(n) {
    return String(Math.max(0, n)).padStart(2, "0");
  }

  function setDisplay(diffMs) {
    const safe = Math.max(0, diffMs);
    const d = Math.floor(safe / (1000 * 60 * 60 * 24));
    const h = Math.floor((safe / (1000 * 60 * 60)) % 24);
    const m = Math.floor((safe / (1000 * 60)) % 60);
    const s = Math.floor((safe / 1000) % 60);

    if (els.days) els.days.textContent = pad(d);
    if (els.hours) els.hours.textContent = pad(h);
    if (els.minutes) els.minutes.textContent = pad(m);
    if (els.seconds) els.seconds.textContent = pad(s);
  }

  function stopTicker() {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  function scheduleRefresh(ms = 5000) {
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(fetchSchedule, ms);
  }

  function renderTick() {
    if (!targetTs) {
      setDisplay(0);
      return;
    }

    const now = Date.now() + serverOffset;
    const diff = targetTs - now;

    if (diff <= 0) {
      setDisplay(0);
      if (els.note) els.note.textContent = "Pipeline running… fetching next round";
      stopTicker();
      scheduleRefresh(4000);
      return;
    }

    setDisplay(diff);
  }

  function startTicker() {
    stopTicker();
    renderTick();
    ticker = setInterval(renderTick, 1000);
  }

  async function fetchSchedule() {
    try {
      const resp = await fetch(API_URL, { cache: "no-store" });
      if (!resp.ok) throw new Error("schedule " + resp.status);

      const data = await resp.json();

      if (typeof data.serverTime === "number") {
        serverOffset = data.serverTime - Date.now();
      }

      const nextAt =
        typeof data.nextPipelineAt === "number"
          ? data.nextPipelineAt
          : typeof data.nextSnapshotAt === "number"
            ? data.nextSnapshotAt
            : null;

      if (typeof nextAt === "number" && nextAt > Date.now() - 60_000) {
        targetTs = nextAt;

        if (els.note) {
          els.note.textContent =
            "Next round: " + new Date(nextAt).toLocaleString("hu-HU");
        }

        startTicker();
        return;
      }

      targetTs = null;
      stopTicker();
      setDisplay(0);

      if (els.note) els.note.textContent = "Waiting for backend schedule…";
      scheduleRefresh(10000);
    } catch (err) {
      console.warn("[countdown] fetchSchedule error:", err);
      targetTs = null;
      stopTicker();
      setDisplay(0);

      if (els.note) els.note.textContent = "Schedule unavailable… retrying";
      scheduleRefresh(15000);
    }
  }

  fetchSchedule();
})();
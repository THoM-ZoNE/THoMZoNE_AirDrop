// Statistic counters + transaction list (live API)
(function () {
  function animateCounter(el, endValue, decimals = 0, duration = 1200) {
    if (!el) return;

    const numericValue = Number(endValue);
    if (!Number.isFinite(numericValue)) {
      el.textContent = "0";
      return;
    }

    const startTime = performance.now();

    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const value = numericValue * progress;

      el.textContent =
        decimals > 0
          ? value.toFixed(decimals)
          : Math.floor(value).toLocaleString("hu-HU");

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent =
          decimals > 0
            ? numericValue.toFixed(decimals)
            : Math.floor(numericValue).toLocaleString("hu-HU");
      }
    }

    requestAnimationFrame(step);
  }

  function getRewardTotals(stats) {
    return {
      totalDistributed:
        stats.totalRewardDistributed ??
        stats.totalUsdcDistributed ??
        0,
      avgPerHolder:
        stats.avgRewardPerHolder ??
        stats.avgUsdcPerHolder ??
        0,
      symbol: stats.rewardSymbol ?? "TOKEN"
    };
  }

  function renderStats(stats) {
    if (!stats) return;

    const reward = getRewardTotals(stats);

    animateCounter(
      document.getElementById("statHolders"),
      stats.totalHolders ?? 0,
      0
    );

    animateCounter(
      document.getElementById("statReward") ||
        document.getElementById("statUSDC") ||
        document.getElementById("statUsdc"),
      reward.totalDistributed,
      2
    );

    animateCounter(
      document.getElementById("statRounds"),
      stats.totalRounds ?? 0,
      0
    );

    animateCounter(
      document.getElementById("statAvg"),
      reward.avgPerHolder,
      4
    );

    animateCounter(
      document.getElementById("miniHolders"),
      stats.totalHolders ?? 0,
      0
    );

    animateCounter(
      document.getElementById("miniReward") ||
        document.getElementById("miniUSDC") ||
        document.getElementById("miniUsdc"),
      reward.totalDistributed,
      2
    );

    animateCounter(
      document.getElementById("miniRounds"),
      stats.totalRounds ?? 0,
      0
    );

    const statLabel = document.querySelector("[data-stat-total-label]");
    if (statLabel) {
      statLabel.textContent = `Total Distributed $${reward.symbol}`;
    }

    const avgLabel = document.querySelector("[data-stat-avg-label]");
    if (avgLabel) {
      avgLabel.textContent = `Average $${reward.symbol} / Holder`;
    }
  }

  function renderRecentTx(txList) {
    const tbody = document.getElementById("recentTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!Array.isArray(txList) || txList.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4">There are no transactions to display.</td>`;
      tbody.appendChild(tr);
      return;
    }

    txList.forEach((tx) => {
      const symbol = tx.symbol ?? "TOKEN";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${tx.time ?? "-"}</td>
        <td>${tx.wallet ?? "-"}</td>
        <td>${Number(tx.amount ?? 0).toFixed(4)} ${symbol}</td>
        <td>
          ${
            tx.tx
              ? `<a href="https://solscan.io/tx/${tx.tx}" target="_blank" rel="noopener">View</a>`
              : "-"
          }
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function loadStats() {
    if (!window.AIRDROP_CONFIG?.statsApiUrl) {
      console.warn("Stats API URL not configured.");
      return;
    }

    try {
      const res = await fetch(window.AIRDROP_CONFIG.statsApiUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });

      if (!res.ok) {
        throw new Error(`Stats API error: ${res.status}`);
      }

      const data = await res.json();
      console.log("[stats] API response:", data);
      renderStats(data);
    } catch (error) {
      console.warn("[stats] API unavailable", error);
    }
  }

  async function loadRecentTx() {
    if (!window.AIRDROP_CONFIG?.recentTxApiUrl) {
      return;
    }

    try {
      const res = await fetch(window.AIRDROP_CONFIG.recentTxApiUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });

      if (!res.ok) {
        throw new Error(`Recent transactions API error: ${res.status}`);
      }

      const data = await res.json();
      renderRecentTx(Array.isArray(data) ? data : data.items);
    } catch (error) {
      console.warn("[stats] Recent transactions API unavailable", error);
      renderRecentTx([]);
    }
  }

  async function initStats() {
    await loadStats();
    await loadRecentTx();

    setInterval(loadStats, 30000);

    if (window.AIRDROP_CONFIG?.recentTxApiUrl) {
      setInterval(loadRecentTx, 30000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStats);
  } else {
    initStats();
  }
})();
// Responsive vault chart using the Canvas API
(function () {
  function formatCompact(value) {
    const num = Number(value || 0);

    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}k`;
    if (num >= 100) return num.toFixed(1);
    if (num >= 10) return num.toFixed(2);
    return num.toFixed(3);
  }

  function drawRoundedRect(ctx, x, y, width, height, radius) {
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  function drawEmptyState(canvas, text) {
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 260;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#93a0bd";
    ctx.font = "15px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, width / 2, height / 2);
  }

  function drawBarChart(canvas, labels, values) {
    if (!canvas) return;

    if (!Array.isArray(labels) || !Array.isArray(values) || values.length === 0) {
      drawEmptyState(canvas, "No distribution data yet.");
      return;
    }

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 260;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const padding = {
      top: 30,
      right: 18,
      bottom: 48,
      left: 18
    };

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const safeValues = values.map((v) => Math.max(Number(v) || 0, 0));
    const max = Math.max(...safeValues, 1);
    const slotWidth = chartWidth / safeValues.length;
    const barWidth = Math.min(88, slotWidth * 0.58);

    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    gradient.addColorStop(0, "#14f1c6");
    gradient.addColorStop(1, "#7c5cff");

    ctx.strokeStyle = "rgba(147, 160, 189, 0.18)";
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    safeValues.forEach((val, i) => {
      const xCenter = padding.left + slotWidth * i + slotWidth / 2;
      const barHeight = (val / max) * (chartHeight * 0.88);
      const x = xCenter - barWidth / 2;
      const y = padding.top + chartHeight - barHeight;

      ctx.fillStyle = gradient;
      drawRoundedRect(ctx, x, y, barWidth, barHeight, 10);

      ctx.fillStyle = "#f4f7ff";
      ctx.font = "600 13px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(formatCompact(val), xCenter, y - 10);

      ctx.fillStyle = "#93a0bd";
      ctx.font = "12px Inter, sans-serif";
      ctx.fillText(labels[i] ?? "", xCenter, height - 14);
    });
  }

  async function loadChartData() {
    if (!window.AIRDROP_CONFIG?.statsApiUrl) {
      return { labels: [], values: [] };
    }

    try {
      const res = await fetch(window.AIRDROP_CONFIG.statsApiUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });

      if (!res.ok) {
        throw new Error(`Chart stats API error: ${res.status}`);
      }

      const data = await res.json();

      return {
        labels: ["Holders", "Rounds", "Avg / Holder", "Total"],
        values: [
          Number(data.totalHolders ?? 0),
          Number(data.totalRounds ?? 0),
          Number(data.avgRewardPerHolder ?? 0),
          Number(data.totalRewardDistributed ?? 0)
        ]
      };
    } catch (error) {
      console.warn("[chart] Failed to load chart data", error);
      return { labels: [], values: [] };
    }
  }

  async function initChart() {
    const canvas = document.getElementById("distributionChart");
    if (!canvas) return;

    const render = async () => {
      const { labels, values } = await loadChartData();
      drawBarChart(canvas, labels, values);
    };

    await render();
    window.addEventListener("resize", render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initChart);
  } else {
    initChart();
  }
})();
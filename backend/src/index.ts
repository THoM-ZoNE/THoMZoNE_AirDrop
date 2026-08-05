import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./lib/prisma.js";
import { config } from "./lib/config.js";
import { requireAdmin } from "./lib/adminAuth.js";
import { createSnapshot } from "./services/snapshotService.js";
import { distributeSnapshot, retryFailedDistributions } from "./services/distributionService.js";
import { CronExpressionParser } from "cron-parser";
import {
  registerRewardEvent,
  processPendingRewardEvent
} from "./services/rewardService.js";

const app = express();

app.use(cors({
  origin: "*"
}));
app.use(express.json());

// --- HEALTH ---
app.get("/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true });
});

// --- SCHEDULE ---
app.get("/schedule", (_req, res) => {
  const now = new Date();

  let nextPipelineAt: number | null = null;

  try {
    const pipeline = CronExpressionParser.parse(config.cronSnapshot, {
      currentDate: now
    });
    nextPipelineAt = pipeline.next().toDate().getTime();
  } catch (err) {
    console.warn("[schedule] pipeline cron parse error:", err);
  }

  res.json({
    serverTime: now.getTime(),
    nextPipelineAt,
    pipelineCron: config.cronSnapshot,
    claimCron: config.claimEnabled ? config.claimCron : null
  });
});

// --- STATS ---
app.get("/stats", async (_req, res) => {
  try {
    const now = new Date();

    const agg = await prisma.distribution.groupBy({
      by: ["owner"],
      where: { status: "sent", recipientType: "holder" },
      _sum: { payoutRawSent: true }
    });

    const holders = agg.length;
    const totalPayoutRaw = agg.reduce(
      (acc, row) => acc + (row._sum.payoutRawSent ?? 0n),
      0n
    );

    const rounds = await prisma.snapshot.count();

    const decimals = 6;
    const totalRewardDistributed = Number(totalPayoutRaw) / 10 ** decimals;
    const avgRewardPerHolder = holders === 0 ? 0 : totalRewardDistributed / holders;

    let nextPipelineAt: number | null = null;

    try {
      const pipeline = CronExpressionParser.parse(config.cronSnapshot, {
        currentDate: now
      });
      nextPipelineAt = pipeline.next().toDate().getTime();
    } catch {}

    res.json({
      rewardSymbol: config.rewardSymbol,
      rewardMint: config.rewardTokenMint,
      totalHolders: holders,
      totalRounds: rounds,
      totalRewardDistributed,
      avgRewardPerHolder,
      totalPayoutDistributedRaw: totalPayoutRaw.toString(),
      avgPayoutRawPerHolder:
        holders === 0
          ? "0"
          : (totalPayoutRaw / BigInt(holders)).toString(),
      serverTime: now.getTime(),
      nextPipelineAt,
      pipelineCron: config.cronSnapshot,
      claimCron: config.claimEnabled ? config.claimCron : null
    });
  } catch (error) {
    console.error("[stats] error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});
// --- RECENT-TX ---
app.get("/recent-transactions", async (_req, res) => {
  try {
    const rows = await prisma.distribution.findMany({
      where: {
        status: "sent",
        txSignature: { not: null }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    });

    const items = rows.map((row) => ({
      time: row.createdAt.toISOString().replace("T", " ").slice(0, 16),
      wallet:
        row.owner.length > 10
          ? `${row.owner.slice(0, 4)}...${row.owner.slice(-4)}`
          : row.owner,
      amount: Number(row.payoutRawSent) / 1_000_000,
      symbol: config.rewardSymbol,
      tx: row.txSignature
    }));

    res.json(items);
  } catch (error) {
    console.error("GET /recent-transactions failed", error);
    res.status(500).json({
      error: "Failed to load recent transactions"
    });
  }
});
// --- SNAPSHOTS ---
app.post("/snapshots", async (req, res) => {
  try {
    const grossRewardPayoutRaw = BigInt(req.body.grossRewardPayoutRaw);
    const sourceRewardTx = req.body.sourceRewardTx as string | undefined;

    const snapshot = await createSnapshot(grossRewardPayoutRaw, sourceRewardTx);

    res.json({
      snapshotId: snapshot.id,
      holders: snapshot.holders.length,
      buybackPayoutRaw: snapshot.buybackPayoutRaw.toString(),
      holderPoolPayoutRaw: snapshot.holderPoolPayoutRaw.toString(),
      reservedSafetyPayoutRaw: snapshot.reservedSafetyPayoutRaw.toString(),
      holderTokenAMint: snapshot.holderTokenAMint,
      holderTokenBMint: snapshot.holderTokenBMint,
      rewardMint: snapshot.rewardMint,
      rewardSymbol: snapshot.rewardSymbol
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.post("/snapshots/:id/distribute", async (req, res) => {
  try {
    const result = await distributeSnapshot(req.params.id);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// POST /admin/retry-failed/:snapshotId
app.post("/retry-failed/:snapshotId", async (req, res) => {
  try {
    const result = await retryFailedDistributions(req.params.snapshotId);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

// --- ADMIN ---
app.post("/admin/rewards", requireAdmin, async (req, res) => {
  try {
    const reward = await registerRewardEvent({
      source: req.body.source ?? "manual",
      grossPayoutRaw: BigInt(req.body.grossPayoutRaw),
      sourceTx: req.body.sourceTx,
      notes: req.body.notes
    });

    res.json({
      ok: true,
      reward: {
        id: reward.id,
        createdAt: reward.createdAt,
        source: reward.source,
        sourceTx: reward.sourceTx,
        grossPayoutRaw: reward.grossPayoutRaw.toString(),
        rewardMint: reward.rewardMint,
        status: reward.status,
        snapshotId: reward.snapshotId,
        distributedAt: reward.distributedAt,
        notes: reward.notes
      }
    });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.post("/admin/process-next", requireAdmin, async (_req, res) => {
  try {
    const result = await processPendingRewardEvent();
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.listen(config.port, () => {
  console.log(`TZ Airdrop backend listening on :${config.port}`);
});
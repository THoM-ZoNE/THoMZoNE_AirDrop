import bs58 from "bs58";
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Keypair,
} from "@solana/web3.js";
import { Prisma } from "@prisma/client";
import { claimCreatorFees } from "./claimService.js";
import { swapSolToRewardToken } from "./swapService.js";
import { registerClaimedRewardEvent } from "./rewardService.js";
import { transferSol } from "./transferSol.js";
import { config } from "../lib/config.js";

const connection = new Connection(config.rpcUrl, "confirmed");

let claimRunning = false;
let lastClaimStartedAt = 0;

async function getSolBalanceRaw(wallet: string): Promise<bigint> {
  return BigInt(await connection.getBalance(new PublicKey(wallet), "confirmed"));
}

function getCreatorKeypair(): Keypair {
  if (!config.creatorWalletPrivateKey) {
    throw new Error("Missing CREATOR_WALLET_PRIVATE_KEY");
  }
  return Keypair.fromSecretKey(bs58.decode(config.creatorWalletPrivateKey));
}

type ClaimResult =
  | {
      ok: true;
      dryRun: true;
      publicKey: string;
    }
  | {
      ok: true;
      signature: string;
      publicKey: string;
    };

function isDryRunClaim(
  value: ClaimResult
): value is Extract<ClaimResult, { dryRun: true }> {
  return "dryRun" in value && value.dryRun === true;
}

function isPrismaUniqueError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function claimAndRegisterRewardIfAny() {
  const now = Date.now();
  if (claimRunning && now - lastClaimStartedAt < config.claimLockTtlMs) {
    return { ok: false, skipped: true, reason: "claim already running" };
  }
  claimRunning = true;
  lastClaimStartedAt = now;

  try {
    const wallet = config.creatorWalletPublicKey;
    if (!wallet) throw new Error("Missing CREATOR_WALLET_PUBLIC_KEY");
    if (!config.distributionWalletPublicKey)
      throw new Error("Missing DISTRIBUTION_WALLET_PUBLIC_KEY");

    // ═══════════════════════════════════════════════════
    // Phase 1 — CLAIM + TRANSFER
    // Always runs, also even small amount claims.
    // SOL claiming in the distribution wallet.
    // ═══════════════════════════════════════════════════

    const before = await getSolBalanceRaw(wallet);
    const claim = (await claimCreatorFees()) as ClaimResult;

    if (isDryRunClaim(claim)) {
      return {
        ok: true,
        dryRun: true,
        beforeRaw: before.toString(),
        beforeSol: (Number(before) / LAMPORTS_PER_SOL).toFixed(6),
      };
    }

    const after = await getSolBalanceRaw(wallet);
    const claimedRaw = after > before ? after - before : 0n;

    if (claimedRaw <= 0n) {
      return {
        ok: true,
        claimSignature: claim.signature,
        claimedRaw: "0",
        skipped: true,
        reason: "no positive balance delta after claim",
      };
    }

    // A proportional portion of the claimed amount is transferred to the distribution wallet
    const transferToDistributionRaw =
      (claimedRaw * BigInt(config.claimToDistributionBps)) / 10_000n;

    if (transferToDistributionRaw <= 0n) {
      return {
        ok: true,
        claimSignature: claim.signature,
        claimedRaw: claimedRaw.toString(),
        skipped: true,
        reason: "claimed amount too small to transfer (claimToDistributionBps result = 0)",
      };
    }

    const creatorKeypair = getCreatorKeypair();
    const distributionPubkey = new PublicKey(config.distributionWalletPublicKey);

    const transferSignature = await transferSol({
      connection,
      fromKeypair: creatorKeypair,
      toPubkey: distributionPubkey,
      lamports: transferToDistributionRaw,
    });

    console.log(
      `[claim] Phase 1 done: claimed=${claimedRaw} lamport, ` +
      `transferred=${transferToDistributionRaw} lamport → distribution wallet, ` +
      `tx=${transferSignature}`
    );

    // ═══════════════════════════════════════════════════
    // PHASE 2 — SWAP + REWARD EVENT
    // We examine the ENTIRE current balance of the distribution wallet
    // — not just the delta that was just claimed.
    // So small claims gradually collected.
    // ═══════════════════════════════════════════════════

    const distributionBalanceRaw = await getSolBalanceRaw(
      config.distributionWalletPublicKey
    );

    // SOL reserve: tx díjakra és token-account creationre félretett összeg
    const reserveRaw =
      config.distributionMinSolReserveLamports ?? 50_000_000n; // default 0.05 SOL

    // A swappable összeg a reserve feletti egyenleg distributionSwapBps aránya
    const aboveReserve =
      distributionBalanceRaw > reserveRaw
        ? distributionBalanceRaw - reserveRaw
        : 0n;

    const swappableRaw =
      (aboveReserve * BigInt(config.distributionSwapBps)) / 10_000n;

    console.log(
      `[claim] Phase 2 check: distributionBalance=${distributionBalanceRaw} lamport, ` +
      `reserve=${reserveRaw}, aboveReserve=${aboveReserve}, ` +
      `swappable=${swappableRaw}, threshold=${config.claimSwapMinSolRaw}`
    );

    // If the swappable amount has not yet reached the threshold → collection continues
    if (swappableRaw < config.claimSwapMinSolRaw) {
      return {
        ok: true,
        claimSignature: claim.signature,
        transferSignature,
        claimedRaw: claimedRaw.toString(),
        claimedSol: (Number(claimedRaw) / LAMPORTS_PER_SOL).toFixed(6),
        transferredRaw: transferToDistributionRaw.toString(),
        distributionBalanceRaw: distributionBalanceRaw.toString(),
        distributionBalanceSol: (Number(distributionBalanceRaw) / LAMPORTS_PER_SOL).toFixed(6),
        swappableRaw: swappableRaw.toString(),
        thresholdRaw: config.claimSwapMinSolRaw.toString(),
        skipped: true,
        reason:
          `distribution wallet swappable (${swappableRaw}) < ` +
          `CLAIM_SWAP_MIN_SOL_RAW (${config.claimSwapMinSolRaw}) — ` +
          `accumulating, not swapping yet`,
      };
    }

    // Threshold reached → initiate swap
    const swap = await swapSolToRewardToken(swappableRaw);
    const rewardRaw = BigInt(swap.actualOutAmountRaw);

    if (rewardRaw < config.minRewardPayoutRaw) {
      return {
        ok: true,
        claimSignature: claim.signature,
        transferSignature,
        swapSignature: swap.signature,
        claimedRaw: claimedRaw.toString(),
        transferredRaw: transferToDistributionRaw.toString(),
        swappableRaw: swappableRaw.toString(),
        rewardRaw: rewardRaw.toString(),
        minRewardPayoutRaw: config.minRewardPayoutRaw.toString(),
        skipped: true,
        reason:
          `swapped ${config.rewardSymbol} (${rewardRaw}) < ` +
          `MIN_REWARD_PAYOUT_RAW (${config.minRewardPayoutRaw})`,
      };
    }

    try {
      const reward = await registerClaimedRewardEvent({
        sourceTx: swap.signature,
        grossPayoutRaw: rewardRaw,
        notes:
          `Auto claim: ${claim.signature}, ` +
          `${config.claimToDistributionBps} bps (${transferToDistributionRaw} raw) → ` +
          `distribution wallet via ${transferSignature}, ` +
          `swapped ${swappableRaw} raw SOL → ${rewardRaw} raw ${config.rewardSymbol}`,
      });

      console.log(
        `[claim] Phase 2 done: swapped=${swappableRaw} lamport → ` +
        `${rewardRaw} ${config.rewardSymbol}, rewardEventId=${reward.id}`
      );

      return {
        ok: true,
        claimSignature: claim.signature,
        transferSignature,
        swapSignature: swap.signature,
        rewardEventId: reward.id,
        claimedRaw: claimedRaw.toString(),
        claimedSol: (Number(claimedRaw) / LAMPORTS_PER_SOL).toFixed(6),
        transferredRaw: transferToDistributionRaw.toString(),
        swappableRaw: swappableRaw.toString(),
        rewardRaw: rewardRaw.toString(),
        skipped: false,
      };
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        return {
          ok: true,
          claimSignature: claim.signature,
          transferSignature,
          swapSignature: swap.signature,
          claimedRaw: claimedRaw.toString(),
          rewardRaw: rewardRaw.toString(),
          skipped: true,
          reason: "reward event already registered for this swap transaction",
        };
      }
      throw error;
    }
  } finally {
    claimRunning = false;
  }
}
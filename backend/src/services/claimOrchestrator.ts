import bs58 from "bs58";
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Keypair
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
    return {
      ok: false,
      skipped: true,
      reason: "claim already running"
    };
  }

  claimRunning = true;
  lastClaimStartedAt = now;

  try {
    const wallet = config.creatorWalletPublicKey;

    if (!wallet) {
      throw new Error("Missing CREATOR_WALLET_PUBLIC_KEY");
    }

    if (!config.distributionWalletPublicKey) {
      throw new Error("Missing DISTRIBUTION_WALLET_PUBLIC_KEY");
    }

    // ✅ Balance előellenőrzés — Pump.fun API hívás ELŐTT
    // Csak akkor claimelünk ha a creator wallet elérte a CLAIM_MIN_RAW küszöböt
    // (0.15 SOL = 150_000_000 lamport alapértelmezetten)
    if (config.claimMinRaw > 0n) {
      const preCheckBalance = await getSolBalanceRaw(wallet);
      if (preCheckBalance < config.claimMinRaw) {
        return {
          ok: true,
          skipped: true,
          reason:
            `creator wallet balance below CLAIM_MIN_RAW threshold ` +
            `(${preCheckBalance.toString()} < ${config.claimMinRaw.toString()})`,
          currentBalanceRaw: preCheckBalance.toString(),
          currentBalanceSol: (Number(preCheckBalance) / LAMPORTS_PER_SOL).toFixed(6),
          claimMinRaw: config.claimMinRaw.toString(),
          claimMinSol: (Number(config.claimMinRaw) / LAMPORTS_PER_SOL).toFixed(6)
        };
      }
    }

    const before = await getSolBalanceRaw(wallet);
const claim = (await claimCreatorFees()) as ClaimResult;

if (isDryRunClaim(claim)) {
  return {
    ok: true,
    dryRun: true,
    beforeRaw: before.toString(),
    beforeSol: Number(before) / LAMPORTS_PER_SOL
  };
}

// ✅ Retry loop: megvárjuk amíg a Helius RPC frissíti a balance-t
let after = before;
for (let attempt = 0; attempt < 5; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  after = await getSolBalanceRaw(wallet);
  if (after > before) break;
}

const claimedRaw = after > before ? after - before : 0n;

if (claimedRaw <= 0n) {
  return {
    ok: true,
    claimSignature: claim.signature,
    claimedRaw: "0",
    skipped: true,
    reason: "no positive balance delta after claim"
  };
}

    if (claimedRaw < config.claimSwapMinSolRaw) {
      return {
        ok: true,
        claimSignature: claim.signature,
        claimedRaw: claimedRaw.toString(),
        minClaimSwapSolRaw: config.claimSwapMinSolRaw.toString(),
        skipped: true,
        reason:
          `claimed SOL below claim swap threshold ` +
          `(${claimedRaw.toString()} < ${config.claimSwapMinSolRaw.toString()})`
      };
    }

    const transferToDistributionRaw =
      (claimedRaw * BigInt(config.claimToDistributionBps)) / 10_000n;

    if (transferToDistributionRaw <= 0n) {
      return {
        ok: true,
        claimSignature: claim.signature,
        claimedRaw: claimedRaw.toString(),
        skipped: true,
        reason: "claimed amount too small to transfer to distribution wallet"
      };
    }

    const creatorKeypair = getCreatorKeypair();
    const distributionPubkey = new PublicKey(config.distributionWalletPublicKey);

    const transferSignature = await transferSol({
      connection,
      fromKeypair: creatorKeypair,
      toPubkey: distributionPubkey,
      lamports: transferToDistributionRaw
    });

    const swappableRaw =
      (transferToDistributionRaw * BigInt(config.distributionSwapBps)) / 10_000n;

    const reserveRaw = transferToDistributionRaw - swappableRaw;

    if (swappableRaw <= 0n) {
      return {
        ok: true,
        claimSignature: claim.signature,
        transferSignature,
        claimedRaw: claimedRaw.toString(),
        transferredRaw: transferToDistributionRaw.toString(),
        reserveRaw: reserveRaw.toString(),
        skipped: true,
        reason: "nothing left to swap after distribution transfer"
      };
    }

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
        reserveRaw: reserveRaw.toString(),
        rewardRaw: rewardRaw.toString(),
        minRewardPayoutRaw: config.minRewardPayoutRaw.toString(),
        skipped: true,
        reason:
          `swapped ${config.rewardSymbol} below MIN_REWARD_PAYOUT_RAW ` +
          `(${rewardRaw.toString()} < ${config.minRewardPayoutRaw.toString()})`
      };
    }

    try {
      const reward = await registerClaimedRewardEvent({
        sourceTx: swap.signature,
        grossPayoutRaw: rewardRaw,
        notes:
          `Automatic creator fee claim from ${claim.signature}, ` +
          `${config.claimToDistributionBps} bps ` +
          `(${transferToDistributionRaw.toString()} raw) transferred to distribution wallet via ${transferSignature}, ` +
          `${config.distributionSwapBps} bps ` +
          `(${swappableRaw.toString()} raw) swapped from SOL to ${config.rewardSymbol}, ` +
          `${reserveRaw.toString()} raw kept as SOL fee reserve`
      });

      return {
        ok: true,
        claimSignature: claim.signature,
        transferSignature,
        swapSignature: swap.signature,
        rewardEventId: reward.id,
        claimedRaw: claimedRaw.toString(),
        transferredRaw: transferToDistributionRaw.toString(),
        swappableRaw: swappableRaw.toString(),
        reserveRaw: reserveRaw.toString(),
        rewardRaw: rewardRaw.toString(),
        minRewardPayoutRaw: config.minRewardPayoutRaw.toString(),
        skipped: false
      };
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        return {
          ok: true,
          claimSignature: claim.signature,
          transferSignature,
          swapSignature: swap.signature,
          claimedRaw: claimedRaw.toString(),
          transferredRaw: transferToDistributionRaw.toString(),
          swappableRaw: swappableRaw.toString(),
          reserveRaw: reserveRaw.toString(),
          rewardRaw: rewardRaw.toString(),
          minRewardPayoutRaw: config.minRewardPayoutRaw.toString(),
          skipped: true,
          reason: "reward event already registered for this swap transaction"
        };
      }

      throw error;
    }
  } finally {
    claimRunning = false;
  }
}
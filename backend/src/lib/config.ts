import { z } from "zod";

const schema = z.object({
  RPC_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),

  // Legacy / backwards compatibility
  DISTRIBUTOR_SECRET_KEY_JSON: z.string().optional().default(""),

  // Preferred naming
  DISTRIBUTION_WALLET_PUBLIC_KEY: z.string().optional().default(""),
  DISTRIBUTION_WALLET_PRIVATE_KEY: z.string().optional().default(""),
  DISTRIBUTION_WALLET_SECRET_KEY_JSON: z.string().optional().default(""),

  HOLDER_TOKEN_A_MINT: z.string().min(32),
  HOLDER_TOKEN_B_MINT: z.string().min(32),

  REWARD_TOKEN_MINT: z.string().min(32),
  REWARD_SYMBOL: z.string().default("USDC"),

  MIN_HOLDER_AMOUNT_RAW: z.coerce.bigint().default(1n),
  MIN_REWARD_PAYOUT_RAW: z.coerce.bigint().default(1n),

  EXCLUDED_WALLETS: z.string().optional().default(""),

  SAFETY_BUFFER_BPS: z.coerce.number().int().min(0).max(10_000).default(300),

  MAX_RECIPIENTS_PER_TX: z.coerce.number().int().min(1).max(8).default(4),

  // Legacy name kept for compatibility
  MIN_SOL_FEE_RESERVE_LAMPORTS: z.coerce.bigint().default(50_000_000n),
  // Preferred name
  DISTRIBUTION_MIN_SOL_RESERVE_LAMPORTS: z.coerce.bigint().optional(),

  DRY_RUN: z.string().optional().default("true"),
  AUTO_DISTRIBUTE: z.string().optional().default("false"),

  CRON_ENABLED: z.string().optional().default("false"),
  CRON_SNAPSHOT: z.string().default("0 * * * *"),
  CRON_DISTRIBUTE: z.string().default("10 * * * *"),

  PORT: z.coerce.number().int().default(8787),
  ADMIN_API_KEY: z.string().min(6),

  CLAIM_ENABLED: z.string().optional().default("false"),
  CLAIM_CRON: z.string().default("*/2 * * * *"),
  CLAIM_PRIORITY_FEE: z.coerce.number().default(0.000001),
  CLAIM_DRY_RUN: z.string().optional().default("true"),
  PUMPPORTAL_TRADE_LOCAL_URL: z
    .string()
    .url()
    .default("https://pumpportal.fun/api/trade-local"),

  CREATOR_WALLET_PUBLIC_KEY: z.string().optional().default(""),
  CREATOR_WALLET_PRIVATE_KEY: z.string().optional().default(""),

  CLAIM_MIN_RAW: z.coerce.bigint().default(1_000_000n),
  CLAIM_MINT: z
    .string()
    .default("So11111111111111111111111111111111111111112"),
  CLAIM_LOCK_TTL_MS: z.coerce.number().default(120000),

  CLAIM_TO_DISTRIBUTION_BPS: z.coerce.number().int().min(0).max(10_000).default(7000),
  DISTRIBUTION_SWAP_BPS: z.coerce.number().int().min(0).max(10_000).default(8000),

  JUPITER_QUOTE_URL: z
    .string()
    .url()
    .default("https://quote-api.jup.ag/v6/quote"),
  JUPITER_SWAP_URL: z
    .string()
    .url()
    .default("https://quote-api.jup.ag/v6/swap"),
  JUPITER_API_KEY: z.string().optional().default(""),
  SWAP_SLIPPAGE_BPS: z.coerce.number().int().min(1).max(5000).default(1000),
  SWAP_MAX_PRICE_IMPACT_BPS: z.coerce.number().int().min(0).max(10000).default(1200),

  // Legacy name kept for compatibility
  SWAP_MIN_SOL_RAW: z.coerce.bigint().default(1_000_000n),
  // Preferred name
  CLAIM_SWAP_MIN_SOL_RAW: z.coerce.bigint().optional()
});

const env = schema.parse(process.env);

if (env.CLAIM_TO_DISTRIBUTION_BPS + env.DISTRIBUTION_SWAP_BPS < 0) {
  throw new Error("Invalid BPS configuration.");
}

if (env.CLAIM_ENABLED === "true") {
  if (!env.CREATOR_WALLET_PUBLIC_KEY) {
    throw new Error("CREATOR_WALLET_PUBLIC_KEY is required when CLAIM_ENABLED=true");
  }

  if (!env.CREATOR_WALLET_PRIVATE_KEY) {
    throw new Error("CREATOR_WALLET_PRIVATE_KEY is required when CLAIM_ENABLED=true");
  }

  const distributionHasAnySigner =
    !!env.DISTRIBUTION_WALLET_PRIVATE_KEY ||
    !!env.DISTRIBUTION_WALLET_SECRET_KEY_JSON ||
    !!env.DISTRIBUTOR_SECRET_KEY_JSON;

  if (!distributionHasAnySigner) {
    throw new Error(
      "DISTRIBUTION_WALLET_PRIVATE_KEY or DISTRIBUTION_WALLET_SECRET_KEY_JSON is required when CLAIM_ENABLED=true"
    );
  }
}

const distributionWalletSecretKeyJson =
  env.DISTRIBUTION_WALLET_SECRET_KEY_JSON || env.DISTRIBUTOR_SECRET_KEY_JSON;

const distributionMinSolReserveLamports =
  env.DISTRIBUTION_MIN_SOL_RESERVE_LAMPORTS ?? env.MIN_SOL_FEE_RESERVE_LAMPORTS;

const claimSwapMinSolRaw =
  env.CLAIM_SWAP_MIN_SOL_RAW ?? env.SWAP_MIN_SOL_RAW;

export const config = {
  rpcUrl: env.RPC_URL,
  databaseUrl: env.DATABASE_URL,

  // Distribution wallet
  distributionWalletPublicKey: env.DISTRIBUTION_WALLET_PUBLIC_KEY,
  distributionWalletPrivateKey: env.DISTRIBUTION_WALLET_PRIVATE_KEY,
  distributionWalletSecretKeyJson,
  distributorSecretKey: distributionWalletSecretKeyJson
    ? Uint8Array.from(JSON.parse(distributionWalletSecretKeyJson))
    : new Uint8Array(),

  holderTokenAMint: env.HOLDER_TOKEN_A_MINT,
  holderTokenBMint: env.HOLDER_TOKEN_B_MINT,

  rewardTokenMint: env.REWARD_TOKEN_MINT,
  rewardSymbol: env.REWARD_SYMBOL,

  minHolderAmountRaw: env.MIN_HOLDER_AMOUNT_RAW,
  minRewardPayoutRaw: env.MIN_REWARD_PAYOUT_RAW,

  excludedWallets: env.EXCLUDED_WALLETS
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  
  safetyBufferBps: env.SAFETY_BUFFER_BPS,

  maxRecipientsPerTx: env.MAX_RECIPIENTS_PER_TX,

  // Legacy + preferred exposed together
  minSolFeeReserveLamports: env.MIN_SOL_FEE_RESERVE_LAMPORTS,
  distributionMinSolReserveLamports,


  dryRun: env.DRY_RUN === "true",
  autoDistribute: env.AUTO_DISTRIBUTE === "true",

  cronEnabled: env.CRON_ENABLED === "true",
  cronSnapshot: env.CRON_SNAPSHOT,
  cronDistribute: env.CRON_DISTRIBUTE,

  port: env.PORT,
  adminApiKey: env.ADMIN_API_KEY,

  claimEnabled: env.CLAIM_ENABLED === "true",
  claimCron: env.CLAIM_CRON,
  claimPriorityFee: env.CLAIM_PRIORITY_FEE,
  claimDryRun: env.CLAIM_DRY_RUN === "true",
  pumpPortalTradeLocalUrl: env.PUMPPORTAL_TRADE_LOCAL_URL,

  creatorWalletPublicKey: env.CREATOR_WALLET_PUBLIC_KEY,
  creatorWalletPrivateKey: env.CREATOR_WALLET_PRIVATE_KEY,

  claimMinRaw: env.CLAIM_MIN_RAW,
  claimMint: env.CLAIM_MINT,
  claimLockTtlMs: env.CLAIM_LOCK_TTL_MS,

  claimToDistributionBps: env.CLAIM_TO_DISTRIBUTION_BPS,
  distributionSwapBps: env.DISTRIBUTION_SWAP_BPS,

  jupiterQuoteUrl: env.JUPITER_QUOTE_URL,
  jupiterSwapUrl: env.JUPITER_SWAP_URL,
  jupiterApiKey: env.JUPITER_API_KEY,
  swapSlippageBps: env.SWAP_SLIPPAGE_BPS,
  swapMaxPriceImpactBps: env.SWAP_MAX_PRICE_IMPACT_BPS,

  // Legacy + preferred exposed together
  swapMinSolRaw: env.SWAP_MIN_SOL_RAW,
  claimSwapMinSolRaw
};
import bs58 from "bs58";
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { config } from "../lib/config.js";

const WSOL_MINT = "So11111111111111111111111111111111111111112";
const connection = new Connection(config.rpcUrl, "confirmed");

function getDistributionKeypair() {
  if (!config.distributionWalletPrivateKey) {
    throw new Error("Missing DISTRIBUTION_WALLET_PRIVATE_KEY");
  }

  return Keypair.fromSecretKey(bs58.decode(config.distributionWalletPrivateKey));
}

type JupiterQuoteResponse = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold?: string;
  swapMode?: string;
  slippageBps?: number;
  priceImpactPct?: string;
  routePlan?: unknown[];
};

type JupiterSwapResponse = {
  swapTransaction: string;
  lastValidBlockHeight?: number;
  prioritizationFeeLamports?: number;
};

async function getMintProgramId(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey> {
  const accountInfo = await connection.getAccountInfo(mint, "confirmed");

  if (!accountInfo) {
    throw new Error(`Mint not found: ${mint.toBase58()}`);
  }

  if (
    !accountInfo.owner.equals(TOKEN_PROGRAM_ID) &&
    !accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)
  ) {
    throw new Error(
      `Unsupported token program: ${accountInfo.owner.toBase58()}`
    );
  }

  return accountInfo.owner;
}

async function getTokenBalanceRawOrZero(tokenAccount: PublicKey): Promise<bigint> {
  try {
    const balance = await connection.getTokenAccountBalance(
      tokenAccount,
      "confirmed"
    );
    return BigInt(balance.value.amount);
  } catch {
    return 0n;
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Swaps SOL (WSOL) from the distribution wallet into the reward token
 * defined by REWARD_TOKEN_MINT.
 */
export async function swapSolToRewardToken(inputAmountRaw: bigint) {
  if (inputAmountRaw <= 0n) {
    throw new Error(
      "swapSolToRewardToken inputAmountRaw must be greater than zero"
    );
  }

  if (!config.rewardTokenMint) {
    throw new Error("Missing REWARD_TOKEN_MINT env variable");
  }

  const keypair = getDistributionKeypair();
  const owner = keypair.publicKey;
  const userPublicKey = owner.toBase58();
  const rewardMint = new PublicKey(config.rewardTokenMint);

  const rewardTokenProgramId = await getMintProgramId(connection, rewardMint);

  const rewardAta = getAssociatedTokenAddressSync(
    rewardMint,
    owner,
    false,
    rewardTokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const rewardBeforeRaw = await getTokenBalanceRawOrZero(rewardAta);

  const quoteUrl = new URL(config.jupiterQuoteUrl);
  quoteUrl.searchParams.set("inputMint", WSOL_MINT);
  quoteUrl.searchParams.set("outputMint", config.rewardTokenMint);
  quoteUrl.searchParams.set("amount", inputAmountRaw.toString());
  quoteUrl.searchParams.set("slippageBps", String(config.swapSlippageBps));
  quoteUrl.searchParams.set("onlyDirectRoutes", "false");

  const quoteResp = await fetch(quoteUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(config.jupiterApiKey ? { "x-api-key": config.jupiterApiKey } : {})
    }
  });

  if (!quoteResp.ok) {
    throw new Error(
      `Jupiter quote error: ${quoteResp.status} ${await quoteResp.text()}`
    );
  }

  const quote = (await quoteResp.json()) as JupiterQuoteResponse;

  if (!quote?.outAmount) {
    throw new Error("Jupiter quote returned no outAmount for reward token");
  }

  const priceImpactPct = Number(quote.priceImpactPct ?? "0");
  const maxPriceImpactPct = config.swapMaxPriceImpactBps / 10_000;

  if (Number.isFinite(priceImpactPct) && priceImpactPct > maxPriceImpactPct) {
    throw new Error(
      `Price impact too high for reward token swap: ${(priceImpactPct * 100).toFixed(2)}% ` +
      `(max ${(maxPriceImpactPct * 100).toFixed(2)}%). Aborting swap.`
    );
  }

  const swapResp = await fetch(config.jupiterSwapUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(config.jupiterApiKey ? { "x-api-key": config.jupiterApiKey } : {})
    },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto"
    })
  });

  if (!swapResp.ok) {
    throw new Error(
      `Jupiter swap error: ${swapResp.status} ${await swapResp.text()}`
    );
  }

  const swapData = (await swapResp.json()) as JupiterSwapResponse;

  if (!swapData?.swapTransaction) {
    throw new Error("Jupiter swap response missing swapTransaction");
  }

  const txBuffer = Buffer.from(swapData.swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(txBuffer);

  tx.sign([keypair]);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3
  });

  const latest = await connection.getLatestBlockhash("confirmed");

await connection.confirmTransaction(
  {
    signature,
    blockhash: tx.message.recentBlockhash,
    lastValidBlockHeight:
      swapData.lastValidBlockHeight ?? latest.lastValidBlockHeight
  },
  "confirmed"
);

  let rewardAfterRaw = 0n;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    rewardAfterRaw = await getTokenBalanceRawOrZero(rewardAta);

    if (rewardAfterRaw > rewardBeforeRaw) {
      break;
    }

    await sleep(1000);
  }

  const balanceDiffOutAmountRaw =
    rewardAfterRaw > rewardBeforeRaw ? rewardAfterRaw - rewardBeforeRaw : 0n;

  const actualOutRaw =
    balanceDiffOutAmountRaw > 0n
      ? balanceDiffOutAmountRaw
      : BigInt(quote.outAmount);

  return {
    ok: true,
    signature,
    inputMint: WSOL_MINT,
    outputMint: config.rewardTokenMint,
    rewardAta: rewardAta.toBase58(),
    rewardTokenProgramId: rewardTokenProgramId.toBase58(),
    inAmountRaw: inputAmountRaw.toString(),
    quotedOutAmountRaw: quote.outAmount,
    actualOutAmountRaw: actualOutRaw.toString(),
    balanceDiffOutAmountRaw: balanceDiffOutAmountRaw.toString(),
    priceImpactPct: quote.priceImpactPct ?? "0",
    rewardBeforeRaw: rewardBeforeRaw.toString(),
    rewardAfterRaw: rewardAfterRaw.toString()
  };
}
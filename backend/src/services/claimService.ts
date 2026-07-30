import bs58 from "bs58";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { config } from "../lib/config.js";

const connection = new Connection(config.rpcUrl, "confirmed");

function getCreatorKeypair() {
  if (!config.creatorWalletPrivateKey) {
    throw new Error("Missing CREATOR_WALLET_PRIVATE_KEY");
  }

  return Keypair.fromSecretKey(bs58.decode(config.creatorWalletPrivateKey));
}

export async function claimCreatorFees() {
  const keypair = getCreatorKeypair();

  if (config.creatorWalletPublicKey && keypair.publicKey.toBase58() !== config.creatorWalletPublicKey) {
    throw new Error("CREATOR_WALLET_PUBLIC_KEY does not match private key");
  }

  if (config.claimDryRun) {
    return {
      ok: true,
      dryRun: true,
      publicKey: keypair.publicKey.toBase58()
    };
  }

  const resp = await fetch(config.pumpPortalTradeLocalUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: keypair.publicKey.toBase58(),
      action: "collectCreatorFee",
      mint: config.claimMint,
      priorityFee: config.claimPriorityFee
    })
  });

  if (!resp.ok) {
    throw new Error(`PumpPortal error: ${resp.status} ${await resp.text()}`);
  }

  const txBytes = new Uint8Array(await resp.arrayBuffer());
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([keypair]);

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 3
  });

  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight
    },
    "confirmed"
  );

  return {
    ok: true,
    signature,
    publicKey: keypair.publicKey.toBase58()
  };
}
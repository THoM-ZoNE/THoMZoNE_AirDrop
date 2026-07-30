import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

export async function transferSol(params: {
  connection: Connection;
  fromKeypair: Keypair;
  toPubkey: PublicKey;
  lamports: bigint;
}): Promise<string> {
  const { connection, fromKeypair, toPubkey, lamports } = params;

  if (lamports <= 0n) {
    throw new Error(`transferSol: invalid lamports amount: ${lamports.toString()}`);
  }

  if (lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`transferSol: lamports exceeds JS safe integer range`);
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey,
      lamports: Number(lamports),
    }),
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [fromKeypair], {
    commitment: 'confirmed',
  });

  return signature;
}
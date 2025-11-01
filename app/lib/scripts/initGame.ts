import { Connection, Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, BN, Idl } from "@coral-xyz/anchor";
import idl from "../lib/idl/pot_game.json";

// Run with: ts-node scripts/initGame.ts (configure ts-node), or adapt to your setup.
(async () => {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL!;
  const programId = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID!);
  const payer = Keypair.fromSecretKey(/* load from fs or env */ new Uint8Array([]));

  const connection = new Connection(endpoint, "confirmed");
  const wallet = {
    publicKey: payer.publicKey,
    signAllTransactions: async (txs: any[]) => {
      txs.forEach(t => t.partialSign(payer));
      return txs;
    },
    signTransaction: async (tx: any) => {
      tx.partialSign(payer);
      return tx;
    }
  } as any;

  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new Program(idl as Idl, programId, provider);

  const game = Keypair.generate();
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), game.publicKey.toBuffer()], programId);

  await program.methods
    .initializeGame(new BN(900), new BN(10_000_000), 200, 0, null) // 15m, 0.01 SOL min, 2% burn, 0% fee
    .accounts({
      admin: payer.publicKey,
      game: game.publicKey,
      vault,
      systemProgram: SystemProgram.programId
    })
    .signers([game])
    .rpc();

  console.log("Game created:", game.publicKey.toBase58());
})().catch(console.error);

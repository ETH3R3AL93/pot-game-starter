"use client";
import { AnchorProvider, BN, Program, web3 } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./idl/pot_game.json";
import type { WalletContextState } from "@solana/wallet-adapter-react";

// Use a valid placeholder so the site can build before you deploy the program
const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
    "PoTGaMe11111111111111111111111111111111111"
);

export async function getProgramWithWallet(
  connection: Connection,
  wallet: WalletContextState
) {
  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });
  // Correct order: (idl, programId, provider). Loosen typing to avoid IDL shape friction.
  return new Program(idl as any, PROGRAM_ID, provider as any);
}

export async function getVaultPda(game: PublicKey) {
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), game.toBuffer()],
    PROGRAM_ID
  );
  return vault;
}

export { BN };

"use client";
import { AnchorProvider, BN, Program, Idl, web3 } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./idl/pot_game.json";
import type { WalletContextState } from "@solana/wallet-adapter-react";

const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID!);

export async function getProgramWithWallet(connection: Connection, wallet: WalletContextState) {
  // WalletContextState matches the Anchor "wallet" interface sufficiently for browser usage
  const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
  return new Program(idl as Idl, PROGRAM_ID, provider);
}

export async function getVaultPda(game: PublicKey) {
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), game.toBuffer()],
    PROGRAM_ID
  );
  return vault;
}

export { BN };

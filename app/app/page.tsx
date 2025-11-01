"use client";
import { useEffect, useMemo, useState } from "react";
import { Connection, PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { BorshCoder, Idl } from "@coral-xyz/anchor";
import idl from "./lib/idl/pot_game.json";
import { getProgramWithWallet, getVaultPda } from "./lib/program";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

type GameAccount = {
  admin: Uint8Array;
  vault: Uint8Array;
  lastBidder: Uint8Array;
  endTime: bigint;
  durationSeconds: bigint;
  minBidLamports: bigint;
  burnBps: number;
  feeBps: number;
  treasury: null | Uint8Array;
  isSettled: boolean;
  bump: number;
};

function toPubkey(u8: Uint8Array) {
  return new PublicKey(Buffer.from(u8));
}

export default function HomePage() {
  const wallet = useWallet();
  const [gamePk, setGamePk] = useState<PublicKey | null>(null);
  const [game, setGame] = useState<any>(null);
  const [vaultBalance, setVaultBalance] = useState<number>(0);
  const [now, setNow] = useState<number>(Math.floor(Date.now() / 1000));

  const connection = useMemo(() => new Connection(process.env.NEXT_PUBLIC_RPC_URL!, "confirmed"), []);
  const coder = useMemo(() => new BorshCoder(idl as Idl), []);

  useEffect(() => {
    const k = process.env.NEXT_PUBLIC_GAME_PK;
    if (k) setGamePk(new PublicKey(k));
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setNow(Math.floor(Date.now()/1000)), 1000);
    return () => clearInterval(iv);
  }, []);

  // Fetch game + vault balance
  useEffect(() => {
    if (!gamePk) return;
    (async () => {
      const ai = await connection.getAccountInfo(gamePk);
      if (!ai) return;
      const decoded = coder.accounts.decode("Game", ai.data) as GameAccount;
      setGame(decoded);
      const vault = await getVaultPda(gamePk);
      const bal = await connection.getBalance(vault);
      setVaultBalance(bal);
    })();
  }, [connection, coder, gamePk, now]);

  const endTime = Number(game?.endTime ?? 0);
  const remaining = Math.max(0, endTime - now);
  const lastBidder = game ? toPubkey(game.lastBidder).toBase58() : "-";
  const potSol = (vaultBalance / 1_000_000_000).toFixed(4);

  async function placeBid(lamports: number) {
    if (!wallet.publicKey || !gamePk) return;
    const program = await getProgramWithWallet(connection, wallet);
    const vault = await getVaultPda(gamePk);

    // build tx with optional priority fee
    const tx = await program.methods.placeBid(new anchor.BN(lamports)).accounts({
      bidder: wallet.publicKey,
      game: gamePk,
      vault,
      systemProgram: SystemProgram.programId
    }).transaction();

    const latest = await connection.getLatestBlockhash();
    tx.feePayer = wallet.publicKey;
    tx.recentBlockhash = latest.blockhash;
    tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }));

    const sig = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction(sig, "confirmed");
  }

  async function settle() {
    if (!wallet.publicKey || !gamePk) return;
    const program = await getProgramWithWallet(connection, wallet);
    const vault = await getVaultPda(gamePk);
    const incinerator = new PublicKey("1nc1nerator11111111111111111111111111111111");

    const ai = await connection.getAccountInfo(gamePk);
    if (!ai) return;
    const decoded = coder.accounts.decode("Game", ai.data) as GameAccount;
    const winner = toPubkey(decoded.lastBidder);
    const treasury = decoded.treasury ? toPubkey(decoded.treasury) : incinerator;

    const sig = await program.methods.settle().accounts({
      caller: wallet.publicKey,
      game: gamePk,
      vault,
      winner,
      incinerator,
      treasury,
      systemProgram: SystemProgram.programId
    }).rpc();
    await connection.confirmTransaction(sig, "confirmed");
  }

  return (
    <div className="card">
      <h1 className="h">Pot Game</h1>
      <div className="small">Program: {(idl as any).metadata.address}</div>
      <div className="small">Game: {gamePk?.toBase58() ?? "-"}</div>

      <div className="grid" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="h">Timer</div>
          <div style={{ fontSize: 42, fontWeight: 800 }}>
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </div>
          <div className="small">Resets to 15:00 on each bid</div>
        </div>

        <div className="card">
          <div className="h">Pot</div>
          <div style={{ fontSize: 42, fontWeight: 800 }}>{potSol} SOL</div>
          <div className="small">Last bidder: {lastBidder}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <WalletMultiButton />
          <div className="row">
            <button className="btn" onClick={() => placeBid(10000000)} disabled={remaining === 0}>
              Bid 0.01 SOL
            </button>
            <button className="btn" onClick={settle} disabled={remaining > 0}>
              Settle
            </button>
          </div>
        </div>
      </div>

      <div className="small" style={{ marginTop: 12 }}>
        * Bids reset the timer. A small percent burns to the incinerator on settle.
      </div>
    </div>
  );
}

# Pot Game Starter (Solana + Anchor + Next.js)

A production-minded starter for a **last-bidder-wins** SOL pot game on Solana:
- Each bid resets a **15-minute timer** (configurable) and grows the pot.
- When the timer expires, the **last bidder wins**.
- A small percent of the pot is **burned** to the incinerator address (configurable).
- Optional **treasury fee**.

> ⚠️ **Legal**: This mechanic can be regulated in many jurisdictions (lottery/gambling). Obtain legal advice before launch.

## Tech
- **On-chain**: Anchor program (Rust).
- **Frontend**: Next.js + Wallet Adapter.
- **No backend** required. Hosting can be on **Vercel** (recommended).

---

## Quick start

### Requirements
- Node 18+
- yarn or npm
- Rust toolchain
- Solana CLI
- Anchor CLI (>= 0.30.x)

### 1) Install dependencies (frontend)
```bash
cd app
npm install
# or: yarn
```

### 2) Local Anchor (optional for dev)
```bash
solana-test-validator
# new terminal:
anchor build
anchor deploy
```

> After `anchor deploy`, replace the program id everywhere:
> - In `programs/pot_game/src/lib.rs` (`declare_id!` line)
> - In `app/.env.local` (`NEXT_PUBLIC_PROGRAM_ID=`)

### 3) Initialize a game (devnet or localnet)
- Create a new keypair with SOL, then run a quick script or use Anchor client to call `initialize_game`.
- Update `.env.local` with the **GAME account** public key you created.

Example using Anchor TS (simplified) is in `app/lib/scripts/initGame.ts`.

### 4) Run the frontend
```bash
cd app
cp .env.example .env.local
# edit .env.local with RPC, PROGRAM_ID, and GAME_PK
npm run dev
```

Open http://localhost:3000 and connect your wallet.

---

## Deploying the frontend (Hosting)
**Vercel (recommended)**:
1. Push this repo to GitHub.
2. Import into **Vercel**.
3. Add environment variables under *Project Settings → Environment Variables*:
   - `NEXT_PUBLIC_RPC_URL` (e.g., https://api.mainnet-beta.solana.com or your provider)
   - `NEXT_PUBLIC_PROGRAM_ID` (deployed program id)
   - `NEXT_PUBLIC_GAME_PK` (public key of the created Game account)
4. Deploy. No server required.

**Alternatives**: Netlify, Cloudflare Pages, or any static hosting that supports Next.js.

---

## Program parameters
Configured at `initialize_game`:
- `duration_seconds` (default example: `900` = 15 min)
- `min_bid_lamports` (e.g., 0.01 SOL)
- `burn_bps` (e.g., `200` → 2%)
- `fee_bps` (e.g., `0` → no treasury fee)
- `treasury` (optional Pubkey if `fee_bps > 0`)

## Security & UX notes
- All critical arithmetic uses checked ops.
- Winner is `last_bidder` when `now >= end_time`.
- Include **priority fees** near expiry to avoid sniping failures.
- Consider audits and open-sourcing.

---

## License
MIT

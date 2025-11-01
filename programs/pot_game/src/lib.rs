use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey::Pubkey;
use core::str::FromStr;

declare_id!("PoTGaMe11111111111111111111111111111111111");

pub const INCINERATOR: &str = "1nc1nerator11111111111111111111111111111111";

#[program]
pub mod pot_game {
    use super::*;

    pub fn initialize_game(
        ctx: Context<InitializeGame>,
        duration_seconds: i64,
        min_bid_lamports: u64,
        burn_bps: u16,
        fee_bps: u16,
        treasury: Option<Pubkey>,
    ) -> Result<()> {
        require!(burn_bps <= 10_000 && fee_bps <= 10_000, PotError::BpsInvalid);
        let game = &mut ctx.accounts.game;
        let clock = Clock::get()?;

        game.admin = ctx.accounts.admin.key();
        game.vault = ctx.accounts.vault.key();
        game.duration_seconds = duration_seconds;
        game.min_bid_lamports = min_bid_lamports;
        game.burn_bps = burn_bps;
        game.fee_bps = fee_bps;
        game.treasury = treasury;
        game.last_bidder = Pubkey::default();
        game.end_time = clock.unix_timestamp + duration_seconds;
        game.is_settled = false;
        game.bump = *ctx.bumps.get("vault").unwrap();
        Ok(())
    }

    pub fn place_bid(ctx: Context<PlaceBid>, lamports: u64) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let clock = Clock::get()?;
        require!(clock.unix_timestamp < game.end_time, PotError::GameOver);
        require!(lamports >= game.min_bid_lamports, PotError::BidTooSmall);

        // transfer from bidder to vault
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.bidder.key(),
            &ctx.accounts.vault.key(),
            lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.bidder.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        game.last_bidder = ctx.accounts.bidder.key();
        game.end_time = clock.unix_timestamp + game.duration_seconds;
        Ok(())
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= game.end_time, PotError::GameNotOver);
        require!(!game.is_settled, PotError::AlreadySettled);
        require!(game.last_bidder != Pubkey::default(), PotError::NoWinner);

        // Validate incinerator address strictly
        let expected = Pubkey::from_str(INCINERATOR).map_err(|_| PotError::InvalidIncinerator)?;
        require_keys_eq!(ctx.accounts.incinerator.key(), expected, PotError::InvalidIncinerator);

        let vault_info = &ctx.accounts.vault.to_account_info();
        let pot = vault_info.lamports();

        // Leave minimum rent (for 0-space system account this is often 0 but we compute anyway)
        let rent = Rent::get()?.minimum_balance(0);
        require!(pot > rent, PotError::EmptyPot);
        let distributable = pot.checked_sub(rent).ok_or(PotError::Math)?;

        // compute parts (bps out of 10_000)
        let burn = (distributable as u128)
            .checked_mul(game.burn_bps as u128).ok_or(PotError::Math)?
            / 10_000u128;

        let fee = (distributable as u128)
            .checked_mul(game.fee_bps as u128).ok_or(PotError::Math)?
            / 10_000u128;

        let burn_u64 = u64::try_from(burn).map_err(|_| PotError::Math)?;
        let fee_u64  = u64::try_from(fee).map_err(|_| PotError::Math)?;

        if game.fee_bps > 0 {
            let treasury = game.treasury.ok_or(PotError::InvalidTreasury)?;
            require_keys_eq!(ctx.accounts.treasury.key(), treasury, PotError::InvalidTreasury);
        } else {
            // when fee is zero, we don't care what is passed in treasury
        }

        let winner_amt = distributable
            .checked_sub(burn_u64).and_then(|x| x.checked_sub(fee_u64))
            .ok_or(PotError::Math)?;

        // Payout winner
        transfer_from_vault_signed(
            &ctx.accounts.vault,
            &ctx.accounts.winner,
            winner_amt,
            &ctx.accounts.system_program,
            &ctx.accounts.game,
        )?;

        // Treasury fee
        if fee_u64 > 0 {
            transfer_from_vault_signed(
                &ctx.accounts.vault,
                &ctx.accounts.treasury,
                fee_u64,
                &ctx.accounts.system_program,
                &ctx.accounts.game,
            )?;
        }

        // Burn to incinerator
        if burn_u64 > 0 {
            transfer_from_vault_signed(
                &ctx.accounts.vault,
                &ctx.accounts.incinerator,
                burn_u64,
                &ctx.accounts.system_program,
                &ctx.accounts.game,
            )?;
        }

        game.is_settled = true;
        Ok(())
    }
}

fn transfer_from_vault_signed(
    vault: &AccountInfo,
    to: &AccountInfo,
    lamports: u64,
    system_program: &Program<System>,
    game: &Account<Game>,
) -> Result<()> {
    let seeds: &[&[u8]] = &[b"vault", game.key().as_ref(), &[game.bump]];
    let ix = anchor_lang::solana_program::system_instruction::transfer(
        &vault.key(),
        &to.key(),
        lamports,
    );
    anchor_lang::solana_program::program::invoke_signed(
        &ix,
        &[vault.clone(), to.clone(), system_program.to_account_info()],
        &[seeds],
    )?;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(init, payer = admin, space = 8 + Game::SIZE)]
    pub game: Account<'info, Game>,

    /// The vault PDA is a 0-space system account that only this program can sign for via seeds
    #[account(
        init,
        payer = admin,
        space = 0,
        seeds = [b"vault", game.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,

    #[account(mut, has_one = vault)]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        seeds = [b"vault", game.key().as_ref()],
        bump = game.bump
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    /// anyone may call settle
    pub caller: Signer<'info>,

    #[account(mut, has_one = vault)]
    pub game: Account<'info, Game>,

    #[account(
        mut,
        seeds = [b"vault", game.key().as_ref()],
        bump = game.bump
    )]
    pub vault: SystemAccount<'info>,

    /// Winner = last_bidder (checked below by constraint)
    /// CHECK: simple system account
    #[account(mut, address = game.last_bidder)]
    pub winner: AccountInfo<'info>,

    /// CHECK: must equal incinerator address
    #[account(mut)]
    pub incinerator: AccountInfo<'info>,

    /// CHECK: optional treasury payout recipient
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct Game {
    pub admin: Pubkey,
    pub vault: Pubkey,
    pub last_bidder: Pubkey,
    pub end_time: i64,
    pub duration_seconds: i64,
    pub min_bid_lamports: u64,
    pub burn_bps: u16,
    pub fee_bps: u16,
    pub treasury: Option<Pubkey>,
    pub is_settled: bool,
    pub bump: u8,
}
impl Game {
    pub const SIZE: usize =
        32 + 32 + 32 + 8 + 8 + 8 + 2 + 2 + 1 + 32 + 1; // packed size estimate
}

#[error_code]
pub enum PotError {
    #[msg("Math overflow/underflow")]
    Math,
    #[msg("BPS must be <= 10000")]
    BpsInvalid,
    #[msg("Game has ended")]
    GameOver,
    #[msg("Game not over yet")]
    GameNotOver,
    #[msg("Already settled")]
    AlreadySettled,
    #[msg("No winner")]
    NoWinner,
    #[msg("Empty pot")]
    EmptyPot,
    #[msg("Bid below minimum")]
    BidTooSmall,
    #[msg("Invalid or missing treasury")]
    InvalidTreasury,
    #[msg("Invalid incinerator address")]
    InvalidIncinerator,
}

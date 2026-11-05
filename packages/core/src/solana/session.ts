// Sessão Solana: abastece a máscara e varre de volta.
//
// Em Solana não existe "approve" como no EVM: a própria transação que o site
// pede para assinar pode mover qualquer token da conta que assina. Por isso a
// máscara é ainda mais importante aqui: o site só alcança a conta da máscara.
//
// A varredura fecha as contas de token (ATA) da máscara e recupera o aluguel
// (rent), então o custo líquido de uma sessão é quase só a taxa de rede.

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { validateBudget, type Budget } from '../budget.js';

export interface SolanaSessionConfig {
  connection: Connection;
  main: Keypair;
  mask: Keypair;
  /** Mints que a varredura deve procurar na máscara (além dos do orçamento). */
  knownMints?: string[];
}

export interface SolanaBalances {
  lamports: bigint;
  tokens: { mint: string; amount: bigint }[];
}

export interface SolanaSweepReceipt {
  signatures: string[];
  tokensSwept: { mint: string; amount: bigint }[];
  lamportsSwept: bigint;
}

/**
 * Taxa exata de uma transação com uma assinatura. A varredura precisa deixar a
 * máscara com ZERO lamports: a Solana rejeita transação que deixe uma conta com
 * saldo abaixo do mínimo de aluguel (~0.00089 SOL) mas diferente de zero.
 */
const SWEEP_FEE_LAMPORTS = 5_000n;

export class SolanaSession {
  readonly connection: Connection;
  readonly main: Keypair;
  readonly mask: Keypair;
  private readonly mints = new Set<string>();

  constructor(cfg: SolanaSessionConfig) {
    this.connection = cfg.connection;
    this.main = cfg.main;
    this.mask = cfg.mask;
    for (const m of cfg.knownMints ?? []) this.mints.add(m);
  }

  get maskAddress(): string {
    return this.mask.publicKey.toBase58();
  }

  get mainAddress(): string {
    return this.main.publicKey.toBase58();
  }

  /** Abastece a máscara: SOL + tokens do orçamento, numa única transação. */
  async fund(budget: Budget): Promise<{ signature: string }> {
    validateBudget(budget);
    const tx = new Transaction();
    if (budget.native > 0n) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: this.main.publicKey,
          toPubkey: this.mask.publicKey,
          lamports: budget.native,
        }),
      );
    }
    for (const t of budget.tokens) {
      this.mints.add(t.id);
      const mint = new PublicKey(t.id);
      const from = getAssociatedTokenAddressSync(mint, this.main.publicKey);
      const to = getAssociatedTokenAddressSync(mint, this.mask.publicKey);
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(this.main.publicKey, to, this.mask.publicKey, mint),
        createTransferInstruction(from, to, this.main.publicKey, t.amount),
      );
    }
    const signature = await sendAndConfirmTransaction(this.connection, tx, [this.main], { commitment: 'confirmed' });
    return { signature };
  }

  async balances(of: 'mask' | 'main' = 'mask'): Promise<SolanaBalances> {
    const owner = of === 'mask' ? this.mask.publicKey : this.main.publicKey;
    const lamports = BigInt(await this.connection.getBalance(owner, 'confirmed'));
    const tokens: SolanaBalances['tokens'] = [];
    for (const m of this.mints) {
      const ata = getAssociatedTokenAddressSync(new PublicKey(m), owner);
      try {
        const acc = await getAccount(this.connection, ata, 'confirmed');
        tokens.push({ mint: m, amount: acc.amount });
      } catch {
        tokens.push({ mint: m, amount: 0n });
      }
    }
    return { lamports, tokens };
  }

  /** Devolve tokens, fecha as contas de token (recupera rent) e devolve o SOL. */
  async sweep(): Promise<SolanaSweepReceipt> {
    const tx = new Transaction();
    const tokensSwept: SolanaSweepReceipt['tokensSwept'] = [];

    for (const m of this.mints) {
      const mint = new PublicKey(m);
      const maskAta = getAssociatedTokenAddressSync(mint, this.mask.publicKey);
      let amount = 0n;
      try {
        amount = (await getAccount(this.connection, maskAta, 'confirmed')).amount;
      } catch {
        continue; // máscara nunca teve conta desse token
      }
      const mainAta = getAssociatedTokenAddressSync(mint, this.main.publicKey);
      if (amount > 0n) {
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(this.mask.publicKey, mainAta, this.main.publicKey, mint),
          createTransferInstruction(maskAta, mainAta, this.mask.publicKey, amount),
        );
        tokensSwept.push({ mint: m, amount });
      }
      // Fechar a ATA devolve o rent (~0.002 SOL) para a principal.
      tx.add(createCloseAccountInstruction(maskAta, this.main.publicKey, this.mask.publicKey, [], TOKEN_PROGRAM_ID));
    }

    const lamports = BigInt(await this.connection.getBalance(this.mask.publicKey, 'confirmed'));
    let lamportsSwept = 0n;
    if (lamports > SWEEP_FEE_LAMPORTS) {
      lamportsSwept = lamports - SWEEP_FEE_LAMPORTS;
      tx.add(
        SystemProgram.transfer({
          fromPubkey: this.mask.publicKey,
          toPubkey: this.main.publicKey,
          lamports: lamportsSwept,
        }),
      );
    }

    if (tx.instructions.length === 0) return { signatures: [], tokensSwept, lamportsSwept: 0n };

    const signature = await sendAndConfirmTransaction(this.connection, tx, [this.mask], { commitment: 'confirmed' });
    return { signatures: [signature], tokensSwept, lamportsSwept };
  }
}

export const SOL = LAMPORTS_PER_SOL;

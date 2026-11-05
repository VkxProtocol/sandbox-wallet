// Sessão EVM: abastece a máscara com o orçamento e, no fim, varre tudo de volta.
//
// Fluxo de uma sessão:
//   1. fund()   principal -> máscara: moeda nativa (gás + valor) e tokens do orçamento
//   2. (o site opera só com a máscara: aprova, puxa, troca, o que quiser)
//   3. sweep()  máscara -> principal: todos os tokens conhecidos e a moeda nativa
//               menos o gás da própria varredura
//
// Nada aqui exige mudança nos sites: para eles a máscara é uma carteira comum.

import { Contract, JsonRpcProvider, Wallet, type TransactionResponse } from 'ethers';
import { ERC20_ABI } from './erc20.js';
import { validateBudget, type Budget } from '../budget.js';

export interface EvmSessionConfig {
  provider: JsonRpcProvider;
  /** Chave da carteira principal (quem abastece e quem recebe de volta). */
  mainPrivateKey: string;
  /** Chave da máscara desta sessão. */
  maskPrivateKey: string;
  /** Tokens que a varredura deve procurar na máscara (além dos do orçamento). */
  knownTokens?: string[];
}

export interface FundReceipt {
  txHashes: string[];
}

export interface SweepReceipt {
  txHashes: string[];
  /** Tokens que tinham saldo e foram devolvidos. */
  tokensSwept: { token: string; amount: bigint }[];
  nativeSwept: bigint;
  /** Saldo nativo que ficou na máscara por ser menor que o gás da devolução. */
  nativeLeft: bigint;
}

export interface EvmBalances {
  native: bigint;
  tokens: { token: string; amount: bigint }[];
}

const TRANSFER_GAS = 21_000n;

export class EvmSession {
  readonly provider: JsonRpcProvider;
  readonly main: Wallet;
  readonly mask: Wallet;
  private readonly tokens = new Set<string>();

  constructor(cfg: EvmSessionConfig) {
    this.provider = cfg.provider;
    this.main = new Wallet(cfg.mainPrivateKey, cfg.provider);
    this.mask = new Wallet(cfg.maskPrivateKey, cfg.provider);
    for (const t of cfg.knownTokens ?? []) this.tokens.add(t.toLowerCase());
  }

  get maskAddress(): string {
    return this.mask.address;
  }

  get mainAddress(): string {
    return this.main.address;
  }

  /** Abastece a máscara exatamente com o orçamento. */
  async fund(budget: Budget): Promise<FundReceipt> {
    validateBudget(budget);
    const txHashes: string[] = [];
    if (budget.native > 0n) {
      const tx = await this.main.sendTransaction({ to: this.mask.address, value: budget.native });
      await tx.wait();
      txHashes.push(tx.hash);
    }
    for (const t of budget.tokens) {
      this.tokens.add(t.id.toLowerCase());
      const erc20 = new Contract(t.id, ERC20_ABI, this.main);
      const tx = (await erc20.transfer(this.mask.address, t.amount)) as TransactionResponse;
      await tx.wait();
      txHashes.push(tx.hash);
    }
    return { txHashes };
  }

  /** Saldos atuais da máscara (nativo + tokens conhecidos). */
  async balances(of: 'mask' | 'main' = 'mask'): Promise<EvmBalances> {
    const addr = of === 'mask' ? this.mask.address : this.main.address;
    const native = await this.provider.getBalance(addr);
    const tokens: EvmBalances['tokens'] = [];
    for (const token of this.tokens) {
      const erc20 = new Contract(token, ERC20_ABI, this.provider);
      const amount = (await erc20.balanceOf(addr)) as bigint;
      tokens.push({ token, amount });
    }
    return { native, tokens };
  }

  /** Permissões (allowance) que a máscara concedeu a um gastador. Útil para a demo. */
  async allowance(token: string, spender: string): Promise<bigint> {
    const erc20 = new Contract(token, ERC20_ABI, this.provider);
    return (await erc20.allowance(this.mask.address, spender)) as bigint;
  }

  /** Devolve tudo que sobrou na máscara para a principal. */
  async sweep(): Promise<SweepReceipt> {
    const txHashes: string[] = [];
    const tokensSwept: SweepReceipt['tokensSwept'] = [];

    for (const token of this.tokens) {
      const erc20 = new Contract(token, ERC20_ABI, this.mask);
      const amount = (await erc20.balanceOf(this.mask.address)) as bigint;
      if (amount === 0n) continue;
      const tx = (await erc20.transfer(this.main.address, amount)) as TransactionResponse;
      await tx.wait();
      txHashes.push(tx.hash);
      tokensSwept.push({ token, amount });
    }

    const native = await this.provider.getBalance(this.mask.address);
    const fee = await this.provider.getFeeData();
    const gasPrice = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
    const cost = TRANSFER_GAS * gasPrice;
    let nativeSwept = 0n;
    let nativeLeft = native;
    if (native > cost && gasPrice > 0n) {
      const value = native - cost;
      const req: Parameters<Wallet['sendTransaction']>[0] = {
        to: this.main.address,
        value,
        gasLimit: TRANSFER_GAS,
      };
      if (fee.maxFeePerGas && fee.maxPriorityFeePerGas) {
        req.maxFeePerGas = fee.maxFeePerGas;
        req.maxPriorityFeePerGas = fee.maxPriorityFeePerGas;
      } else {
        req.gasPrice = gasPrice;
      }
      const tx = await this.mask.sendTransaction(req);
      const receipt = await tx.wait();
      txHashes.push(tx.hash);
      nativeSwept = value;
      // Calculado pelo recibo (ler o saldo logo após a tx pode vir de cache).
      const paid = receipt ? receipt.gasUsed * receipt.gasPrice : cost;
      nativeLeft = native - value - paid;
    }

    return { txHashes, tokensSwept, nativeSwept, nativeLeft };
  }
}

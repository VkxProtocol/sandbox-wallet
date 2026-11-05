// Orçamento de uma sessão: o máximo que uma máscara pode receber.
// Tudo que o site conseguir levar está limitado a isto.

export interface TokenBudget {
  /** EVM: endereço do contrato. Solana: mint. */
  id: string;
  /** Quantidade na menor unidade (wei / lamports / unidades do token). */
  amount: bigint;
}

export interface Budget {
  /** Moeda nativa (BNB, ETH, SOL) na menor unidade. Cobre gás e valor. */
  native: bigint;
  tokens: TokenBudget[];
}

export function emptyBudget(): Budget {
  return { native: 0n, tokens: [] };
}

export function validateBudget(b: Budget): void {
  if (b.native < 0n) throw new Error('orçamento nativo negativo');
  const seen = new Set<string>();
  for (const t of b.tokens) {
    if (t.amount <= 0n) throw new Error(`orçamento inválido para ${t.id}`);
    const key = t.id.toLowerCase();
    if (seen.has(key)) throw new Error(`token repetido no orçamento: ${t.id}`);
    seen.add(key);
  }
}

/** Converte "1.5" com N decimais para a menor unidade, sem ponto flutuante. */
export function parseUnits(value: string, decimals: number): bigint {
  const s = value.trim();
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') throw new Error(`valor inválido: ${value}`);
  const [intPart, fracRaw = ''] = s.split('.');
  if (fracRaw.length > decimals) throw new Error(`mais casas decimais que o permitido (${decimals})`);
  const frac = fracRaw.padEnd(decimals, '0');
  return BigInt((intPart || '0') + frac);
}

export function formatUnits(value: bigint, decimals: number, maxFrac = 6): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const s = v.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals);
  let frac = s.slice(s.length - decimals).slice(0, maxFrac).replace(/0+$/, '');
  return `${neg ? '-' : ''}${int}${frac ? '.' + frac : ''}`;
}

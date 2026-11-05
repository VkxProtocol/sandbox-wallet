import { describe, expect, it } from 'vitest';
import { formatUnits, parseUnits, validateBudget } from '../src/budget.js';

describe('parseUnits/formatUnits', () => {
  it('converte sem ponto flutuante', () => {
    expect(parseUnits('1.5', 18)).toBe(1_500_000_000_000_000_000n);
    expect(parseUnits('0.000001', 6)).toBe(1n);
    expect(parseUnits('100', 0)).toBe(100n);
    expect(() => parseUnits('1.1234567', 6)).toThrow();
    expect(() => parseUnits('abc', 6)).toThrow();
  });
  it('formata', () => {
    expect(formatUnits(1_500_000_000_000_000_000n, 18)).toBe('1.5');
    expect(formatUnits(1n, 6)).toBe('0.000001');
    expect(formatUnits(0n, 9)).toBe('0');
  });
});

describe('validateBudget', () => {
  it('rejeita token repetido e valores inválidos', () => {
    expect(() => validateBudget({ native: 0n, tokens: [{ id: 'A', amount: 1n }, { id: 'a', amount: 2n }] })).toThrow();
    expect(() => validateBudget({ native: -1n, tokens: [] })).toThrow();
    expect(() => validateBudget({ native: 0n, tokens: [{ id: 'A', amount: 0n }] })).toThrow();
    expect(() => validateBudget({ native: 1n, tokens: [{ id: 'A', amount: 1n }] })).not.toThrow();
  });
});

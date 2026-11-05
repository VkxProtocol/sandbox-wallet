import { describe, expect, it } from 'vitest';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils';
import {
  deriveEvmMain,
  deriveEvmMask,
  deriveSolanaMain,
  deriveSolanaMask,
  isValidMnemonic,
  maskIndex,
  mnemonicToSeed,
  newMnemonic,
  normalizeOrigin,
  slip10Ed25519,
  MAX_HD_INDEX,
} from '../src/derive.js';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('normalizeOrigin', () => {
  it('reduz ao host em minúsculas', () => {
    expect(normalizeOrigin('https://App.Uniswap.org/swap?x=1')).toBe('app.uniswap.org');
    expect(normalizeOrigin('APP.UNISWAP.ORG')).toBe('app.uniswap.org');
    expect(normalizeOrigin('http://localhost:5173/')).toBe('localhost');
  });
  it('rejeita vazio', () => {
    expect(() => normalizeOrigin('   ')).toThrow();
  });
});

describe('maskIndex', () => {
  it('é determinístico e cabe no limite BIP-32', () => {
    const a = maskIndex({ origin: 'golpe.example' });
    expect(a).toBe(maskIndex({ origin: 'https://golpe.example/x' }));
    expect(a).toBeLessThanOrEqual(MAX_HD_INDEX);
    expect(a).toBeGreaterThanOrEqual(0);
  });
  it('muda por site e por rotação', () => {
    const a = maskIndex({ origin: 'a.example' });
    const b = maskIndex({ origin: 'b.example' });
    const a1 = maskIndex({ origin: 'a.example', rotation: 1 });
    expect(a).not.toBe(b);
    expect(a).not.toBe(a1);
  });
});

describe('EVM', () => {
  const seed = mnemonicToSeed(MNEMONIC);
  it('carteira principal segue o caminho padrão (vetor conhecido)', () => {
    // Endereço conhecido de m/44'/60'/0'/0/0 para a frase "abandon ... about".
    expect(deriveEvmMain(seed).address).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  });
  it('máscaras são diferentes da principal e entre sites', () => {
    const main = deriveEvmMain(seed);
    const m1 = deriveEvmMask(seed, { origin: 'a.example' });
    const m2 = deriveEvmMask(seed, { origin: 'b.example' });
    const m1again = deriveEvmMask(seed, { origin: 'A.EXAMPLE' });
    expect(m1.address).not.toBe(main.address);
    expect(m1.address).not.toBe(m2.address);
    expect(m1.address).toBe(m1again.address);
    expect(m1.path).toBe(`m/44'/60'/1'/0/${m1.index}`);
  });
});

describe('SLIP-0010 ed25519', () => {
  it('bate com o vetor de teste oficial (seed 000102..0f, m/0\')', () => {
    const seed = hexToBytes('000102030405060708090a0b0c0d0e0f');
    const node = slip10Ed25519(seed, "m/0'");
    expect(bytesToHex(node.chainCode)).toBe('8b59aa11380b624e81507a27fedda59fea6d0b779a778918a2fd3590e16e9c69');
    expect(bytesToHex(node.key)).toBe('68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3');
  });
  it("vetor oficial m/0'/1'/2'/2'/1000000000'", () => {
    const seed = hexToBytes('000102030405060708090a0b0c0d0e0f');
    const node = slip10Ed25519(seed, "m/0'/1'/2'/2'/1000000000'");
    expect(bytesToHex(node.key)).toBe('8f94d394a8e8fd6b1bc2f3f49f5c47e385281d5c17e65324b0f62483e37e8793');
  });
  it('rejeita caminho não hardened', () => {
    expect(() => slip10Ed25519(new Uint8Array(16), 'm/0')).toThrow();
  });
});

describe('Solana', () => {
  const seed = mnemonicToSeed(MNEMONIC);
  it('principal é determinística e máscaras diferem', () => {
    const main = deriveSolanaMain(seed);
    expect(main.address).toBe(deriveSolanaMain(seed).address);
    const m1 = deriveSolanaMask(seed, { origin: 'a.example' });
    const m2 = deriveSolanaMask(seed, { origin: 'a.example', rotation: 1 });
    expect(m1.address).not.toBe(main.address);
    expect(m1.address).not.toBe(m2.address);
    expect(m1.path).toBe(`m/44'/501'/${m1.index}'/1'`);
  });
});

describe('frase', () => {
  it('gera e valida', () => {
    const m = newMnemonic();
    expect(m.split(' ')).toHaveLength(12);
    expect(isValidMnemonic(m)).toBe(true);
    expect(isValidMnemonic('abandon abandon')).toBe(false);
  });
});

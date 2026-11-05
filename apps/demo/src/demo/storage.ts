import { isValidMnemonic, newMnemonic } from '@sandbox-wallet/core';

const KEY = 'sandbox-wallet-demo-mnemonic';

export function loadMnemonic(): string | null {
  try {
    const m = localStorage.getItem(KEY);
    return m && isValidMnemonic(m) ? m : null;
  } catch {
    return null;
  }
}

export function createMnemonic(): string {
  const m = newMnemonic();
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* sem storage: a frase vive só nesta aba */
  }
  return m;
}

export function clearMnemonic() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

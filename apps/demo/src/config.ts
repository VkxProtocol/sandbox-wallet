// Configuração das redes da demonstração.
// Endereços vazios = o app implanta/cunha na hora usando a tesouraria (mais lento).
// Depois de rodar `npm run setup:devnet` / `npm run setup:bsc`, cole os endereços aqui.

export type NetworkId = 'solana-devnet' | 'bsc-testnet' | 'local';

export const SCAM_SITE = 'airdrop-gratis.example';

export const SOLANA = {
  rpc: 'https://api.devnet.solana.com',
  explorerTx: (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
  explorerAddr: (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`,
  /** Mint do USDX de demonstração (autoridade = tesouraria). Vazio = cria na hora. */
  usdxMint: '3x8CwnBNhAV4pdHjr4k2q9oQpWRWaDoCKhShsGTCPsYv',
  decimals: 6,
  /** Quanto a tesouraria dá para cada carteira de demonstração. */
  setupSol: 0.05,
  setupUsdx: 1000n,
  /** Orçamento de uma sessão com o site. */
  budgetSol: 0.01,
  budgetUsdx: 100n,
};

export const EVM: Record<'bsc-testnet' | 'local', {
  name: string;
  rpc: string;
  chainId: number;
  explorerTx: (h: string) => string;
  explorerAddr: (a: string) => string;
  usdx: string;
  drainer: string;
  symbol: string;
}> = {
  'bsc-testnet': {
    name: 'BNB Smart Chain testnet',
    rpc: 'https://bsc-testnet-rpc.publicnode.com',
    chainId: 97,
    explorerTx: (h) => `https://testnet.bscscan.com/tx/${h}`,
    explorerAddr: (a) => `https://testnet.bscscan.com/address/${a}`,
    usdx: '0x6E290E400d176a5fFc9B2C47089605392bBC65e3',
    drainer: '0xB0B6Bf0e7e2aAC4e45Dcb8df4F6B161b598A43B2',
    symbol: 'tBNB',
  },
  local: {
    name: 'Nó local (Hardhat)',
    rpc: 'http://127.0.0.1:8545',
    chainId: 31337,
    explorerTx: (h) => `#${h}`,
    explorerAddr: (a) => `#${a}`,
    usdx: '',
    drainer: '',
    symbol: 'ETH',
  },
};

export const EVM_AMOUNTS = {
  decimals: 18,
  setupNative: '0.02',
  setupUsdx: 1000n,
  budgetNative: '0.005',
  budgetUsdx: 100n,
};

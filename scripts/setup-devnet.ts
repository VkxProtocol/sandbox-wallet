// Prepara a Solana devnet para a demonstração web: cria o mint USDX com a
// tesouraria como autoridade e imprime o endereço para colar em
// apps/demo/src/config.ts (SOLANA.usdxMint).
//
// Antes: carregar SOLANA_TREASURY_ADDRESS em https://faucet.solana.com
// Uso:   npm run setup:devnet

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMint } from '@solana/spl-token';
import { SOLANA_TREASURY_SECRET, SOLANA_TREASURY_ADDRESS } from '../apps/demo/src/treasury';

const RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';

async function main() {
  const connection = new Connection(RPC, 'confirmed');
  const treasury = Keypair.fromSecretKey(SOLANA_TREASURY_SECRET);
  const bal = await connection.getBalance(treasury.publicKey);
  console.log(`tesouraria ${SOLANA_TREASURY_ADDRESS}: ${bal / LAMPORTS_PER_SOL} SOL`);
  if (bal < 0.1 * LAMPORTS_PER_SOL) {
    console.error('Tesouraria sem SOL de teste. Carregue em https://faucet.solana.com e rode de novo.');
    process.exit(1);
  }
  const mint = await createMint(connection, treasury, treasury.publicKey, null, 6);
  console.log(`\nmint USDX criado: ${mint.toBase58()}`);
  console.log(`cole em apps/demo/src/config.ts -> SOLANA.usdxMint = '${mint.toBase58()}'`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

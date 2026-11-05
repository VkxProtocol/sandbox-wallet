// Demonstração completa em Solana devnet, sem nenhuma configuração:
//   1. cria uma carteira (frase nova), pega SOL de teste no faucet
//   2. cunha um token de demonstração ("USDX") para a carteira principal
//   3. cria a máscara para o site "golpe.example" e abastece com o orçamento
//   4. o site golpe monta uma transação que leva TUDO da conta conectada
//   5. a máscara assina (o usuário "caiu no golpe")
//   6. resultado: a máscara ficou vazia; a principal continua intacta
//   7. varredura: o que sobrou (rent das contas) volta para a principal
//
// Uso: npm run demo:solana        (opcional: SOLANA_RPC=... para outro RPC)

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
  createAssociatedTokenAccountIdempotentInstruction,
  createMint,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import {
  SolanaSession,
  deriveSolanaMain,
  deriveSolanaMask,
  formatUnits,
  mnemonicToSeed,
  newMnemonic,
} from '@sandbox-wallet/core';

const RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';
const DECIMALS = 6;
const SITE = 'golpe.example';

function log(step: string, msg: string) {
  console.log(`\n[${step}] ${msg}`);
}

async function airdrop(connection: Connection, to: PublicKey, sol: number) {
  const sig = await connection.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash('confirmed');
  await connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed');
}

/** O que um site golpe faz: uma transação que esvazia a conta conectada. */
function buildDrainTx(victim: PublicKey, attacker: PublicKey, mints: PublicKey[], victimLamports: number, tokenAmounts: bigint[]) {
  const tx = new Transaction();
  mints.forEach((mint, i) => {
    const from = getAssociatedTokenAddressSync(mint, victim);
    const to = getAssociatedTokenAddressSync(mint, attacker);
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(victim, to, attacker, mint),
      createTransferInstruction(from, to, victim, tokenAmounts[i]),
    );
  });
  // Leva o SOL também, deixando só o rent mínimo + taxa para a tx passar.
  const keep = 900_000 + 5_000 * 2;
  if (victimLamports > keep) {
    tx.add(SystemProgram.transfer({ fromPubkey: victim, toPubkey: attacker, lamports: victimLamports - keep }));
  }
  return tx;
}

async function main() {
  const connection = new Connection(RPC, 'confirmed');

  log('1', 'Criando carteira nova e pedindo SOL de teste...');
  const mnemonic = newMnemonic();
  const seed = mnemonicToSeed(mnemonic);
  const main = deriveSolanaMain(seed);
  await airdrop(connection, main.keypair.publicKey, 2);
  console.log(`    principal: ${main.address}`);

  log('2', 'Cunhando token de demonstração USDX para a principal...');
  const mint = await createMint(connection, main.keypair, main.keypair.publicKey, null, DECIMALS);
  const mainAta = await getOrCreateAssociatedTokenAccount(connection, main.keypair, mint, main.keypair.publicKey);
  await mintTo(connection, main.keypair, mint, mainAta.address, main.keypair, 1_000n * 10n ** BigInt(DECIMALS));
  console.log(`    mint: ${mint.toBase58()}  saldo principal: 1000 USDX`);

  log('3', `Criando máscara para ${SITE} e abastecendo com orçamento (0.05 SOL + 100 USDX)...`);
  const mask = deriveSolanaMask(seed, { origin: SITE });
  const session = new SolanaSession({ connection, main: main.keypair, mask: mask.keypair });
  await session.fund({
    native: BigInt(0.05 * LAMPORTS_PER_SOL),
    tokens: [{ id: mint.toBase58(), amount: 100n * 10n ** BigInt(DECIMALS) }],
  });
  console.log(`    máscara: ${mask.address}  (caminho ${mask.path})`);
  await printBalances(session, 'antes do golpe');

  log('4', 'Site golpe monta uma transação que leva tudo da conta conectada (a máscara)...');
  const attacker = Keypair.generate();
  const maskBal = await session.balances('mask');
  const drainTx = buildDrainTx(mask.keypair.publicKey, attacker.publicKey, [mint], Number(maskBal.lamports), [maskBal.tokens[0].amount]);

  log('5', 'Usuário assina sem ler (caiu no golpe)...');
  const sig = await sendAndConfirmTransaction(connection, drainTx, [mask.keypair], { commitment: 'confirmed' });
  console.log(`    tx do dreno: ${sig}`);

  log('6', 'Resultado:');
  await printBalances(session, 'depois do golpe');
  const mainAfter = await session.balances('main');
  const ok = mainAfter.tokens[0].amount === 900n * 10n ** BigInt(DECIMALS);
  console.log(`    => principal intacta com 900 USDX: ${ok ? 'SIM' : 'NÃO'}`);
  console.log(`    => o golpe levou no máximo o orçamento da sessão (100 USDX + 0.05 SOL)`);

  log('7', 'Varredura: devolvendo o que sobrou na máscara...');
  const sweep = await session.sweep();
  console.log(`    assinaturas: ${sweep.signatures.join(', ') || '(nada a devolver)'}`);
  await printBalances(session, 'após varredura');

  if (!ok) {
    console.error('FALHA: a principal foi afetada');
    process.exit(1);
  }
}

async function printBalances(session: SolanaSession, label: string) {
  const m = await session.balances('main');
  const k = await session.balances('mask');
  console.log(`    [${label}] principal: ${formatUnits(m.lamports, 9, 4)} SOL, ${formatUnits(m.tokens[0]?.amount ?? 0n, DECIMALS)} USDX`);
  console.log(`    [${label}] máscara:   ${formatUnits(k.lamports, 9, 4)} SOL, ${formatUnits(k.tokens[0]?.amount ?? 0n, DECIMALS)} USDX`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

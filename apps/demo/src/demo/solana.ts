// Driver da demonstração em Solana devnet.
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
  createInitializeMint2Instruction,
  createMintToInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  SolanaSession,
  deriveSolanaMain,
  deriveSolanaMask,
  formatUnits,
  mnemonicToSeed,
} from '@sandbox-wallet/core';
import { SCAM_SITE, SOLANA } from '../config';
import { SOLANA_TREASURY_ADDRESS, SOLANA_TREASURY_SECRET } from '../treasury';
import { clearMnemonic, createMnemonic, loadMnemonic } from './storage';
import type { ConnectMode, DemoDriver, DemoState, LogEntry } from './types';

type Log = (e: Omit<LogEntry, 't'>) => void;

const D = SOLANA.decimals;
const U = 10n ** BigInt(D);

export function createSolanaDriver(log: Log): DemoDriver {
  const connection = new Connection(SOLANA.rpc, 'confirmed');
  const treasury = Keypair.fromSecretKey(SOLANA_TREASURY_SECRET);
  const attacker = Keypair.generate();

  let mnemonic = loadMnemonic();
  let main: Keypair | null = null;
  let mint: PublicKey | null = SOLANA.usdxMint ? new PublicKey(SOLANA.usdxMint) : null;
  let session: SolanaSession | null = null;
  let connectedAs: ConnectMode | null = null;

  function seedFrom(m: string) {
    return mnemonicToSeed(m);
  }

  async function ensureMint(): Promise<PublicKey> {
    if (mint) return mint;
    const kp = Keypair.generate();
    const lamports = await getMinimumBalanceForRentExemptMint(connection);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: treasury.publicKey,
        newAccountPubkey: kp.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(kp.publicKey, D, treasury.publicKey, null),
    );
    await sendAndConfirmTransaction(connection, tx, [treasury, kp], { commitment: 'confirmed' });
    mint = kp.publicKey;
    log({ who: 'rede', text: `Token USDX de demonstração cunhado: ${mint.toBase58()}`, link: SOLANA.explorerAddr(mint.toBase58()) });
    return mint;
  }

  async function usdxOf(owner: PublicKey): Promise<bigint> {
    if (!mint) return 0n;
    try {
      return (await getAccount(connection, getAssociatedTokenAddressSync(mint, owner), 'confirmed')).amount;
    } catch {
      return 0n;
    }
  }

  async function balanceOf(owner: PublicKey) {
    const lamports = BigInt(await connection.getBalance(owner, 'confirmed'));
    return { native: formatUnits(lamports, 9, 4) + ' SOL', usdx: formatUnits(await usdxOf(owner), D) + ' USDX' };
  }

  return {
    async setup() {
      const treasuryLamports = await connection.getBalance(treasury.publicKey, 'confirmed');
      if (treasuryLamports < 0.1 * LAMPORTS_PER_SOL) {
        throw new Error(`A tesouraria de teste está sem SOL (${SOLANA_TREASURY_ADDRESS}). Carregue em https://faucet.solana.com (rede Devnet) e tente de novo.`);
      }
      mnemonic = createMnemonic();
      main = deriveSolanaMain(seedFrom(mnemonic)).keypair;
      session = null;
      connectedAs = null;
      log({ who: 'carteira', text: `Carteira nova criada. Principal: ${main.publicKey.toBase58()}`, link: SOLANA.explorerAddr(main.publicKey.toBase58()) });
      try {
      const m = await ensureMint();
      const ata = getAssociatedTokenAddressSync(m, main.publicKey);
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey: main.publicKey, lamports: SOLANA.setupSol * LAMPORTS_PER_SOL }),
        createAssociatedTokenAccountIdempotentInstruction(treasury.publicKey, ata, main.publicKey, m),
        createMintToInstruction(m, ata, treasury.publicKey, SOLANA.setupUsdx * U),
      );
      const sig = await sendAndConfirmTransaction(connection, tx, [treasury], { commitment: 'confirmed' });
      log({ who: 'rede', text: `Tesouraria de teste depositou ${SOLANA.setupSol} SOL e ${SOLANA.setupUsdx} USDX na principal`, link: SOLANA.explorerTx(sig) });
      } catch (e) {
        // Criação é tudo ou nada: sem abastecimento, volta ao início.
        this.reset();
        throw e;
      }
    },

    async connect(mode) {
      if (!main || !mint) throw new Error('crie a carteira primeiro');
      if (mode === 'main') {
        connectedAs = 'main';
        log({ who: 'carteira', text: `Conectado com a CARTEIRA PRINCIPAL (modo carteira comum): ${main.publicKey.toBase58()}` });
        return;
      }
      const mask = deriveSolanaMask(seedFrom(mnemonic!), { origin: SCAM_SITE });
      session = new SolanaSession({ connection, main, mask: mask.keypair, knownMints: [mint.toBase58()] });
      log({ who: 'carteira', text: `Máscara para ${SCAM_SITE}: ${mask.address} (caminho ${mask.path})`, link: SOLANA.explorerAddr(mask.address) });
      const { signature } = await session.fund({
        native: BigInt(Math.round(SOLANA.budgetSol * LAMPORTS_PER_SOL)),
        tokens: [{ id: mint.toBase58(), amount: SOLANA.budgetUsdx * U }],
      });
      connectedAs = 'mask';
      log({ who: 'carteira', text: `Máscara abastecida com o orçamento: ${SOLANA.budgetSol} SOL + ${SOLANA.budgetUsdx} USDX. Site conectado à máscara.`, link: SOLANA.explorerTx(signature) });
    },

    async drain() {
      if (!main || !mint || !connectedAs) throw new Error('conecte primeiro');
      const victim = connectedAs === 'mask' ? session!.mask : main;
      const lamports = await connection.getBalance(victim.publicKey, 'confirmed');
      const usdx = await usdxOf(victim.publicKey);
      const tx = new Transaction();
      if (usdx > 0n) {
        const from = getAssociatedTokenAddressSync(mint, victim.publicKey);
        const to = getAssociatedTokenAddressSync(mint, attacker.publicKey);
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(victim.publicKey, to, attacker.publicKey, mint),
          createTransferInstruction(from, to, victim.publicKey, usdx),
        );
      }
      const keep = 900_000 + 10_000; // rent mínimo + taxa
      if (lamports > keep) {
        tx.add(SystemProgram.transfer({ fromPubkey: victim.publicKey, toPubkey: attacker.publicKey, lamports: lamports - keep }));
      }
      log({ who: 'site', text: `"Assine para resgatar o airdrop": a transação na verdade move ${formatUnits(usdx, D)} USDX e ${formatUnits(BigInt(Math.max(lamports - keep, 0)), 9, 4)} SOL para o golpista.` });
      const sig = await sendAndConfirmTransaction(connection, tx, [victim], { commitment: 'confirmed' });
      log({ who: 'rede', text: `Dreno confirmado. Golpista: ${attacker.publicKey.toBase58()}`, link: SOLANA.explorerTx(sig) });
    },

    async sweep() {
      if (!session) return;
      const r = await session.sweep();
      log({ who: 'carteira', text: `Varredura: ${r.tokensSwept.length} token(s) e ${formatUnits(r.lamportsSwept, 9, 4)} SOL de volta para a principal (contas fechadas, rent recuperado).`, link: r.signatures[0] ? SOLANA.explorerTx(r.signatures[0]) : undefined });
      connectedAs = null;
    },

    reset() {
      clearMnemonic();
      mnemonic = null;
      main = null;
      session = null;
      connectedAs = null;
    },

    async state(): Promise<DemoState> {
      if (!main) {
        if (mnemonic) main = deriveSolanaMain(seedFrom(mnemonic)).keypair;
        else return { ready: false, mainAddress: '', maskAddress: null, connectedAs: null, connectedAddress: null, main: { native: '-', usdx: '-' }, mask: null, attackerUsdx: '0 USDX' };
      }
      const mainBal = await balanceOf(main.publicKey);
      const maskBal = session ? await balanceOf(session.mask.publicKey) : null;
      const connectedAddress = connectedAs === 'mask' ? session!.maskAddress : connectedAs === 'main' ? main.publicKey.toBase58() : null;
      return {
        ready: true,
        mainAddress: main.publicKey.toBase58(),
        maskAddress: session?.maskAddress ?? null,
        connectedAs,
        connectedAddress,
        main: mainBal,
        mask: maskBal,
        attackerUsdx: formatUnits(await usdxOf(attacker.publicKey), D) + ' USDX',
      };
    },
  };
}

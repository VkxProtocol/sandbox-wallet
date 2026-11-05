// Driver da demonstração em EVM (BSC testnet ou nó local Hardhat).
import { Contract, ContractFactory, JsonRpcProvider, MaxUint256, Wallet, parseEther } from 'ethers';
import {
  ERC20_ABI,
  EvmSession,
  deriveEvmMain,
  deriveEvmMask,
  formatUnits,
  mnemonicToSeed,
} from '@sandbox-wallet/core';
import artifacts from '../../../../contracts/build/artifacts.json';
import { EVM, EVM_AMOUNTS, SCAM_SITE } from '../config';
import { EVM_TREASURY_PRIVATE_KEY } from '../treasury';
import { clearMnemonic, createMnemonic, loadMnemonic } from './storage';
import type { ConnectMode, DemoDriver, DemoState, LogEntry } from './types';

type Log = (e: Omit<LogEntry, 't'>) => void;

// Conta 0 do Hardhat: só existe no nó local.
const HARDHAT_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const D = EVM_AMOUNTS.decimals;
const U = 10n ** BigInt(D);

export function createEvmDriver(net: 'bsc-testnet' | 'local', log: Log): DemoDriver {
  const cfg = EVM[net];
  const provider = new JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: true });
  const treasury = new Wallet(net === 'local' ? HARDHAT_KEY : EVM_TREASURY_PRIVATE_KEY, provider);

  let mnemonic = loadMnemonic();
  let main: Wallet | null = null;
  let mainKey = '';
  let usdx = cfg.usdx;
  let drainer = cfg.drainer;
  let attacker = '';
  let session: EvmSession | null = null;
  let connectedAs: ConnectMode | null = null;

  async function ensureContracts() {
    if (!usdx) {
      const c = await new ContractFactory(artifacts.DemoToken.abi, artifacts.DemoToken.bytecode, treasury).deploy('Demo USD', 'USDX', D);
      await c.waitForDeployment();
      usdx = await c.getAddress();
      log({ who: 'rede', text: `Token USDX de demonstração implantado: ${usdx}`, link: cfg.explorerAddr(usdx) });
    }
    if (!drainer) {
      attacker = Wallet.createRandom().address;
      const c = await new ContractFactory(artifacts.Drainer.abi, artifacts.Drainer.bytecode, treasury).deploy(attacker);
      await c.waitForDeployment();
      drainer = await c.getAddress();
      log({ who: 'rede', text: `Contrato drenador do golpista implantado: ${drainer}`, link: cfg.explorerAddr(drainer) });
    }
    if (!attacker) attacker = (await new Contract(drainer, ['function attacker() view returns (address)'], provider).attacker()) as string;
  }

  function token(signer?: Wallet) {
    return new Contract(usdx, ERC20_ABI, signer ?? provider);
  }

  async function balanceOf(addr: string) {
    const native = await provider.getBalance(addr);
    const t = usdx ? ((await token().balanceOf(addr)) as bigint) : 0n;
    return { native: `${formatUnits(native, 18, 5)} ${cfg.symbol}`, usdx: `${formatUnits(t, D)} USDX` };
  }

  function loadMain(m: string) {
    const acc = deriveEvmMain(mnemonicToSeed(m));
    mainKey = acc.privateKey;
    main = new Wallet(acc.privateKey, provider);
  }

  return {
    async setup() {
      let treasuryBal: bigint;
      try {
        treasuryBal = await provider.getBalance(treasury.address);
      } catch {
        throw new Error(net === 'local' ? 'Nó local não respondeu. Rode `npx hardhat node` e tente de novo.' : `A rede ${cfg.name} não respondeu. Tente de novo em instantes.`);
      }
      if (treasuryBal < parseEther('0.05')) {
        throw new Error(`A tesouraria de teste está sem ${cfg.symbol} (${treasury.address}). Carregue em https://www.bnbchain.org/en/testnet-faucet e tente de novo.`);
      }
      mnemonic = createMnemonic();
      loadMain(mnemonic);
      session = null;
      connectedAs = null;
      log({ who: 'carteira', text: `Carteira nova criada. Principal: ${main!.address}`, link: cfg.explorerAddr(main!.address) });
      try {
      await ensureContracts();
      const tx1 = await treasury.sendTransaction({ to: main!.address, value: parseEther(EVM_AMOUNTS.setupNative) });
      await tx1.wait();
      const tx2 = await new Contract(usdx, artifacts.DemoToken.abi, treasury).mint(main!.address, EVM_AMOUNTS.setupUsdx * U);
      await tx2.wait();
      log({ who: 'rede', text: `Tesouraria de teste depositou ${EVM_AMOUNTS.setupNative} ${cfg.symbol} e ${EVM_AMOUNTS.setupUsdx} USDX na principal`, link: cfg.explorerTx(tx2.hash) });
      } catch (e) {
        // Criação é tudo ou nada: sem abastecimento, volta ao início.
        this.reset();
        throw e;
      }
    },

    async connect(mode) {
      if (!main) throw new Error('crie a carteira primeiro');
      await ensureContracts();
      if (mode === 'main') {
        connectedAs = 'main';
        log({ who: 'carteira', text: `Conectado com a CARTEIRA PRINCIPAL (modo carteira comum): ${main.address}` });
        return;
      }
      const mask = deriveEvmMask(mnemonicToSeed(mnemonic!), { origin: SCAM_SITE });
      session = new EvmSession({ provider, mainPrivateKey: mainKey, maskPrivateKey: mask.privateKey, knownTokens: [usdx] });
      log({ who: 'carteira', text: `Máscara para ${SCAM_SITE}: ${mask.address} (caminho ${mask.path})`, link: cfg.explorerAddr(mask.address) });
      const r = await session.fund({ native: parseEther(EVM_AMOUNTS.budgetNative), tokens: [{ id: usdx, amount: EVM_AMOUNTS.budgetUsdx * U }] });
      connectedAs = 'mask';
      log({ who: 'carteira', text: `Máscara abastecida com o orçamento: ${EVM_AMOUNTS.budgetNative} ${cfg.symbol} + ${EVM_AMOUNTS.budgetUsdx} USDX. Site conectado à máscara.`, link: cfg.explorerTx(r.txHashes[r.txHashes.length - 1]) });
    },

    async drain() {
      if (!main || !connectedAs) throw new Error('conecte primeiro');
      const victim = connectedAs === 'mask' ? session!.mask : main;
      log({ who: 'site', text: '"Aprove USDX para resgatar o airdrop": o pedido é um approve ILIMITADO para o contrato do golpista.' });
      const a = await token(victim).approve(drainer, MaxUint256);
      await a.wait();
      log({ who: 'rede', text: `Approve ilimitado confirmado (${victim.address} -> drenador)`, link: cfg.explorerTx(a.hash) });
      const d = new Contract(drainer, artifacts.Drainer.abi, treasury);
      const tx = await d.drain(victim.address, [usdx]);
      await tx.wait();
      log({ who: 'rede', text: `Golpista chamou drain(): puxou todo o USDX aprovado numa única transação. Golpista: ${attacker}`, link: cfg.explorerTx(tx.hash) });
    },

    async sweep() {
      if (!session) return;
      const r = await session.sweep();
      log({ who: 'carteira', text: `Varredura: ${r.tokensSwept.length} token(s) e ${formatUnits(r.nativeSwept, 18, 5)} ${cfg.symbol} de volta para a principal.`, link: r.txHashes[0] ? cfg.explorerTx(r.txHashes[0]) : undefined });
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
        if (mnemonic) loadMain(mnemonic);
        else return { ready: false, mainAddress: '', maskAddress: null, connectedAs: null, connectedAddress: null, main: { native: '-', usdx: '-' }, mask: null, attackerUsdx: '0 USDX' };
      }
      const mainBal = await balanceOf(main!.address);
      const maskBal = session ? await balanceOf(session.maskAddress) : null;
      const attackerBal = attacker && usdx ? formatUnits((await token().balanceOf(attacker)) as bigint, D) + ' USDX' : '0 USDX';
      return {
        ready: true,
        mainAddress: main!.address,
        maskAddress: session?.maskAddress ?? null,
        connectedAs,
        connectedAddress: connectedAs === 'mask' ? session!.maskAddress : connectedAs === 'main' ? main!.address : null,
        main: mainBal,
        mask: maskBal,
        attackerUsdx: attackerBal,
      };
    },
  };
}

// Demonstração completa em EVM (nó local Hardhat ou BSC testnet):
//   1. carteira principal (frase nova) recebe BNB/ETH de teste e 1000 USDX
//   2. máscara para "golpe.example" é abastecida com 100 USDX + gás
//   3. site golpe pede "approve ilimitado" e a máscara assina (caiu no golpe)
//   4. o contrato Drainer puxa tudo o que a máscara aprovou, numa tx só
//   5. resultado: a máscara ficou vazia; a principal continua com 900 USDX
//   6. varredura: sobras da máscara voltam para a principal
//
// Uso local:   npx hardhat node   (em outro terminal)   e depois   npm run demo:evm
// BSC testnet: EVM_RPC=https://bsc-testnet-rpc.publicnode.com FUNDER_PRIVATE_KEY=0x... npm run demo:evm
//   (a FUNDER é só quem tem BNB de teste; a carteira principal da demo é criada na hora)

import { readFileSync } from 'node:fs';
import { Contract, ContractFactory, JsonRpcProvider, MaxUint256, Wallet, parseEther } from 'ethers';
import {
  ERC20_ABI,
  EvmSession,
  deriveEvmMain,
  deriveEvmMask,
  formatUnits,
  mnemonicToSeed,
  newMnemonic,
} from '@sandbox-wallet/core';

const RPC = process.env.EVM_RPC ?? 'http://127.0.0.1:8545';
// Conta 0 padrão do Hardhat (só vale no nó local).
const HARDHAT_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const FUNDER_KEY = process.env.FUNDER_PRIVATE_KEY ?? HARDHAT_KEY;
const DECIMALS = 18;
const SITE = 'golpe.example';
const U = 10n ** BigInt(DECIMALS);

const artifacts = JSON.parse(readFileSync(new URL('../contracts/build/artifacts.json', import.meta.url), 'utf8'));

function log(step: string, msg: string) {
  console.log(`\n[${step}] ${msg}`);
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const funder = new Wallet(FUNDER_KEY, provider);
  const net = await provider.getNetwork();
  console.log(`rede: chainId ${net.chainId}  rpc: ${RPC}`);

  log('1', 'Criando carteira principal (frase nova) e abastecendo com moeda de teste...');
  const seed = mnemonicToSeed(newMnemonic());
  const mainAcc = deriveEvmMain(seed);
  const main = new Wallet(mainAcc.privateKey, provider);
  await (await funder.sendTransaction({ to: main.address, value: parseEther(process.env.FUND_NATIVE ?? '0.05') })).wait();

  const token = await new ContractFactory(artifacts.DemoToken.abi, artifacts.DemoToken.bytecode, funder).deploy('Demo USD', 'USDX', DECIMALS);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  await (await (token as Contract).mint(main.address, 1000n * U)).wait();
  console.log(`    principal: ${main.address}`);
  console.log(`    token USDX: ${tokenAddr}  saldo principal: 1000 USDX`);

  log('2', `Criando máscara para ${SITE} e abastecendo (gás + 100 USDX)...`);
  const maskAcc = deriveEvmMask(seed, { origin: SITE });
  const session = new EvmSession({ provider, mainPrivateKey: mainAcc.privateKey, maskPrivateKey: maskAcc.privateKey });
  await session.fund({ native: parseEther(process.env.MASK_NATIVE ?? '0.01'), tokens: [{ id: tokenAddr, amount: 100n * U }] });
  console.log(`    máscara: ${maskAcc.address}  (caminho ${maskAcc.path})`);
  await printBalances(session, 'antes do golpe');

  log('3', 'Site golpe: "aprove USDX ilimitado para continuar". A máscara assina...');
  const attacker = Wallet.createRandom().address;
  const drainer = await new ContractFactory(artifacts.Drainer.abi, artifacts.Drainer.bytecode, funder).deploy(attacker);
  await drainer.waitForDeployment();
  const drainerAddr = await drainer.getAddress();
  const tokenAsMask = new Contract(tokenAddr, ERC20_ABI, session.mask);
  await (await tokenAsMask.approve(drainerAddr, MaxUint256)).wait();
  console.log(`    allowance máscara -> drenador: ${(await session.allowance(tokenAddr, drainerAddr)) === MaxUint256 ? 'ILIMITADA' : 'limitada'}`);

  log('4', 'Drenador puxa tudo que foi aprovado, numa única transação...');
  const tx = await (drainer as Contract).drain(session.maskAddress, [tokenAddr]);
  await tx.wait();
  console.log(`    tx do dreno: ${tx.hash}`);

  log('5', 'Resultado:');
  await printBalances(session, 'depois do golpe');
  const mainBal = await session.balances('main');
  const attackerBal = (await new Contract(tokenAddr, ERC20_ABI, provider).balanceOf(attacker)) as bigint;
  const ok = mainBal.tokens[0].amount === 900n * U && attackerBal === 100n * U;
  console.log(`    atacante levou: ${formatUnits(attackerBal, DECIMALS)} USDX (o orçamento da sessão, nada mais)`);
  console.log(`    => principal intacta com 900 USDX: ${ok ? 'SIM' : 'NÃO'}`);

  log('6', 'Varredura: devolvendo sobras da máscara para a principal...');
  const sweep = await session.sweep();
  console.log(`    txs: ${sweep.txHashes.length}  nativo devolvido: ${formatUnits(sweep.nativeSwept, 18)}  restou: ${formatUnits(sweep.nativeLeft, 18)}`);
  await printBalances(session, 'após varredura');

  if (!ok) {
    console.error('FALHA: a principal foi afetada');
    process.exit(1);
  }
}

async function printBalances(session: EvmSession, label: string) {
  const m = await session.balances('main');
  const k = await session.balances('mask');
  console.log(`    [${label}] principal: ${formatUnits(m.native, 18, 5)} nativo, ${formatUnits(m.tokens[0]?.amount ?? 0n, DECIMALS)} USDX`);
  console.log(`    [${label}] máscara:   ${formatUnits(k.native, 18, 5)} nativo, ${formatUnits(k.tokens[0]?.amount ?? 0n, DECIMALS)} USDX`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

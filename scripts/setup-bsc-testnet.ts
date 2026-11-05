// Prepara a BSC testnet para a demonstração web: implanta DemoToken (USDX) e
// Drainer com a tesouraria e imprime os endereços para colar em
// apps/demo/src/config.ts (EVM['bsc-testnet'].usdx / .drainer).
//
// Antes: carregar EVM_TREASURY_ADDRESS em https://www.bnbchain.org/en/testnet-faucet
// Uso:   npm run setup:bsc

import { readFileSync } from 'node:fs';
import { ContractFactory, JsonRpcProvider, Wallet, formatEther } from 'ethers';
import { EVM_TREASURY_PRIVATE_KEY, EVM_TREASURY_ADDRESS } from '../apps/demo/src/treasury';

const RPC = process.env.EVM_RPC ?? 'https://bsc-testnet-rpc.publicnode.com';
const artifacts = JSON.parse(readFileSync(new URL('../contracts/build/artifacts.json', import.meta.url), 'utf8'));

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const treasury = new Wallet(EVM_TREASURY_PRIVATE_KEY, provider);
  const bal = await provider.getBalance(treasury.address);
  console.log(`tesouraria ${EVM_TREASURY_ADDRESS}: ${formatEther(bal)} tBNB`);
  if (bal < 10n ** 16n) {
    console.error('Tesouraria sem tBNB. Carregue em https://www.bnbchain.org/en/testnet-faucet e rode de novo.');
    process.exit(1);
  }
  const token = await new ContractFactory(artifacts.DemoToken.abi, artifacts.DemoToken.bytecode, treasury).deploy('Demo USD', 'USDX', 18);
  await token.waitForDeployment();
  const attacker = Wallet.createRandom().address;
  const drainer = await new ContractFactory(artifacts.Drainer.abi, artifacts.Drainer.bytecode, treasury).deploy(attacker);
  await drainer.waitForDeployment();
  console.log(`\nUSDX:    ${await token.getAddress()}`);
  console.log(`Drainer: ${await drainer.getAddress()}  (golpista: ${attacker})`);
  console.log(`cole em apps/demo/src/config.ts -> EVM['bsc-testnet'].usdx e .drainer`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

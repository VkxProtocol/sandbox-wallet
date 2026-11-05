// Compila contracts/*.sol com solc-js e grava ABI + bytecode em contracts/artifacts.json.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const solc = require('solc');

const dir = join(process.cwd(), 'contracts');
const sources: Record<string, { content: string }> = {};
for (const f of readdirSync(dir)) {
  if (f.endsWith('.sol')) sources[f] = { content: readFileSync(join(dir, f), 'utf8') };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors ?? []).filter((e: { severity: string }) => e.severity === 'error');
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}

const artifacts: Record<string, { abi: unknown; bytecode: string }> = {};
for (const file of Object.keys(out.contracts)) {
  for (const name of Object.keys(out.contracts[file])) {
    const c = out.contracts[file][name];
    artifacts[name] = { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
  }
}
mkdirSync(join(dir, 'build'), { recursive: true });
writeFileSync(join(dir, 'build', 'artifacts.json'), JSON.stringify(artifacts, null, 2));
console.log(`compilado: ${Object.keys(artifacts).join(', ')}`);

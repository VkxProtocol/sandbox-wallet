# Sandbox Wallet

**A carteira que usa máscaras.** Quem fala com o site é uma máscara com orçamento limitado. A carteira principal nunca aparece.

Projeto para o Hack Brasil 2026, trilha Cibersegurança. Página pública: https://vkxprotocol.github.io/sandbox-wallet/ · Demonstração ao vivo: https://vkxprotocol.github.io/sandbox-wallet/app/

## O problema

Todo golpe de "aprovação" funciona do mesmo jeito. Um site pede uma assinatura inocente ("resgatar airdrop", "aprovar para continuar") e essa assinatura dá ao golpista o poder de mover tudo o que está na carteira conectada. As carteiras de hoje conectam a carteira **inteira** ao site. Os simuladores (Blockaid, Pocket Universe, Rabby) avisam antes de assinar, mas o aviso é ignorado por quem está com pressa, e um site golpe bem feito engana a simulação. Em Solana nem existe "aprovação": a própria transação assinada pode levar qualquer token da conta.

Depois que a pessoa assina, nenhuma carteira do mundo consegue impedir o dreno. Então a pergunta certa não é "como avisar melhor", e sim "como fazer o dreno não valer a pena".

## A solução

Nunca conectar a carteira principal. Para cada site, a carteira deriva uma **máscara**: um endereço calculado a partir da mesma frase de recuperação e do nome do site. A máscara recebe só o **orçamento** que o usuário definiu para aquela sessão. O site conecta, aprova, assina e opera com a máscara. O resultado volta direto para a principal. No fim, as sobras são varridas de volta.

| | Carteira comum | Sandbox Wallet |
|---|---|---|
| Site golpe pede aprovação, usuário assina | golpista leva 100% da carteira | golpista leva só o orçamento da máscara |
| Assinatura Permit (sem gás) falsa | vale sobre a carteira inteira | vale sobre a máscara |
| Solana: transação que move qualquer token | leva tudo | alcança só a máscara |
| O site precisa mudar algo? | | não: a máscara é uma carteira comum para ele |

O que a máscara **não** resolve: frase de recuperação vazada (as máscaras derivam da mesma frase) e golpes em que a própria pessoa transfere o dinheiro. Isso é outro problema, com outra solução.

## Como funciona por dentro

- **Derivação determinística.** `índice = primeiros 4 bytes de sha256("sandbox-wallet/v1/" + site + "/" + rotação)`, limitado a 2^31-1. EVM: `m/44'/60'/1'/0/{índice}`. Solana (SLIP-0010): `m/44'/501'/{índice}'/1'`. Caminhos propositalmente fora dos que as carteiras usam, para nunca colidir com contas existentes.
- **Recuperável.** Frase + nome do site recriam a máscara em qualquer aparelho. "Trocar de máscara" é subir a rotação.
- **Orçamento.** Abastecimento numa única transação (Solana) ou em lote (EVM). O site nunca alcança mais do que isso.
- **Varredura.** Devolve tokens e moeda à principal. Em Solana fecha as contas de token e recupera o aluguel (rent), então o custo líquido de uma sessão é quase só a taxa de rede.
- **Máscara fixa por site.** Para sites que usam o endereço como identidade (posição de stake, NFT, pontos), a mesma máscara é reutilizada: a identidade persiste e o risco continua isolado por site.
- **Redes.** Solana e todas as EVM (BSC, Ethereum, Polygon, Arbitrum, Base) com o mesmo código.

## Estrutura

```
packages/core        núcleo: derivação, orçamento, sessões EVM e Solana (TypeScript, testes)
apps/demo            demonstração web (React + Vite): carteira x site golpe
contracts/           DemoToken (ERC-20) e Drainer (o que um site golpe faz), só para testnet
scripts/             demos de linha de comando e preparação das redes de teste
docs/                página pública (GitHub Pages) e build da demo
```

## Como executar

Requer Node 20+.

```bash
npm install
npm test                      # testes do núcleo (derivação, vetores SLIP-0010, orçamento)
npm run build                 # compila núcleo e demo (saída em docs/app)
```

### Demo de linha de comando em EVM (nó local, sem configurar nada)

```bash
npx tsx scripts/compile-contracts.ts
npx hardhat node              # em outro terminal
npm run demo:evm
```

Saída esperada: a máscara aprova USDX ilimitado para o contrato do golpista, o `Drainer` puxa tudo o que foi aprovado numa única transação, e a carteira principal continua com os 900 USDX. A varredura devolve as sobras.

### Demo de linha de comando em Solana devnet

O faucet do RPC público fechou. Carregue a tesouraria de teste (`SOLANA_TREASURY_ADDRESS` em `apps/demo/src/treasury.ts`) em https://faucet.solana.com e rode:

```bash
npm run demo:solana
```

### Demo web

```bash
npm run demo                  # abre a demo em http://localhost:5173
```

A aba **EVM local** funciona com `npx hardhat node` rodando. As abas **Solana devnet** e **BSC testnet** usam uma tesouraria de teste (chaves públicas de propósito, só com moeda de teste) para abastecer cada carteira de demonstração. Preparação única das redes: `npm run setup:devnet` e `npm run setup:bsc`, colando os endereços em `apps/demo/src/config.ts`.

## Exemplo de uso do núcleo

```ts
import { mnemonicToSeed, deriveEvmMain, deriveEvmMask, EvmSession } from '@sandbox-wallet/core';

const seed = mnemonicToSeed(frase);
const main = deriveEvmMain(seed);
const mask = deriveEvmMask(seed, { origin: 'app.uniswap.org' });

const session = new EvmSession({ provider, mainPrivateKey: main.privateKey, maskPrivateKey: mask.privateKey });
await session.fund({ native: parseEther('0.01'), tokens: [{ id: USDT, amount: 100_000_000n }] });
// ... o site opera com mask.address ...
await session.sweep();
```

## Time

VKX Tech. Licença de avaliação: veja `LICENSE`.

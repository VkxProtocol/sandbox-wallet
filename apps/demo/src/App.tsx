import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSolanaDriver } from './demo/solana';
import { createEvmDriver } from './demo/evm';
import type { ConnectMode, DemoDriver, DemoState, LogEntry } from './demo/types';
import { SCAM_SITE, type NetworkId } from './config';

const NETWORKS: { id: NetworkId; label: string }[] = [
  { id: 'solana-devnet', label: 'Solana devnet' },
  { id: 'bsc-testnet', label: 'BSC testnet' },
  { id: 'local', label: 'EVM local' },
];

type Step = 'idle' | 'ready' | 'connect-request' | 'connected' | 'sign-request' | 'drained';

/** Traduz os erros mais comuns das redes para uma frase curta. */
function friendlyError(msg: string): string {
  if (/no record of a prior credit|insufficient funds|insufficient lamports/i.test(msg)) {
    return 'Saldo insuficiente na rede de teste. A tesouraria de demonstração precisa ser recarregada no faucet.';
  }
  if (/Failed to fetch|NetworkError|ECONNREFUSED|could not detect network|SERVER_ERROR/i.test(msg)) {
    return 'A rede de teste não respondeu. Tente de novo em instantes.';
  }
  return msg.length > 220 ? msg.slice(0, 220) + '…' : msg;
}

export function App() {
  const [net, setNet] = useState<NetworkId>('solana-devnet');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [state, setState] = useState<DemoState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const log = useCallback((e: Omit<LogEntry, 't'>) => setLogs((l) => [...l, { ...e, t: Date.now() }]), []);

  const driver: DemoDriver = useMemo(() => {
    setLogs([]);
    setStep('idle');
    return net === 'solana-devnet' ? createSolanaDriver(log) : createEvmDriver(net, log);
  }, [net, log]);

  const refresh = useCallback(async () => {
    try {
      const s = await driver.state();
      setState(s);
      setStep((prev) => (prev === 'idle' && s.ready ? 'ready' : prev));
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  }, [driver]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  async function run(label: string, fn: () => Promise<void>, next?: Step) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      if (next) setStep(next);
    } catch (e) {
      const msg = friendlyError(String((e as Error).message ?? e));
      setError(msg);
      log({ who: 'rede', text: `Erro: ${msg}` });
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  const connected = state?.connectedAs ?? null;

  return (
    <div className="app">
      <header>
        <div>
          <h1>Sandbox Wallet</h1>
          <p className="tag">A carteira usa máscaras. Quem fala com o site é uma máscara com orçamento limitado. A carteira principal nunca aparece.</p>
        </div>
        <nav>
          {NETWORKS.map((n) => (
            <button key={n.id} className={n.id === net ? 'active' : ''} onClick={() => setNet(n.id)} disabled={!!busy}>
              {n.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {/* ----------------------------------------------- carteira */}
        <section className="panel wallet">
          <h2>Sua carteira</h2>
          {!state?.ready ? (
            <>
              <p>Crie uma carteira de demonstração. Uma tesouraria de teste deposita moeda e 1000 USDX (token de brinquedo).</p>
              <button className="primary" disabled={!!busy} onClick={() => run('Criando carteira...', () => driver.setup(), 'ready')}>
                Criar carteira de demonstração
              </button>
            </>
          ) : (
            <>
              <div className="account main">
                <div className="label">Carteira principal {connected === 'main' && <span className="pill danger">exposta ao site</span>}</div>
                <code>{state.mainAddress}</code>
                <div className="bal">{state.main.native} · <b>{state.main.usdx}</b></div>
              </div>
              {state.maskAddress && (
                <div className="account mask">
                  <div className="label">Máscara para {SCAM_SITE} {connected === 'mask' && <span className="pill ok">conectada ao site</span>}</div>
                  <code>{state.maskAddress}</code>
                  <div className="bal">{state.mask?.native} · <b>{state.mask?.usdx}</b></div>
                </div>
              )}
              <div className="account attacker">
                <div className="label">Carteira do golpista</div>
                <div className="bal"><b>{state.attackerUsdx}</b></div>
              </div>

              {step === 'connect-request' && (
                <div className="modal">
                  <h3>{SCAM_SITE} quer conectar</h3>
                  <p>Como você quer aparecer para este site?</p>
                  <button className="primary" disabled={!!busy} onClick={() => run('Criando e abastecendo a máscara...', () => driver.connect('mask'), 'connected')}>
                    Com uma máscara (orçamento: 100 USDX + gás)
                  </button>
                  <button className="danger" disabled={!!busy} onClick={() => run('Conectando...', () => driver.connect('main'), 'connected')}>
                    Com a carteira principal (como as carteiras comuns)
                  </button>
                </div>
              )}

              {step === 'sign-request' && (
                <div className="modal">
                  <h3>{SCAM_SITE} pede uma assinatura</h3>
                  <p>
                    O site diz "resgatar airdrop". A transação de verdade {net === 'solana-devnet' ? 'move todos os tokens e o SOL da conta conectada para o golpista' : 'é um approve ilimitado de USDX para o contrato do golpista, que depois puxa tudo'}.
                    A maioria das pessoas assina sem ler.
                  </p>
                  <button className="danger" disabled={!!busy} onClick={() => run('Assinando e enviando...', () => driver.drain(), 'drained')}>
                    Assinar sem ler (cair no golpe)
                  </button>
                </div>
              )}

              {step === 'drained' && (
                <div className={`result ${connected === 'mask' ? 'ok' : 'bad'}`}>
                  {connected === 'mask' ? (
                    <>
                      <h3>O golpe levou só a máscara.</h3>
                      <p>A carteira principal continua com o saldo. O site nunca soube que ela existia.</p>
                      <button disabled={!!busy} onClick={() => run('Varrendo sobras...', () => driver.sweep(), 'ready')}>Varrer sobras da máscara para a principal</button>
                    </>
                  ) : (
                    <>
                      <h3>Carteira principal drenada.</h3>
                      <p>É isso que acontece hoje nas carteiras comuns. Crie outra carteira e repita com uma máscara.</p>
                    </>
                  )}
                </div>
              )}

              <div className="row small">
                <button disabled={!!busy} onClick={() => { driver.reset(); setStep('idle'); setLogs([]); void refresh(); }}>Esquecer esta carteira</button>
                <button disabled={!!busy} onClick={() => void refresh()}>Atualizar saldos</button>
              </div>
            </>
          )}
          {busy && <div className="busy">{busy}</div>}
          {error && <div className="error">{error}</div>}
        </section>

        {/* ----------------------------------------------- site golpe */}
        <section className="panel site">
          <div className="urlbar">https://{SCAM_SITE}</div>
          <div className="scam">
            <h2>🎁 Airdrop grátis de 5.000 USDX</h2>
            <p>Conecte sua carteira e resgate agora. Só hoje!</p>
            {!state?.connectedAddress ? (
              <button className="primary big" disabled={!state?.ready || !!busy || step === 'connect-request'} onClick={() => setStep('connect-request')}>
                Conectar carteira
              </button>
            ) : (
              <>
                <p className="muted">Conectado: <code>{state.connectedAddress}</code></p>
                <button className="primary big" disabled={!!busy || step === 'sign-request' || step === 'drained'} onClick={() => setStep('sign-request')}>
                  Resgatar airdrop
                </button>
              </>
            )}
            {step === 'drained' && <p className="muted">😈 O site "quebrou". O golpista já foi embora.</p>}
          </div>
        </section>
      </main>

      <section className="panel logs">
        <h2>O que aconteceu na rede</h2>
        <div className="loglist" ref={logRef}>
          {logs.length === 0 && <p className="muted">Nada ainda.</p>}
          {logs.map((l, i) => (
            <div key={i} className={`log ${l.who}`}>
              <span className="who">{l.who}</span>
              <span>{l.text}</span>
              {l.link && !l.link.startsWith('#') && (
                <a href={l.link} target="_blank" rel="noreferrer">ver</a>
              )}
            </div>
          ))}
        </div>
      </section>

      <footer>
        <p>
          Demonstração em redes de teste, sem valor real. Hack Brasil 2026 · trilha Cibersegurança ·{' '}
          <a href="https://github.com/VkxProtocol/sandbox-wallet" target="_blank" rel="noreferrer">código</a>
        </p>
      </footer>
    </div>
  );
}

export type { ConnectMode };

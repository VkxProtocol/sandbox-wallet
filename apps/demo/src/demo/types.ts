export type ConnectMode = 'mask' | 'main';

export interface Balance {
  native: string; // já formatado
  usdx: string;
}

export interface DemoState {
  ready: boolean;
  mainAddress: string;
  maskAddress: string | null;
  connectedAs: ConnectMode | null;
  connectedAddress: string | null;
  main: Balance;
  mask: Balance | null;
  attackerUsdx: string;
}

export interface LogEntry {
  t: number;
  who: 'carteira' | 'site' | 'rede';
  text: string;
  link?: string;
}

export interface DemoDriver {
  /** Cria carteira de demonstração (frase nova) e abastece pela tesouraria. */
  setup(): Promise<void>;
  /** O site pede conexão; a carteira responde com máscara ou principal. */
  connect(mode: ConnectMode): Promise<void>;
  /** O site pede uma assinatura que, na prática, drena a conta conectada. */
  drain(): Promise<void>;
  /** Devolve sobras da máscara para a principal. */
  sweep(): Promise<void>;
  /** Esquece a carteira de demonstração atual. */
  reset(): void;
  state(): Promise<DemoState>;
}

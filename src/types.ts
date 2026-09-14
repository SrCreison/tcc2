/**
 * Tipos centrais do motor de jogo.
 *
 * Antes, quase tudo circulava como `any` entre gameMath -> gameEngine ->
 * roundProcessor -> server. Isso escondia bugs (ex.: nomes de campo
 * trocados) que só apareceriam em runtime. Com esses tipos, o próprio
 * compilador TypeScript passa a pegar esse tipo de erro.
 */

export interface PayTable {
    '8-9': number;
    '10-11': number;
    '12+': number;
}

/** Definição estática de um símbolo, como cadastrado nas tabelas de peso. */
export interface SymbolDefinition {
    id: number;
    name: string;
    weight: number;
    pays?: PayTable;
}

/**
 * Um símbolo já sorteado e posicionado no grid.
 * `venceu` e `valorMultiplicador` só existem quando fazem sentido
 * (símbolo participou de uma combinação vencedora / é a Pedra Filosofal).
 */
export interface GridSymbol extends SymbolDefinition {
    valorMultiplicador?: number;
    venceu?: boolean;
}

export type Grid = GridSymbol[];

export interface WinningCombination {
    simbolo: string;
    quantidade: number;
    premio: number;
    posicoes: number[];
}

export interface GridEvaluation {
    teveVitoria: boolean;
    combinacoesVencedoras: WinningCombination[];
    posicoesParaExplodir: number[];
    premioCascata: number;
}

export interface CascadeStep {
    cascata: number;
    hashUtilizado: string;
    grid: Grid;
    resultado: GridEvaluation;
}

export interface SpinResult {
    historico: CascadeStep[];
    premioRodada: number;
    multiplicadorAplicado: number;
    scattersNaTela: number;
    hashesGerados: number;
}

export interface BonusSpinSummary {
    giro: number;
    nonceUtilizado: number;
    scattersNaTela: number;
    multiplicadorFinal: number;
    premio: number;
    /**
     * Histórico completo das cascatas deste giro (não só o grid final).
     * Antes só o grid final era enviado, então o front não tinha como
     * reproduzir a animação de vitória/cascata dentro do bônus — via
     * direto pro resultado, sem destaque nenhum de quem ganhou.
     */
    historico: CascadeStep[];
}

export interface BonusRoundResult {
    quantidadeGiros: number;
    premioTotalBonus: number;
    giros: BonusSpinSummary[];
}

/**
 * Constantes de configuração do jogo.
 *
 * Antes esses números (30, 6, 5, 8, 4, 10, 100...) estavam espalhados e
 * repetidos como "números mágicos" em gameMath.ts, gameEngine.ts e
 * server.ts. Centralizar aqui evita que uma mudança futura (ex.: mudar o
 * grid pra 5x4) precise ser feita em 3 lugares diferentes e esqueçam um.
 */

export const COLUMNS = 6;
export const ROWS = 5;
export const GRID_SIZE = COLUMNS * ROWS;

/** Quantidade mínima de símbolos iguais na tela para pagar. */
export const MIN_WIN_COUNT = 8;

/** Quantidade mínima de scatters acumulados para ativar a rodada bônus. */
export const MIN_SCATTERS_FOR_BONUS = 4;

/** Quantos giros grátis a rodada bônus concede. */
export const BONUS_FREE_SPINS = 10;

/** Valor fixo da aposta (o estudo de caso não tem apostas variáveis). */
export const BASE_BET_AMOUNT = 2.0;

/** A compra direta do bônus custa BASE_BET_AMOUNT * este multiplicador. */
export const BONUS_BUY_COST_MULTIPLIER = 100;

export const SCATTER_SYMBOL_NAME = 'scatter_grimorio';
export const MULTIPLIER_SYMBOL_NAME = 'pedra_filosofal';

/** Tamanho máximo aceito para o clientSeed informado pelo jogador. */
export const MAX_CLIENT_SEED_LENGTH = 64;

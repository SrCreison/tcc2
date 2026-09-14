import { GameMath } from './gameMath';
import { COLUMNS, MIN_WIN_COUNT, MULTIPLIER_SYMBOL_NAME, ROWS, SCATTER_SYMBOL_NAME } from './config';
import type { Grid, GridEvaluation, WinningCombination } from './types';

export class GameEngine {
    /**
     * Avalia o grid atual: conta ocorrências de cada símbolo (ignorando
     * scatter e multiplicador, que não formam combinação) e calcula o
     * prêmio de qualquer símbolo com MIN_WIN_COUNT ou mais ocorrências.
     *
     * Efeito colateral intencional: os símbolos vencedores são marcados
     * com `venceu = true` diretamente no array `grid` recebido. Isso
     * permite que o histórico salvo (e o front-end) saibam exatamente
     * quais posições brilharam/explodiram nesta cascata, sem precisar
     * duplicar essa informação em outro lugar — antes, o front já lia
     * `simbolo.venceu` para destacar a vitória, mas o back nunca setava
     * esse campo, então a animação de destaque nunca aparecia.
     */
    static evaluateGrid(grid: Grid, betAmount: number): GridEvaluation {
        const symbolCounts: Record<string, number> = {};
        const symbolPositions: Record<string, number[]> = {};

        grid.forEach((symbol, index) => {
            if (symbol.name === SCATTER_SYMBOL_NAME || symbol.name === MULTIPLIER_SYMBOL_NAME) {
                return;
            }

            if (!symbolCounts[symbol.name]) {
                symbolCounts[symbol.name] = 0;
                symbolPositions[symbol.name] = [];
            }

            symbolCounts[symbol.name]++;
            symbolPositions[symbol.name].push(index);
        });

        const winningCombinations: WinningCombination[] = [];
        let destroyedIndexes: number[] = [];
        let winAmount = 0;

        for (const [name, count] of Object.entries(symbolCounts)) {
            if (count >= MIN_WIN_COUNT) {
                const payout = GameMath.calculatePayout(name, count, betAmount);
                winAmount += payout;

                const posicoes = symbolPositions[name];
                for (const pos of posicoes) {
                    grid[pos] = { ...grid[pos], venceu: true };
                }

                winningCombinations.push({
                    simbolo: name,
                    quantidade: count,
                    premio: payout,
                    posicoes,
                });

                destroyedIndexes = destroyedIndexes.concat(posicoes);
            }
        }

        destroyedIndexes.sort((a, b) => a - b);

        return {
            teveVitoria: winningCombinations.length > 0,
            combinacoesVencedoras: winningCombinations,
            posicoesParaExplodir: destroyedIndexes,
            premioCascata: Number(winAmount.toFixed(2)),
        };
    }

    /**
     * Aplica a gravidade: remove os símbolos destruídos, faz os
     * sobreviventes de cada coluna caírem e preenche o espaço vazio no
     * topo com símbolos novos vindos de `newSymbolsPool`.
     */
    static applyCascade(currentGrid: Grid, destroyedIndexes: number[], newSymbolsPool: Grid): Grid {
        const nextGrid: Grid = new Array(COLUMNS * ROWS);
        const destroyedSet = new Set(destroyedIndexes);
        let poolIndex = 0;

        for (let col = 0; col < COLUMNS; col++) {
            const survivors = [];

            // Coleta os sobreviventes da coluna, de baixo para cima.
            for (let row = ROWS - 1; row >= 0; row--) {
                const index = row * COLUMNS + col;
                if (!destroyedSet.has(index)) {
                    survivors.push(currentGrid[index]);
                }
            }

            // Completa o espaço aberto com símbolos novos.
            while (survivors.length < ROWS) {
                survivors.push(newSymbolsPool[poolIndex]);
                poolIndex++;
            }

            // Devolve para o grid final, de baixo para cima.
            for (let row = ROWS - 1; row >= 0; row--) {
                const index = row * COLUMNS + col;
                nextGrid[index] = survivors[ROWS - 1 - row];
            }
        }

        return nextGrid;
    }
}

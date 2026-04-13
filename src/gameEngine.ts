import { GameMath } from './gameMath';

export class GameEngine {
    
    // NOVO: A função agora recebe o valor da aposta
    static evaluateGrid(grid: any[], betAmount: number) {
        const symbolCounts: { [key: string]: number } = {};
        const symbolPositions: { [key: string]: number[] } = {};

        grid.forEach((symbol, index) => {
            if (symbol.name === 'scatter_grimorio' || symbol.name === 'pedra_filosofal') {
                return;
            }

            if (!symbolCounts[symbol.name]) {
                symbolCounts[symbol.name] = 0;
                symbolPositions[symbol.name] = [];
            }

            symbolCounts[symbol.name]++;
            symbolPositions[symbol.name].push(index);
        });

        const winningCombinations = [];
        let destroyedIndexes: number[] = [];
        let winAmount = 0; // Guardamos o prêmio desta cascata específica

        for (const [name, count] of Object.entries(symbolCounts)) {
            if (count >= 8) {
                // Calcula o prêmio!
                const payout = GameMath.calculatePayout(name, count, betAmount);
                winAmount += payout;

                winningCombinations.push({
                    simbolo: name,
                    quantidade: count,
                    premio: payout, // Mostra o prêmio no log da vitória
                    posicoes: symbolPositions[name]
                });
                
                destroyedIndexes = destroyedIndexes.concat(symbolPositions[name]);
            }
        }

        destroyedIndexes.sort((a, b) => a - b);

        return {
            teveVitoria: winningCombinations.length > 0,
            combinacoesVencedoras: winningCombinations,
            posicoesParaExplodir: destroyedIndexes,
            premioCascata: winAmount // Retorna o valor ganho nesta queda
        };
    }

    /**
     * Aplica a gravidade: remove os explodidos, faz os que sobraram cair, 
     * e injeta os novos símbolos no topo.
     */
    static applyCascade(currentGrid: any[], destroyedIndexes: number[], newSymbolsPool: any[]): any[] {
        const COLUMNS = 6;
        const ROWS = 5;
        const nextGrid = new Array(30).fill(null);
        let poolIndex = 0; // Quantos símbolos novos já usamos

        // Varremos o grid coluna por coluna
        for (let col = 0; col < COLUMNS; col++) {
            let columnItems = [];

            // 1. Coleta os sobreviventes dessa coluna (de baixo para cima)
            for (let row = ROWS - 1; row >= 0; row--) {
                let index = row * COLUMNS + col;
                if (!destroyedIndexes.includes(index)) {
                    columnItems.push(currentGrid[index]);
                }
            }

            // 2. Preenche o espaço que sobrou com novos símbolos do nosso novo hash
            while (columnItems.length < ROWS) {
                columnItems.push(newSymbolsPool[poolIndex]);
                poolIndex++;
            }

            // 3. Devolve os símbolos para o novo grid (de baixo para cima)
            for (let row = ROWS - 1; row >= 0; row--) {
                let index = row * COLUMNS + col;
                // Como pegamos de baixo pra cima, a ordem em columnItems já está correta
                nextGrid[index] = columnItems[(ROWS - 1) - row];
            }
        }

        return nextGrid;
    }
}

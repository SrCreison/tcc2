export class GameEngine {
    /**
     * Avalia o grid de 30 símbolos e descobre quem ganhou e onde eles estão.
     */
    static evaluateGrid(grid: any[]) {
        // 1. Dicionários para contar os símbolos e guardar suas posições
        const symbolCounts: { [key: string]: number } = {};
        const symbolPositions: { [key: string]: number[] } = {};

        // 2. Varre o grid inteiro (posições de 0 a 29)
        grid.forEach((symbol, index) => {
            // Ignoramos Scatters e Multiplicadores (eles não explodem na regra de 8+)
            if (symbol.name === 'scatter_grimorio' || symbol.name === 'pedra_filosofal') {
                return;
            }

            // Inicia os contadores se for a primeira vez que vemos esse símbolo
            if (!symbolCounts[symbol.name]) {
                symbolCounts[symbol.name] = 0;
                symbolPositions[symbol.name] = [];
            }

            // Conta +1 e anota a posição exata (índice)
            symbolCounts[symbol.name]++;
            symbolPositions[symbol.name].push(index);
        });

        // 3. Verifica quem bateu a meta de 8 ou mais
        const winningCombinations = [];
        let destroyedIndexes: number[] = [];

        for (const [name, count] of Object.entries(symbolCounts)) {
            if (count >= 8) {
                winningCombinations.push({
                    simbolo: name,
                    quantidade: count,
                    posicoes: symbolPositions[name]
                });
                
                // Junta todas as posições que vão explodir em uma única lista
                destroyedIndexes = destroyedIndexes.concat(symbolPositions[name]);
            }
        }

        // Ordena os índices do menor para o maior para facilitar pro Frontend
        destroyedIndexes.sort((a, b) => a - b);

        return {
            teveVitoria: winningCombinations.length > 0,
            combinacoesVencedoras: winningCombinations,
            posicoesParaExplodir: destroyedIndexes
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

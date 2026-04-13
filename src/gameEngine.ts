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
}

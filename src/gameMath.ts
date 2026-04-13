export class GameMath {
    // Definimos os símbolos com seus pesos E valores de pagamento
    static commonSymbols = [
        // LOW PAYS
        { id: 1, name: 'cristal_cinza', weight: 500, pays: { '8-9': 0.25, '10-11': 0.75, '12+': 2 } },
        { id: 2, name: 'cristal_verde', weight: 400, pays: { '8-9': 0.4, '10-11': 0.9, '12+': 4 } },
        { id: 3, name: 'cristal_azul', weight: 350, pays: { '8-9': 0.5, '10-11': 1, '12+': 5 } },
        { id: 4, name: 'cristal_rosa', weight: 300, pays: { '8-9': 0.8, '10-11': 1.2, '12+': 8 } },
        { id: 5, name: 'cristal_amarelo', weight: 250, pays: { '8-9': 1, '10-11': 1.5, '12+': 10 } },

        // HIGH PAYS
        { id: 6, name: 'pocao_verde', weight: 150, pays: { '8-9': 1.5, '10-11': 2, '12+': 12 } },
        { id: 7, name: 'pocao_azul', weight: 100, pays: { '8-9': 2, '10-11': 5, '12+': 15 } },
        { id: 8, name: 'pocao_vermelha', weight: 70, pays: { '8-9': 2.5, '10-11': 10, '12+': 25 } },
        { id: 9, name: 'pocao_dourada', weight: 40, pays: { '8-9': 10, '10-11': 25, '12+': 50 } }, 
    ];

    static baseTable = [
        ...this.commonSymbols,
        { id: 10, name: 'scatter_grimorio', weight: 25 } 
    ];

    static bonusTable = [
        ...this.commonSymbols,
        { id: 10, name: 'scatter_grimorio', weight: 20 },
        { id: 11, name: 'pedra_filosofal', weight: 60 } 
    ];

    static multiplierValues = [2, 3, 4, 5, 8, 10, 15, 25, 50, 100];

/**
     * NOVO: Adicionado o parâmetro isBonusBuy.
     */
    static generateGridFromHash(hash: string, isBonusMode: boolean = false, isBonusBuy: boolean = false): any[] {
        const grid = new Array(30).fill(null);
        const activeTable = isBonusMode ? this.bonusTable : this.baseTable;
        const totalWeight = activeTable.reduce((acc, symbol) => acc + symbol.weight, 0);

        let hashIndex = 0; // Usado para saber qual byte do hash estamos lendo
        let forcedScatterPositions: number[] = [];

        // SE FOR COMPRA DE BÔNUS: Sorteamos 4 posições únicas baseadas no Hash!
        if (isBonusBuy) {
            for (let i = 0; i < 4; i++) {
                let hexByte = hash.substring(hashIndex * 2, (hashIndex * 2) + 2);
                let pos = parseInt(hexByte, 16) % 30; // Garante um número de 0 a 29
                hashIndex++;
                
                // Se a posição já foi sorteada, pula para a próxima casa livre
                while (forcedScatterPositions.includes(pos)) {
                    pos = (pos + 1) % 30;
                }
                forcedScatterPositions.push(pos);
            }
        }

        // Preenche o grid
        for (let i = 0; i < 30; i++) {
            // Se essa posição foi sorteada para ser o scatter da compra de bônus, injeta ele!
            if (forcedScatterPositions.includes(i)) {
                grid[i] = { id: 10, name: 'scatter_grimorio', weight: 25 };
                continue;
            }

            // Geração Normal para os outros espaços
            const hexByte = hash.substring(hashIndex * 2, (hashIndex * 2) + 2);
            hashIndex++; // Avança a leitura do hash
            
            const decimalValue = parseInt(hexByte, 16);
            const floatValue = decimalValue / 256;
            const randomWeight = floatValue * totalWeight;

            let currentWeight = 0;
            for (const symbol of activeTable) {
                currentWeight += symbol.weight;
                if (randomWeight < currentWeight) {
                    let item: any = { ...symbol }; 
                    
                    if (item.name === 'pedra_filosofal') {
                        const multiIndex = decimalValue % this.multiplierValues.length;
                        item.valor_multiplicador = this.multiplierValues[multiIndex];
                    }

                    grid[i] = item;
                    break;
                }
            }
        }
        return grid;
    }

    /**
     * NOVO: Calcula o prêmio de um símbolo baseado na quantidade que caiu.
     */
    static calculatePayout(symbolName: string, count: number, betAmount: number): number {
        // Encontra o símbolo na tabela base (poderia ser na bonusTable também, os pagamentos normais são os mesmos)
        const symbol = this.baseTable.find(s => s.name === symbolName);
        
        if (!symbol || !symbol.pays) return 0;

        let multiplier = 0;
        if (count >= 8 && count <= 9) multiplier = symbol.pays['8-9'];
        else if (count >= 10 && count <= 11) multiplier = symbol.pays['10-11'];
        else if (count >= 12) multiplier = symbol.pays['12+'];

        return betAmount * multiplier;
    }
}

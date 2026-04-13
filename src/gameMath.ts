export class GameMath {
    static commonSymbols = [
        // LOW PAYS (Cristais Brutos - Alta Frequência)
        { id: 1, name: 'cristal_cinza', weight: 500 },
        { id: 2, name: 'cristal_verde', weight: 400 },
        { id: 3, name: 'cristal_azul', weight: 350 },
        { id: 4, name: 'cristal_rosa', weight: 300 },
        { id: 5, name: 'cristal_amarelo', weight: 250 },

        // HIGH PAYS (Poções Refinadas - Baixa Frequência)
        { id: 6, name: 'pocao_verde', weight: 150 },
        { id: 7, name: 'pocao_azul', weight: 100 },
        { id: 8, name: 'pocao_vermelha', weight: 70 },
        { id: 9, name: 'pocao_dourada', weight: 40 }, // O símbolo mais valioso do jogo base
    ];

    // 1. Tabela do Jogo Base
    static baseTable = [
        ...this.commonSymbols,
        { id: 10, name: 'scatter_grimorio', weight: 25 } // Deixei mais difícil para balancear
    ];

    // 2. Tabela do Jogo Bônus (Com o Multiplicador)
    static bonusTable = [
        ...this.commonSymbols,
        { id: 10, name: 'scatter_grimorio', weight: 20 },
        { id: 11, name: 'pedra_filosofal', weight: 60 } // O multiplicador!
    ];

    // Valores possíveis para o multiplicador da Pedra Filosofal
    static multiplierValues = [2, 3, 4, 5, 8, 10, 15, 25, 50, 100];

    static generateGridFromHash(hash: string, isBonusMode: boolean = false): any[] {
        const grid = [];
        const activeTable = isBonusMode ? this.bonusTable : this.baseTable;
        const totalWeight = activeTable.reduce((acc, symbol) => acc + symbol.weight, 0);

        for (let i = 0; i < 30; i++) {
            const hexByte = hash.substring(i * 2, (i * 2) + 2);
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

                    grid.push(item);
                    break;
                }
            }
        }
        return grid;
    }
}

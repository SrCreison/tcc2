import { HashCursor } from './provablyFair';
import { GRID_SIZE, MULTIPLIER_SYMBOL_NAME, SCATTER_SYMBOL_NAME } from './config';
import type { Grid, GridSymbol, SymbolDefinition } from './types';

export class GameMath {
    // Símbolos comuns: peso (probabilidade relativa) + pagamento por
    // faixa de quantidade na tela (8-9, 10-11, 12+ símbolos iguais).
    static readonly commonSymbols: SymbolDefinition[] = [
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

    static readonly baseTable: SymbolDefinition[] = [
        ...this.commonSymbols,
        { id: 10, name: SCATTER_SYMBOL_NAME, weight: 25 },
    ];

    static readonly bonusTable: SymbolDefinition[] = [
        ...this.commonSymbols,
        { id: 10, name: SCATTER_SYMBOL_NAME, weight: 20 },
        { id: 11, name: MULTIPLIER_SYMBOL_NAME, weight: 60 },
    ];

    static readonly multiplierValues = [2, 3, 4, 5, 8, 10, 15, 25, 50, 100];

    /**
     * Sorteia um símbolo ponderado a partir do próximo byte do hash.
     * Quando o símbolo sorteado é a Pedra Filosofal (multiplicador), um
     * SEGUNDO byte independente é consumido para escolher o valor do
     * multiplicador. Reaproveitar o mesmo byte para as duas decisões (como
     * na versão anterior) correlaciona as duas variáveis: o valor do
     * multiplicador ficaria sempre preso à faixa de bytes que sorteia esse
     * símbolo, quebrando a uniformidade que um CSPRNG deveria garantir.
     */
    private static drawWeightedSymbol(table: SymbolDefinition[], totalWeight: number, cursor: HashCursor): GridSymbol {
        const byte = cursor.nextByte();
        const randomWeight = (byte / 256) * totalWeight;

        let cumulativeWeight = 0;
        for (const symbol of table) {
            cumulativeWeight += symbol.weight;
            if (randomWeight < cumulativeWeight) {
                const drawn: GridSymbol = { ...symbol };

                if (drawn.name === MULTIPLIER_SYMBOL_NAME) {
                    const multiplierByte = cursor.nextByte();
                    drawn.valorMultiplicador = this.multiplierValues[multiplierByte % this.multiplierValues.length];
                }

                return drawn;
            }
        }

        // Só chega aqui por erro de arredondamento de ponto flutuante na
        // soma dos pesos; devolve o último símbolo da tabela como fallback
        // seguro em vez de deixar a posição do grid vazia (null).
        return { ...table[table.length - 1] };
    }

    /**
     * Gera um grid completo (30 posições) a partir de um hash.
     * Em compra de bônus (isBonusBuy), 4 posições são forçadas a scatter
     * usando os primeiros bytes do hash; o restante do grid é sorteado
     * normalmente com os bytes seguintes.
     */
    static generateGridFromHash(hash: string, isBonusMode: boolean = false, isBonusBuy: boolean = false): Grid {
        const activeTable = isBonusMode ? this.bonusTable : this.baseTable;
        const totalWeight = activeTable.reduce((acc, symbol) => acc + symbol.weight, 0);
        const cursor = new HashCursor(hash);
        const grid: Grid = new Array(GRID_SIZE);

        const forcedScatterPositions: number[] = [];
        if (isBonusBuy) {
            for (let i = 0; i < 4; i++) {
                let pos = cursor.nextByte() % GRID_SIZE;
                while (forcedScatterPositions.includes(pos)) {
                    pos = (pos + 1) % GRID_SIZE;
                }
                forcedScatterPositions.push(pos);
            }
        }

        const scatterSymbol = this.baseTable.find((s) => s.name === SCATTER_SYMBOL_NAME)!;

        for (let i = 0; i < GRID_SIZE; i++) {
            if (forcedScatterPositions.includes(i)) {
                grid[i] = { ...scatterSymbol };
                continue;
            }

            grid[i] = this.drawWeightedSymbol(activeTable, totalWeight, cursor);
        }

        return grid;
    }

    /** Calcula o prêmio de um símbolo, dado quantas vezes ele apareceu na tela. */
    static calculatePayout(symbolName: string, count: number, betAmount: number): number {
        const symbol = this.baseTable.find((s) => s.name === symbolName);
        if (!symbol || !symbol.pays) return 0;

        let multiplier = 0;
        if (count >= 8 && count <= 9) multiplier = symbol.pays['8-9'];
        else if (count >= 10 && count <= 11) multiplier = symbol.pays['10-11'];
        else if (count >= 12) multiplier = symbol.pays['12+'];

        return betAmount * multiplier;
    }
}

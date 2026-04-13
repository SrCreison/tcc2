export class GameMath {
    // Tabela de Símbolos e Pesos (Probabilidades)
    // Quanto maior o peso, mais fácil de cair.
    static symbolTable = [
        { id: 1, name: 'pocao_azul', weight: 400 },     // Muito Comum
        { id: 2, name: 'pocao_verde', weight: 300 },    // Comum
        { id: 3, name: 'pocao_vermelha', weight: 150 }, // Incomum
        { id: 4, name: 'pedra_filosofal', weight: 100 },// Raro
        { id: 5, name: 'scatter_grimorio', weight: 50 } // Muito Raro (Bônus)
    ];

    /**
     * Converte o Hash Hexadecimal em um Array de 30 Símbolos
     */
    static generateGridFromHash(hash: string): any[] {
        const grid = [];
        
        // Calcula o peso total da nossa tabela (400+300+150+100+50 = 1000)
        const totalWeight = this.symbolTable.reduce((acc, symbol) => acc + symbol.weight, 0);

        // Precisamos de 30 símbolos para um grid 6x5
        for (let i = 0; i < 30; i++) {
            // Pega 2 caracteres do hash por vez (1 Byte)
            // Loop 0: caracteres 0 e 1 | Loop 1: caracteres 2 e 3...
            const hexByte = hash.substring(i * 2, (i * 2) + 2);
            
            // Converte o Hexadecimal ("75") para Decimal (117)
            const decimalValue = parseInt(hexByte, 16);
            
            // Transforma o número de 0-255 em um Float de 0.0 a 1.0
            const floatValue = decimalValue / 256;

            // Multiplica o float pelo peso total (ex: 0.45 * 1000 = 450)
            const randomWeight = floatValue * totalWeight;

            // Encontra qual símbolo corresponde a esse peso
            let currentWeight = 0;
            for (const symbol of this.symbolTable) {
                currentWeight += symbol.weight;
                if (randomWeight < currentWeight) {
                    grid.push(symbol);
                    break;
                }
            }
        }

        return grid;
    }
}

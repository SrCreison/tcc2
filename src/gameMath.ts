import { HashCursor } from './provablyFair';
import { GRID_SIZE, MULTIPLIER_SYMBOL_NAME, SCATTER_SYMBOL_NAME } from './config';
import type { Grid, GridSymbol, PayTable, SymbolDefinition } from './types';

/**
 * Os dois "perfis" de jogo.
 *
 * O ponto pedagógico central do projeto: o CSPRNG (HMAC-SHA256 a partir
 * de um serverSeed aleatório) garante que o PROCESSO de sorteio é
 * verificável e não pode ser manipulado depois que a aposta é feita —
 * isso é o que /api/verify prova. Só que isso não significa que o jogo
 * seja "justo" no sentido de dar ao jogador uma expectativa positiva.
 * As CHANCES de cada símbolo (os `weight` abaixo) são uma escolha de
 * design completamente separada da criptografia, e é ela que define se,
 * no longo prazo, o jogador ganha ou perde dinheiro (o "RTP" / house
 * edge de um cassino real).
 *
 * `normal` usa pesos calibrados (ver simulação no fim deste arquivo,
 * nos comentários) para reproduzir esse comportamento: vitórias e o
 * bônus são propositalmente raros, e o valor esperado por giro é menor
 * que o valor apostado — exatamente como um slot real.
 *
 * `demonstracao` usa pesos muito mais generosos, só para fins didáticos:
 * permite ver cascatas, multiplicadores e a rodada bônus acontecerem em
 * poucos giros, sem esperar centenas de tentativas. Ele existe para
 * ENSINAR como o sistema funciona, não para simular economia real — e o
 * front deixa isso explícito na interface, nunca escondido.
 */
export type GameProfile = 'normal' | 'demonstracao';
export const GAME_PROFILES: GameProfile[] = ['normal', 'demonstracao'];
export const DEFAULT_GAME_PROFILE: GameProfile = 'normal';

/**
 * Resultado de referência de `scripts/simulate.ts` (500.000 giros
 * simulados por perfil, usando o próprio motor do jogo). Não é
 * recalculado a cada requisição — é um retrato documentado, exposto via
 * /api/config para a tela "Como funciona". Se você mudar os pesos em
 * WEIGHTS abaixo, rode o script de novo e atualize estes números.
 */
export const PROFILE_REFERENCE_STATS: Record<
    GameProfile,
    { rtpPercent: number; hitRatePercent: number; bonusFrequency: string; amostraGiros: number }
> = {
    normal: { rtpPercent: 83.2, hitRatePercent: 54.3, bonusFrequency: '1 em ~3.000 giros', amostraGiros: 500_000 },
    demonstracao: { rtpPercent: 379.4, hitRatePercent: 59.4, bonusFrequency: '1 em ~59 giros', amostraGiros: 500_000 },
};

interface SymbolConfig {
    id: number;
    name: string;
    pays?: PayTable;
}

export class GameMath {
    /**
     * Definição "estática" dos símbolos: id, nome e tabela de pagamento.
     * O pagamento NÃO muda entre perfis — só a chance de cada símbolo
     * aparecer (o `weight`) é diferente. Isso é intencional: separa
     * claramente "quanto paga" (regra do jogo) de "quão frequente é"
     * (escolha econômica de quem opera o jogo).
     */
    private static readonly commonSymbolDefs: SymbolConfig[] = [
        // LOW PAYS
        { id: 1, name: 'cristal_cinza', pays: { '8-9': 0.25, '10-11': 0.75, '12+': 2 } },
        { id: 2, name: 'cristal_verde', pays: { '8-9': 0.4, '10-11': 0.9, '12+': 4 } },
        { id: 3, name: 'cristal_azul', pays: { '8-9': 0.5, '10-11': 1, '12+': 5 } },
        { id: 4, name: 'cristal_rosa', pays: { '8-9': 0.8, '10-11': 1.2, '12+': 8 } },
        { id: 5, name: 'cristal_amarelo', pays: { '8-9': 1, '10-11': 1.5, '12+': 10 } },
        // HIGH PAYS
        { id: 6, name: 'pocao_verde', pays: { '8-9': 1.5, '10-11': 2, '12+': 12 } },
        { id: 7, name: 'pocao_azul', pays: { '8-9': 2, '10-11': 5, '12+': 15 } },
        { id: 8, name: 'pocao_vermelha', pays: { '8-9': 2.5, '10-11': 10, '12+': 25 } },
        { id: 9, name: 'pocao_dourada', pays: { '8-9': 10, '10-11': 25, '12+': 50 } },
    ];

    /**
     * Pesos por perfil.
     *
     * Calibrados por SIMULAÇÃO real (não estimativa manual) — rode
     * `npx ts-node --transpile-only scripts/simulate.ts` pra reproduzir.
     * Resultado de 500.000 giros simulados com estes números:
     *
     *   Perfil          RTP       Frequência de vitória   Bônus
     *   normal          ~83%      ~54%                    1 em ~3.000 giros
     *   demonstracao    ~379%     ~59%                     1 em ~59 giros
     *
     * RTP = retorno total pago / total apostado. RTP < 100% é o que
     * importa aqui: mesmo com mais da metade dos giros pagando ALGUMA
     * coisa (54%), o jogador perde dinheiro no longo prazo porque a
     * maioria dos prêmios é pequena perto do valor apostado — é assim
     * que cassinos reais conciliam "o jogador ganha com frequência" com
     * "a casa sempre sai no lucro no agregado". `demonstracao` inverte
     * isso de propósito (RTP bem acima de 100%) só para tornar o bônus
     * e os multiplicadores visíveis numa demonstração curta.
     */
    private static readonly WEIGHTS: Record<
        GameProfile,
        { common: number[]; scatterBase: number; scatterBonus: number; multiplier: number }
    > = {
        normal: {
            common: [90, 80, 70, 60, 50, 35, 25, 15, 8],
            scatterBase: 5,
            scatterBonus: 4,
            multiplier: 30,
        },
        demonstracao: {
            common: [120, 100, 85, 70, 55, 40, 28, 18, 9],
            scatterBase: 14,
            scatterBonus: 8,
            multiplier: 14,
        },
    };

    static readonly multiplierValues = [2, 3, 4, 5, 8, 10, 15, 25, 50, 100];

    private static buildCommonSymbols(profile: GameProfile): SymbolDefinition[] {
        const weights = this.WEIGHTS[profile].common;
        return this.commonSymbolDefs.map((def, i) => ({ ...def, weight: weights[i] }));
    }

    static getBaseTable(profile: GameProfile): SymbolDefinition[] {
        return [
            ...this.buildCommonSymbols(profile),
            { id: 10, name: SCATTER_SYMBOL_NAME, weight: this.WEIGHTS[profile].scatterBase },
        ];
    }

    static getBonusTable(profile: GameProfile): SymbolDefinition[] {
        return [
            ...this.buildCommonSymbols(profile),
            { id: 10, name: SCATTER_SYMBOL_NAME, weight: this.WEIGHTS[profile].scatterBonus },
            { id: 11, name: MULTIPLIER_SYMBOL_NAME, weight: this.WEIGHTS[profile].multiplier },
        ];
    }

    /** Devolve os pesos brutos de um perfil — usado pelo endpoint /api/config para exibição didática. */
    static getWeightsSnapshot(profile: GameProfile) {
        return {
            common: this.buildCommonSymbols(profile).map(({ id, name, weight, pays }) => ({ id, name, weight, pays })),
            scatterBase: this.WEIGHTS[profile].scatterBase,
            scatterBonus: this.WEIGHTS[profile].scatterBonus,
            multiplier: this.WEIGHTS[profile].multiplier,
        };
    }

    /**
     * Sorteia um símbolo ponderado a partir do próximo byte do hash.
     * Quando o símbolo sorteado é a Pedra Filosofal (multiplicador), um
     * SEGUNDO byte independente é consumido para escolher o valor do
     * multiplicador — reaproveitar o mesmo byte correlacionaria as duas
     * variáveis (o multiplicador ficaria preso à faixa de bytes que
     * sorteia esse símbolo).
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
     * Gera um grid completo (30 posições) a partir de um hash, usando os
     * pesos do `profile` informado. Em compra de bônus (isBonusBuy), 4
     * posições são forçadas a scatter usando os primeiros bytes do hash;
     * o restante do grid é sorteado normalmente com os bytes seguintes.
     */
    static generateGridFromHash(
        hash: string,
        profile: GameProfile,
        isBonusMode: boolean = false,
        isBonusBuy: boolean = false,
    ): Grid {
        const activeTable = isBonusMode ? this.getBonusTable(profile) : this.getBaseTable(profile);
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

        const scatterSymbol = activeTable.find((s) => s.name === SCATTER_SYMBOL_NAME)!;

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
        const symbol = this.commonSymbolDefs.find((s) => s.name === symbolName);
        if (!symbol || !symbol.pays) return 0;

        let multiplier = 0;
        if (count >= 8 && count <= 9) multiplier = symbol.pays['8-9'];
        else if (count >= 10 && count <= 11) multiplier = symbol.pays['10-11'];
        else if (count >= 12) multiplier = symbol.pays['12+'];

        return betAmount * multiplier;
    }
}

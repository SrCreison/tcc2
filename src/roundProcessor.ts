import { ProvablyFair } from './provablyFair';
import { GameMath, type GameProfile } from './gameMath';
import { GameEngine } from './gameEngine';
import { MULTIPLIER_SYMBOL_NAME, SCATTER_SYMBOL_NAME } from './config';
import type { CascadeStep, SpinResult } from './types';

export class RoundProcessor {
    /**
     * Processa um giro (rodada base OU um giro da rodada bônus) até que
     * nenhuma cascata gere vitória. `isBonusBuyTrigger` só se aplica ao
     * primeiro grid do giro — as cascatas de preenchimento nunca forçam
     * scatters, senão a compra de bônus poderia acionar bônus dentro do
     * bônus indefinidamente.
     */
    static processSingleSpin(
        serverSeed: string,
        clientSeed: string,
        nonce: number,
        betAmount: number,
        isBonusMode: boolean,
        profile: GameProfile,
        isBonusBuyTrigger: boolean = false,
    ): SpinResult {
        let cursor = 0;
        let isCascading = true;
        const roundHistory: CascadeStep[] = [];
        let winAmount = 0;

        let currentHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce, cursor);
        let currentGrid = GameMath.generateGridFromHash(currentHash, profile, isBonusMode, isBonusBuyTrigger);

        while (isCascading) {
            // evaluateGrid marca os símbolos vencedores (venceu = true)
            // diretamente em currentGrid antes deste push, então o
            // histórico salvo abaixo já reflete o destaque visual.
            const avaliacao = GameEngine.evaluateGrid(currentGrid, betAmount);

            roundHistory.push({
                cascata: cursor,
                hashUtilizado: currentHash,
                grid: currentGrid,
                resultado: avaliacao,
            });

            if (avaliacao.teveVitoria) {
                winAmount += avaliacao.premioCascata;
                cursor++;
                currentHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce, cursor);
                // O preenchimento de cascata nunca é compra de bônus.
                const poolDeNovosSimbolos = GameMath.generateGridFromHash(currentHash, profile, isBonusMode, false);
                currentGrid = GameEngine.applyCascade(currentGrid, avaliacao.posicoesParaExplodir, poolDeNovosSimbolos);
            } else {
                isCascading = false;
            }
        }

        // Scatters e a Pedra Filosofal nunca são destruídos numa cascata
        // (evaluateGrid os ignora de propósito), então eles se acumulam
        // naturalmente através das cascatas. Por isso é seguro somá-los
        // olhando só para o grid final, sem precisar percorrer o histórico.
        let totalMultiplier = 0;
        let totalScatters = 0;

        for (const symbol of currentGrid) {
            if (!symbol) continue;
            if (isBonusMode && symbol.name === MULTIPLIER_SYMBOL_NAME && symbol.valorMultiplicador) {
                totalMultiplier += symbol.valorMultiplicador;
            }
            if (symbol.name === SCATTER_SYMBOL_NAME) {
                totalScatters++;
            }
        }

        winAmount = totalMultiplier > 0 ? winAmount * totalMultiplier : winAmount;
        winAmount = Number(winAmount.toFixed(2));

        return {
            historico: roundHistory,
            premioRodada: winAmount,
            multiplicadorAplicado: totalMultiplier,
            scattersNaTela: totalScatters,
            hashesGerados: cursor + 1,
        };
    }
}

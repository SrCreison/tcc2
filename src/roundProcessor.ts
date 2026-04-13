import { ProvablyFair } from './provablyFair';
import { GameMath } from './gameMath';
import { GameEngine } from './gameEngine';

export class RoundProcessor {
    /**
     * Executa UMA ÚNICA RODADA de cascata completa.
     * Retorna o histórico dessa rodada, o prêmio, e os recursos ativados.
     */
    static processSingleSpin(serverSeed: string, clientSeed: string, nonce: number, betAmount: number, isBonusMode: boolean) {
        let cursor = 0;
        let isCascading = true;
        let roundHistory = [];
        let winAmount = 0;

        let currentHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce, cursor);
        let currentGrid = GameMath.generateGridFromHash(currentHash, isBonusMode);

        // O Loop da Cascata
        while (isCascading) {
            const avaliacao = GameEngine.evaluateGrid(currentGrid, betAmount);

            roundHistory.push({
                cascata: cursor,
                hashUtilizado: currentHash,
                grid: currentGrid,
                resultado: avaliacao
            });

            if (avaliacao.teveVitoria) {
                winAmount += avaliacao.premioCascata;
                cursor++;
                currentHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce, cursor);
                let poolDeNovosSimbolos = GameMath.generateGridFromHash(currentHash, isBonusMode);
                currentGrid = GameEngine.applyCascade(currentGrid, avaliacao.posicoesParaExplodir, poolDeNovosSimbolos);
            } else {
                isCascading = false;
            }
        }

        // Análise Final do Grid (Scatters e Multiplicadores)
        let totalMultiplier = 0;
        let totalScatters = 0;

        currentGrid.forEach(symbol => {
            if (!symbol) return;
            if (isBonusMode && symbol.name === 'pedra_filosofal') {
                totalMultiplier += symbol.valor_multiplicador;
            }
            if (symbol.name === 'scatter_grimorio') {
                totalScatters++;
            }
        });

        if (winAmount > 0 && totalMultiplier > 0) {
            winAmount = winAmount * totalMultiplier;
        }

        return {
            historico: roundHistory,
            premioRodada: winAmount,
            multiplicadorAplicado: totalMultiplier,
            scattersNaTela: totalScatters,
            hashesGerados: cursor + 1
        };
    }
}

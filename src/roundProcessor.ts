import { ProvablyFair } from './provablyFair';
import { GameMath } from './gameMath';
import { GameEngine } from './gameEngine';

export class RoundProcessor {
    
    // NOVO: Adicionado isBonusBuyTrigger
    static processSingleSpin(serverSeed: string, clientSeed: string, nonce: number, betAmount: number, isBonusMode: boolean, isBonusBuyTrigger: boolean = false) {
        let cursor = 0;
        let isCascading = true;
        let roundHistory = [];
        let winAmount = 0;

        let currentHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce, cursor);
        // Repassamos a flag isBonusBuyTrigger apenas para o primeiro giro base
        let currentGrid = GameMath.generateGridFromHash(currentHash, isBonusMode, isBonusBuyTrigger);

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
                // Cascatas de preenchimento NUNCA são compras de bônus, são sempre normais
                let poolDeNovosSimbolos = GameMath.generateGridFromHash(currentHash, isBonusMode, false);
                currentGrid = GameEngine.applyCascade(currentGrid, avaliacao.posicoesParaExplodir, poolDeNovosSimbolos);
            } else {
                isCascading = false;
            }
        }

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

        // FIX: Limpeza de casas decimais!
        if (winAmount > 0 && totalMultiplier > 0) {
            winAmount = Number((winAmount * totalMultiplier).toFixed(2));
        } else {
            winAmount = Number(winAmount.toFixed(2));
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

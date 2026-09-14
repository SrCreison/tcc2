import { ProvablyFair } from '../src/provablyFair';
import { RoundProcessor } from '../src/roundProcessor';
import type { GameProfile } from '../src/gameMath';
import { BASE_BET_AMOUNT, BONUS_FREE_SPINS, MIN_SCATTERS_FOR_BONUS } from '../src/config';

function simulate(profile: GameProfile, spins: number) {
    let totalBet = 0;
    let totalPayout = 0;
    let hits = 0;
    let bonusTriggers = 0;
    let maxWin = 0;

    for (let i = 0; i < spins; i++) {
        const serverSeed = ProvablyFair.generateServerSeed();
        const clientSeed = 'sim';
        const nonce = i;
        const bet = BASE_BET_AMOUNT;

        totalBet += bet;
        const jogoBase = RoundProcessor.processSingleSpin(serverSeed, clientSeed, nonce, bet, false, profile, false);
        let roundPayout = jogoBase.premioRodada;
        if (jogoBase.premioRodada > 0) hits++;

        if (jogoBase.scattersNaTela >= MIN_SCATTERS_FOR_BONUS) {
            bonusTriggers++;
            for (let g = 1; g <= BONUS_FREE_SPINS; g++) {
                const giro = RoundProcessor.processSingleSpin(serverSeed, clientSeed, nonce + g, bet, true, profile, false);
                roundPayout += giro.premioRodada;
            }
        }

        totalPayout += roundPayout;
        if (roundPayout > maxWin) maxWin = roundPayout;
    }

    const rtp = (totalPayout / totalBet) * 100;
    console.log(`\n--- Perfil: ${profile} (${spins.toLocaleString('pt-BR')} giros) ---`);
    console.log(`RTP:                 ${rtp.toFixed(2)}%`);
    console.log(`Frequência de vitória (hit rate): ${((hits / spins) * 100).toFixed(2)}%`);
    console.log(`Bônus ativado:       ${bonusTriggers} vezes (1 em ${(spins / Math.max(bonusTriggers, 1)).toFixed(0)} giros)`);
    console.log(`Maior prêmio de uma rodada: R$ ${maxWin.toFixed(2)}`);
}

const N = 500_000;
simulate('normal', N);
simulate('demonstracao', N);

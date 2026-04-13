import express from 'express';
import cors from 'cors';
import { ProvablyFair } from './provablyFair';
import { GameMath } from './gameMath';
import { GameEngine } from './gameEngine';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/test-crypto', (req, res) => {
    const serverSeed = ProvablyFair.generateServerSeed();
    const clientSeed = (req.query.cSeed as string) || "semente_padrao"; 
    const nonce = parseInt(req.query.aposta as string) || 1;
    const isBonusMode = req.query.bonus === 'true';
    
    const betAmount = 2.00; 

    let cursor = 0; 
    let isCascading = true;
    let roundHistory = []; 
    let totalWinAmount = 0; 

    let currentHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce, cursor);
    let currentGrid = GameMath.generateGridFromHash(currentHash, isBonusMode);

    while (isCascading) {
        const avaliacao = GameEngine.evaluateGrid(currentGrid, betAmount);

        roundHistory.push({
            cascata: cursor,
            hashUtilizado: currentHash,
            grid: currentGrid,
            resultado: avaliacao
        });

        if (avaliacao.teveVitoria) {
            totalWinAmount += avaliacao.premioCascata; 
            cursor++; 
            currentHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce, cursor);
            let poolDeNovosSimbolos = GameMath.generateGridFromHash(currentHash, isBonusMode);
            currentGrid = GameEngine.applyCascade(currentGrid, avaliacao.posicoesParaExplodir, poolDeNovosSimbolos);
        } else {
            isCascading = false; 
        }
    }

    // --- FIM DA CASCATA: ANÁLISE FINAL DA TELA ---
    
    let totalMultiplier = 0;
    let totalScatters = 0;

    // Varre a tela final (onde as peças pararam de cair)
    currentGrid.forEach(symbol => {
        if (!symbol) return;

        // Conta as Pedras Filosofais (Só funciona se isBonusMode for true)
        if (isBonusMode && symbol.name === 'pedra_filosofal') {
            totalMultiplier += symbol.valor_multiplicador;
        }

        // Conta os Scatters na tela
        if (symbol.name === 'scatter_grimorio') {
            totalScatters++;
        }
    });

    // Aplica o multiplicador se houver ganho no modo bônus
    if (totalWinAmount > 0 && totalMultiplier > 0) {
        totalWinAmount = totalWinAmount * totalMultiplier;
    }

    // NOVO: Verifica se ativou o bônus! (4 ou mais Scatters)
    // Se o jogador JÁ ESTIVER no bônus, 3 scatters costumam dar "+5 Giros" (Retrigger). 
    // Vamos focar no acionamento inicial por enquanto.
    const ativouGirosGratis = !isBonusMode && totalScatters >= 4;

    res.json({
        mensagem: `Rodada concluída!`,
        auditoria: {
            serverSeed,
            clientSeed,
            nonce,
            modoBonusAtivo: isBonusMode,
            totalHashesGerados: cursor + 1
        },
        // NOVO BLOCO PARA O FRONTEND
        recursosEspeciais: {
            scattersNaTela: totalScatters,
            ativouGirosGratis: ativouGirosGratis
        },
        resumoFinanceiro: {
            aposta: betAmount,
            multiplicadorFinal: totalMultiplier > 0 ? `${totalMultiplier}x` : 'Nenhum',
            premioTotal: totalWinAmount
        },
        historicoRodada: roundHistory 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

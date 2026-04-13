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
    
    // NOVO: Valor da aposta em R$ (vamos assumir R$ 2.00 para este teste)
    const betAmount = 2.00; 

    let cursor = 0; 
    let isCascading = true;
    let roundHistory = []; 
    let totalWinAmount = 0; // Rastreia o prêmio total da rodada

    let currentHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce, cursor);
    let currentGrid = GameMath.generateGridFromHash(currentHash, isBonusMode);

    while (isCascading) {
        // Agora passamos o valor da aposta para a Engine!
        const avaliacao = GameEngine.evaluateGrid(currentGrid, betAmount);

        roundHistory.push({
            cascata: cursor,
            hashUtilizado: currentHash,
            grid: currentGrid,
            resultado: avaliacao
        });

        if (avaliacao.teveVitoria) {
            // Soma o prêmio da cascata ao total do jogador
            totalWinAmount += avaliacao.premioCascata; 

            cursor++; 
            currentHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce, cursor);
            let poolDeNovosSimbolos = GameMath.generateGridFromHash(currentHash, isBonusMode);
            currentGrid = GameEngine.applyCascade(currentGrid, avaliacao.posicoesParaExplodir, poolDeNovosSimbolos);
        } else {
            isCascading = false; 
        }
    }

    // A CASCATA ACABOU. HORA DE APLICAR OS MULTIPLICADORES!
    let totalMultiplier = 0;
    
    // Se o jogador ganhou algum prêmio (não adianta multiplicar zero)...
    if (totalWinAmount > 0 && isBonusMode) {
        // Varre o último grid gerado (onde a cascata parou) para achar as Pedras Filosofais
        currentGrid.forEach(symbol => {
            if (symbol && symbol.name === 'pedra_filosofal') {
                totalMultiplier += symbol.valor_multiplicador;
            }
        });

        // Se encontrou alguma pedra, multiplica o prêmio!
        if (totalMultiplier > 0) {
            totalWinAmount = totalWinAmount * totalMultiplier;
        }
    }

    res.json({
        mensagem: `Rodada concluída!`,
        auditoria: {
            serverSeed,
            clientSeed,
            nonce,
            modoBonusAtivo: isBonusMode,
            totalHashesGerados: cursor + 1
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

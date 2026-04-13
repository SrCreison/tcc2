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

    let cursor = 0; // Começamos na cascata 0
    let isCascading = true;
    let roundHistory = []; // O "filme" da rodada inteira

    // 1. Gera o Grid Inicial
    let currentHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce, cursor);
    let currentGrid = GameMath.generateGridFromHash(currentHash, isBonusMode);

    // 2. O Loop da Cascata (Roda em milissegundos no servidor)
    while (isCascading) {
        // O juiz avalia a tela atual
        const avaliacao = GameEngine.evaluateGrid(currentGrid);

        // Guardamos essa "cena" no histórico para o Frontend exibir
        roundHistory.push({
            cascata: cursor,
            hashUtilizado: currentHash,
            grid: currentGrid,
            resultado: avaliacao
        });

        if (avaliacao.teveVitoria) {
            // Se ganhou, precisamos de novos símbolos!
            cursor++; 
            
            // Geramos um NOVO hash usando o novo cursor
            currentHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce, cursor);
            
            // Geramos um pool de 30 novos símbolos para usar como "estepe"
            let poolDeNovosSimbolos = GameMath.generateGridFromHash(currentHash, isBonusMode);
            
            // A gravidade atua: remove os velhos e injeta os novos
            currentGrid = GameEngine.applyCascade(currentGrid, avaliacao.posicoesParaExplodir, poolDeNovosSimbolos);
        } else {
            // Se não formou 8 iguais, a rodada acabou!
            isCascading = false; 
        }
    }

    res.json({
        mensagem: `Rodada concluída com ${cursor} cascatas!`,
        auditoria: {
            serverSeed,
            clientSeed,
            nonce,
            modoBonusAtivo: isBonusMode,
            totalHashesGerados: cursor + 1
        },
        historicoRodada: roundHistory // O Frontend vai ler isso passo a passo!
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

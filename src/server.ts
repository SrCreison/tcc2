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

    // 1. Gera o Hash
    const gameHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce);

    // 2. Gera os primeiros 30 símbolos
    const gridGerado = GameMath.generateGridFromHash(gameHash, isBonusMode);

    // 3. Avaliação do grid com os resultados gerados
    const avaliacao = GameEngine.evaluateGrid(gridGerado);

    res.json({
        mensagem: isBonusMode ? "Grid BÔNUS Gerado!" : "Grid BASE Gerado!",
        auditoria: {
            serverSeed,
            clientSeed,
            nonce,
            hashFinal: gameHash,
            modoBonusAtivo: isBonusMode
        },
        estatisticas: {
            scatters: gridGerado.filter(s => s.name === 'scatter_grimorio').length,
            multiplicadores: gridGerado.filter(s => s.name === 'pedra_filosofal').length,
        },
        // Mostramos o resultado da avaliação aqui:
        resultadoRodada: avaliacao,
        grid: gridGerado
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

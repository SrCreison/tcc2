import express from 'express';
import cors from 'cors';
import { ProvablyFair } from './provablyFair';
import { GameMath } from './gameMath';

const app = express();
app.use(cors());
app.use(express.json());

// Nossa rota principal
app.get('/api/test-crypto', (req, res) => {
    // 1. Servidor gera sua semente aleatória (CSPRNG)
    const serverSeed = ProvablyFair.generateServerSeed();
    
    // 2. Captura a Client Seed enviada pela URL (?cSeed=). Se não vier, usa um padrão.
    const clientSeed = (req.query.cSeed as string) || "semente_padrao"; 
    
    // 3. Captura o Nonce (número da aposta) pela URL (?aposta=).
    const nonce = parseInt(req.query.aposta as string) || 1;

    // 4. Junta tudo para criar o destino da rodada
    const gameHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce);

    // 5. MÁGICA: Transforma o Hash no Grid 6x5 usando a tabela de probabilidades
    const gridGerado = GameMath.generateGridFromHash(gameHash);

    // 6. Devolve o resultado formatado para a tela
    res.json({
        mensagem: "Grid Gerado com Sucesso!",
        auditoria: {
            serverSeed: serverSeed,
            clientSeed: clientSeed,
            nonce: nonce,
            hashFinal: gameHash
        },
        scattersEncontrados: gridGerado.filter(s => s.name === 'scatter_grimorio').length,
        grid: gridGerado
    });
});

// Usando a porta dinâmica para não dar erro na nuvem
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

import express from 'express';
import cors from 'cors';
import { ProvablyFair } from './provablyFair';
import { RoundProcessor } from './roundProcessor'; // Usando o nosso novo Maestro

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/test-crypto', (req, res) => {
    // 1. Variáveis de Entrada do Jogador
    const clientSeed = (req.query.cSeed as string) || "jogador_123"; 
    const baseNonce = parseInt(req.query.aposta as string) || 1;
    const betAmount = 2.00; 

    // O Cassino gera a semente (Num jogo real, ela seria buscada no banco de dados)
    const serverSeed = ProvablyFair.generateServerSeed(); 

    // --- EXECUÇÃO DO JOGO BASE ---
    const jogoBase = RoundProcessor.processSingleSpin(serverSeed, clientSeed, baseNonce, betAmount, false);
    
    // Verifica se ativou o Bônus
    const ativouBônus = jogoBase.scattersNaTela >= 4;
    
    let totalHashesUtilizados = jogoBase.hashesGerados;
    let premioFinalTotal = jogoBase.premioRodada;
    let dadosDoBonus = null;

    // --- MÁGICA: EXECUÇÃO DO BÔNUS (TRANSAÇÃO ATÔMICA) ---
    if (ativouBônus) {
        dadosDoBonus = {
            quantidadeGiros: 10,
            premioTotalBonus: 0,
            giros: [] as any[] // Array para tipar no typescript
        };

        // Roda os 10 giros grátis instantaneamente no servidor!
        for (let i = 1; i <= 10; i++) {
            // O Nonce aumenta a cada giro grátis para garantir hashes únicos!
            const bonusNonce = baseNonce + i; 
            
            const giroBonus = RoundProcessor.processSingleSpin(serverSeed, clientSeed, bonusNonce, betAmount, true);

            dadosDoBonus.giros.push({
                giro: i,
                nonceUtilizado: bonusNonce,
                scattersNaTela: giroBonus.scattersNaTela,
                multiplicadorFinal: giroBonus.multiplicadorAplicado,
                premio: giroBonus.premioRodada,
                historico: giroBonus.historico
            });

            dadosDoBonus.premioTotalBonus += giroBonus.premioRodada;
            totalHashesUtilizados += giroBonus.hashesGerados;
        }

        // Soma o prêmio do jogo base com o que ganhou no bônus
        premioFinalTotal += dadosDoBonus.premioTotalBonus;
    }

    // --- ENTREGA O "ROTEIRO DO FILME" PARA O FRONTEND ---
    res.json({
        mensagem: ativouBônus ? "BÔNUS ATIVADO! 10 Giros Grátis Calculados." : "Rodada Base concluída.",
        auditoria: {
            serverSeed,
            clientSeed,
            nonceInicial: baseNonce,
            totalHashesGerados: totalHashesUtilizados
        },
        resumoFinanceiro: {
            aposta: betAmount,
            premioTotalDaSessao: premioFinalTotal
        },
        roteiroDoJogo: {
            jogoBase: {
                scattersEncontrados: jogoBase.scattersNaTela,
                ativouGirosGratis: ativouBônus,
                premioRodada: jogoBase.premioRodada,
                historicoRodada: jogoBase.historico
            },
            jogoBonus: dadosDoBonus
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { ProvablyFair } from './provablyFair';
import { RoundProcessor } from './roundProcessor';

const app = express();
const prisma = new PrismaClient();

// 1. Configuração do Middleware CORS
app.use(cors({
  origin: 'https://play.abraaodaldon.com.br',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ROTA 1: JOGO PRINCIPAL (Com Gravação no Banco)
app.get('/api/play', async (req, res) => {
    try {
        const clientSeed = (req.query.cSeed as string) || "jogador_123"; 
        const baseNonce = parseInt(req.query.aposta as string) || Math.floor(Math.random() * 99999);
        const isBonusBuy = req.query.buyBonus === 'true'; 
        const betAmount = 2.00; 
        
        let costOfSpin = isBonusBuy ? betAmount * 100 : betAmount;
        const serverSeed = ProvablyFair.generateServerSeed(); 

        // Processa a Rodada Base
        const jogoBase = RoundProcessor.processSingleSpin(serverSeed, clientSeed, baseNonce, betAmount, false, isBonusBuy);
        
        const ativouBonus = jogoBase.scattersNaTela >= 4;
        let premioFinalTotal = jogoBase.premioRodada;
        let dadosDoBonus = null;

        // Lógica de Bônus (Se ativado ou comprado)
        if (ativouBonus) {
            dadosDoBonus = { quantidadeGiros: 10, premioTotalBonus: 0, giros: [] as any[] };

            for (let i = 1; i <= 10; i++) {
                const bonusNonce = baseNonce + i; 
                const giroBonus = RoundProcessor.processSingleSpin(serverSeed, clientSeed, bonusNonce, betAmount, true, false);
                
                dadosDoBonus.giros.push({
                    giro: i,
                    premio: giroBonus.premioRodada,
                    grid: giroBonus.historico[0].grid // Pegamos o grid final do giro
                });
                dadosDoBonus.premioTotalBonus += giroBonus.premioRodada;
            }
            premioFinalTotal = Number((premioFinalTotal + dadosDoBonus.premioTotalBonus).toFixed(2));
        }

        // SALVANDO NO BANCO (Prisma)
        const savedRound = await prisma.gameRound.create({
            data: {
                serverSeed,
                clientSeed,
                nonce: baseNonce,
                betAmount: costOfSpin,
                payout: premioFinalTotal,
                isBonusBuy: isBonusBuy,
                totalScatters: jogoBase.scattersNaTela,
                history: jogoBase.historico as any // Salva o histórico de cascatas
            }
        });

        res.json({
            id: savedRound.id,
            mensagem: ativouBonus ? "BÔNUS ATIVADO!" : "Rodada Base concluída.",
            auditoria: { serverSeed, clientSeed, nonceInicial: baseNonce },
            resumoFinanceiro: {
                valorApostado: costOfSpin,
                premioTotalDaSessao: premioFinalTotal,
                lucroSessao: Number((premioFinalTotal - costOfSpin).toFixed(2))
            },
            roteiroDoJogo: {
                jogoBase: {
                    scattersEncontrados: jogoBase.scattersNaTela,
                    ativouGirosGratis: ativouBonus,
                    premioRodada: jogoBase.premioRodada,
                    historicoRodada: jogoBase.historico
                },
                jogoBonus: dadosDoBonus
            }
        });
    } catch (error) {
        console.error("Erro no processamento:", error);
        res.status(500).json({ erro: "Erro interno no servidor de jogo." });
    }
});

// ROTA 2: HISTÓRICO (Para a barra lateral do front)
app.get('/api/history', async (req, res) => {
    const history = await prisma.gameRound.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
    });
    res.json(history);
});

// ROTA 3: CALCULADORA PROVABLY FAIR (Auditoria)
app.post('/api/verify', async (req, res) => {
    const { serverSeed, clientSeed, nonceInicial, isBonusBuy } = req.body;
    const betAmount = 2.00; 
    const jogoBase = RoundProcessor.processSingleSpin(serverSeed, clientSeed, nonceInicial, betAmount, false, isBonusBuy);
    res.json({ verificado: true, jogoBase });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Alquimia rodando na porta ${PORT}`);
});

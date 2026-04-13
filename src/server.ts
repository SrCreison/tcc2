import express from 'express';
import cors from 'cors';
import { ProvablyFair } from './provablyFair';
import { RoundProcessor } from './roundProcessor';

const app = express();

// 1. Configuração do Middleware CORS
// Usamos apenas uma vez. O origin deve ser EXATAMENTE o que aparece no navegador.
app.use(cors({
  origin: 'https://play.abraaodaldon.com.br',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 2. Middleware de segurança extra para evitar headers duplicados (Garante valor único)
app.use((req, res, next) => {
    res.removeHeader('Access-Control-Allow-Origin'); // Remove se existir algum lixo anterior
    res.header("Access-Control-Allow-Origin", "https://play.abraaodaldon.com.br");
    next();
});

app.use(express.json());

// ROTA 1: JOGO PRINCIPAL
app.get('/api/play', (req, res) => {
    const clientSeed = (req.query.cSeed as string) || "jogador_123"; 
    const baseNonce = parseInt(req.query.aposta as string) || 1;
    const isBonusBuy = req.query.buyBonus === 'true'; 
    
    const betAmount = 2.00; 
    
    let costOfSpin = betAmount;
    if (isBonusBuy) {
        costOfSpin = betAmount * 100; 
    }

    const serverSeed = ProvablyFair.generateServerSeed(); 

    const jogoBase = RoundProcessor.processSingleSpin(serverSeed, clientSeed, baseNonce, betAmount, false, isBonusBuy);
    
    const ativouBônus = jogoBase.scattersNaTela >= 4;
    
    let totalHashesUtilizados = jogoBase.hashesGerados;
    let premioFinalTotal = jogoBase.premioRodada;
    let dadosDoBonus = null;

    if (ativouBônus) {
        dadosDoBonus = {
            quantidadeGiros: 10,
            premioTotalBonus: 0,
            giros: [] as any[] 
        };

        for (let i = 1; i <= 10; i++) {
            const bonusNonce = baseNonce + i; 
            const giroBonus = RoundProcessor.processSingleSpin(serverSeed, clientSeed, bonusNonce, betAmount, true, false);

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
        
        dadosDoBonus.premioTotalBonus = Number(dadosDoBonus.premioTotalBonus.toFixed(2));
        premioFinalTotal = Number((premioFinalTotal + dadosDoBonus.premioTotalBonus).toFixed(2));
    }

    res.json({
        mensagem: ativouBônus ? "BÔNUS ATIVADO!" : "Rodada Base concluída.",
        auditoria: {
            serverSeed,
            clientSeed,
            nonceInicial: baseNonce,
            totalHashesGerados: totalHashesUtilizados,
            isBonusBuy: isBonusBuy
        },
        resumoFinanceiro: {
            valorApostado: costOfSpin,
            valorBaseMoeda: betAmount,
            premioTotalDaSessao: premioFinalTotal,
            lucroSessao: Number((premioFinalTotal - costOfSpin).toFixed(2))
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

// ROTA 2: CALCULADORA PROVABLY FAIR
app.post('/api/verify', (req, res) => {
    const { serverSeed, clientSeed, nonceInicial, isBonusBuy } = req.body;

    if (!serverSeed || !clientSeed || !nonceInicial) {
         res.status(400).json({ erro: "Sementes incompletas para verificação." });
         return;
    }

    const betAmount = 2.00; 
    
    const jogoBase = RoundProcessor.processSingleSpin(serverSeed, clientSeed, nonceInicial, betAmount, false, isBonusBuy);
    const ativouBônus = jogoBase.scattersNaTela >= 4;
    
    let premioFinalTotal = jogoBase.premioRodada;
    let dadosDoBonus = null;

    if (ativouBônus) {
        dadosDoBonus = { giros: [] as any[], premioTotalBonus: 0 };
        for (let i = 1; i <= 10; i++) {
            const giro = RoundProcessor.processSingleSpin(serverSeed, clientSeed, nonceInicial + i, betAmount, true, false);
            dadosDoBonus.giros.push(giro);
            dadosDoBonus.premioTotalBonus += giro.premioRodada;
        }
        premioFinalTotal += dadosDoBonus.premioTotalBonus;
    }

    res.json({
        mensagem: "Auditoria concluída. Os resultados matemáticos são:",
        verificadoComSucesso: true,
        premioCalculado: Number(premioFinalTotal.toFixed(2)),
        detalhes: {
            jogoBase,
            jogoBonus: dadosDoBonus
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

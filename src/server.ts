import express from 'express';
import cors from 'cors';
import { ProvablyFair } from './provablyFair';
import { RoundProcessor } from './roundProcessor';

const app = express();
app.use(cors());
app.use(express.json());

// ROTA 1: JOGO PRINCIPAL
app.get('/api/play', (req, res) => {
    const clientSeed = (req.query.cSeed as string) || "jogador_123"; 
    const baseNonce = parseInt(req.query.aposta as string) || 1;
    const isBonusBuy = req.query.buyBonus === 'true'; // Verifica se o usuário comprou o recurso
    
    const betAmount = 2.00; 
    
    // Matemática Financeira da Compra de Bônus
    let costOfSpin = betAmount;
    if (isBonusBuy) {
        costOfSpin = betAmount * 100; // Custa 100x a aposta (R$ 200)
    }

    const serverSeed = ProvablyFair.generateServerSeed(); 

    // O jogo base roda sabendo se é uma compra ou não
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
        
        // Fix de casas decimais para o total
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
            lucroSessao: Number((premioFinalTotal - costOfSpin).toFixed(2)) // Mostra se a pessoa saiu no lucro ou prejuízo
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

// ROTA 2: CALCULADORA PROVABLY FAIR (AUDITORIA)
// O jogador manda as seeds reveladas, e o servidor recalcula o jogo aberto.
app.post('/api/verify', (req, res) => {
    const { serverSeed, clientSeed, nonceInicial, isBonusBuy } = req.body;

    if (!serverSeed || !clientSeed || !nonceInicial) {
         res.status(400).json({ erro: "Sementes incompletas para verificação." });
         return;
    }

    const betAmount = 2.00; // Hardcoded para simplificar a auditoria
    
    // Roda o simulador exatamente igual a rota oficial
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

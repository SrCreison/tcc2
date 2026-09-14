import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { ProvablyFair } from './provablyFair';
import { RoundProcessor } from './roundProcessor';
import { createRateLimiter } from './rateLimiter';
import {
    BASE_BET_AMOUNT,
    BONUS_BUY_COST_MULTIPLIER,
    BONUS_FREE_SPINS,
    MAX_CLIENT_SEED_LENGTH,
    MIN_SCATTERS_FOR_BONUS,
} from './config';
import type { BonusRoundResult } from './types';

const app = express();

/**
 * CONFIGURAÇÃO PRISMA 7 + POSTGRESQL
 * Na versão 7, o Prisma exige que a conexão seja feita via adaptador
 * quando a URL não está diretamente no schema.prisma.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    // Falha rápido e com uma mensagem clara em vez de deixar o Pool
    // tentar conectar em "undefined" e falhar de forma confusa depois.
    throw new Error('DATABASE_URL não definida. Configure o arquivo .env (veja .env.example).');
}
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Permite configurar a origem via ambiente (útil em dev), com o domínio
// de produção como padrão.
const corsOrigin = process.env.CORS_ORIGIN ?? 'https://play.abraaodaldon.com.br';
app.use(
    cors({
        origin: corsOrigin,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }),
);

app.use(express.json());

// Limite simples para o endpoint que grava no banco: no máx. 20
// requisições por 10s por IP. Ver rateLimiter.ts para o porquê.
const playRateLimiter = createRateLimiter({ windowMs: 10_000, max: 20 });

/** Garante um clientSeed sempre presente e de tamanho limitado. */
function sanitizeClientSeed(raw: unknown): string {
    const value = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : 'jogador_123';
    return value.slice(0, MAX_CLIENT_SEED_LENGTH);
}

/**
 * Interpreta o nonce vindo da query string.
 *
 * BUG CORRIGIDO: a versão anterior usava `parseInt(...) || fallback`.
 * Como 0 é "falsy" em JavaScript, pedir explicitamente `aposta=0` era
 * silenciosamente substituído por um nonce aleatório — o jogador nunca
 * conseguia, de fato, jogar com nonce 0. Aqui a checagem é feita com
 * Number.isFinite, então só cai no fallback quando o valor realmente
 * não foi informado ou não é um número válido.
 */
function parseNonce(raw: unknown): number {
    if (typeof raw === 'string' && raw.trim() !== '') {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
            return Math.trunc(parsed);
        }
    }
    return ProvablyFair.generateNonce();
}

// ROTA 1: JOGO PRINCIPAL (com gravação no banco)
app.get('/api/play', playRateLimiter, async (req, res) => {
    try {
        const clientSeed = sanitizeClientSeed(req.query.cSeed);
        const baseNonce = parseNonce(req.query.aposta);
        const isBonusBuy = req.query.buyBonus === 'true';
        const betAmount = BASE_BET_AMOUNT;

        const costOfSpin = isBonusBuy ? betAmount * BONUS_BUY_COST_MULTIPLIER : betAmount;
        const serverSeed = ProvablyFair.generateServerSeed();

        // Processa a rodada base
        const jogoBase = RoundProcessor.processSingleSpin(serverSeed, clientSeed, baseNonce, betAmount, false, isBonusBuy);

        const ativouBonus = jogoBase.scattersNaTela >= MIN_SCATTERS_FOR_BONUS;
        let premioFinalTotal = jogoBase.premioRodada;
        let dadosDoBonus: BonusRoundResult | null = null;

        // Lógica de bônus (se ativado ou comprado)
        if (ativouBonus) {
            dadosDoBonus = { quantidadeGiros: BONUS_FREE_SPINS, premioTotalBonus: 0, giros: [] };

            for (let i = 1; i <= BONUS_FREE_SPINS; i++) {
                const bonusNonce = baseNonce + i;
                const giroBonus = RoundProcessor.processSingleSpin(serverSeed, clientSeed, bonusNonce, betAmount, true, false);

                dadosDoBonus.giros.push({
                    giro: i,
                    nonceUtilizado: bonusNonce,
                    scattersNaTela: giroBonus.scattersNaTela,
                    multiplicadorFinal: giroBonus.multiplicadorAplicado,
                    premio: giroBonus.premioRodada,
                    grid: giroBonus.historico[giroBonus.historico.length - 1].grid,
                });
                dadosDoBonus.premioTotalBonus += giroBonus.premioRodada;
            }
            dadosDoBonus.premioTotalBonus = Number(dadosDoBonus.premioTotalBonus.toFixed(2));
            premioFinalTotal = Number((premioFinalTotal + dadosDoBonus.premioTotalBonus).toFixed(2));
        }

        const savedRound = await prisma.gameRound.create({
            data: {
                serverSeed,
                clientSeed,
                nonce: baseNonce,
                betAmount: costOfSpin,
                payout: premioFinalTotal,
                isBonusBuy,
                totalScatters: jogoBase.scattersNaTela,
                history: jogoBase.historico as any,
            },
        });

        res.json({
            id: savedRound.id,
            mensagem: ativouBonus ? 'BÔNUS ATIVADO!' : 'Rodada Base concluída.',
            auditoria: { serverSeed, clientSeed, nonceInicial: baseNonce },
            resumoFinanceiro: {
                valorApostado: costOfSpin,
                premioTotalDaSessao: premioFinalTotal,
                lucroSessao: Number((premioFinalTotal - costOfSpin).toFixed(2)),
            },
            roteiroDoJogo: {
                jogoBase: {
                    scattersEncontrados: jogoBase.scattersNaTela,
                    ativouGirosGratis: ativouBonus,
                    premioRodada: jogoBase.premioRodada,
                    historicoRodada: jogoBase.historico,
                },
                jogoBonus: dadosDoBonus,
            },
        });
    } catch (error) {
        console.error('Erro no processamento:', error);
        res.status(500).json({ erro: 'Erro interno no servidor de jogo.' });
    }
});

// ROTA 2: HISTÓRICO (para a barra lateral do front)
app.get('/api/history', async (_req, res) => {
    try {
        const history = await prisma.gameRound.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
        });
        res.json(history);
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        res.status(500).json({ erro: 'Erro ao carregar histórico.' });
    }
});

// ROTA 3: CALCULADORA PROVABLY FAIR (auditoria)
app.post('/api/verify', async (req, res) => {
    try {
        const { serverSeed, clientSeed, nonceInicial, isBonusBuy } = req.body ?? {};

        if (typeof serverSeed !== 'string' || serverSeed.length === 0) {
            res.status(400).json({ erro: 'serverSeed é obrigatório e deve ser uma string.' });
            return;
        }
        if (typeof clientSeed !== 'string' || clientSeed.length === 0) {
            res.status(400).json({ erro: 'clientSeed é obrigatório e deve ser uma string.' });
            return;
        }
        const nonce = Number(nonceInicial);
        if (!Number.isFinite(nonce)) {
            res.status(400).json({ erro: 'nonceInicial é obrigatório e deve ser numérico.' });
            return;
        }

        const jogoBase = RoundProcessor.processSingleSpin(
            serverSeed,
            clientSeed,
            Math.trunc(nonce),
            BASE_BET_AMOUNT,
            false,
            isBonusBuy === true,
        );
        res.json({ verificado: true, jogoBase });
    } catch (error) {
        console.error('Erro na verificação:', error);
        res.status(400).json({ erro: 'Erro na verificação dos dados.' });
    }
});

// ROTA 4: HEALTHCHECK (útil para probes de infraestrutura/Jelastic)
app.get('/api/health', async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', database: 'up' });
    } catch (error) {
        console.error('Healthcheck falhou:', error);
        res.status(503).json({ status: 'degraded', database: 'down' });
    }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor Alquimia rodando na porta ${PORT}`);
});

// Encerramento gracioso: garante que conexões com o banco não fiquem
// penduradas quando o processo recebe SIGTERM (ex.: deploy/restart).
async function shutdown(signal: string) {
    console.log(`\nRecebido ${signal}, encerrando com segurança...`);
    server.close();
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

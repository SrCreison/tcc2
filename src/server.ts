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
    GameMath,
    GAME_PROFILES,
    DEFAULT_GAME_PROFILE,
    PROFILE_REFERENCE_STATS,
    type GameProfile,
} from './gameMath';
import {
    BASE_BET_AMOUNT,
    BONUS_BUY_COST_MULTIPLIER,
    BONUS_FREE_SPINS,
    COLUMNS,
    GRID_SIZE,
    MAX_BET_AMOUNT,
    MAX_CLIENT_SEED_LENGTH,
    MIN_BET_AMOUNT,
    MIN_SCATTERS_FOR_BONUS,
    MIN_WIN_COUNT,
    ROWS,
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
 * BUG CORRIGIDO (herdado de uma versão anterior): usar
 * `parseInt(...) || fallback` faz `aposta=0` ser silenciosamente
 * substituído por um nonce aleatório, já que 0 é "falsy" em JS. Aqui a
 * checagem usa Number.isFinite, então só cai no fallback quando o valor
 * realmente não foi informado ou não é numérico.
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

/** Valida o valor de aposta informado pelo jogador, com limites sãos. */
function parseBetAmount(raw: unknown): number {
    if (typeof raw === 'string' && raw.trim() !== '') {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= MIN_BET_AMOUNT && parsed <= MAX_BET_AMOUNT) {
            return Math.round(parsed * 100) / 100;
        }
    }
    return BASE_BET_AMOUNT;
}

/**
 * Valida o perfil de pesos pedido. Qualquer valor fora da lista
 * conhecida cai no perfil padrão — nunca lança erro por causa disso,
 * já que é só um parâmetro de exibição/demonstração, não algo sensível.
 */
function parseProfile(raw: unknown): GameProfile {
    if (typeof raw === 'string' && (GAME_PROFILES as string[]).includes(raw)) {
        return raw as GameProfile;
    }
    return DEFAULT_GAME_PROFILE;
}

// ROTA 1: JOGO PRINCIPAL (com gravação no banco)
app.get('/api/play', playRateLimiter, async (req, res) => {
    try {
        const clientSeed = sanitizeClientSeed(req.query.cSeed);
        const baseNonce = parseNonce(req.query.aposta);
        const isBonusBuy = req.query.buyBonus === 'true';
        const betAmount = parseBetAmount(req.query.valorAposta);
        const profile = parseProfile(req.query.modo);

        const costOfSpin = isBonusBuy ? Number((betAmount * BONUS_BUY_COST_MULTIPLIER).toFixed(2)) : betAmount;
        const serverSeed = ProvablyFair.generateServerSeed();

        // Processa a rodada base
        const jogoBase = RoundProcessor.processSingleSpin(serverSeed, clientSeed, baseNonce, betAmount, false, profile, isBonusBuy);

        const ativouBonus = jogoBase.scattersNaTela >= MIN_SCATTERS_FOR_BONUS;
        let premioFinalTotal = jogoBase.premioRodada;
        let dadosDoBonus: BonusRoundResult | null = null;

        // Lógica de bônus (se ativado ou comprado)
        if (ativouBonus) {
            dadosDoBonus = { quantidadeGiros: BONUS_FREE_SPINS, premioTotalBonus: 0, giros: [] };

            for (let i = 1; i <= BONUS_FREE_SPINS; i++) {
                const bonusNonce = baseNonce + i;
                const giroBonus = RoundProcessor.processSingleSpin(serverSeed, clientSeed, bonusNonce, betAmount, true, profile, false);

                dadosDoBonus.giros.push({
                    giro: i,
                    nonceUtilizado: bonusNonce,
                    scattersNaTela: giroBonus.scattersNaTela,
                    multiplicadorFinal: giroBonus.multiplicadorAplicado,
                    premio: giroBonus.premioRodada,
                    historico: giroBonus.historico,
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
                profile,
                history: jogoBase.historico as any,
            },
        });

        res.json({
            id: savedRound.id,
            mensagem: ativouBonus ? 'BÔNUS ATIVADO!' : 'Rodada Base concluída.',
            perfilUtilizado: profile,
            auditoria: { serverSeed, clientSeed, nonceInicial: baseNonce, valorAposta: betAmount, perfil: profile, isBonusBuy },
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
// Recebe os dados públicos de uma rodada já jogada (serverSeed é
// revelado na resposta de /api/play) e recalcula o resultado do zero.
// Se bater com o que foi exibido ao jogador, a rodada está provada.
app.post('/api/verify', async (req, res) => {
    try {
        const { serverSeed, clientSeed, nonceInicial, isBonusBuy, valorAposta, perfil } = req.body ?? {};

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

        const betAmount = parseBetAmount(valorAposta);
        const profile = parseProfile(perfil);

        const jogoBase = RoundProcessor.processSingleSpin(
            serverSeed,
            clientSeed,
            Math.trunc(nonce),
            betAmount,
            false,
            profile,
            isBonusBuy === true,
        );
        res.json({ verificado: true, perfilUtilizado: profile, valorApostaUtilizado: betAmount, jogoBase });
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

// ROTA 5: CONFIGURAÇÃO/DIDÁTICA — números reais usados pelo motor do
// jogo (pesos, regras, estatísticas de referência), consumidos pela
// tela "Como funciona" do front. Existe pra a explicação nunca ficar
// dessincronizada do código: em vez de descrever os pesos em texto
// fixo, o front busca os valores atuais aqui.
app.get('/api/config', (_req, res) => {
    res.json({
        grid: { colunas: COLUMNS, linhas: ROWS, totalCasas: GRID_SIZE },
        regras: {
            minimoParaPagar: MIN_WIN_COUNT,
            scattersParaBonus: MIN_SCATTERS_FOR_BONUS,
            girosGratisNoBonus: BONUS_FREE_SPINS,
            multiplicadorCompraDeBonus: BONUS_BUY_COST_MULTIPLIER,
        },
        aposta: { minima: MIN_BET_AMOUNT, maxima: MAX_BET_AMOUNT, padrao: BASE_BET_AMOUNT },
        perfis: GAME_PROFILES.map((profile) => ({
            id: profile,
            pesos: GameMath.getWeightsSnapshot(profile),
            estatisticasDeReferencia: PROFILE_REFERENCE_STATS[profile],
        })),
    });
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

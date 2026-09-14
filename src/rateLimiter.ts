import type { NextFunction, Request, Response } from 'express';

/**
 * Rate limiter bem simples, em memória, sem dependência externa.
 *
 * O endpoint /api/play grava no banco a cada chamada e não exige
 * autenticação — hoje qualquer pessoa pode martelar a URL pública sem
 * limite algum. Isso não é um requisito do estudo de caso em si (que é
 * sobre CSPRNG), mas é o tipo de "erro possível" que vale corrigir antes
 * de deixar a API exposta publicamente. Para um serviço real, o ideal é
 * um limiter compartilhado (Redis) atrás de múltiplas instâncias; para
 * este projeto de demonstração, em memória já resolve.
 */
export function createRateLimiter(options: { windowMs: number; max: number }) {
    const hits = new Map<string, number[]>();

    return function rateLimiter(req: Request, res: Response, next: NextFunction) {
        const key = req.ip ?? 'unknown';
        const now = Date.now();
        const windowStart = now - options.windowMs;

        const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);
        timestamps.push(now);
        hits.set(key, timestamps);

        if (timestamps.length > options.max) {
            res.status(429).json({ erro: 'Muitas requisições. Tente novamente em instantes.' });
            return;
        }

        next();
    };
}

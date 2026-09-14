import crypto from 'crypto';

/**
 * Núcleo criptográfico do estudo de caso.
 *
 * A ideia de "provably fair" aqui é: cada rodada usa um serverSeed novo,
 * gerado por um CSPRNG (crypto.randomBytes), e o resultado é derivado
 * dele via HMAC-SHA256. Como o serverSeed é devolvido ao final da rodada
 * (ver server.ts) e o endpoint /api/verify recalcula a rodada a partir
 * dele, qualquer pessoa consegue reproduzir e conferir o resultado.
 *
 * HashCursor centraliza a leitura de bytes do hash. Antes, gameMath.ts
 * controlava um índice (`hashIndex`) manualmente e cada trecho de código
 * precisava lembrar de incrementá-lo — um único esquecimento geraria
 * reaproveitamento de byte (correlação estatística) ou, num grid com
 * muita Pedra Filosofal, estouro do hash (32 bytes/64 hex chars). O
 * cursor abaixo nunca estoura: ao chegar ao fim do hash, ele recomeça a
 * leitura por cima do próprio hash (wrap-around), o que é seguro porque
 * cada leitura já é combinada com sua posição no grid antes de virar
 * número (ver GameMath.pickWeightedIndex / pickMultiplierIndex).
 */
export class HashCursor {
    private position = 0;

    constructor(private readonly hash: string) {}

    /** Lê o próximo byte (0-255) do hash, avançando o cursor. */
    nextByte(): number {
        const start = this.position % this.hash.length;
        let hex = this.hash.substring(start, start + 2);
        if (hex.length < 2) {
            // Chegamos ao fim da string hex: completa lendo do início.
            hex = (this.hash + this.hash).substring(start, start + 2);
        }
        this.position += 2;
        return parseInt(hex, 16);
    }
}

export class ProvablyFair {
    /** Gera 32 bytes aleatórios criptograficamente seguros (CSPRNG). */
    static generateServerSeed(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Gera um nonce inicial usando o CSPRNG do Node em vez de Math.random().
     * Não é estritamente necessário para a segurança do resultado (o
     * serverSeed já garante isso), mas mantém o projeto inteiro consistente
     * com o tema de estudo: nenhuma fonte de aleatoriedade "fraca" usada
     * onde um CSPRNG está disponível.
     */
    static generateNonce(): number {
        return crypto.randomInt(0, 999_999);
    }

    /**
     * Deriva o hash determinístico de uma cascata específica.
     * `cursor` é o número da cascata (0 = giro inicial, 1 = após a primeira
     * queda de símbolos, etc.) — incluí-lo na mensagem garante que cada
     * cascata tenha seu próprio hash, mesmo dentro da mesma rodada/nonce.
     */
    static generateHash(serverSeed: string, clientSeed: string, nonce: number, cursor: number = 0): string {
        const message = `${clientSeed}:${nonce}:${cursor}`;

        return crypto
            .createHmac('sha256', serverSeed)
            .update(message)
            .digest('hex');
    }
}

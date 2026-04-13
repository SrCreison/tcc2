import crypto from 'crypto';

export class ProvablyFair {
    static generateServerSeed(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    // NOVO: Adicionamos o "cursor" com valor padrão 0
    static generateHash(serverSeed: string, clientSeed: string, nonce: number, cursor: number = 0): string {
        // A mensagem agora inclui a cascata atual!
        const message = `${clientSeed}:${nonce}:${cursor}`;
        
        return crypto
            .createHmac('sha256', serverSeed)
            .update(message)
            .digest('hex');
    }
}

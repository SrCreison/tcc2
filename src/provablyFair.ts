import crypto from 'crypto';

export class ProvablyFair {
    

    static generateServerSeed(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    static generateHash(serverSeed: string, clientSeed: string, nonce: number): string {
        const message = `${clientSeed}:${nonce}`;
        
        return crypto
            .createHmac('sha256', serverSeed)
            .update(message)
            .digest('hex');
    }
}

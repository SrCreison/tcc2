import express from 'express';
import cors from 'cors';
import { ProvablyFair } from './provablyFair';

const app = express();
app.use(cors());
app.use(express.json());

// Rota de teste para ver a mágica acontecendo
app.get('/api/test-crypto', (req, res) => {
    const serverSeed = ProvablyFair.generateServerSeed();
    // Captura a Client Seed enviada pela URL (Query Parameter).
    // Se o usuário não mandar nada, usamos "semente_padrao" para não dar erro.
    const clientSeed = (req.query.cSeed as string) || "semente_padrao"; 
    // O Nonce (número da aposta) também costuma vir do banco de dados, 
    // mas por enquanto vamos simular pegando da URL também!
    const nonce = parseInt(req.query.aposta as string) || 1;

    res.json({
        mensagem: "Motor Criptográfico Online!",
        serverSeed: serverSeed,
        clientSeed: clientSeed,
        nonce: nonce,
        hashFinal: gameHash
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta http://localhost:${PORT}`);
});import crypto from 'crypto';

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

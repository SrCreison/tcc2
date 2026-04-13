import express from 'express';
import cors from 'cors';
import { ProvablyFair } from './provablyFair';

const app = express();
app.use(cors());
app.use(express.json());

// Rota de teste para ver a mágica acontecendo
app.get('/api/test-crypto', (req, res) => {
    // 1. O Servidor gera sua semente secreta (CSPRNG)
    const serverSeed = ProvablyFair.generateServerSeed();
    
    // 2. O Jogador (ou navegador) fornece a dele e o número da aposta
    const clientSeed = "MeuTCC_Alquimia_2024";
    const nonce = 1;

    // 3. A combinação dos três gera o destino do jogo
    const gameHash = ProvablyFair.generateHash(serverSeed, clientSeed, nonce);

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

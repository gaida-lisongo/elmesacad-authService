const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Import de l'application (on va créer une version exportable pour le test)
const app = express();
app.use(express.json());
const routes = require('./routes');
app.use('/api/v1', routes);

let mongoServer;

const SHARED_KEY = "test_shared_key";
const JWT_SECRET = "test_jwt_secret";

beforeAll(async () => {
    process.env.GLOBAL_SHARED_KEY = SHARED_KEY;
    process.env.JWT_SECRET = JWT_SECRET;
    
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

afterAll(async () => {
    await mongoose.disconnect().catch(() => {});
    if (mongoServer) {
        try {
            await mongoServer.stop();
        } catch {
            // Évite d'échouer le run si l'arrêt du binaire mongod est restreint (sandbox, permissions)
        }
    }
});

describe('Auth Service - Traefik & Provisioning Tests', () => {
    const clientData = {
        apiKey: "client-123",
        apiSecret: "secret-456",
        designation: "Test App",
        duration: 3600
    };

    const generateSignature = (apiKey, timestamp) => {
        return crypto
            .createHmac('sha256', SHARED_KEY)
            .update(timestamp + apiKey)
            .digest('hex');
    };

    let clientToken;

    test('POST /provision - Devrait créer un client et retourner un token', async () => {
        const timestamp = Date.now().toString();
        const signature = generateSignature(clientData.apiKey, timestamp);

        const res = await request(app)
            .post('/api/v1/client/provision')
            .send({
                ...clientData,
                timestamp,
                signature
            });

        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('token');
        clientToken = res.body.token;
    });

    test('GET /validate - Devrait valider un token correct (Traefik mode)', async () => {
        const res = await request(app)
            .get('/api/v1/client/validate')
            .set('Authorization', `Bearer ${clientToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.text).toBe('OK');
        expect(res.headers).toHaveProperty('x-client-id');
    });

    test('GET /validate - Devrait rejeter un token invalide', async () => {
        const res = await request(app)
            .get('/api/v1/client/validate')
            .set('Authorization', `Bearer invalid_token`);

        expect(res.statusCode).toBe(401);
    });

    test('POST /verify - Devrait vérifier l\'état du client avec signature', async () => {
        const timestamp = Date.now().toString();
        const signature = generateSignature(clientData.apiKey, timestamp);

        const res = await request(app)
            .post('/api/v1/client/verify')
            .send({
                apiKey: clientData.apiKey,
                timestamp,
                signature
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.client.apiKey).toBe(clientData.apiKey);
        expect(res.body.isExpired).toBe(false);
    });

    test('DELETE /revoke - Devrait révoquer un client avec signature et secret', async () => {
        const timestamp = Date.now().toString();
        const signature = generateSignature(clientData.apiKey, timestamp);

        const res = await request(app)
            .delete('/api/v1/client/revoke')
            .send({
                apiKey: clientData.apiKey,
                apiSecret: clientData.apiSecret,
                timestamp,
                signature
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toContain('révoqué');
    });
});

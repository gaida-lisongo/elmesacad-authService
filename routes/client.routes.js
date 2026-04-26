const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const Client = require('../models/Client');
const jwt = require('jsonwebtoken');

// Middleware de reconnaissance (Shared Key)
// Supporte req.body (JSON) ou headers (Traefik/Custom)
const checkSignature = (req, res, next) => {
    const apiKey = req.body.apiKey || req.headers['x-api-key'];
    const timestamp = req.body.timestamp || req.headers['x-timestamp'];
    const signature = req.body.signature || req.headers['x-signature'];
    const SHARED_KEY = process.env.GLOBAL_SHARED_KEY;

    if (!apiKey || !timestamp || !signature) {
        return res.status(401).json({ error: "Paramètres d'authentification manquants" });
    }

    const expectedSignature = crypto
        .createHmac('sha256', SHARED_KEY)
        .update(timestamp + apiKey)
        .digest('hex');

    if (signature !== expectedSignature) {
        return res.status(403).json({ error: "Reconnaissance échouée" });
    }
    next();
};

// --- 0. GET : VALIDATION (Pour Traefik forwardAuth) ---
router.get('/validate', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // On peut optionnellement injecter des infos client dans les headers pour les services suivants
        res.setHeader('X-Client-Id', decoded.id);
        res.status(200).send('OK');
    } catch (err) {
        res.status(401).send('Invalid or expired token');
    }
});

// --- 1. POST : APPROVISIONNEMENT ---
router.post('/provision', checkSignature, async (req, res) => {
    const { apiKey, apiSecret, designation, duration } = req.body;
    // ... reste du code identique ...
    try {
        // On vérifie si le client existe déjà
        let client = await Client.findOne({ apiKey });
        if (client) return res.status(400).json({ error: "Client déjà enregistré" });

        // Création du client avec apiSecret (sera haché par le schéma)
        client = new Client({ apiKey, apiSecret, designation, duration });
        
        const token = jwt.sign({ id: client._id }, process.env.JWT_SECRET, { expiresIn: duration });
        client.token = token;
        client.expiresAt = new Date(Date.now() + duration * 1000);
        
        await client.save();
        res.status(201).json({ message: "Client approvisionné", token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 2. GET : VÉRIFICATION (État du client et validité du token actuel) ---
router.post('/verify', checkSignature, async (req, res) => {
    // Note: On utilise POST ici car on a besoin de la signature dans le body
    const { apiKey } = req.body;
    try {
        const client = await Client.findOne({ apiKey }).select('-apiSecret');
        if (!client) return res.status(404).json({ error: "Client inconnu" });
        
        const isExpired = client.expiresAt < new Date();
        res.json({ client, isExpired });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 3. PUT : MISE À JOUR (Renouvellement du token / Refresh) ---
router.put('/refresh', checkSignature, async (req, res) => {
    const { apiKey, apiSecret } = req.body;
    try {
        const client = await Client.findOne({ apiKey });
        if (!client) return res.status(404).json({ error: "Client inconnu" });

        const isMatch = await bcrypt.compare(apiSecret, client.apiSecret);
        if (!isMatch) return res.status(401).json({ error: "Identifiants invalides" });

        const newToken = jwt.sign({ id: client._id }, process.env.JWT_SECRET, { expiresIn: client.duration });
        client.token = newToken;
        client.expiresAt = new Date(Date.now() + client.duration * 1000);
        
        await client.save();
        res.json({ token: newToken, expiresAt: client.expiresAt });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 4. DELETE : DÉSABONNEMENT (Suppression du client) ---
router.delete('/revoke', checkSignature, async (req, res) => {
    const { apiKey, apiSecret } = req.body;
    try {
        const client = await Client.findOne({ apiKey });
        const isMatch = await bcrypt.compare(apiSecret, client.apiSecret);
        
        if (isMatch) {
            await Client.deleteOne({ apiKey });
            res.json({ message: "Accès révoqué avec succès" });
        } else {
            res.status(401).json({ error: "Action non autorisée" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
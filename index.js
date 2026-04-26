require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Connexion MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connecté à MongoDB'))
    .catch(err => console.error('Erreur de connexion MongoDB:', err));

// Middlewares
app.use(cors());
app.use(express.json()); // Pour lire le corps des requêtes JSON

// Route de test
app.get('/', (req, res) => {
    res.json({ message: "Service opérationnel", status: "OK" });
});

app.use('/api/v1', routes);

// Lancement du serveur
app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
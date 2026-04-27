const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const ClientSchema = new mongoose.Schema({
    designation: { type: String, required: true },
    apiKey: { type: String, required: true, unique: true },
    apiSecret: { type: String, required: true },
    token: { type: String }, // Le dernier token généré
    duration: { type: Number, default: 3600 }, // Durée de validité en secondes (ex: 1h)
    expiresAt: { type: Date } // Timestamp d'expiration
});

// Avant de sauvegarder, on hache l'apiSecret (async sans `next` — compatible Mongoose 6+)
ClientSchema.pre('save', async function () {
    if (!this.isModified('apiSecret')) return;
    this.apiSecret = await bcrypt.hash(this.apiSecret, 10);
});

module.exports = mongoose.model('Client', ClientSchema);
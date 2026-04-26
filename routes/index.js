const express = require('express');
const router = express.Router();
const clientRoutes = require('./client.routes');

router.use('/client', clientRoutes);

module.exports = router;
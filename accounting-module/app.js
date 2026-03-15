const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

// Mount the API Routes for the standalone module
app.use('/api/v1/accounting', routes);

// Centralized error handler
app.use(errorHandler);

const PORT = process.env.ACCOUNTING_PORT || 4000;

async function startServer() {
    try {
        await sequelize.authenticate();
        console.log('Isolated Accounting DB Connected.');
        app.listen(PORT, () => {
            console.log(`Standalone Accounting Module running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Failed to start accounting server:', err);
    }
}

// Only start the server if this file is run directly (Not when required in test scripts)
if (require.main === module) {
    startServer();
}

module.exports = app;

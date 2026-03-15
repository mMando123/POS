#!/usr/bin/env node
require('dotenv').config()

const { initDatabase, sequelize } = require('../models')

const run = async () => {
    try {
        await initDatabase({
            seedDemoData: false,
            seedPaymentGateways: false,
            runCompatibilityChecks: true,
            runSchemaSync: false,
            autoSyncIfMissing: false
        })
        console.log('Startup compatibility checks executed successfully.')
        process.exit(0)
    } catch (error) {
        console.error('Startup compatibility checks failed:', error)
        process.exit(1)
    } finally {
        try {
            await sequelize.close()
        } catch (_) {
            // ignore close errors in script mode
        }
    }
}

run()

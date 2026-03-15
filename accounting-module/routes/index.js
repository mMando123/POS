const express = require('express');
const router = express.Router();

const companiesRoutes = require('./companies');
const accountsRoutes = require('./accounts');
const journalsRoutes = require('./journals');
const reportsRoutes = require('./reports');
const { validateCompanyId } = require('../middlewares/validators');

// Master Routes
router.use('/companies', companiesRoutes);

// All company-scoped routes get UUID validation automatically
router.use('/companies/:companyId/accounts', validateCompanyId, accountsRoutes);
router.use('/companies/:companyId/journals', validateCompanyId, journalsRoutes);
router.use('/companies/:companyId/reports', validateCompanyId, reportsRoutes);

module.exports = router;

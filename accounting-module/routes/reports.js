const express = require('express');
const router = express.Router({ mergeParams: true });
const ReportService = require('../services/reportService');

const parseDates = (req) => ({
    startDate: req.query.startDate || '1970-01-01',
    endDate: req.query.endDate || new Date().toISOString().split('T')[0]
});

// 1. General Ledger
router.get('/general-ledger/:accountId', async (req, res, next) => {
    try {
        const { companyId, accountId } = req.params;
        const { startDate, endDate } = parseDates(req);
        const report = await ReportService.getGeneralLedger(companyId, accountId, startDate, endDate);
        res.json({ success: true, data: report });
    } catch (err) {
        next(err);
    }
});

// 2. Trial Balance (FIXED: removed duplicate _getAggregatedAccountBalances call)
router.get('/trial-balance', async (req, res, next) => {
    try {
        const { companyId } = req.params;
        const { startDate, endDate } = parseDates(req);
        const report = await ReportService.getTrialBalance(companyId, startDate, endDate);
        res.json({ success: true, data: report });
    } catch (err) {
        next(err);
    }
});

// 3. Profit & Loss
router.get('/profit-and-loss', async (req, res, next) => {
    try {
        const { companyId } = req.params;
        const { startDate, endDate } = parseDates(req);
        const report = await ReportService.getProfitAndLoss(companyId, startDate, endDate);
        res.json({ success: true, data: report });
    } catch (err) {
        next(err);
    }
});

// 4. Balance Sheet
router.get('/balance-sheet', async (req, res, next) => {
    try {
        const { companyId } = req.params;
        const asOfDate = req.query.asOfDate || new Date().toISOString().split('T')[0];
        const report = await ReportService.getBalanceSheet(companyId, asOfDate);
        res.json({ success: true, data: report });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

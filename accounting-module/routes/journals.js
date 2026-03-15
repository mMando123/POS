const express = require('express');
const router = express.Router({ mergeParams: true });
const JournalService = require('../services/journalService');
const { JournalEntry, JournalLine } = require('../models');
const { validateJournalEntry, sanitizeBody } = require('../middlewares/validators');

const ALLOWED_JOURNAL_FIELDS = ['entry_date', 'description', 'reference', 'status', 'lines'];

// GET all entries with lines
router.get('/', async (req, res, next) => {
    try {
        const { companyId } = req.params;
        const { status, startDate, endDate } = req.query;
        const where = { company_id: companyId };

        if (status) where.status = status;
        if (startDate && endDate) {
            const { Op } = require('sequelize');
            where.entry_date = { [Op.between]: [startDate, endDate] };
        }

        const entries = await JournalEntry.findAll({
            where,
            include: [{ model: JournalLine, as: 'lines' }],
            order: [['entry_date', 'DESC'], ['created_at', 'DESC']]
        });
        res.json({ success: true, data: entries });
    } catch (err) {
        next(err);
    }
});

// GET single entry
router.get('/:id', async (req, res, next) => {
    try {
        const { companyId, id } = req.params;
        const entry = await JournalEntry.findOne({
            where: { id, company_id: companyId },
            include: [{ model: JournalLine, as: 'lines' }]
        });
        if (!entry) return res.status(404).json({ success: false, error: 'Entry not found.' });
        res.json({ success: true, data: entry });
    } catch (err) {
        next(err);
    }
});

// POST Create Journal Entry
router.post('/', sanitizeBody(ALLOWED_JOURNAL_FIELDS), validateJournalEntry, async (req, res, next) => {
    try {
        const { companyId } = req.params;
        const userId = req.headers['x-user-id'] || null; // Pass user context from auth
        const entry = await JournalService.createJournalEntry(req.body, companyId, { userId });
        res.status(201).json({ success: true, data: entry });
    } catch (err) {
        next(err);
    }
});

// POST Post an existing draft
router.post('/:id/post', async (req, res, next) => {
    try {
        const { companyId, id } = req.params;
        const userId = req.headers['x-user-id'] || null;
        const entry = await JournalService.postEntry(id, companyId, { userId });
        res.json({ success: true, data: entry });
    } catch (err) {
        next(err);
    }
});

// POST Cancel/Reverse a posted entry
router.post('/:id/cancel', async (req, res, next) => {
    try {
        const { companyId, id } = req.params;
        const userId = req.headers['x-user-id'] || null;
        const result = await JournalService.cancelEntry(id, companyId, { userId });
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

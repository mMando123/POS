const express = require('express');
const router = express.Router({ mergeParams: true });
const AccountService = require('../services/accountService');
const { Account } = require('../models');
const { validateAccount, sanitizeBody } = require('../middlewares/validators');

const ALLOWED_ACCOUNT_FIELDS = ['code', 'name', 'name_ar', 'parent_id', 'is_group', 'root_type', 'account_type', 'normal_balance', 'is_active'];

// GET all accounts for a company
router.get('/', async (req, res, next) => {
    try {
        const { companyId } = req.params;
        const accounts = await Account.findAll({
            where: { company_id: companyId },
            order: [['code', 'ASC']]
        });
        res.json({ success: true, data: accounts });
    } catch (err) {
        next(err);
    }
});

// GET single account
router.get('/:id', async (req, res, next) => {
    try {
        const { companyId, id } = req.params;
        const account = await Account.findOne({
            where: { id, company_id: companyId },
            include: [
                { model: Account, as: 'Children', attributes: ['id', 'code', 'name', 'name_ar', 'is_group'] },
                { model: Account, as: 'Parent', attributes: ['id', 'code', 'name', 'name_ar'] }
            ]
        });
        if (!account) return res.status(404).json({ success: false, error: 'Account not found.' });
        res.json({ success: true, data: account });
    } catch (err) {
        next(err);
    }
});

// POST create an account
router.post('/', sanitizeBody(ALLOWED_ACCOUNT_FIELDS), validateAccount, async (req, res, next) => {
    try {
        const { companyId } = req.params;
        const account = await AccountService.createAccount(req.body, companyId);
        res.status(201).json({ success: true, data: account });
    } catch (err) {
        next(err);
    }
});

// PUT update an account
router.put('/:id', sanitizeBody(ALLOWED_ACCOUNT_FIELDS), async (req, res, next) => {
    try {
        const { companyId, id } = req.params;
        const account = await AccountService.updateAccount(id, companyId, req.body);
        res.json({ success: true, data: account });
    } catch (err) {
        next(err);
    }
});

// DELETE an account
router.delete('/:id', async (req, res, next) => {
    try {
        const { companyId, id } = req.params;
        const result = await AccountService.deleteAccount(id, companyId);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

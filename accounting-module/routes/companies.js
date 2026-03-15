const express = require('express');
const router = express.Router();
const { Company } = require('../models');

// GET all companies
router.get('/', async (req, res, next) => {
    try {
        const companies = await Company.findAll();
        res.json({ success: true, data: companies });
    } catch (err) {
        next(err);
    }
});

// POST create new company
router.post('/', async (req, res, next) => {
    try {
        const company = await Company.create(req.body);
        res.status(201).json({ success: true, data: company });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

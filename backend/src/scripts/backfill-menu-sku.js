#!/usr/bin/env node
require('dotenv').config()

const { Op, fn, col, where } = require('sequelize')
const { sequelize, Menu } = require('../models')
const { generateUniqueSku } = require('../utils/sku')

const hasFlag = (flag) => process.argv.includes(flag)
const argValue = (name) => {
    const pref = `${name}=`
    const arg = process.argv.find((a) => a.startsWith(pref))
    return arg ? arg.slice(pref.length) : null
}

const parsePositiveInt = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return Math.floor(parsed)
}

const run = async () => {
    const apply = hasFlag('--apply')
    const branchId = argValue('--branch')
    const limit = parsePositiveInt(argValue('--limit'), 1000)

    let transaction = null
    try {
        await sequelize.authenticate()

        const whereConditions = {
            [Op.or]: [
                { sku: { [Op.is]: null } },
                where(fn('TRIM', col('sku')), '')
            ]
        }

        if (branchId) {
            whereConditions.branch_id = branchId
        }

        const candidates = await Menu.findAll({
            where: whereConditions,
            attributes: ['id', 'name_ar', 'name_en', 'item_type', 'branch_id', 'sku'],
            order: [['created_at', 'ASC']],
            limit
        })

        if (!candidates.length) {
            console.log('No menu items need SKU backfill.')
            return
        }

        if (apply) {
            transaction = await sequelize.transaction()
        }

        const preview = []
        let updated = 0
        for (const item of candidates) {
            const nextSku = await generateUniqueSku(Menu, {
                itemType: item.item_type || 'sellable',
                transaction
            })

            preview.push({
                id: item.id,
                name: item.name_ar || item.name_en || 'Unnamed item',
                branch_id: item.branch_id,
                item_type: item.item_type,
                sku: nextSku
            })

            if (apply) {
                await item.update({ sku: nextSku }, { transaction })
                updated += 1
            }
        }

        if (apply) {
            await transaction.commit()
            transaction = null
        }

        console.log(JSON.stringify({
            mode: apply ? 'apply' : 'dry-run',
            branch_id: branchId || null,
            limit,
            candidates: candidates.length,
            updated,
            sample: preview.slice(0, 20)
        }, null, 2))
    } catch (error) {
        if (transaction) {
            try { await transaction.rollback() } catch (_) { }
        }
        console.error('SKU backfill failed:', error.message)
        process.exitCode = 1
    } finally {
        try { await sequelize.close() } catch (_) { }
    }
}

run()

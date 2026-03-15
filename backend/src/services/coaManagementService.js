const { Account, JournalLine, sequelize } = require('../models')
const { Op } = require('sequelize')
const GLAuditService = require('./glAuditService')

/**
 * COA Management Service
 *
 * Enforces accounting-safe mutations on Chart of Accounts:
 * - Parent must be is_group=true
 * - Parent/child root_type must match
 * - No parent loops
 * - No risky structural edits on accounts with posted history
 */
class COAManagementService {
    static async listAccounts({ includeInactive = false } = {}) {
        const where = {}
        if (!includeInactive) where.is_active = true

        return Account.findAll({
            where,
            order: [['code', 'ASC']]
        })
    }

    static async getTree({ includeInactive = false } = {}) {
        const rows = await this.listAccounts({ includeInactive })
        return this._buildTree(rows.map(r => r.get({ plain: true })))
    }

    static async createAccount(payload, { userId = null, branchId = null } = {}) {
        const transaction = await sequelize.transaction()
        try {
            const input = this._normalizePayload(payload, { forCreate: true })

            await this._assertCodeUnique(input.code, null, input.company_id || null, { transaction })
            const parent = await this._validateParent({
                parentId: input.parent_id,
                childRootType: input.root_type,
                childAccountId: null,
                transaction
            })

            const account = await Account.create(input, { transaction })

            await GLAuditService.log({
                eventType: 'coa_account_created',
                sourceType: 'gl_account',
                sourceId: account.id,
                createdBy: userId,
                branchId: branchId || account.branch_id || null,
                payload: {
                    account: account.get({ plain: true }),
                    parent_code: parent?.code || null
                }
            }, { transaction })

            await transaction.commit()
            return this.getAccountById(account.id)
        } catch (error) {
            await transaction.rollback()
            throw error
        }
    }

    static async updateAccount(accountId, payload, { userId = null, branchId = null } = {}) {
        const transaction = await sequelize.transaction()
        try {
            const account = await this._getAccountOrThrow(accountId, { transaction })
            const before = account.get({ plain: true })
            const input = this._normalizePayload(payload, { forCreate: false })

            if (Object.keys(input).length === 0) {
                throw new Error('COA_ERROR: No fields provided for update')
            }

            const hasHistory = await this._hasJournalHistory(account.id, { transaction })
            const activeChildren = await Account.count({
                where: { parent_id: account.id, is_active: true },
                transaction
            })

            if (hasHistory) {
                if (input.code && input.code !== account.code) {
                    throw new Error('COA_ERROR: Cannot change account code after journal history exists')
                }
                if (input.root_type && input.root_type !== account.root_type) {
                    throw new Error('COA_ERROR: Cannot change root type after journal history exists')
                }
                if (input.normal_balance && input.normal_balance !== account.normal_balance) {
                    throw new Error('COA_ERROR: Cannot change normal balance after journal history exists')
                }
            }

            // System accounts remain structurally protected.
            if (account.is_system) {
                if (input.code && input.code !== account.code) {
                    throw new Error('COA_ERROR: Cannot change code of system account')
                }
                if (input.root_type && input.root_type !== account.root_type) {
                    throw new Error('COA_ERROR: Cannot change root type of system account')
                }
                if (input.normal_balance && input.normal_balance !== account.normal_balance) {
                    throw new Error('COA_ERROR: Cannot change normal balance of system account')
                }
            }

            if (input.code && input.code !== account.code) {
                await this._assertCodeUnique(input.code, account.id, input.company_id || account.company_id || null, { transaction })
            }

            const nextRootType = input.root_type || account.root_type

            if (Object.prototype.hasOwnProperty.call(input, 'parent_id')) {
                await this._validateParent({
                    parentId: input.parent_id,
                    childRootType: nextRootType,
                    childAccountId: account.id,
                    transaction
                })
            } else if (input.root_type && account.parent_id) {
                await this._validateParent({
                    parentId: account.parent_id,
                    childRootType: nextRootType,
                    childAccountId: account.id,
                    transaction
                })
            }

            if (Object.prototype.hasOwnProperty.call(input, 'is_group') && input.is_group === false && activeChildren > 0) {
                throw new Error('COA_ERROR: Cannot mark account as non-group while it has active children')
            }

            if (Object.prototype.hasOwnProperty.call(input, 'is_active') && input.is_active === false && activeChildren > 0) {
                throw new Error('COA_ERROR: Cannot deactivate account while it has active children')
            }

            await account.update(input, { transaction })

            await GLAuditService.log({
                eventType: 'coa_account_updated',
                sourceType: 'gl_account',
                sourceId: account.id,
                createdBy: userId,
                branchId: branchId || account.branch_id || null,
                payload: {
                    before,
                    after: account.get({ plain: true })
                }
            }, { transaction })

            await transaction.commit()
            return this.getAccountById(account.id)
        } catch (error) {
            await transaction.rollback()
            throw error
        }
    }

    static async moveAccount(accountId, parentId, context = {}) {
        return this.updateAccount(accountId, { parent_id: parentId || null }, context)
    }

    static async setAccountStatus(accountId, isActive, context = {}) {
        return this.updateAccount(accountId, { is_active: !!isActive }, context)
    }

    static async getAccountById(accountId) {
        const account = await Account.findByPk(accountId, {
            include: [
                { model: Account, as: 'parent', attributes: ['id', 'code', 'name_ar', 'name_en', 'root_type', 'is_group'] },
                { model: Account, as: 'children', attributes: ['id', 'code', 'name_ar', 'name_en', 'is_active'], required: false }
            ]
        })

        if (!account) throw new Error('COA_ERROR: Account not found')
        return account
    }

    static _normalizePayload(payload, { forCreate = false } = {}) {
        const allowed = [
            'code',
            'name_ar',
            'name_en',
            'root_type',
            'account_type',
            'normal_balance',
            'parent_id',
            'is_group',
            'is_active',
            'company_id',
            'description'
        ]

        const out = {}
        for (const key of allowed) {
            if (Object.prototype.hasOwnProperty.call(payload, key)) {
                out[key] = payload[key]
            }
        }

        if (typeof out.code === 'string') out.code = out.code.trim()
        if (typeof out.name_ar === 'string') out.name_ar = out.name_ar.trim()
        if (typeof out.name_en === 'string') out.name_en = out.name_en.trim()
        if (typeof out.description === 'string') out.description = out.description.trim()

        if (forCreate) {
            if (!out.code) throw new Error('COA_ERROR: code is required')
            if (!out.name_ar) throw new Error('COA_ERROR: name_ar is required')
            if (!out.name_en) throw new Error('COA_ERROR: name_en is required')
            if (!out.root_type) throw new Error('COA_ERROR: root_type is required')
            if (!out.normal_balance) throw new Error('COA_ERROR: normal_balance is required')
        }

        return out
    }

    static async _assertCodeUnique(code, excludeId = null, companyId = null, { transaction = null } = {}) {
        if (!code) return
        const where = { code, company_id: companyId || null }
        if (excludeId) where.id = { [Op.ne]: excludeId }
        const existing = await Account.findOne({ where, transaction })
        if (existing) {
            throw new Error(`COA_ERROR: Account code "${code}" already exists in this company scope`)
        }
    }

    static async _getAccountOrThrow(accountId, { transaction = null } = {}) {
        const account = await Account.findByPk(accountId, { transaction })
        if (!account) throw new Error('COA_ERROR: Account not found')
        return account
    }

    static async _hasJournalHistory(accountId, { transaction = null } = {}) {
        const count = await JournalLine.count({
            where: { account_id: accountId },
            transaction
        })
        return count > 0
    }

    static async _validateParent({
        parentId = null,
        childRootType,
        childAccountId = null,
        transaction = null
    } = {}) {
        if (!parentId) return null

        if (childAccountId && parentId === childAccountId) {
            throw new Error('COA_ERROR: Account cannot be parent of itself')
        }

        const parent = await Account.findByPk(parentId, { transaction })
        if (!parent) throw new Error('COA_ERROR: Parent account not found')
        if (!parent.is_active) throw new Error('COA_ERROR: Parent account is inactive')
        if (!parent.is_group) throw new Error('COA_ERROR: Parent account must be a group account (is_group=true)')

        if (childRootType && parent.root_type !== childRootType) {
            throw new Error(
                `COA_ERROR: Parent root type (${parent.root_type}) must match child root type (${childRootType})`
            )
        }

        if (childAccountId) {
            await this._assertNoCycle({
                movingAccountId: childAccountId,
                newParentId: parent.id,
                transaction
            })
        }

        return parent
    }

    static async _assertNoCycle({ movingAccountId, newParentId, transaction = null }) {
        let cursor = newParentId
        const visited = new Set()

        while (cursor) {
            if (cursor === movingAccountId) {
                throw new Error('COA_ERROR: Invalid move would create a parent loop')
            }
            if (visited.has(cursor)) {
                throw new Error('COA_ERROR: Existing parent loop detected in account tree')
            }
            visited.add(cursor)

            const node = await Account.findByPk(cursor, {
                attributes: ['id', 'parent_id'],
                transaction
            })
            cursor = node?.parent_id || null
        }
    }

    static _buildTree(accounts) {
        const map = new Map()
        const roots = []

        for (const account of accounts) {
            map.set(account.id, { ...account, children: [] })
        }

        for (const account of map.values()) {
            if (account.parent_id && map.has(account.parent_id)) {
                map.get(account.parent_id).children.push(account)
            } else {
                roots.push(account)
            }
        }

        const sortNodes = (nodes) => {
            nodes.sort((a, b) => a.code.localeCompare(b.code))
            for (const node of nodes) {
                sortNodes(node.children)
            }
        }
        sortNodes(roots)

        return roots
    }
}

module.exports = COAManagementService

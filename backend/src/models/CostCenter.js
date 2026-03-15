/**
 * CostCenter Model — Cost Center Hierarchy
 * 
 * ACCOUNTING LAYER — ERPNext-Style Architecture
 * 
 * Cost Centers enable tracking profitability by department, branch, or unit.
 * Uses the same hierarchical tree pattern as the Chart of Accounts.
 * 
 * RULES (same as Account hierarchy):
 *   1. is_group=true  → Group cost center (folder), cannot be directly assigned
 *   2. is_group=false → Ledger cost center, can be assigned to journal lines
 *   3. Parent must be is_group=true
 *   4. Code is unique within a company
 *   5. Cannot delete cost centers linked to journal entries
 * 
 * EXAMPLE HIERARCHY:
 *   الشركة الرئيسية (Root, is_group=true)
 *     └── فرع القاهرة (Group)
 *           ├── قسم المبيعات — القاهرة (Ledger)
 *           ├── قسم المستودع — القاهرة (Ledger)
 *           └── نقطة بيع 1 (Ledger)
 *     └── فرع الإسكندرية (Group)
 *           ├── قسم المبيعات — الإسكندرية (Ledger)
 *           └── نقطة بيع 2 (Ledger)
 */

const { DataTypes } = require('sequelize')
const { sequelize } = require('../config/database')

const CostCenter = sequelize.define('CostCenter', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'Cost center code, unique within company'
    },
    name_ar: {
        type: DataTypes.STRING(200),
        allowNull: false
    },
    name_en: {
        type: DataTypes.STRING(200),
        allowNull: false
    },
    // ============ Hierarchy ============
    parent_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Parent cost center for hierarchical structure'
    },
    is_group: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Group cost centers cannot be assigned to transactions — only ledger ones'
    },
    // ============ Company Scope ============
    company_id: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'Company this cost center belongs to'
    },
    branch_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Optional direct branch mapping for branch-level cost centers'
    },
    // ============ Status ============
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'cost_centers',
    timestamps: true,
    underscored: true,
    indexes: [
        { unique: true, fields: ['code', 'company_id'], name: 'cc_code_company_unique' },
        { fields: ['parent_id'], name: 'cc_parent_idx' },
        { fields: ['company_id'], name: 'cc_company_idx' },
        { fields: ['branch_id'], name: 'cc_branch_idx' },
        { fields: ['is_active'], name: 'cc_active_idx' },
        { fields: ['is_group'], name: 'cc_group_idx' }
    ]
})

module.exports = CostCenter

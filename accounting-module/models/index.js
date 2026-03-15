const { sequelize } = require('../config/database');

const Company = require('./Company');
const Account = require('./Account');
const CostCenter = require('./CostCenter');
const JournalEntry = require('./JournalEntry');
const JournalLine = require('./JournalLine');
const AccountDefault = require('./AccountDefault');
const FiscalYear = require('./FiscalYear');
const FiscalPeriod = require('./FiscalPeriod');
const PaymentMethod = require('./PaymentMethod');
const ExpenseType = require('./ExpenseType');
const Warehouse = require('./Warehouse');
const AuditLog = require('./AuditLog');
const Sequence = require('./Sequence');

// --- Associations ---

// Company Relations
Company.hasMany(Account, { foreignKey: 'company_id' });
Account.belongsTo(Company, { foreignKey: 'company_id' });

Company.hasMany(CostCenter, { foreignKey: 'company_id' });
CostCenter.belongsTo(Company, { foreignKey: 'company_id' });

Company.hasMany(JournalEntry, { foreignKey: 'company_id' });
JournalEntry.belongsTo(Company, { foreignKey: 'company_id' });

Company.hasMany(FiscalYear, { foreignKey: 'company_id' });
FiscalYear.belongsTo(Company, { foreignKey: 'company_id' });

Company.hasMany(FiscalPeriod, { foreignKey: 'company_id' });
FiscalPeriod.belongsTo(Company, { foreignKey: 'company_id' });

Company.hasMany(AccountDefault, { foreignKey: 'company_id' });
AccountDefault.belongsTo(Company, { foreignKey: 'company_id' });

Company.hasMany(PaymentMethod, { foreignKey: 'company_id' });
PaymentMethod.belongsTo(Company, { foreignKey: 'company_id' });

Company.hasMany(ExpenseType, { foreignKey: 'company_id' });
ExpenseType.belongsTo(Company, { foreignKey: 'company_id' });

Company.hasMany(Warehouse, { foreignKey: 'company_id' });
Warehouse.belongsTo(Company, { foreignKey: 'company_id' });

Company.hasMany(AuditLog, { foreignKey: 'company_id' });
AuditLog.belongsTo(Company, { foreignKey: 'company_id' });

Company.hasMany(Sequence, { foreignKey: 'company_id' });
Sequence.belongsTo(Company, { foreignKey: 'company_id' });

// Tree Structures
Account.belongsTo(Account, { as: 'Parent', foreignKey: 'parent_id' });
Account.hasMany(Account, { as: 'Children', foreignKey: 'parent_id' });

CostCenter.belongsTo(CostCenter, { as: 'Parent', foreignKey: 'parent_id' });
CostCenter.hasMany(CostCenter, { as: 'Children', foreignKey: 'parent_id' });

// Journal Relations
JournalEntry.hasMany(JournalLine, { foreignKey: 'journal_entry_id', as: 'lines' });
JournalLine.belongsTo(JournalEntry, { foreignKey: 'journal_entry_id' });

FiscalYear.hasMany(JournalEntry, { foreignKey: 'fiscal_year_id' });
JournalEntry.belongsTo(FiscalYear, { foreignKey: 'fiscal_year_id' });

Account.hasMany(JournalLine, { foreignKey: 'account_id' });
JournalLine.belongsTo(Account, { foreignKey: 'account_id' });

CostCenter.hasMany(JournalLine, { foreignKey: 'cost_center_id' });
JournalLine.belongsTo(CostCenter, { foreignKey: 'cost_center_id' });

// Entity Accounting Mappings
AccountDefault.belongsTo(Account, { foreignKey: 'account_id' });
PaymentMethod.belongsTo(Account, { foreignKey: 'account_id' });
ExpenseType.belongsTo(Account, { foreignKey: 'account_id' });
Warehouse.belongsTo(Account, { foreignKey: 'inventory_account_id' });

FiscalYear.hasMany(FiscalPeriod, { foreignKey: 'fiscal_year_id' });
FiscalPeriod.belongsTo(FiscalYear, { foreignKey: 'fiscal_year_id' });

module.exports = {
    sequelize,
    Company,
    Account,
    CostCenter,
    JournalEntry,
    JournalLine,
    AccountDefault,
    FiscalYear,
    FiscalPeriod,
    PaymentMethod,
    ExpenseType,
    Warehouse,
    AuditLog,
    Sequence
};

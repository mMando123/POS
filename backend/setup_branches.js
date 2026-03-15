/**
 * Fix #5: Setup branches + warehouses for multi-branch production
 * 
 * Ensures every branch has:
 *  - A default warehouse
 *  - Proper linking
 * 
 * Also verifies delivery personnel branch assignment
 */
require('dotenv').config()
const { v4: uuidv4 } = require('uuid')
const db = require('./src/models/index')

async function setupBranches() {
    console.log('═══════════════════════════════════════════════════')
    console.log('  Multi-Branch Production Setup')
    console.log('═══════════════════════════════════════════════════\n')

    // ═══ Step 1: List current branches ═══
    console.log('── Step 1: Current Branches ──')
    const branches = await db.sequelize.query(
        `SELECT b.id, b.name_ar, b.name_en, b.is_active, 
                (SELECT COUNT(*) FROM warehouses w WHERE w.branch_id = b.id) as warehouse_count,
                (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id) as user_count
         FROM branches b ORDER BY b.name_ar`,
        { type: db.sequelize.QueryTypes.SELECT }
    )

    if (branches.length === 0) {
        console.log('  ⚠️ No branches found! Creating default branch...')
        const branchId = uuidv4()
        const companyRows = await db.sequelize.query(`SELECT id FROM companies LIMIT 1`, { type: db.sequelize.QueryTypes.SELECT })
        const companyId = companyRows[0]?.id || null

        await db.sequelize.query(
            `INSERT INTO branches (id, name_ar, name_en, company_id, is_active, created_at, updated_at) 
             VALUES (:id, 'الفرع الرئيسي', 'Main Branch', :companyId, true, NOW(), NOW())`,
            { replacements: { id: branchId, companyId } }
        )
        branches.push({ id: branchId, name_ar: 'الفرع الرئيسي', name_en: 'Main Branch', is_active: 1, warehouse_count: 0, user_count: 0 })
        console.log(`  ✅ Created: الفرع الرئيسي (${branchId.substring(0, 8)})`)
    }

    for (const b of branches) {
        console.log(`  📍 ${b.name_ar} (${b.name_en || '-'})`)
        console.log(`     ID: ${b.id.substring(0, 8)}... | Active: ${b.is_active ? '✅' : '❌'} | Warehouses: ${b.warehouse_count} | Users: ${b.user_count}`)
    }

    // ═══ Step 2: Ensure each branch has a default warehouse ═══
    console.log('\n── Step 2: Ensure Default Warehouses ──')
    let warehousesCreated = 0

    for (const branch of branches) {
        const warehouses = await db.sequelize.query(
            `SELECT id, name_ar, is_default FROM warehouses WHERE branch_id = :branchId AND status = 'active'`,
            { replacements: { branchId: branch.id }, type: db.sequelize.QueryTypes.SELECT }
        )

        if (warehouses.length === 0) {
            // Create a default warehouse for this branch
            const whId = uuidv4()
            await db.sequelize.query(
                `INSERT INTO warehouses (id, name_ar, name_en, branch_id, is_default, status, created_at, updated_at) 
                 VALUES (:id, :nameAr, :nameEn, :branchId, true, 'active', NOW(), NOW())`,
                {
                    replacements: {
                        id: whId,
                        nameAr: `مستودع ${branch.name_ar}`,
                        nameEn: `${branch.name_en || 'Branch'} Warehouse`,
                        branchId: branch.id
                    }
                }
            )
            console.log(`  ✅ Created warehouse for "${branch.name_ar}" → ${whId.substring(0, 8)}`)
            warehousesCreated++
        } else {
            const hasDefault = warehouses.some(w => w.is_default)
            if (!hasDefault) {
                // Set first warehouse as default
                await db.sequelize.query(
                    `UPDATE warehouses SET is_default = true WHERE id = :id`,
                    { replacements: { id: warehouses[0].id } }
                )
                console.log(`  🔄 Set default warehouse for "${branch.name_ar}" → ${warehouses[0].name_ar}`)
            } else {
                console.log(`  ✅ "${branch.name_ar}" already has default warehouse`)
            }
        }
    }

    // ═══ Step 3: Check users branch assignment ═══
    console.log('\n── Step 3: User Branch Assignment ──')
    const usersWithoutBranch = await db.sequelize.query(
        `SELECT id, username, name_ar, role FROM users WHERE branch_id IS NULL AND is_active = true`,
        { type: db.sequelize.QueryTypes.SELECT }
    )

    if (usersWithoutBranch.length > 0) {
        console.log(`  ⚠️ ${usersWithoutBranch.length} active users without branch assignment:`)
        for (const u of usersWithoutBranch) {
            console.log(`     👤 ${u.username} (${u.name_ar || '-'}) — role: ${u.role}`)
        }

        // Auto-assign to first branch if only one exists
        if (branches.length === 1) {
            await db.sequelize.query(
                `UPDATE users SET branch_id = :branchId WHERE branch_id IS NULL AND is_active = true`,
                { replacements: { branchId: branches[0].id } }
            )
            console.log(`  🔄 Auto-assigned all to "${branches[0].name_ar}"`)
        } else {
            console.log(`  ℹ️ Multiple branches exist — assign users manually via admin panel`)
        }
    } else {
        console.log(`  ✅ All active users have branch assignments`)
    }

    // ═══ Step 4: Check users warehouse assignment ═══
    console.log('\n── Step 4: User Warehouse Assignment ──')
    const usersWithoutWarehouse = await db.sequelize.query(
        `SELECT u.id, u.username, u.name_ar, u.role, u.branch_id, b.name_ar as branch_name
         FROM users u LEFT JOIN branches b ON b.id = u.branch_id
         WHERE u.default_warehouse_id IS NULL AND u.is_active = true AND u.branch_id IS NOT NULL`,
        { type: db.sequelize.QueryTypes.SELECT }
    )

    if (usersWithoutWarehouse.length > 0) {
        console.log(`  ⚠️ ${usersWithoutWarehouse.length} users without warehouse — auto-assigning default...`)
        for (const u of usersWithoutWarehouse) {
            const defaultWh = await db.sequelize.query(
                `SELECT id FROM warehouses WHERE branch_id = :branchId AND is_default = true LIMIT 1`,
                { replacements: { branchId: u.branch_id }, type: db.sequelize.QueryTypes.SELECT }
            )
            if (defaultWh[0]) {
                await db.sequelize.query(
                    `UPDATE users SET default_warehouse_id = :whId WHERE id = :userId`,
                    { replacements: { whId: defaultWh[0].id, userId: u.id } }
                )
                console.log(`     ✅ ${u.username} → warehouse ${defaultWh[0].id.substring(0, 8)} (${u.branch_name})`)
            }
        }
    } else {
        console.log(`  ✅ All users have warehouse assignments`)
    }

    // ═══ Step 5: Summary ═══
    console.log('\n── Step 5: Final Summary ──')
    const finalBranches = await db.sequelize.query(
        `SELECT b.id, b.name_ar,
                (SELECT COUNT(*) FROM warehouses w WHERE w.branch_id = b.id AND w.status = 'active') as warehouses,
                (SELECT COUNT(*) FROM users u WHERE u.branch_id = b.id AND u.is_active = true) as users,
                (SELECT COUNT(*) FROM delivery_personnel dp WHERE dp.branch_id = b.id) as riders
         FROM branches b WHERE b.is_active = true ORDER BY b.name_ar`,
        { type: db.sequelize.QueryTypes.SELECT }
    )

    console.log('\n  ┌─────────────────────────┬───────────┬───────────┬───────────┐')
    console.log('  │ الفرع                   │ المستودعات│ الموظفين  │ السائقين  │')
    console.log('  ├─────────────────────────┼───────────┼───────────┼───────────┤')
    for (const b of finalBranches) {
        const name = (b.name_ar + '                         ').substring(0, 25)
        console.log(`  │ ${name}│ ${String(b.warehouses).padStart(9)} │ ${String(b.users).padStart(9)} │ ${String(b.riders).padStart(9)} │`)
    }
    console.log('  └─────────────────────────┴───────────┴───────────┴───────────┘')

    const issues = []
    for (const b of finalBranches) {
        if (parseInt(b.warehouses) === 0) issues.push(`⚠️ "${b.name_ar}" has no active warehouse`)
        if (parseInt(b.users) === 0) issues.push(`⚠️ "${b.name_ar}" has no users assigned`)
    }

    if (issues.length > 0) {
        console.log('\n  ⚠️ Issues found:')
        issues.forEach(i => console.log(`     ${i}`))
    } else {
        console.log('\n  ✅ All branches properly configured!')
    }

    console.log('\n═══════════════════════════════════════════════════')
    console.log(`  Setup complete! ${finalBranches.length} branch(es) ready.`)
    console.log('═══════════════════════════════════════════════════')

    process.exit(0)
}

setupBranches().catch(e => { console.error('FATAL:', e.message); process.exit(1) })

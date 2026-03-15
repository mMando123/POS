/**
 * Rollout strict accounting hardening:
 * 1) staging gate
 * 2) production gate
 *
 * Acceptance: both pass with zero failures.
 */

const path = require('path')
const { spawnSync } = require('child_process')

const scriptPath = path.join(__dirname, 'preprod-gate-check.js')
const nodeBin = process.execPath
const cwd = path.join(__dirname, '../..')

function runGate(targetEnv) {
    const env = {
        ...process.env,
        TARGET_ENV: targetEnv,
        NODE_ENV: targetEnv,
        ACCOUNTING_STRICT_DEFAULTS: 'true',
        ACCOUNTING_AUTO_REMAP_POSTING: 'false',
        ACCOUNTING_ALLOW_GLOBAL_FALLBACK: 'false'
    }

    console.log(`\n=== Running strict accounting gate for: ${targetEnv} ===`)
    const result = spawnSync(nodeBin, [scriptPath], {
        cwd,
        env,
        stdio: 'inherit'
    })

    return result.status === 0
}

function run() {
    const stagingOk = runGate('staging')
    if (!stagingOk) {
        console.error('\n❌ Staging gate failed. Production rollout blocked.')
        process.exit(1)
    }

    const productionOk = runGate('production')
    if (!productionOk) {
        console.error('\n❌ Production gate failed.')
        process.exit(1)
    }

    console.log('\n✅ Strict accounting rollout passed for staging and production.')
}

run()


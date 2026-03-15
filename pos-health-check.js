#!/usr/bin/env node

/**
 * POS System Quick Health Check
 * Run: node pos-health-check.js
 */

const fs = require('fs')
const path = require('path')

// Colors for console output
const colors = {
    green: '\\x1b[32m',
    yellow: '\\x1b[33m',
    red: '\\x1b[31m',
    blue: '\\x1b[34m',
    reset: '\\x1b[0m',
}

function log(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`)
}

function separator() {
    console.log(colors.blue + '═'.repeat(50) + colors.reset)
}

function checkFile(filePath, shouldExist = true) {
    const exists = fs.existsSync(filePath)
    return shouldExist ? exists : !exists
}

function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath)
        return (stats.size / 1024 / 1024).toFixed(2) + ' MB'
    } catch {
        return 'N/A'
    }
}

// Start health check
log('blue', '\\n🏥 POS System Health Check')
log('blue', '════════════════════════════════════')

// Check 1: Project Structure
separator()
log('blue', '1️⃣  Project Structure')
separator()

const checks = [
    { path: 'pos/package.json', name: 'Package.json' },
    { path: 'pos/src', name: 'Source folder' },
    { path: 'pos/src/components', name: 'Components folder' },
    { path: 'pos/src/pages', name: 'Pages folder' },
    { path: 'pos/src/services', name: 'Services folder' },
    { path: 'pos/src/store', name: 'Store folder' },
    { path: 'pos/vite.config.js', name: 'Vite config' },
    { path: 'pos/index.html', name: 'HTML entry point' },
]

let structureScore = 0
checks.forEach(({ path: filePath, name }) => {
    const exists = checkFile(filePath)
    const status = exists ? '✅' : '❌'
    log(exists ? 'green' : 'red', `  ${status} ${name}`)
    if (exists) structureScore++
})

log('green', `\\n  Structure Score: ${structureScore}/${checks.length}`)

// Check 2: Dependencies
separator()
log('blue', '2️⃣  Dependencies')
separator()

const packageJsonPath = path.join(__dirname, 'pos', 'package.json')
let criticalDeps = {
    react: false,
    'react-dom': false,
    'react-router-dom': false,
    '@reduxjs/toolkit': false,
    axios: false,
    'socket.io-client': false,
    '@mui/material': false,
}

if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies }

    Object.keys(criticalDeps).forEach(dep => {
        if (allDeps[dep]) {
            criticalDeps[dep] = true
            log('green', `  ✅ ${dep} (${allDeps[dep]})`)
        } else {
            log('red', `  ❌ ${dep} (missing)`)
        }
    })

    const depScore = Object.values(criticalDeps).filter(v => v).length
    log('green', `\\n  Dependency Score: ${depScore}/7`)
} else {
    log('red', '  ❌ Could not read package.json')
}

// Check 3: Temporary Files
separator()
log('blue', '3️⃣  Build Artifacts & Temporary Files')
separator()

const posDir = path.join(__dirname, 'pos')
const tmpFiles = fs.readdirSync(posDir).filter(f => f.startsWith('.tmp-'))

if (tmpFiles.length > 0) {
    log('red', `  ❌ Found ${tmpFiles.length} temporary files (should be deleted)`)
    tmpFiles.forEach(file => {
        const size = getFileSize(path.join(posDir, file))
        log('yellow', `     - ${file} (${size})`)
    })
} else {
    log('green', '  ✅ No temporary files found')
}

// Check 4: Environment Configuration
separator()
log('blue', '4️⃣  Environment Configuration')
separator()

const envPath = path.join(posDir, '.env')
const envProdPath = path.join(posDir, '.env.production')
const envDevPath = path.join(posDir, '.env.development')

if (fs.existsSync(envPath)) {
    log('green', '  ✅ .env file exists')
} else {
    log('yellow', '  ⚠️  .env file not found (can use defaults)')
}

if (fs.existsSync(envProdPath)) {
    log('green', '  ✅ .env.production exists')
} else {
    log('yellow', '  ⚠️  .env.production not configured')
}

// Check 5: Key Configuration Files
separator()
log('blue', '5️⃣  Key Configuration Files')
separator()

const configs = [
    { path: 'pos/vite.config.js', name: 'Vite Configuration' },
    { path: 'pos/package.json', name: 'NPM Configuration' },
    { path: 'pos/index.html', name: 'HTML Entry Point' },
    { path: 'pos/public', name: 'Public Assets' },
]

let configScore = 0
configs.forEach(({ path: filePath, name }) => {
    const exists = checkFile(filePath)
    const status = exists ? '✅' : '⚠️'
    log(exists ? 'green' : 'yellow', `  ${status} ${name}`)
    if (exists) configScore++
})

log('green', `\\n  Configuration Score: ${configScore}/4`)

// Check 6: Build Output
separator()
log('blue', '6️⃣  Build Output')
separator()

const distPath = path.join(posDir, 'dist')
if (fs.existsSync(distPath)) {
    log('green', '  ✅ dist/ folder exists (build artifacts present)')
    const distSize = getFileSize(distPath)
    log('blue', `     Size: ${distSize}`)
} else {
    log('yellow', '  ⚠️  dist/ folder not found (need to run: npm run build)')
}

// Check 7: Node Modules
separator()
log('blue', '7️⃣  Dependencies Installation')
separator()

const nodeModulesPath = path.join(posDir, 'node_modules')
if (fs.existsSync(nodeModulesPath)) {
    log('green', '  ✅ node_modules installed')
    try {
        const reactPath = path.join(nodeModulesPath, 'react')
        if (fs.existsSync(reactPath)) {
            log('green', '     ✅ React is installed')
        }
    } catch (e) {
        // Ignore
    }
} else {
    log('red', '  ❌ node_modules NOT installed (run: npm install)')
}

// Summary
separator()
log('blue', '📊 Health Check Summary')
separator()

const summary = {
    'Project Structure': structureScore === checks.length ? '✅' : '⚠️',
    'Dependencies': Object.values(criticalDeps).every(v => v) ? '✅' : '⚠️',
    'Temp Files': tmpFiles.length === 0 ? '✅' : '❌',
    'Environment': fs.existsSync(envPath) ? '✅' : '⚠️',
    'Build Output': fs.existsSync(distPath) ? '✅' : '⚠️',
    'Node Modules': fs.existsSync(nodeModulesPath) ? '✅' : '❌',
}

Object.entries(summary).forEach(([key, status]) => {
    const color = status === '✅' ? 'green' : status === '❌' ? 'red' : 'yellow'
    log(color, `  ${status} ${key}`)
})

// Final Score
separator()
const passedChecks = Object.values(summary).filter(v => v === '✅').length
const totalChecks = Object.values(summary).length
const score = ((passedChecks / totalChecks) * 100).toFixed(0)

if (score >= 80) {
    log('green', `\\n✅ Overall Health: GOOD (${score}%)`)
} else if (score >= 50) {
    log('yellow', `\\n⚠️  Overall Health: FAIR (${score}%)`)
} else {
    log('red', `\\n❌ Overall Health: POOR (${score}%)`)
}

separator()
log('blue', '\\n📋 Recommended Actions:')
separator()

const actions = []

if (tmpFiles.length > 0) {
    actions.push('1. Delete temporary build files:')
    actions.push(`   rm -f pos/.tmp-*.js`)
}

if (!fs.existsSync(envPath)) {
    actions.push('2. Create .env configuration file')
}

if (!fs.existsSync(nodeModulesPath)) {
    actions.push('3. Install dependencies:')
    actions.push(`   cd pos && npm install`)
}

if (!fs.existsSync(distPath)) {
    actions.push('4. Build the project:')
    actions.push(`   cd pos && npm run build`)
}

if (actions.length > 0) {
    actions.forEach(action => log('yellow', `  ${action}`))
} else {
    log('green', '✅ No immediate actions needed')
}

separator()
log('green', '\\n✨ Health Check Complete!\\n')

// Return exit code based on health
process.exit(score >= 70 ? 0 : 1)

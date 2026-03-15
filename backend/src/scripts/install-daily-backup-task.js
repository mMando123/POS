/**
 * Install daily backup task (Windows Task Scheduler).
 *
 * Run:
 *   node src/scripts/install-daily-backup-task.js
 *   node src/scripts/install-daily-backup-task.js --time=02:30
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

function getArg(name, fallback = null) {
    const match = process.argv.find((arg) => arg.startsWith(`${name}=`))
    if (!match) return fallback
    return match.slice(name.length + 1)
}

function hasFlag(name) {
    return process.argv.includes(name)
}

function validateTime(time) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time)
}

function runWindowsTaskInstall(taskName, scheduleTime, runnerPath, runAsSystem = false) {
    const args = [
        '/Create',
        '/TN',
        taskName,
        '/SC',
        'DAILY',
        '/ST',
        scheduleTime,
        '/TR',
        `cmd /c "${runnerPath}"`,
        '/F',
    ]

    if (runAsSystem) {
        args.push('/RU', 'SYSTEM', '/RL', 'HIGHEST')
    }

    const create = spawnSync(
        'schtasks',
        args,
        { encoding: 'utf8', windowsHide: true }
    )

    if (create.status !== 0) {
        throw new Error(`schtasks create failed: ${create.stderr || create.stdout}`)
    }

    const verify = spawnSync(
        'schtasks',
        ['/Query', '/TN', taskName, '/V', '/FO', 'LIST'],
        { encoding: 'utf8', windowsHide: true }
    )
    if (verify.status !== 0) {
        throw new Error(`schtasks query failed: ${verify.stderr || verify.stdout}`)
    }

    return verify.stdout
}

function main() {
    const scheduleTime = getArg('--time', process.env.OPS_BACKUP_SCHEDULE_TIME || '02:30')
    const runAsSystem = hasFlag('--run-as-system')
    if (!validateTime(scheduleTime)) {
        throw new Error(`Invalid time format "${scheduleTime}". Use HH:MM 24h format.`)
    }

    const taskName = process.env.OPS_BACKUP_TASK_NAME || 'SmartPOS-Daily-Backup-Restore'
    const runnerPath = path.join(__dirname, '../../scripts/run-daily-backup-task.cmd')

    if (!fs.existsSync(runnerPath)) {
        throw new Error(`Runner file not found: ${runnerPath}`)
    }

    if (process.platform !== 'win32') {
        const backendDir = path.join(__dirname, '../..')
        console.log('Non-Windows OS detected. Use this cron entry:')
        console.log(`${scheduleTime.split(':')[1]} ${scheduleTime.split(':')[0]} * * * cd ${backendDir} && node src/scripts/ops-backup-restore-test.js >> logs/ops-daily-backup.log 2>&1`)
        return
    }

    const verifyOutput = runWindowsTaskInstall(taskName, scheduleTime, runnerPath, runAsSystem)
    console.log(`Task installed: ${taskName}`)
    console.log(`Daily time: ${scheduleTime}`)
    console.log(`Run as SYSTEM: ${runAsSystem}`)
    console.log('\nTask details:')
    console.log(verifyOutput.split(/\r?\n/).slice(0, 20).join('\n'))
}

try {
    main()
} catch (error) {
    console.error(`Install failed: ${error.message}`)
    if (String(error.message).toLowerCase().includes('access is denied')) {
        console.error('Hint: open PowerShell as Administrator, then run:')
        console.error('  cd C:\\Users\\activ\\Desktop\\pos\\backend')
        console.error('  npm run ops:schedule:install -- --time=02:30 --run-as-system')
    }
    process.exit(1)
}

#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const net = require('net');

const rootDir = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const nodeCmd = process.execPath;

const children = [];
let shuttingDown = false;
const QUICK_REUSE_CHECK_ATTEMPTS = 5;
const QUICK_REUSE_CHECK_DELAY_MS = 1000;
const STARTUP_CHECK_ATTEMPTS = 90;
const STARTUP_CHECK_DELAY_MS = 1000;

function safeWrite(stream, message) {
  if (!stream || stream.destroyed || !stream.writable) return;
  try {
    stream.write(message);
  } catch (_) {
    // ignore closed pipe errors when parent process is terminated
  }
}

function run(cmd, args, cwd, name, extraEnv = {}) {
  const child = spawn(cmd, args, {
    cwd,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  child.stdout.on('data', (buf) => {
    safeWrite(process.stdout, `[${name}] ${buf}`);
  });

  child.stderr.on('data', (buf) => {
    safeWrite(process.stderr, `[${name}] ${buf}`);
  });

  child.stdout.on('error', () => {});
  child.stderr.on('error', () => {});

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[${name}] exited (code=${code}, signal=${signal})`);
    if (name === 'backend' || name === 'pos') {
      shutdown(1);
    }
  });

  child.on('error', (err) => {
    if (shuttingDown) return;
    console.error(`[${name}] failed to start:`, err.message);
    shutdown(1);
  });

  children.push({ name, child });
  return child;
}

function killTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    if (isWin) {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        stdio: 'ignore',
        shell: false,
      });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
      return;
    }
    try {
      process.kill(pid, 'SIGTERM');
    } catch (_) {
      // no-op
    }
    resolve();
  });
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[runner] stopping processes...');
  await Promise.all(children.map(({ child }) => killTree(child.pid)));
  process.exit(exitCode);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForHttpOk(url, maxAttempts = 40, delayMs = 1000) {
  return new Promise(async (resolve) => {
    for (let i = 0; i < maxAttempts; i += 1) {
      const ok = await new Promise((done) => {
        const req = http.get(url, (res) => {
          res.resume();
          done(res.statusCode >= 200 && res.statusCode < 500);
        });
        req.on('error', () => done(false));
        req.setTimeout(1500, () => {
          req.destroy();
          done(false);
        });
      });

      if (ok) return resolve(true);
      await wait(delayMs);
    }
    resolve(false);
  });
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', (err) => resolve(err && err.code === 'EADDRINUSE'))
      .once('listening', () => tester.close(() => resolve(false)))
      .listen(port);
  });
}

function killProcessesOnPort(port) {
  try {
    if (isWin) {
      const output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const pids = [...new Set(
        output
          .split(/\r?\n/)
          .map((line) => line.trim().split(/\s+/).pop())
          .filter((pid) => pid && /^\d+$/.test(pid) && Number(pid) !== process.pid)
      )];
      for (const pid of pids) {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      }
      return pids.length > 0;
    }

    const output = execSync(`lsof -ti tcp:${port}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pids = [...new Set(
      output
        .split(/\r?\n/)
        .map((pid) => pid.trim())
        .filter((pid) => pid && /^\d+$/.test(pid) && Number(pid) !== process.pid)
    )];
    for (const pid of pids) {
      execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    }
    return pids.length > 0;
  } catch (_) {
    return false;
  }
}

async function main() {
  console.log('[runner] starting backend + POS (PWA dev) + website + KDS...');

  const backendCwd = path.join(rootDir, 'backend');
  const posCwd = path.join(rootDir, 'pos');
  const websiteCwd = path.join(rootDir, 'website');
  const kdsCwd = path.join(rootDir, 'kds');
  const backendDevArgs = [path.join(backendCwd, 'node_modules', 'nodemon', 'bin', 'nodemon.js'), 'src/server.js'];
  const websiteDevArgs = [path.join(websiteCwd, 'node_modules', 'vite', 'bin', 'vite.js')];
  const kdsDevArgs = [path.join(kdsCwd, 'node_modules', 'vite', 'bin', 'vite.js')];
  const posDevArgs = [path.join(posCwd, 'node_modules', 'vite', 'bin', 'vite.js'), '--mode', 'pwa-dev'];

  const backendHealthUrl = 'http://127.0.0.1:3001/api/health';

  const [backendPortBusy, posPortBusy, websitePortBusy, kdsPortBusy] = await Promise.all([
    isPortInUse(3001),
    isPortInUse(3002),
    isPortInUse(3000),
    isPortInUse(3003),
  ]);

  if (backendPortBusy) {
    console.log('[runner] Port 3001 is already in use. Reusing existing backend process.');
  } else {
    run(nodeCmd, backendDevArgs, backendCwd, 'backend', { NODE_ENV: 'development' });
  }

  let backendReady = await waitForHttpOk(
    backendHealthUrl,
    backendPortBusy ? QUICK_REUSE_CHECK_ATTEMPTS : STARTUP_CHECK_ATTEMPTS,
    backendPortBusy ? QUICK_REUSE_CHECK_DELAY_MS : STARTUP_CHECK_DELAY_MS
  );

  if (!backendReady && backendPortBusy) {
    console.warn('[runner] Port 3001 is occupied but backend API is not reachable. Killing stale backend and restarting...');
    const killed = killProcessesOnPort(3001);
    if (killed) {
      await wait(800);
      run(nodeCmd, backendDevArgs, backendCwd, 'backend', { NODE_ENV: 'development' });
      backendReady = await waitForHttpOk(backendHealthUrl, STARTUP_CHECK_ATTEMPTS, STARTUP_CHECK_DELAY_MS);
    }
  }

  if (!backendReady) {
    console.error('[runner] Backend is not reachable on 3001 after recovery attempt. Stop stale processes and retry.');
    process.exit(1);
  }

  if (websitePortBusy) {
    console.log('[runner] Port 3000 is already in use. Reusing existing website process.');
    const websiteReady = await waitForHttpOk('http://127.0.0.1:3000');
    if (!websiteReady) {
      console.error('[runner] Website is not reachable on 3000. Stop stale processes and retry.');
      process.exit(1);
    }
  } else {
    run(nodeCmd, websiteDevArgs, websiteCwd, 'website');
  }

  if (kdsPortBusy) {
    console.log('[runner] Port 3003 is already in use. Reusing existing KDS process.');
    const kdsReady = await waitForHttpOk('http://127.0.0.1:3003');
    if (!kdsReady) {
      console.error('[runner] KDS is not reachable on 3003. Stop stale processes and retry.');
      process.exit(1);
    }
  } else {
    run(nodeCmd, kdsDevArgs, kdsCwd, 'kds');
  }

  if (posPortBusy) {
    console.log('[runner] Port 3002 is already in use. Reusing existing POS process.');
    const posReady = await waitForHttpOk('http://127.0.0.1:3002');
    if (!posReady) {
      console.error('[runner] POS is not reachable on 3002. Stop stale processes and retry.');
      process.exit(1);
    }
  } else {
    run(nodeCmd, posDevArgs, posCwd, 'pos');
    await wait(1800);
  }

  console.log('\n[runner] All local servers are running!');
  console.log('[runner] To test on mobile securely (HTTPS), please run `npm run tunnel:website` or `npm run tunnel:pos` in a new terminal window.');
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', () => {
  shuttingDown = true;
});

main().catch((err) => {
  console.error('[runner] fatal error:', err);
  shutdown(1);
});

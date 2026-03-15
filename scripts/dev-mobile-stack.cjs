#!/usr/bin/env node
const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const net = require('net');

const rootDir = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

const children = [];
let shuttingDown = false;

function safeWrite(stream, message) {
  if (!stream || stream.destroyed || !stream.writable) return;
  try {
    stream.write(message);
  } catch (_) {
    // ignore closed pipe errors when parent process is terminated
  }
}

function run(cmd, args, cwd, name) {
  const spawnCmd = isWin ? 'cmd.exe' : cmd;
  const spawnArgs = isWin
    ? ['/d', '/s', '/c', [cmd, ...args].map((part) => {
      if (/[ "]/.test(part)) return `"${part.replace(/"/g, '\\"')}"`;
      return part;
    }).join(' ')]
    : args;

  const child = spawn(spawnCmd, spawnArgs, {
    cwd,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
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
    if (name === 'ngrok' && code !== 0) {
      console.error('[runner] ngrok failed. If you see ERR_NGROK_108, close old ngrok session then retry.');
    }
    if (name === 'backend' || name === 'pos') {
      shutdown(1);
    }
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

function getNgrokUrl() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const tunnel = (parsed.tunnels || []).find((t) => t.public_url && t.public_url.startsWith('https://'));
          resolve(tunnel ? tunnel.public_url : null);
        } catch (_) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function printNgrokUrl(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const url = await getNgrokUrl();
    if (url) {
      console.log(`\n[runner] Mobile HTTPS URL: ${url}`);
      console.log('[runner] Open this URL from mobile browser, then install app.');
      return;
    }
    await wait(1000);
  }
  console.warn('[runner] ngrok started but HTTPS URL was not detected on :4040.');
}

async function main() {
  console.log('[runner] starting backend + POS (PWA dev) + website + KDS + ngrok tunnel...');

  const backendCwd = path.join(rootDir, 'backend');
  const posCwd = path.join(rootDir, 'pos');
  const websiteCwd = path.join(rootDir, 'website');
  const kdsCwd = path.join(rootDir, 'kds');

  const [backendPortBusy, posPortBusy, websitePortBusy, kdsPortBusy] = await Promise.all([
    isPortInUse(3001),
    isPortInUse(3002),
    isPortInUse(3000),
    isPortInUse(3003),
  ]);

  if (backendPortBusy) {
    console.log('[runner] Port 3001 is already in use. Reusing existing backend process.');
  } else {
    run(npmCmd, ['run', 'dev'], backendCwd, 'backend');
  }

  let backendReady = await waitForHttpOk('http://127.0.0.1:3001/api/settings/public');
  if (!backendReady && backendPortBusy) {
    console.warn('[runner] Port 3001 is occupied but backend API is not reachable. Attempting auto-recovery...');
    const killed = killProcessesOnPort(3001);
    if (killed) {
      await wait(800);
      run(npmCmd, ['run', 'dev'], backendCwd, 'backend');
      backendReady = await waitForHttpOk('http://127.0.0.1:3001/api/settings/public');
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
    run(npmCmd, ['run', 'dev'], websiteCwd, 'website');
  }

  if (kdsPortBusy) {
    console.log('[runner] Port 3003 is already in use. Reusing existing KDS process.');
    const kdsReady = await waitForHttpOk('http://127.0.0.1:3003');
    if (!kdsReady) {
      console.error('[runner] KDS is not reachable on 3003. Stop stale processes and retry.');
      process.exit(1);
    }
  } else {
    run(npmCmd, ['run', 'dev'], kdsCwd, 'kds');
  }

  if (posPortBusy) {
    console.log('[runner] Port 3002 is already in use. Reusing existing POS process.');
    const posReady = await waitForHttpOk('http://127.0.0.1:3002');
    if (!posReady) {
      console.error('[runner] POS is not reachable on 3002. Stop stale processes and retry.');
      process.exit(1);
    }
  } else {
    run(npmCmd, ['run', 'dev:pwa'], posCwd, 'pos');
    await wait(1800);
  }

  const existingNgrokUrl = await getNgrokUrl();
  if (existingNgrokUrl) {
    console.log(`\n[runner] Existing ngrok tunnel detected: ${existingNgrokUrl}`);
    console.log('[runner] Reusing existing tunnel.');
  } else {
    run(npxCmd, ['ngrok', 'http', '3002'], posCwd, 'ngrok');
  }

  printNgrokUrl().catch(() => {
    console.warn('[runner] failed to read ngrok URL from local API.');
  });
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

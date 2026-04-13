#!/usr/bin/env node
const { spawn } = require('child_process');

const rawTargetArg = String(process.argv[2] || 'pos').trim();
const targetArg = rawTargetArg.toLowerCase();
const targets = {
  backend: { port: 3001, label: 'Backend / POS API' },
  website: { port: 3000, label: 'Website / API' },
  pos: { port: 3002, label: 'POS' },
  kds: { port: 3003, label: 'KDS' },
};

function resolveTarget(input) {
  if (targets[input]) return targets[input];

  if (/^\d+$/.test(input)) {
    return { port: Number(input), label: `Custom Port ${input}` };
  }

  const urlMatch = input.match(/^https?:\/\/[^:\/]+:(\d+)(?:\/.*)?$/i);
  if (urlMatch) {
    return { port: Number(urlMatch[1]), label: `Custom URL Port ${urlMatch[1]}` };
  }

  return null;
}

const target = resolveTarget(targetArg) || targets.pos;

console.log("======================================================");
console.log("   Starting Standalone Tunnel (Ngrok)                 ");
console.log("======================================================");
console.log(` Target: http://localhost:${target.port} (${target.label})`);
console.log(" Note: Ngrok will open its own interface below.");
console.log(" If you see an authentication error, please set your token:");
console.log(" npx ngrok config add-authtoken <YOUR_TOKEN>\n");

if (!resolveTarget(targetArg) && targetArg) {
  console.log(` [Tunnel] Unknown target "${rawTargetArg}". Falling back to POS.`);
  console.log(" [Tunnel] Tip: you can use:");
  console.log("          npm run tunnel -- 3000");
  console.log("          npm run tunnel -- 3002");
  console.log("          npm run tunnel -- 3001");
  console.log("          npm run tunnel -- http://192.168.100.5:3002/");
}

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

const child = spawn(npxCmd, ['ngrok', 'http', String(target.port)], {
  stdio: 'inherit',
  shell: isWin
});

child.on('exit', (code) => {
  console.log(`\n[Tunnel] Process exited with code ${code}`);
  if (code !== 0) {
    console.log("======================================================");
    console.log(" Ngrok failed to start.");
    console.log(" If Ngrok is blocked in your network, try this alternative:");
    console.log(` npx -y localtunnel --port ${target.port}`);
    console.log("======================================================");
  }
});

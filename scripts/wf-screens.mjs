// wf-screens.mjs — Capture PRIMA module screenshots → docs/workflow/assets/
// Pure Node (v24 global fetch + WebSocket), drives system Chrome via CDP. No deps.
// Usage: node scripts/wf-screens.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:3000';
const OUT = 'docs/workflow/assets';
const PORT = 9222;
const W = 1440, H = 900;

mkdirSync(OUT, { recursive: true });
const userDir = join(tmpdir(), 'wf-chrome-' + Date.now());

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Launch Chrome ───────────────────────────────────────────────────────────
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1',
  'about:blank',
], { stdio: 'ignore' });

// ─── Minimal CDP client (flatten sessions) ───────────────────────────────────
let ws, msgId = 0;
const pending = new Map();
const evHandlers = [];

function send(method, params = {}, sessionId) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
function onEvent(fn) { evHandlers.push(fn); }

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- Chrome DevTools CDP discovery di 127.0.0.1 (http-only by design, bukan request app)
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error('Chrome CDP not reachable');
}

async function main() {
  const wsUrl = await connect();
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    } else if (m.method) {
      for (const fn of evHandlers) fn(m);
    }
  };

  // New page target + attach (flatten)
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = sessionId;

  await send('Page.enable', {}, S);
  await send('Runtime.enable', {}, S);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, S);

  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S);
    return r.result?.value;
  };
  const goto = async (url) => {
    await send('Page.navigate', { url }, S);
    await sleep(2800); // CSR pages fetch data after load
  };
  const shot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' }, S);
    writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
    console.log('  ✓', name);
  };

  const login = async (user, pass) => {
    await goto(`${BASE}/login`);
    await evalJS(`(()=>{
      const setV=(sel,val)=>{const el=document.querySelector(sel);if(!el)return false;
        const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
        s.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}));return true;};
      setV('input[placeholder="Masukkan username"]',${JSON.stringify(user)});
      setV('input[placeholder="Masukkan password"]',${JSON.stringify(pass)});
      return true;})()`);
    await sleep(400);
    await evalJS(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Masuk');if(b)b.click();return !!b;})()`);
    // wait for /menu
    for (let i = 0; i < 20; i++) { await sleep(600); if ((await evalJS('location.pathname')) === '/menu') break; }
    console.log('  logged in as', user, '→', await evalJS('location.pathname'));
  };

  // Capture plan: [ urlPath, fileName ]
  const captures = {
    superadmin: [
      ['/menu', '01-menu.png'],
      ['/usulan-kebutuhan', 'usulan-main.png'],
      ['/kinerja', 'kinerja-main.png'],
      ['/blud', 'blud-main.png'],
      ['/blud/dpa', 'blud-dpa.png'],
      ['/perjanjian-kinerja', 'pk-main.png'],
      ['/perjanjian-kinerja/form', 'pk-form.png'],
      ['/buku-besar-aset', 'bba-main.png'],
      ['/lkjip', 'lkjip-main.png'],
      ['/rencana-aksi', 'renaksi-main.png'],
      ['/dashboard', 'dashboard-main.png'],
      ['/admin', 'admin-main.png'],
    ],
    dummy_program: [['/usulan-kebutuhan', 'usulan-role-program.png']],
    dummy_renbang: [['/usulan-kebutuhan', 'usulan-role-bidang.png']],
    dummy_admin:   [['/usulan-kebutuhan', 'usulan-role-admin.png']],
    dummy_kabag:   [['/usulan-kebutuhan', 'usulan-role-kabag.png']],
  };
  const creds = {
    superadmin: 'Prima123', dummy_program: 'Password123',
    dummy_renbang: 'Password123', dummy_admin: 'Password123', dummy_kabag: 'Password123',
  };

  // login.png first (pre-auth)
  await goto(`${BASE}/login`);
  await shot('00-login.png');

  for (const [user, list] of Object.entries(captures)) {
    console.log('▶', user);
    await login(user, creds[user]);
    for (const [path, name] of list) {
      await goto(`${BASE}${path}`);
      await shot(name);
    }
    // logout to switch user
    await evalJS(`fetch('/api/auth/logout',{method:'POST'}).catch(()=>{})`);
    await sleep(800);
  }

  console.log('DONE');
  await send('Browser.close', {}).catch(() => {});
  ws.close();
  chrome.kill();
  try { rmSync(userDir, { recursive: true, force: true }); } catch {}
  process.exit(0);
}

main().catch(async (e) => {
  console.error('ERROR:', e.message);
  try { chrome.kill(); } catch {}
  process.exit(1);
});

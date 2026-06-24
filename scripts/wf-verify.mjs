// wf-verify.mjs — open the panduan HTML in headless Chrome, click through, screenshot.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FILE = 'file:///C:/Users/HP%20VICTUS/Documents/prima-web/docs/workflow/panduan-prima.html';
const OUT = 'docs/workflow/_verify';
const PORT = 9223, W = 1400, H = 950;
mkdirSync(OUT, { recursive: true });
const userDir = join(tmpdir(), 'wfv-' + Date.now());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
  '--no-first-run', `--window-size=${W},${H}`, '--hide-scrollbars', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });

let ws, id = 0; const pend = new Map();
const send = (m, p = {}, s) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p, sessionId: s })); });

async function main() {
  let wsUrl;
  // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- Chrome DevTools CDP discovery di 127.0.0.1 (http-only by design, bukan request app)
  for (let i = 0; i < 40; i++) { try { const r = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if (r.webSocketDebuggerUrl) { wsUrl = r.webSocketDebuggerUrl; break; } } catch {} await sleep(300); }
  ws = new WebSocket(wsUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, S); await send('Runtime.enable', {}, S);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, S);
  const ev = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S).then(r => r.result?.value);
  const shot = async name => { const { data } = await send('Page.captureScreenshot', { format: 'png' }, S); writeFileSync(join(OUT, name), Buffer.from(data, 'base64')); console.log('  ✓', name); };
  await send('Page.navigate', { url: FILE }, S); await sleep(1500);
  await shot('v1-home.png');
  // diag: count broken images
  const diag = await ev(`JSON.stringify({imgs:[...document.images].length, broken:[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.getAttribute('src'))})`);
  console.log('  imgs:', diag);
  await ev(`document.querySelector('[data-view="usulan"].nav-item').click()`); await sleep(500); await shot('v2-usulan-flow.png');
  await ev(`document.querySelector('#subtabs .subtab[data-sub="guide"]').click()`); await sleep(700); await shot('v3-usulan-guide.png');
  await ev(`document.querySelector('[data-view="global"].nav-item').click()`); await sleep(400);
  await ev(`document.querySelector('#subtabs .subtab[data-sub="guide"]').click()`); await sleep(600); await shot('v4-global-guide.png');
  await send('Browser.close', {}).catch(() => {}); ws.close(); chrome.kill();
  try { rmSync(userDir, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
main().catch(e => { console.error('ERR', e.message); try { chrome.kill(); } catch {} process.exit(1); });

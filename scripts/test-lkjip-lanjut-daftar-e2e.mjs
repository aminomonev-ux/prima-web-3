// test-lkjip-lanjut-daftar-e2e.mjs — dekorasi "Lanjut daftar" di editor, diuji di peramban sungguhan.
//
// Suite `test-lkjip-lanjut-daftar.mts` membuktikan HITUNGANNYA = Word, tapi D4/D5 hanya mencocokkan pola
// kode sumber. Yang tidak bisa dibuktikan di Node — dan dibuktikan di sini — dua hal:
//   1. `Decoration.node` benar-benar memasang atribut `start` pada <ol> pertama blok, dan Chromium
//      menomori ulang dari situ (bukan hanya nilai plugin yang benar);
//   2. melepas centang mengembalikan nomornya sendiri (dekorasi tidak "tertinggal" di 3).
//
// Butuh dev server + DB yang bisa ditulis (dokumen uji dibuat lalu DIHAPUS di akhir, termasuk saat gagal).
// Chrome dijalankan headless lewat CDP, tanpa dependensi baru.
//
// Jalankan: node scripts/test-lkjip-lanjut-daftar-e2e.mjs
//   BASE_URL=http://localhost:3000  LKJIP_E2E_USER=<akun dummy>  LKJIP_E2E_PASS=<sandinya>
//   CHROME_PATH=... (bila Chrome tidak di lokasi bawaan)
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
// Tanpa nilai cadangan: repo ini publik, dan uji hanya boleh memakai akun dummy kotak pasir.
const USER = process.env.LKJIP_E2E_USER;
const PASS = process.env.LKJIP_E2E_PASS;
if (!USER || !PASS) { console.error('Set LKJIP_E2E_USER dan LKJIP_E2E_PASS (akun dummy, bukan akun asli).'); process.exit(2); }
const PORT = Number(process.env.CDP_PORT || 9224);
const W = 1280, H = 900;

const sleep = ms => new Promise(r => setTimeout(r, ms));
let lulus = 0;
const gagal = [];
const ok = (nama, syarat, ket = '') => {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`); }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`); }
};

const userDir = join(tmpdir(), 'lkjip-e2e-' + Date.now());
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++msgId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request -- CDP discovery di 127.0.0.1
      const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error('Chrome CDP tidak bisa dihubungi');
}

async function main() {
  const cek = await fetch(`${BASE}/login`).catch(() => null);
  if (!cek || !cek.ok) throw new Error(`dev server tidak menjawab di ${BASE} — jalankan "npm run dev" dulu`);

  ws = new WebSocket(await connect());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (!m.id || !pending.has(m.id)) return;
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, S);
  await send('Runtime.enable', {}, S);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, S);

  const ev = expr => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, S)
    .then(r => r.result?.value);
  const goto = async url => { await send('Page.navigate', { url }, S); await sleep(1500); };
  // Menunggu kondisi, bukan menebak jeda: halaman ini CSR dan editor Tiptap baru muncul sesudah data tiba.
  const tunggu = async (expr, syarat, batas = 40) => {
    let nilai;
    for (let i = 0; i < batas; i++) {
      nilai = await ev(expr);
      if (syarat(nilai)) return nilai;
      await sleep(300);
    }
    return nilai;
  };

  // ── Login ──────────────────────────────────────────────────────────────────
  await goto(`${BASE}/login`);
  await ev(`(() => {
    const setV = (sel, val) => { const el = document.querySelector(sel); if (!el) return false;
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); return true; };
    setV('input[placeholder="Masukkan username"]', ${JSON.stringify(USER)});
    setV('input[placeholder="Masukkan password"]', ${JSON.stringify(PASS)});
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Masuk');
    if (b) b.click();
    return !!b;
  })()`);
  const path = await tunggu('location.pathname', v => v === '/menu', 40);
  ok('E1 login berhasil (sampai /menu)', path === '/menu', String(path));
  if (path !== '/menu') throw new Error('login gagal — set LKJIP_E2E_USER/LKJIP_E2E_PASS');

  // ── Siapkan dokumen: 2 blok narasi, blok kedua "Lanjut daftar" ──────────────
  const siap = await ev(`(async () => {
    const kirim = async (url, method, body) => {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    const buat = await kirim('/api/lkjip', 'POST', { tahun: 2099, judul: 'UJI E2E Lanjut Daftar', template: 'standar' });
    if (!buat.body?.ok) return { err: 'buat dokumen: ' + JSON.stringify(buat) };
    const id = buat.body.id;
    const detail = await (await fetch('/api/lkjip/' + id)).json();
    const section = detail?.dokumen?.tree?.[0]?.id ?? null;
    if (!section) return { id, err: 'bagian pertama tidak ditemukan' };
    const b1 = await kirim('/api/lkjip/block', 'POST', { section_id: section, tipe: 'NARASI',
      payload: { html: '<ol><li><p>Satu</p></li><li><p>Dua</p></li></ol>', continueList: false } });
    const b2 = await kirim('/api/lkjip/block', 'POST', { section_id: section, tipe: 'NARASI',
      payload: { html: '<ol><li><p>Tiga</p></li><li><p>Empat</p></li></ol>', continueList: true } });
    return { id, section, b1: b1.status, b2: b2.status, okB1: !!b1.body?.ok, okB2: !!b2.body?.ok };
  })()`);

  let idDokumen = siap?.id ?? null;
  try {
    ok('E2 dokumen uji + 2 blok narasi dibuat', !!idDokumen && siap.okB1 && siap.okB2, JSON.stringify(siap));
    if (!idDokumen || !siap.okB1 || !siap.okB2) throw new Error('persiapan dokumen gagal');

    // ── Dekorasi terpasang ────────────────────────────────────────────────────
    await goto(`${BASE}/lkjip/${idDokumen}`);
    const baca = `[...document.querySelectorAll('.lk-block')].map(b => {
      const ol = b.querySelector('.ProseMirror ol');
      return { start: ol ? ol.getAttribute('start') : null, centang: !!b.querySelector('.lk-block-cont input')?.checked };
    })`;
    const awal = await tunggu(`(${baca}).length === 2 ? (${baca}) : null`, v => Array.isArray(v) && v.length === 2);
    ok('E3 blok 1 tanpa centang → start 1, blok 2 dicentang → start 3',
      awal?.[0]?.start === '1' && awal?.[1]?.start === '3' && awal?.[1]?.centang === true,
      JSON.stringify(awal));

    // ── Lepas centang: nomor kembali ke daftar itu sendiri ─────────────────────
    await ev(`document.querySelectorAll('.lk-block-cont input')[1].click()`);
    const lepas = await tunggu(`(${baca}).length === 2 ? (${baca}) : null`, v => v?.[1]?.start === '1');
    ok('E4 centang dilepas → start kembali 1 (dekorasi tidak tertinggal)', lepas?.[1]?.start === '1' && lepas?.[1]?.centang === false,
      JSON.stringify(lepas?.[1]));

    // ── Centang lagi: nomor sambungan kembali ─────────────────────────────────
    await ev(`document.querySelectorAll('.lk-block-cont input')[1].click()`);
    const pasang = await tunggu(`(${baca}).length === 2 ? (${baca}) : null`, v => v?.[1]?.start === '3');
    ok('E5 centang dipasang lagi → start 3 kembali', pasang?.[1]?.start === '3' && pasang?.[1]?.centang === true,
      JSON.stringify(pasang?.[1]));
  } finally {
    // ── Bersih-bersih: dokumen uji selalu dihapus ─────────────────────────────
    if (idDokumen) {
      const hapus = await ev(`fetch('/api/lkjip?id=${idDokumen}', { method: 'DELETE' }).then(r => r.status)`).catch(() => 0);
      ok('E6 dokumen uji dihapus', hapus === 200, String(hapus));
    }
  }
}

main()
  .catch(e => { gagal.push('fatal'); console.error('ERROR:', e.message); })
  .finally(async () => {
    console.log(`\n${lulus} lulus, ${gagal.length} gagal`);
    if (gagal.length) console.log('GAGAL: ' + gagal.join('; '));
    await send('Browser.close', {}).catch(() => {});
    try { ws?.close(); } catch {}
    try { chrome.kill(); } catch {}
    await sleep(300);
    try { rmSync(userDir, { recursive: true, force: true }); } catch {}
    process.exit(gagal.length ? 1 : 0);
  });

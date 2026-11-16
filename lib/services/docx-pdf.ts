// lib/services/docx-pdf.ts — berkas Word → PDF lewat LibreOffice di server (konsep
// docs/konsep/pk/CONCEPT-pk-lampiran-blud-pj.md §4). Hasilnya PDF berteks yang tata letaknya
// dihitung mesin pengolah kata, bukan foto halaman peramban (pratinjau lama di Riwayat PK).
//
// Satu konversi pada satu waktu (antrean): profil LibreOffice dipakai bersama, dan dua proses
// di atas profil yang sama saling mengunci. Profilnya sendiri (bukan profil pengguna) supaya
// LibreOffice yang dibuka orang di laptop server tidak ikut terkunci.

import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export class PdfTidakTersediaError extends Error {
  constructor() {
    super('PDF belum bisa dibuat di server ini karena LibreOffice belum terpasang. '
      + 'Unduh Word, lalu simpan sebagai PDF dari Word.');
  }
}

const CALON = process.platform === 'win32'
  ? ['C:\\Program Files\\LibreOffice\\program\\soffice.com', 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com']
  : ['/usr/bin/soffice', '/usr/bin/libreoffice', '/usr/local/bin/soffice', '/opt/libreoffice/program/soffice',
     '/Applications/LibreOffice.app/Contents/MacOS/soffice'];

/** `LIBREOFFICE_PATH` (opsional) didahulukan; tanpa itu lokasi pemasangan bawaan. */
export async function lokasiLibreOffice(): Promise<string | null> {
  for (const p of [process.env.LIBREOFFICE_PATH, ...CALON]) {
    if (!p) continue;
    try { await access(p); return p; } catch { /* coba berikutnya */ }
  }
  return null;
}

let antrean: Promise<unknown> = Promise.resolve();

function jalankan(exe: string, args: string[], batasMs: number): Promise<void> {
  return new Promise((ok, gagal) => {
    execFile(exe, args, { timeout: batasMs, windowsHide: true }, err => (err ? gagal(err) : ok()));
  });
}

async function ubah(docx: Uint8Array, batasMs: number): Promise<Buffer> {
  const exe = await lokasiLibreOffice();
  if (!exe) throw new PdfTidakTersediaError();
  const profil = path.join(os.tmpdir(), 'prima-libreoffice-profil');
  await mkdir(profil, { recursive: true });
  const kerja = await mkdtemp(path.join(os.tmpdir(), 'prima-pdf-'));
  try {
    const masuk = path.join(kerja, 'dokumen.docx');
    await writeFile(masuk, docx);
    await jalankan(exe, [
      '--headless', '--norestore', '--nolockcheck', '--nodefault', '--nofirststartwizard',
      `-env:UserInstallation=${pathToFileURL(profil).href}`,
      '--convert-to', 'pdf', '--outdir', kerja, masuk,
    ], batasMs);
    try {
      return await readFile(path.join(kerja, 'dokumen.pdf'));
    } catch {
      throw new Error('LibreOffice selesai tanpa menghasilkan PDF.');
    }
  } finally {
    await rm(kerja, { recursive: true, force: true }).catch(() => {});
  }
}

export function docxKePdf(docx: Uint8Array, batasMs = 90_000): Promise<Buffer> {
  const giliran = antrean.then(() => ubah(docx, batasMs));
  antrean = giliran.catch(() => {});
  return giliran;
}

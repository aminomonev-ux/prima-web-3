// PDF LKJIP lewat LibreOffice di server (konsep docs/CONCEPT-lkjip-pratinjau-dan-word.md §1).
// Masukannya SELALU keluaran rakitDocx — pratinjau, PDF, dan Word bersumber satu (L78).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export class PdfTidakTersediaError extends Error {
  constructor() { super('LibreOffice belum terpasang di server, jadi PDF belum bisa dibuat. Word tetap bisa diunduh.'); }
}
export class PdfSibukError extends Error {
  constructor() { super('Server sedang membuat PDF lain. Coba lagi beberapa detik lagi.'); }
}
export class PdfBatasWaktuError extends Error {
  constructor(detik: number) { super(`Pembuatan PDF dihentikan karena melewati ${detik} detik. Word tetap bisa diunduh.`); }
}
export class PdfGagalError extends Error {}

const WIN = process.platform === 'win32';
const CALON_PROGRAM = WIN
  ? ['C:\\Program Files\\LibreOffice\\program', 'C:\\Program Files (x86)\\LibreOffice\\program']
  : ['/usr/lib/libreoffice/program', '/opt/libreoffice/program', '/usr/local/lib/libreoffice/program', '/Applications/LibreOffice.app/Contents/MacOS'];

export interface LokasiLibreOffice { soffice: string; python: string }

/** Folder `program` LibreOffice: env LIBREOFFICE_PROGRAM dulu, lalu lokasi pasang bawaan. Null = tidak terpasang. */
export function cariLibreOffice(env: Record<string, string | undefined> = process.env, ada: (p: string) => boolean = existsSync): LokasiLibreOffice | null {
  const isian = env.LIBREOFFICE_PROGRAM?.trim();
  for (const dir of isian ? [isian] : CALON_PROGRAM) {
    const soffice = path.join(dir, WIN ? 'soffice.exe' : 'soffice');
    if (!ada(soffice)) continue;
    // Windows: Python ikut terpasang di folder program. Linux: python3 sistem dengan modul uno (paket python3-uno).
    const python = WIN ? path.join(dir, 'python.exe') : (env.LIBREOFFICE_PYTHON?.trim() || 'python3');
    if (WIN && !ada(python)) continue;
    return { soffice, python };
  }
  return null;
}

export const pdfTersedia = (): boolean => cariLibreOffice() !== null;

// Perintah `soffice --convert-to pdf` biasa TIDAK memperbarui Daftar Isi — padahal docgen menulisnya
// tanpa nomor halaman (entriDaftar) dan menyerahkan pengisiannya ke pembaruan field. Karena itu lewat UNO.
// Makro tidak pernah dijalankan (MacroExecutionMode 0), tautan luar tidak dimuat (UpdateDocMode 0).
// Sambungan lewat pipe bernama acak, bukan port TCP: tidak bentrok, tidak terbuka ke jaringan.
export const SKRIP_UNO = String.raw`
import sys, time, subprocess, uno
from com.sun.star.beans import PropertyValue

def pv(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p

soffice, profil, pipa, masuk, keluar, judul = sys.argv[1:7]
proc = subprocess.Popen([soffice, "-env:UserInstallation=" + profil, "--headless", "--invisible", "--nologo",
                         "--norestore", "--nodefault", "--nolockcheck", "--accept=pipe,name=" + pipa + ";urp;"])
desk = None
try:
    ctx = uno.getComponentContext()
    res = ctx.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", ctx)
    rctx = None
    for _ in range(240):
        try:
            rctx = res.resolve("uno:pipe,name=" + pipa + ";urp;StarOffice.ComponentContext"); break
        except Exception:
            if proc.poll() is not None: raise SystemExit("LibreOffice berhenti sebelum siap")
            time.sleep(0.25)
    if rctx is None: raise SystemExit("LibreOffice tidak menjawab")
    desk = rctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", rctx)
    doc = desk.loadComponentFromURL(uno.systemPathToFileUrl(masuk), "_blank", 0,
                                    (pv("Hidden", True), pv("MacroExecutionMode", 0), pv("UpdateDocMode", 0), pv("ReadOnly", True)))
    if doc is None: raise SystemExit("Berkas Word tidak bisa dibuka LibreOffice")
    # Judul PDF: tanpa ini penampil peramban menampilkan nama blob acak.
    if judul: doc.getDocumentProperties().Title = judul
    idx = doc.getDocumentIndexes()
    # Dua kali: Daftar Isi yang memanjang menggeser halaman sesudahnya.
    for _ in range(2):
        for i in range(idx.getCount()):
            idx.getByIndex(i).update()
        doc.getTextFields().refresh()
    filtr = uno.Any("[]com.sun.star.beans.PropertyValue", (pv("ExportBookmarks", True), pv("ExportNotes", False), pv("DisplayPDFDocumentTitle", True)))
    doc.storeToURL(uno.systemPathToFileUrl(keluar), (pv("FilterName", "writer_pdf_Export"), pv("FilterData", filtr)))
    print("OK daftar=%d" % idx.getCount())
    doc.close(True)
finally:
    try:
        if desk is not None: desk.terminate()
    except Exception:
        pass
    try:
        proc.wait(20)
    except Exception:
        proc.kill()
`;

export const BATAS_WAKTU_MS = 90_000;
export const BATAS_ANTRE = 3;

let berjalan = false;
const antrean: Array<() => void> = [];

/** Untuk uji: berapa yang sedang berjalan & menunggu. */
export const statusAntrean = () => ({ berjalan, menunggu: antrean.length });

async function giliran(): Promise<() => void> {
  if (berjalan) {
    if (antrean.length >= BATAS_ANTRE) throw new PdfSibukError();
    await new Promise<void>(lanjut => antrean.push(lanjut));
  }
  berjalan = true;
  return () => {
    const berikut = antrean.shift();
    if (berikut) berikut(); else berjalan = false;
  };
}

function matikanPohon(pid: number | undefined): void {
  if (!pid) return;
  try {
    if (WIN) spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else process.kill(-pid, 'SIGKILL');
  } catch { /* sudah mati */ }
}

/** Satu folder profil per proses aplikasi: tidak berbagi dgn LibreOffice yang dibuka orang di laptop server. */
const folderProfil = () => path.join(os.tmpdir(), `prima-lo-profil-${process.pid}`);

export class PdfDibatalkanError extends Error {
  constructor() { super('Permintaan PDF dibatalkan sebelum dikerjakan.'); }
}

/** signal: permintaan yang dibatalkan peramban selagi MENGANTRE tidak dikerjakan (LibreOffice ± 4 detik per konversi). */
export interface OpsiPdf { batasMs?: number; lokasi?: LokasiLibreOffice | null; judul?: string; signal?: AbortSignal }

/** docx → PDF. Satu konversi pada satu waktu per proses; antrean ≤ BATAS_ANTRE, lebih dari itu PdfSibukError. */
export async function ubahKePdf(docx: Buffer, opsi: OpsiPdf = {}): Promise<Buffer> {
  const lokasi = opsi.lokasi === undefined ? cariLibreOffice() : opsi.lokasi;
  if (!lokasi) throw new PdfTidakTersediaError();
  const selesai = await giliran();
  if (opsi.signal?.aborted) { selesai(); throw new PdfDibatalkanError(); }
  const kerja = path.join(os.tmpdir(), 'prima-lkjip-pdf', randomUUID());
  try {
    await mkdir(kerja, { recursive: true });
    const masuk = path.join(kerja, 'masuk.docx');
    const keluar = path.join(kerja, 'keluar.pdf');
    const skrip = path.join(kerja, 'ke-pdf.py');
    await writeFile(masuk, docx);
    await writeFile(skrip, SKRIP_UNO, 'utf8');
    const batasMs = opsi.batasMs ?? BATAS_WAKTU_MS;
    await jalankan(lokasi.python, [skrip, lokasi.soffice, pathToFileURL(folderProfil()).href, `prima_${randomUUID().replace(/-/g, '')}`, masuk, keluar, (opsi.judul ?? '').replace(/[\r\n]+/g, ' ').slice(0, 200)], batasMs, kerja);
    if (!existsSync(keluar)) throw new PdfGagalError('LibreOffice tidak menghasilkan PDF.');
    return await readFile(keluar);
  } finally {
    // maxRetries: sesudah proses dimatikan, Windows bisa masih memegang berkasnya sesaat (EBUSY/EPERM).
    await rm(kerja, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => {});
    selesai();
  }
}

function jalankan(perintah: string, argumen: string[], batasMs: number, cwd: string): Promise<void> {
  return new Promise((ok, gagal) => {
    // Python LibreOffice Windows membaca PYTHONPATH/PYTHONHOME milik sistem kalau ada — dibuang supaya tidak bentrok.
    const env = { ...process.env }; delete env.PYTHONPATH; delete env.PYTHONHOME;
    // cwd = folder kerja sementara: tanpa itu LibreOffice mewarisi folder aplikasi (di laptop pengembang
    // ada di Documents) dan Windows "Controlled folder access" menahannya (terlihat di log Defender).
    const p = spawn(perintah, argumen, { cwd, env, windowsHide: true, detached: !WIN, stdio: ['ignore', 'pipe', 'pipe'] });
    let galat = '';
    let lewatBatas = false;
    p.stderr.on('data', (d: Buffer) => { galat = (galat + d.toString()).slice(-2000); });
    p.stdout.on('data', () => {});
    // Lewat batas: matikan pohon prosesnya, lalu TUNGGU ia benar-benar keluar sebelum menolak — kalau
    // tidak, folder kerja dihapus selagi LibreOffice masih memegang berkasnya (Windows menolak, folder tertinggal).
    let cadangan: ReturnType<typeof setTimeout> | undefined;
    const selesaiLewat = () => gagal(new PdfBatasWaktuError(Math.round(batasMs / 1000)));
    const jam = setTimeout(() => { lewatBatas = true; matikanPohon(p.pid); cadangan = setTimeout(selesaiLewat, 10_000); }, batasMs);
    p.on('error', e => { clearTimeout(jam); gagal(new PdfGagalError(`LibreOffice tidak bisa dijalankan: ${e.message}`)); });
    p.on('close', kode => {
      clearTimeout(jam); clearTimeout(cadangan);
      if (lewatBatas) selesaiLewat();
      else if (kode === 0) ok();
      else gagal(new PdfGagalError(`LibreOffice gagal (kode ${kode}): ${galat.trim().split('\n').slice(-3).join(' | ')}`));
    });
  });
}

/** Jumlah halaman PDF keluaran LibreOffice (objek halaman ditulis polos, tanpa object stream). */
export function hitungHalaman(pdf: Buffer | Uint8Array): number {
  return (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

const polos = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Nama huruf yang tertanam (tanpa awalan subset "ABCDEF+"). */
export function hurufTertanam(pdf: Buffer | Uint8Array): string[] {
  const t = Buffer.from(pdf).toString('latin1');
  return [...new Set([...t.matchAll(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?([A-Za-z0-9,\-]+)/g)].map(m => m[1]))];
}

/**
 * Huruf dokumen benar-benar dipakai LibreOffice? Nama PostScript = nama keluarga tanpa spasi
 * (+ akhiran gaya/"MT"/"PSMT"): "Bookman Old Style" → "BookmanOldStyle-Bold". Huruf yang tidak
 * terpasang diganti diam-diam (mis. LiberationSerif) dan letak halaman bergeser.
 */
export function hurufTerpasang(pdf: Buffer | Uint8Array, keluarga: string): boolean {
  const kunci = polos(keluarga);
  return hurufTertanam(pdf).some(n => polos(n).startsWith(kunci));
}

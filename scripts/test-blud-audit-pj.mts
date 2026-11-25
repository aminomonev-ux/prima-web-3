// scripts/test-blud-audit-pj.mts — Audit Rekap PJ yang menjelaskan selisih sampai habis.
// Konsep: docs/konsep/blud/CONCEPT-blud-audit-pj-pintar.md.
//
// Jalankan: npx tsx scripts/test-blud-audit-pj.mts

import {
  rekonsiliasiPj, periksaLabelPj, kalimatPos, kalimatNeraca, bandingVersi, kalimatBanding, pjTingkatTakLazim,
  saranPjDobel, labelTanpaPk, kalimatDobel, kalimatTakLazim, kalimatTanpaPk, type BarisRekon,
} from '../lib/blud/rekonsiliasi-pj'
import { auditRekapPJ, type AuditPjRow } from '../lib/blud/audit-pj'
import { renderCetakHtml } from '../lib/blud/cetak-data'
import { susunRekapPj, barisRekapDpa, siapkanKonteksPj } from '../lib/blud/rekap-pj'
import { buatWorkbookRekapPj } from '../lib/blud/export/rekap-pj-dokumen'
import { buatPdfRekapPj } from '../lib/blud/export/pdf-dokumen'
import type { DpaBaris } from '../types'
import fs from 'node:fs'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(70)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(70)} ${catatan}`) }
}
const bab = (t: string) => console.log(`\n── ${t} ──`)

const ak = (n: number) => `AK-${n.toString(16).padStart(32, '0')}`
let nomor = 0
const b = (o: Partial<BarisRekon> & { row_id: string }): BarisRekon & Record<string, unknown> => ({
  parent_id: null, kode_rekening: '', uraian: o.row_id, jumlah: 0, penanggung_jawab: null,
  tipe_baris: 'CHILD', anggaran_key: ak(++nomor), urutan: nomor, vol: null, satuan: null, harga: null, keterangan: null, ...o,
})

/** Akar 100: Operasi 60 (ATK & Listrik ber-PJ "Kasubbag Umum", Air 10 tanpa PJ),
 *  Modal 40 seluruhnya tanpa PJ (Komputer + rincian tanpa kode). */
function pohonDasar(): Array<BarisRekon & Record<string, unknown>> {
  nomor = 0
  return [
    b({ row_id: 'akar', tipe_baris: 'GRANDMASTER', kode_rekening: '5', uraian: 'Belanja Daerah', jumlah: 100 }),
    b({ row_id: 'op', parent_id: 'akar', tipe_baris: 'MASTER', kode_rekening: '5.1', uraian: 'Belanja Operasi', jumlah: 60 }),
    b({ row_id: 'atk', parent_id: 'op', kode_rekening: '5.1.01', uraian: 'ATK', jumlah: 20, penanggung_jawab: 'Kasubbag Umum' }),
    b({ row_id: 'lis', parent_id: 'op', kode_rekening: '5.1.02', uraian: 'Listrik', jumlah: 30, penanggung_jawab: 'Kasubbag Umum' }),
    b({ row_id: 'air', parent_id: 'op', kode_rekening: '5.1.03', uraian: 'Air', jumlah: 10 }),
    b({ row_id: 'mod', parent_id: 'akar', tipe_baris: 'MASTER', kode_rekening: '5.2', uraian: 'Belanja Modal', jumlah: 40 }),
    b({ row_id: 'kom', parent_id: 'mod', kode_rekening: '5.2.01', uraian: 'Komputer', jumlah: 40 }),
    b({ row_id: 'laptop', parent_id: 'kom', kode_rekening: '', uraian: 'Laptop', jumlah: 25 }),
    b({ row_id: 'printer', parent_id: 'kom', kode_rekening: '', uraian: 'Printer', jumlah: 15 }),
  ]
}

// ─── A. Celah: tepat, tanpa tumpang-tindih ───────────────────────────────────
bab('A. Celah PJ = kekurangan, persis')
{
  const rows = pohonDasar()
  const h = rekonsiliasiPj(rows)
  cek('A1 total 100, rekap 50, selisih +50 (rekap kurang)', h.total === 100 && h.rekap === 50 && h.selisih === 50)
  cek('A2 dua pos saja: Modal (seluruh cabang) & Air', h.pos.length === 2
    && h.pos.map(p => p.rowId).join(',') === 'mod,air', h.pos.map(p => `${p.rowId}:${p.nilai}`).join(' '))
  cek('A3 Σ pos = selisih, sisa 0', h.pos.reduce((s, p) => s + p.nilai, 0) === 50 && h.sisa === 0)
  const lama = auditRekapPJ(rows as unknown as AuditPjRow[]).belumEntry
  cek('A4 daftar lama menghitung uang yang sama berkali-kali (pembanding)', lama.reduce((s, x) => s + x.jumlah, 0) > 50,
    `${lama.length} baris, Σ ${lama.reduce((s, x) => s + x.jumlah, 0)}`)
  const mod = h.pos.find(p => p.rowId === 'mod')!
  cek('A5 Modal: cabang 4 baris (rincian tanpa kode ikut), bukan induk "Belanja Daerah"',
    mod.jenis === 'celah' && mod.barisCabang === 4 && !h.pos.some(p => p.rowId === 'akar' || p.rowId === 'op'))
  const air = h.pos.find(p => p.rowId === 'air')!
  cek('A6 saran Air dari saudaranya: Kasubbag Umum 2 dari 2',
    air.jenis === 'celah' && air.saran?.pj === 'Kasubbag Umum' && air.saran.dukungan === 2 && air.saran.dari === 2 && air.saran.dasar === 'saudara')
  cek('A7 Modal tanpa saudara ber-PJ → tanpa saran', mod.jenis === 'celah' && mod.saran === null)
  cek('A8 tercakup 50%', Math.abs(h.tercakup - 0.5) < 1e-9)

  // Rincian tanpa kode yang jadi celah sendirian menyebut induknya.
  const r2 = pohonDasar().map(r => (r.row_id === 'laptop' ? { ...r, penanggung_jawab: 'Kasi Penunjang Medik' } : r))
  const h2 = rekonsiliasiPj(r2)
  const printer = h2.pos.find(p => p.rowId === 'printer')
  cek('A9 rincian tanpa kode: dikenali lewat jalur induknya', printer?.jenis === 'celah' && printer.jalur === '5.2.01 Komputer'
    && /di bawah 5\.2\.01 Komputer/.test(kalimatPos(printer)), printer ? kalimatPos(printer) : '-')
  cek('A10 … dan saran dari saudaranya (Laptop)', printer?.jenis === 'celah' && printer.saran?.pj === 'Kasi Penunjang Medik')
  // "-" di kolom PJ = kosong (aturan `hasPj` di pj-conflict.ts), bukan PJ bernama "-".
  const strip = rekonsiliasiPj(pohonDasar().map(r => (r.row_id === 'air' ? { ...r, penanggung_jawab: '-' } : r)))
  cek('A11 PJ "-" dianggap belum ber-PJ', strip.pos.some(p => p.rowId === 'air' && p.jenis === 'celah') && strip.sisa === 0)
}

// ─── B. Induk ≠ jumlah anak: menjelaskan kurang DAN lebih ─────────────────────
bab('B. Angka induk tak sama dengan jumlah anaknya')
{
  const naik = pohonDasar().map(r => (r.row_id === 'op' ? { ...r, jumlah: 65 } : r.row_id === 'akar' ? { ...r, jumlah: 105 } : r))
  const h = rekonsiliasiPj(naik)
  const op = h.pos.find(p => p.rowId === 'op')
  cek('B1 Operasi 65 vs anak 60 → pos induk +5 (rekap kurang)', op?.jenis === 'induk' && op.nilai === 5 && op.jumlahAnak === 60)
  cek('B2 neraca tetap habis: 55 = 40 + 10 + 5, sisa 0', h.selisih === 55 && h.sisa === 0)

  const turun = pohonDasar().map(r => (r.row_id === 'op' ? { ...r, jumlah: 45 } : r.row_id === 'akar' ? { ...r, jumlah: 85 } : r))
  const h2 = rekonsiliasiPj(turun)
  const op2 = h2.pos.find(p => p.rowId === 'op')
  cek('B3 Operasi 45 vs anak 60 → pos induk −15 (rekap LEBIH)', op2?.jenis === 'induk' && op2.nilai === -15)
  cek('B4 sisa 0', h2.sisa === 0, String(h2.sisa))
  cek('B5 kalimat menyebut "rekap lebih"', !!op2 && /rekap lebih Rp 15/.test(kalimatPos(op2)))

  // Induk tak cocok DI DALAM cabang ber-PJ tidak berpengaruh — PJ mengambil angka induknya.
  const dalam = pohonDasar().map(r => (r.row_id === 'mod' ? { ...r, penanggung_jawab: 'Kasi Penunjang Medik' }
    : r.row_id === 'kom' ? { ...r, jumlah: 99 } : r))
  cek('B6 induk tak cocok di bawah baris ber-PJ tidak dilaporkan', !rekonsiliasiPj(dalam).pos.some(p => p.rowId === 'kom'))
}

// ─── C. PJ di luar total anggaran (rekap lebih) ──────────────────────────────
bab('C. Baris ber-PJ di luar Belanja Daerah')
{
  const rows = [...pohonDasar(), b({ row_id: 'yatim', parent_id: 'tidak-ada', kode_rekening: '5.9', uraian: 'Sisa lama', jumlah: 7, penanggung_jawab: 'Kasubbag Umum' })]
  const h = rekonsiliasiPj(rows)
  const luar = h.pos.find(p => p.rowId === 'yatim')
  cek('C1 masuk rekap (57) tetapi tidak masuk total (100)', h.rekap === 57 && h.total === 100)
  cek('C2 pos luar −7 (rekap lebih)', luar?.jenis === 'luar' && luar.nilai === -7 && luar.pj === 'Kasubbag Umum')
  cek('C3 sisa 0', h.sisa === 0)
  // PJ dipasang di baris yang MENAUNGI Belanja Daerah: rekap 120, total 100 → lebih 20,
  // dan Belanja Daerah sendiri bukan celah (sudah tertaungi PJ di atasnya).
  const naung = [b({ row_id: 'payung', tipe_baris: 'MASTER', kode_rekening: '5', uraian: 'Payung', jumlah: 120, penanggung_jawab: 'Direktur' }),
    ...pohonDasar().map(r => (r.row_id === 'akar' ? { ...r, parent_id: 'payung' } : r))]
  const hn = rekonsiliasiPj(naung)
  cek('C5 PJ di atas Belanja Daerah: satu pos luar −20, tanpa celah, sisa 0',
    hn.selisih === -20 && hn.pos.length === 1 && hn.pos[0].jenis === 'luar' && hn.pos[0].nilai === -20 && hn.sisa === 0,
    hn.pos.map(p => `${p.jenis}:${p.rowId}:${p.nilai}`).join(' '))
  cek('C4 neraca menyebut kelebihan', /- kelebihan Rp 7/.test(kalimatNeraca(h, 'DPA')), kalimatNeraca(h, 'DPA'))
}

// ─── D. Uji acak: selisih SELALU habis terjelaskan ───────────────────────────
bab('D. 400 pohon acak — sisa selalu 0')
{
  let acak = 12345
  const rnd = () => { acak = (acak * 1103515245 + 12345) % 2147483648; return acak / 2147483648 }
  let gagalAcak = 0
  let contoh = ''
  for (let uji = 0; uji < 400; uji++) {
    nomor = 0
    const rows: Array<BarisRekon & Record<string, unknown>> = [b({ row_id: 'r0', tipe_baris: 'GRANDMASTER', jumlah: 0 })]
    const n = 3 + Math.floor(rnd() * 30)
    for (let i = 1; i < n; i++) {
      const p = rows[Math.floor(rnd() * rows.length)]
      rows.push(b({ row_id: `r${i}`, parent_id: p.row_id, jumlah: 0, kode_rekening: rnd() < 0.3 ? '' : `5.${i}` }))
    }
    const anakDari = (id: string) => rows.filter(r => r.parent_id === id)
    const isi = (r: BarisRekon): number => {
      const c = anakDari(r.row_id)
      r.jumlah = c.length ? c.reduce((s, x) => s + isi(x), 0) : Math.floor(rnd() * 1000)
      if (rnd() < 0.15) r.jumlah += Math.floor(rnd() * 200) - 100 // induk/daun tak cocok
      return r.jumlah
    }
    isi(rows[0])
    for (const r of rows) if (rnd() < 0.3) r.penanggung_jawab = ['A', 'B', 'C'][Math.floor(rnd() * 3)]
    if (rnd() < 0.2) rows.push(b({ row_id: 'yatim', parent_id: 'hilang', jumlah: 50, penanggung_jawab: 'A' }))
    const h = rekonsiliasiPj(rows)
    if (h.sisa !== 0) { gagalAcak++; contoh ||= `uji ${uji}: sisa ${h.sisa}` }
  }
  cek('D1 400/400 pohon: Σ pos = total − rekap', gagalAcak === 0, contoh)
}

// ─── E. Label PJ ─────────────────────────────────────────────────────────────
bab('E. Label PJ: ejaan, mirip, di luar master')
{
  const rows = [
    b({ row_id: 'a', penanggung_jawab: 'Kasubbag Umum', jumlah: 1 }),
    b({ row_id: 'b', penanggung_jawab: 'KASUBBAG  UMUM ', jumlah: 1 }),
    b({ row_id: 'c', penanggung_jawab: 'Kasubbag Keuangan', jumlah: 1 }),
    b({ row_id: 'd', penanggung_jawab: 'Kasubag Keuangan', jumlah: 1 }),
    b({ row_id: 'e', penanggung_jawab: 'Kasi Pelayanan Medik', jumlah: 1 }),
    b({ row_id: 'f', penanggung_jawab: 'Kasi Penunjang Medik', jumlah: 1 }),
  ]
  const t = periksaLabelPj(rows, ['Kasubbag Umum', 'Kasubbag Keuangan', 'Kasi Pelayanan Medik', 'Kasi Penunjang Medik'])
  cek('E1 ejaan berbeda: "Kasubbag Umum" & "KASUBBAG  UMUM"', t.some(x => x.jenis === 'ejaan' && x.label.length === 2))
  cek('E2 mirip: Kasubbag Keuangan ~ Kasubag Keuangan', t.some(x => x.jenis === 'mirip' && x.label.includes('Kasubag Keuangan')))
  cek('E3 Pelayanan vs Penunjang TIDAK dianggap mirip', !t.some(x => x.jenis === 'mirip' && x.label.includes('Kasi Pelayanan Medik')))
  cek('E4 di luar master: hanya "Kasubag Keuangan"', t.filter(x => x.jenis === 'luarMaster').map(x => x.label.join()).join('|') === 'Kasubag Keuangan')
  cek('E5 tanpa master → pemeriksaan master dilewati', !periksaLabelPj(rows).some(x => x.jenis === 'luarMaster'))
}

// ─── F. Panel layar ──────────────────────────────────────────────────────────
bab('F. Panel Audit di menu Cetak')
{
  const rows = pohonDasar() as unknown as DpaBaris[]
  const html = renderCetakHtml({ menu: 'pergeseran', view: 'penanggungJawab',
    rows: rows.map(r => ({ ...r, pergeseran: r.jumlah, dpa_versi_tanggal: '2099-01-31', bertambah_berkurang: 0 })),
    versi: '2099-02-28', tanggal: '', tahun: 2099, masterPj: ['Kasubbag Umum'] }).html
  cek('F1 kepala menjawab: "50% anggaran sudah ber-PJ — rekap kurang"', /50% anggaran sudah ber-PJ — rekap kurang/.test(html))
  cek('F2 neraca + daftar "Belum ber-PJ — 2 pos"', /Belum ber-PJ — 2 pos/.test(html) && /Total Pergeseran Rp 100 = rekap PJ Rp 50/.test(html))
  cek('F3 saran PJ tampil', /saran: Kasubbag Umum/.test(html))
  cek('F4 tautan "Buka" ke layar Pergeseran versi & baris yang tepat',
    html.includes(`/blud/pergeseran?tahun=2099&amp;versi=2099-02-28&amp;fokus=${ak(5)}`))
  cek('F5 butir bisa dibuka-tutup, tanpa "+N lainnya" & label lama', /<details class="apj-blok" open>/.test(html)
    && !/lainnya\.\.\./.test(html) && !/Hybrid rule-based/.test(html))
  const htmlDpa = renderCetakHtml({ menu: 'dpa', view: 'penanggungJawab', rows, versi: '2099-01-31', tanggal: '', tahun: 2099 }).html
  cek('F6 menu DPA menaut ke layar DPA', htmlDpa.includes('/blud/dpa?tahun=2099&amp;versi=2099-01-31&amp;fokus='))
  const src = fs.readFileSync(new URL('../app/(dashboard)/blud/dpa/dpa-client.tsx', import.meta.url), 'utf8')
  cek('F7 layar DPA menyorot baris dari ?fokus=<anggaran_key>', /useSearchParams\(\)/.test(src)
    && src.includes('rows.find(r => r.anggaran_key === fokusTautan)') && src.includes("searchParams.get('versi')"))
}

// ─── G. Catatan ikut tercetak ────────────────────────────────────────────────
bab('G. Catatan unduhan Excel & PDF')
{
  const rows = pohonDasar() as unknown as DpaBaris[]
  const s = susunRekapPj(barisRekapDpa(rows), 'DPA')
  cek('G1 catatan: neraca + "Penyebab selisih (2 pos)" + 2 butir', s.catatan[0].startsWith('Total DPA Rp 100 = rekap PJ Rp 50')
    && s.catatan.includes('Penyebab selisih (2 pos):') && s.catatan.some(c => /^1\. 5\.2 Belanja Modal: belum ber-PJ \(4 baris\)/.test(c)),
    s.catatan.join(' | '))
  cek('G2 saran ikut tercetak', s.catatan.some(c => /^2\. 5\.1\.03 Air: .*saran: Kasubbag Umum/.test(c)))
  const wb = await buatWorkbookRekapPj({ tahun: 2099, versi: '2099-01-31', sumber: 'dpa', rows })
  let teks = ''
  wb.worksheets[0].eachRow(r => r.eachCell(c => { teks += ` ${String(c.value ?? '')}` }))
  cek('G3 Excel memuat penyebab selisih & saran', /Penyebab selisih \(2 pos\)/.test(teks) && /saran: Kasubbag Umum/.test(teks))
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const buf = (await buatPdfRekapPj({ tahun: 2099, versi: '2099-01-31', sumber: 'dpa', rows })).output('arraybuffer')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false, verbosity: 0 }).promise
  let tp = ''
  for (let i = 1; i <= doc.numPages; i++) tp += ' ' + (await (await doc.getPage(i)).getTextContent()).items.map(x => ('str' in x ? x.str : '')).join(' ')
  tp = tp.replace(/\s+/g, ' ')
  cek('G4 PDF memuat penyebab selisih & saran', /Penyebab selisih \(2 pos\)/.test(tp) && /saran: Kasubbag Umum/.test(tp))
  // Banyak pos: dipotong rapi dgn jumlah sisanya.
  nomor = 0
  const banyak = [b({ row_id: 'akar', tipe_baris: 'GRANDMASTER', jumlah: 0 })]
  for (let i = 0; i < 60; i++) banyak.push(b({ row_id: `x${i}`, parent_id: 'akar', kode_rekening: `5.${i}`, uraian: `Pos ${i}`, jumlah: 10 + i }))
  banyak[0].jumlah = banyak.slice(1).reduce((t, r) => t + r.jumlah, 0)
  banyak[1].penanggung_jawab = 'A'
  const s2 = susunRekapPj(barisRekapDpa(banyak as unknown as DpaBaris[]), 'DPA')
  cek('G5 >40 pos: dipotong + "… dan 19 pos lainnya"', s2.catatan.some(c => /^… dan 19 pos lainnya/.test(c)))
  // Catatan ikut ke PDF (jsPDF WinAnsi): satu karakter di luar cp1252 merusak seluruh barisnya.
  const cp1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
  const semua = [b({ row_id: 'akar', tipe_baris: 'GRANDMASTER', jumlah: 50 }),
    b({ row_id: 'i', parent_id: 'akar', kode_rekening: '5.1', jumlah: 45 }),
    b({ row_id: 'j', parent_id: 'i', kode_rekening: '5.1.1', jumlah: 20, penanggung_jawab: 'Kasubbag Umum' }),
    b({ row_id: 'k', parent_id: 'i', kode_rekening: '', uraian: 'Rincian', jumlah: 20 }),
    b({ row_id: 'l', parent_id: 'hilang', kode_rekening: '5.9', jumlah: 3, penanggung_jawab: 'KASUBBAG UMUM' })]
  const asing = susunRekapPj(barisRekapDpa(semua as unknown as DpaBaris[]), 'DPA').catatan.join('')
    .split('').filter(c => c.charCodeAt(0) > 255 && !cp1252.includes(c))
  cek('G6 semua kalimat catatan aman untuk huruf PDF (WinAnsi)', asing.length === 0, JSON.stringify([...new Set(asing)]))
}

// ─── H. Riwayat, DPA acuan, banding versi, tingkat, dobel, Form PK ───────────
bab('H. Deteksi lanjut (versi lalu, tahun lalu, DPA, tingkat, dobel, PK)')
{
  const kini = pohonDasar()
  const jangkar = new Map(kini.map(r => [r.row_id, r.anggaran_key]))
  const salin = (ubah: Record<string, string | null>) => pohonDasar().map(r => ({
    ...r, anggaran_key: jangkar.get(r.row_id),
    penanggung_jawab: r.row_id in ubah ? ubah[r.row_id] : r.penanggung_jawab,
  }))
  // Versi lalu: Air ber-PJ, Komputer ber-PJ (cabang Modal).
  const lalu = salin({ air: 'Kasubbag Umum', kom: 'Kasi Penunjang Medik' })
  const h = rekonsiliasiPj(kini, { sebelum: { versi: '2099-08-31', rows: lalu } })
  const air = h.pos.find(p => p.rowId === 'air')
  const mod = h.pos.find(p => p.rowId === 'mod')
  cek('H1 Air: PJ hilang sejak versi lalu terdeteksi', air?.jenis === 'celah' && air.riwayat?.pj === 'Kasubbag Umum' && air.riwayat.versi === '2099-08-31')
  cek('H2 … sarannya dari versi lalu (bukan saudara)', air?.jenis === 'celah' && air.saran?.dasar === 'versi lalu')
  cek('H3 Modal: saran dari cabangnya di versi lalu', mod?.jenis === 'celah' && mod.saran?.dasar === 'cabang lalu' && mod.saran.pj === 'Kasi Penunjang Medik' && mod.riwayat === null)
  cek('H4 kalimat menyebut "PJ-nya hilang sejak itu"', !!air && /dulu ber-PJ Kasubbag Umum di versi 31 Agu 2099 — PJ-nya hilang/.test(kalimatPos(air)), air ? kalimatPos(air) : '')

  // Tahun lalu: jangkar beda (Salin Tahun melepasnya) → dicocokkan kode + uraian.
  nomor = 500
  const tl = pohonDasar().map(r => (r.row_id === 'mod' ? { ...r, penanggung_jawab: 'Kasubbag Rumah Tangga' } : r))
  const ht = rekonsiliasiPj(kini, { tahunLalu: { tahun: 2098, rows: tl } })
  const modT = ht.pos.find(p => p.rowId === 'mod')
  cek('H5 saran tahun lalu lewat kode + uraian', modT?.jenis === 'celah' && modT.saran?.dasar === 'tahun lalu' && modT.saran.pj === 'Kasubbag Rumah Tangga')

  // DPA acuan (Pergeseran): Air ber-PJ di DPA, Modal kosong, Laptop tertaungi PJ Komputer.
  const dpa = salin({ air: 'Kasubbag Umum', kom: 'Kasi Penunjang Medik' })
  const hd = rekonsiliasiPj(kini, { dpaAcuan: { versi: '2099-01-31', rows: dpa }, sebelum: { versi: '2099-08-31', rows: salin({ air: 'Lain' }) } })
  const airD = hd.pos.find(p => p.rowId === 'air')
  cek('H6 DPA ber-PJ → saran dari DPA mengalahkan versi lalu', airD?.jenis === 'celah' && airD.saran?.dasar === 'dpa' && airD.saran.pj === 'Kasubbag Umum')
  cek('H7 … petunjuk: tekan Sinkronkan DPA', airD?.jenis === 'celah' && airD.dpa?.status === 'pj' && /Sinkronkan DPA/.test(kalimatPos(airD)))
  const dpaKosong = salin({})
  const hk = rekonsiliasiPj(kini, { dpaAcuan: { versi: '2099-01-31', rows: dpaKosong } })
  const modK = hk.pos.find(p => p.rowId === 'mod')
  cek('H8 DPA juga kosong → "isi di DPA juga, kalau tidak Sinkronkan DPA mengosongkannya"',
    modK?.jenis === 'celah' && modK.dpa?.status === 'kosong' && /isi di DPA juga/.test(kalimatPos(modK)))
  const r2 = pohonDasar().map(r => (r.row_id === 'laptop' ? { ...r, penanggung_jawab: 'X' } : r))
  const hT = rekonsiliasiPj(r2, { dpaAcuan: { versi: '2099-01-31', rows: salin({ kom: 'Kasi Penunjang Medik' }).map(r => ({ ...r, anggaran_key: jangkar.get(r.row_id) })) } })
  const printer = hT.pos.find(p => p.rowId === 'printer')
  cek('H9 di DPA tertaungi PJ induknya', printer?.jenis === 'celah' && printer.dpa?.status === 'tertaungi' && printer.dpa.pj === 'Kasi Penunjang Medik')
  cek('H10 tanpa DPA acuan → tanpa petunjuk DPA', h.pos.every(p => p.jenis !== 'celah' || p.dpa === null))

  // Banding versi: dulu hanya Modal yang celah; kini Air ikut.
  const b = bandingVersi(h, rekonsiliasiPj(lalu), '2099-08-31')
  cek('H11 banding: 2 pos baru (Modal & Air) + selisih naik', b.baru.length === 2 && b.baru.some(p => p.rowId === 'air') && b.selisihKini > b.selisihLalu,
    `${b.baru.map(p => p.rowId)} ${b.selisihLalu}→${b.selisihKini}`)
  cek('H12 kalimat banding: dulu pas, kini kurang 50 dari 2 pos baru', /^Dibanding versi 31 Agu 2099: rekap pas; sekarang kurang Rp 50 — 2 pos baru \(Belanja Modal, Air\)/.test(kalimatBanding(b)), kalimatBanding(b))

  // Tingkat tak lazim: 6 PJ di tingkat 3, satu di tingkat 5.
  nomor = 900
  const t = [b0('akar', null, 0, 'GRANDMASTER')]
  for (let i = 0; i < 3; i++) t.push(b0(`k${i}`, 'akar', 0))
  for (let i = 0; i < 6; i++) t.push(b0(`p${i}`, `k${i % 3}`, 10, undefined, 'PJ ' + (i % 2)))
  t.push(b0('cucu', 'p0', 5), b0('dalam', 'cucu', 5, undefined, 'PJ X'))
  const tl2 = pjTingkatTakLazim(t)
  cek('H13 tingkat lazim 3, "dalam" (tingkat 5) dilaporkan', tl2.lazim === 3 && tl2.daftar.length === 1 && tl2.daftar[0].rowId === 'dalam' && tl2.daftar[0].tingkat === 5)
  cek('H14 kurang dari 5 PJ → diam', pjTingkatTakLazim(t.slice(0, 6)).daftar.length === 0)

  // PJ dobel: "dalam" di bawah p0 (PJ 0) — p0 di tingkat lazim → hapus di bawah.
  const d1 = saranPjDobel(t)
  cek('H15 dobel beda PJ, induk di tingkat lazim → hapus di baris bawah', d1.length === 1 && d1[0].rowId === 'dalam' && d1[0].hapusDi === 'bawah')
  const t2 = t.map(r => (r.row_id === 'k0' ? { ...r, penanggung_jawab: 'PJ 0' } : r))
  const d2 = saranPjDobel(t2).find(x => x.rowId === 'p0')
  cek('H16 dobel PJ sama → hapus di bawah, "sudah tercakup"', d2?.hapusDi === 'bawah' && /sama dengan induknya/.test(d2.alasan))
  const t3 = t.map(r => (r.row_id === 'k1' ? { ...r, penanggung_jawab: 'Kabid' } : r))
  const d3 = saranPjDobel(t3).find(x => x.rowId === 'p1')
  cek('H17 dobel beda PJ, induk TIDAK di tingkat lazim → hapus di induk', d3?.hapusDi === 'induk' && d3.indukRowId === 'k1')

  // Form PK.
  const pk = labelTanpaPk(t, ['pj 0', 'PJ X'])
  cek('H18 label tanpa PK: "PJ 1" saja, dgn nominal (huruf besar diabaikan)', pk.length === 1 && pk[0].label === 'PJ 1' && pk[0].baris === 3 && pk[0].nominal === 30)
  cek('H19 tanpa daftar PK → diam (endpoint gagal)', labelTanpaPk(t, null).length === 0)

  // Panel + unduhan memakai semuanya.
  const raw = {
    sebelum: { versi: '2099-08-31', rows: lalu as unknown as DpaBaris[] },
    labelPk: ['Kasubbag Rumah Tangga'],
  }
  const html = renderCetakHtml({ menu: 'dpa', view: 'penanggungJawab', rows: kini as unknown as DpaBaris[], versi: '2099-09-30', tanggal: '', tahun: 2099, konteksPj: raw }).html
  cek('H20 panel: kartu PJ hilang + kalimat banding + PJ hilang per pos', /PJ hilang sejak versi lalu/.test(html) && /Dibanding versi 31 Agu 2099/.test(html) && /class="apj-hilang"/.test(html))
  cek('H21 panel: label tanpa PK disebut', /PJ tidak dipetakan ke Form PK — 1 label/.test(html) && /Kasubbag Umum/.test(html))
  const sus = susunRekapPj(barisRekapDpa(kini as unknown as DpaBaris[]), 'DPA', { konteks: siapkanKonteksPj('dpa', raw), labelPk: raw.labelPk })
  cek('H22 catatan unduhan: banding + PJ hilang + tanpa PK', sus.catatan.some(c => /^Dibanding versi/.test(c))
    && sus.catatan.some(c => /PJ-nya hilang sejak itu/.test(c)) && sus.catatan.some(c => /tidak dipetakan ke unit Form PK/.test(c)))
  const wb = await buatWorkbookRekapPj({ tahun: 2099, versi: '2099-09-30', sumber: 'dpa', rows: kini as unknown as DpaBaris[], konteks: raw })
  let teks = ''
  wb.worksheets[0].eachRow(r => r.eachCell(c => { teks += ` ${String(c.value ?? '')}` }))
  cek('H23 Excel memuat kalimat banding & PK', /Dibanding versi 31 Agu 2099/.test(teks) && /Form PK/.test(teks))
  const cp1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
  const semuaKalimat = [...sus.catatan, kalimatPos(airD!), kalimatPos(modK!), kalimatPos(printer!),
    ...d1.map(kalimatDobel), ...tl2.daftar.map(kalimatTakLazim), ...pk.map(kalimatTanpaPk)].join('')
  const asing = [...semuaKalimat].filter(c => c.charCodeAt(0) > 255 && !cp1252.includes(c))
  cek('H24 semua kalimat baru aman untuk PDF (WinAnsi)', asing.length === 0, JSON.stringify([...new Set(asing)]))

  const src = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
  const cetak = src('app/(dashboard)/blud/cetak/cetak-client.tsx')
  cek('H25 Cetak memuat konteks & mengopernya ke panel, Excel, PDF',
    /await muatKonteksPj\(/.test(cetak) && /tahun, masterPj, konteksPj,/.test(cetak) && (cetak.match(/konteks: rawKonteksPj/g) ?? []).length === 2)
  cek('H26 panel tidak meluap: .apj dibatasi selebar layar & sticky', /\.apj \{[^}]*position: sticky; left: 0; max-width: calc\(100vw - 48px\)/.test(cetak))
  // Banding: pos yang tetap ada BUKAN "baru"; pos yang hilang = "teratasi".
  const laluB = salin({ kom: 'Kasi Penunjang Medik', air: null })   // dulu: Air celah, Modal tertutup
  const kiniB = salin({ air: 'Kasubbag Umum' })                       // kini: Air tertutup, Modal celah
  const bb = bandingVersi(rekonsiliasiPj(kiniB), rekonsiliasiPj(laluB), '2099-08-31')
  cek('H28 banding: Modal baru, Air teratasi', bb.baru.map(p => p.rowId).join() === 'mod' && bb.teratasi.map(p => p.rowId).join() === 'air',
    `baru ${bb.baru.map(p => p.rowId)} · teratasi ${bb.teratasi.map(p => p.rowId)}`)
  const bSama = bandingVersi(rekonsiliasiPj(kini), rekonsiliasiPj(kini), '2099-08-31')
  cek('H29 banding: pos yang sama di dua versi tidak dihitung baru', bSama.baru.length === 0 && /penyebabnya sama/.test(kalimatBanding(bSama)))

  // Tingkat: pola tidak jelas (< 60% di satu tingkat) → diam; jarak 1 tingkat → tidak dilaporkan.
  nomor = 950
  const campur = [b0('akar', null, 0, 'GRANDMASTER'), b0('k', 'akar', 0)]
  for (let i = 0; i < 3; i++) campur.push(b0(`x${i}`, 'k', 1, undefined, 'A'))
  for (let i = 0; i < 3; i++) campur.push(b0(`y${i}`, `x${i}`, 1, undefined, 'B'))
  cek('H30 < 60% di satu tingkat → tidak ada tingkat lazim', pjTingkatTakLazim(campur).lazim === null)
  const dekat = t.map(r => (r.row_id === 'cucu' ? { ...r, penanggung_jawab: 'PJ Y' } : r)).filter(r => r.row_id !== 'dalam')
  cek('H31 PJ satu tingkat di bawah yang lazim tidak dilaporkan', pjTingkatTakLazim(dekat).daftar.length === 0)

  // Tahun lalu ambigu (kode + uraian sama, PJ beda) → tanpa saran tahun lalu.
  nomor = 700
  const ambigu = [...pohonDasar().map(r => (r.row_id === 'mod' ? { ...r, penanggung_jawab: 'A' } : r)),
    { ...pohonDasar().find(r => r.row_id === 'mod')!, row_id: 'mod2', anggaran_key: ak(999), jumlah: 1, penanggung_jawab: 'B' }]
  const modA = rekonsiliasiPj(kini, { tahunLalu: { tahun: 2098, rows: ambigu } }).pos.find(p => p.rowId === 'mod')
  cek('H32 kode + uraian sama tapi PJ beda di tahun lalu → tidak menebak dari tahun lalu', modA?.jenis === 'celah' && modA.saran?.dasar !== 'tahun lalu')

  // Konteks Pergeseran dibandingkan dgn pagu PASCA-geser, bukan kolom jumlah DPA.
  const pgLalu = (lalu as unknown as Record<string, unknown>[]).map(r => ({ ...r, pergeseran: Number(r.jumlah) * 2 }))
  const kp = siapkanKonteksPj('pergeseran', { sebelum: { versi: '2099-08-31', rows: pgLalu as never } })
  cek('H33 konteks Pergeseran memakai kolom pergeseran', kp.sebelum?.rows.find(r => r.row_id === 'akar')?.jumlah === 200)

  // Panel Pergeseran menulis petunjuk DPA per celah.
  const htmlPg = renderCetakHtml({ menu: 'pergeseran', view: 'penanggungJawab',
    rows: kini.map(r => ({ ...r, pergeseran: r.jumlah, dpa_versi_tanggal: '2099-01-31', bertambah_berkurang: 0 })),
    versi: '2099-09-30', tanggal: '', tahun: 2099, konteksPj: { dpaAcuan: { versi: '2099-01-31', rows: dpaKosong as unknown as DpaBaris[] } } }).html
  cek('H34 panel Pergeseran: petunjuk "isi di DPA juga"', /class="apj-dpa">di DPA juga belum ber-PJ/.test(htmlPg))

  const rute = src('app/api/blud/penanggung-jawab/route.ts')
  cek('H27 GET ?mode=pk tetap di belakang pagar baca & sakelar', /bludMati[\s\S]*bolehLihatSalahSatu[\s\S]*mode'\) === 'pk'/.test(rute))
}

function b0(row_id: string, parent_id: string | null, jumlah: number, tipe_baris = 'CHILD', penanggung_jawab: string | null = null) {
  return b({ row_id, parent_id, jumlah, tipe_baris, penanggung_jawab, kode_rekening: `5.${row_id}` })
}

console.log(`\n${lulus} lulus · ${gagal} gagal`)
process.exit(gagal ? 1 : 0)

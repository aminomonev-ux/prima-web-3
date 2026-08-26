// lib/blud/cetak-data.ts
// Client-side helpers untuk menu Cetak BLUD — aggregate raw rows ke HTML preview
// + bentuk data terstruktur untuk export PDF/Excel.
//
// Ported dari Aplikasi BLUD (GAS) blud.html line 6375-6645 (showRekap render logic).
// PRIMA: data sudah typed via interfaces di types/index.ts, jadi tidak perlu re-parse
// array index seperti GAS.
//
// Functions di sini PURE (no DB, no fetch) — aman dipakai di client component.

import type { DpaBaris, PergeseranBaris } from '@/types'
import type { MasterAkun } from './master-akun-data'
import { formatRupiah } from './format'
import { hitungDeltaPergeseranRoot } from './recalc'
import { auditRekapPJ } from './audit-pj'
import type { AuditResult, AuditPjRow } from './audit-pj'

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type Menu = 'dpa' | 'pergeseran' | 'master-akun'
export type View = 'dpa' | 'penanggungJawab' | 'rekapPergeseran' | 'masterAkun'

export interface RenderArgs {
  menu:    Menu
  view:    View
  rows:    unknown      // raw data dari API (DpaBaris[] | PergeseranBaris[] | MasterAkun[])
  versi:   string | null
  tanggal: string       // user-input date filter (kosong = pakai versi)
  /**
   * Cetak hanya pos yang benar-benar bergeser (+ leluhurnya). Hanya berlaku di
   * `menu: 'pergeseran'` / `view: 'rekapPergeseran'`; view lain mengabaikannya.
   */
  hanyaBergeser?: boolean
}

// Output shape — `rows` di sini sudah-aggregated (PJ grouping, etc.) untuk export
export interface RenderResult {
  html: string
  rows: ExportRow[]
  meta: { title: string; columns: string[] }
}

// Tabel row terstruktur untuk export — string-only supaya XLSX & PDF konsisten
export type ExportRow = (string | number)[]

// ──────────────────────────────────────────────────────────────────────────
// HTML escape — cegah XSS kalau data ada karakter <, >, &, ", '
// ──────────────────────────────────────────────────────────────────────────
function esc(s: unknown): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// B7: 0 tetap dicetak "0" — hanya null/belum diisi yang blank (bedakan di cetak/export)
function fmt(n: number | null | undefined): string {
  return n == null ? '' : formatRupiah(n)
}

/**
 * B6: pergeseran yang belum berimbang BUKAN dokumen final. Satu sumber untuk
 * semua view bermenu `pergeseran` — dulu cuma tabel Rekap Pergeseran yang
 * memasangnya, sehingga rekap PJ bisa terbit dari draft tanpa tanda apa pun.
 */
function spandukDraft(deltaRoot: number): string {
  if (deltaRoot === 0) return ''
  return `<div style="margin-bottom:10px;padding:8px 12px;border:1.5px solid #F59E0B;background:rgba(245,158,11,.15);border-radius:8px;color:#FCD34D;font-weight:700;font-size:12px;">`
    + `⚠️ DRAFT — belum berimbang: total anggaran ${deltaRoot > 0 ? 'bertambah' : 'berkurang'} ${formatRupiah(Math.abs(deltaRoot))} terhadap DPA. Bukan dokumen final.</div>`
}

/** Jumlah baris yang dicetak vs jumlah baris versi itu — dipakai spanduk "sebagian". */
export interface CakupanCetak { ditampilkan: number; total: number }

/**
 * Rekap anggaran yang diam-diam membuang baris adalah dokumen yang menyesatkan,
 * bukan dokumen yang ringkas. Spanduk ini yang membuat penyaringan jujur —
 * terutama kalimat kedua, sebab angka pada baris induk memang tetap pagu penuh.
 */
function spandukSebagian(c: CakupanCetak): string {
  return `<div style="margin-bottom:10px;padding:8px 12px;border:1.5px solid #38BDF8;background:rgba(56,189,248,.12);border-radius:8px;color:#7DD3FC;font-weight:600;font-size:12px;">`
    + `ℹ️ <strong>Hanya baris yang bergeser</strong> — ${c.ditampilkan} dari ${c.total} baris. `
    + `Angka pada baris induk tetap pagu penuh, termasuk pos yang tidak ditampilkan.</div>`
}

/**
 * Saring baris Pergeseran ke "hanya yang bergeser": daun ber-selisih, PLUS
 * seluruh leluhurnya.
 *
 * Leluhur dibawa TANPA memandang selisihnya sendiri, dan itu bukan kelonggaran
 * melainkan syarat. Geser Rp 1 juta dari ATK ke Listrik di bawah induk yang
 * sama: kedua daun ber-selisih, induknya +1jt −1jt = 0. Saringan naif
 * `bb !== 0` membuang induknya dan menyisakan dua daun yatim — padahal
 * pergeseran berimbang di bawah satu induk justru bentuk yang paling sering
 * terjadi, dan tanpa baris induk dokumennya tidak terbaca sebagai anggaran.
 *
 * Angka pada baris leluhur SENGAJA tidak dihitung ulang dari anak yang lolos
 * saring: itu pagu penuh yang menyambung ke DPA. Karena itu pemanggil wajib
 * memasang `spandukSebagian`.
 *
 * Penyaringan ini baru punya dasar sejak kolom P jadi salinan penuh kolom DPA.
 * Sebelumnya baris yang tidak digeser ber-`bertambah_berkurang` = −jumlah, jadi
 * di mata mesin SEMUA baris bergeser dan saringan ini tidak menyaring apa pun.
 */
export function saringYangBergeser<T extends {
  row_id: string; parent_id: string | null; bertambah_berkurang?: number | null
}>(rows: T[]): T[] {
  const punyaAnak = new Set<string>()
  for (const r of rows) if (r.parent_id) punyaAnak.add(r.parent_id)

  // Hanya daun yang dinilai dari selisihnya sendiri; induk masuk lewat jalur
  // leluhur di bawah. Pada data konsisten hasilnya sama saja — selisih induk
  // adalah jumlah selisih anaknya, jadi induk ber-selisih pasti punya daun
  // ber-selisih. Yang dijaga penjaga ini data TIDAK konsisten: baris agregat
  // yang selisih tersimpannya basi tidak boleh menyeret dirinya sendiri masuk
  // tanpa satu pun anak yang menemani — kepala tabel tanpa rincian.
  const simpan = new Set<string>()
  for (const r of rows) {
    if (punyaAnak.has(r.row_id)) continue
    if ((r.bertambah_berkurang ?? 0) !== 0) simpan.add(r.row_id)
  }

  const byId = new Map(rows.map(r => [r.row_id, r]))
  for (const id of [...simpan]) {
    let kini = byId.get(id)
    // Pagar kedalaman: rantai induk melingkar ditolak saat SIMPAN
    // (`validateTreeIntegrity`), tapi ini jalan di jalur BACA — data lama yang
    // terlanjur melingkar tidak boleh menggantung layar Cetak.
    for (let pagar = 0; kini?.parent_id && pagar < 64; pagar++) {
      const induk = byId.get(kini.parent_id)
      if (!induk) break
      simpan.add(induk.row_id)
      kini = induk
    }
  }

  return rows.filter(r => simpan.has(r.row_id))
}

// ──────────────────────────────────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────────────────────────────────
export function renderCetakHtml(args: RenderArgs): RenderResult {
  const { menu, view, rows, versi, tanggal, hanyaBergeser } = args

  if (menu === 'dpa' && view === 'dpa') {
    return renderDpaView(rows as DpaBaris[], versi ?? tanggal)
  }
  if (menu === 'dpa' && view === 'penanggungJawab') {
    return renderPjView(rows as DpaBaris[], versi ?? tanggal, 'dpa')
  }
  if (menu === 'pergeseran' && view === 'penanggungJawab') {
    const asli = rows as PergeseranBaris[]
    // Delta WAJIB dihitung sebelum penukaran di bawah: sesudah `jumlah` diisi
    // `pergeseran`, selisih keduanya selalu 0 dan spanduk DRAFT tak pernah muncul.
    const deltaRoot = hitungDeltaPergeseranRoot(asli)
    // Pagu PASCA-geser — itu seluruh alasan rekap ini ada. `jumlah` di baris
    // pergeseran masih angka DPA; yang berlaku setelah digeser ada di `pergeseran`.
    const pascaGeser = asli.map(r => ({ ...r, jumlah: r.pergeseran }))
    return renderPjView(pascaGeser, versi ?? tanggal, 'pergeseran', deltaRoot)
  }
  if (menu === 'pergeseran' && view === 'rekapPergeseran') {
    const asli = rows as PergeseranBaris[]
    // Delta dari daftar PENUH, supaya penilaian DRAFT tidak bergantung pada cara
    // saringan bekerja. Pada data yang konsisten kedua cara memang sama —
    // akar ber-selisih berarti ada daun ber-selisih, daun itu selalu lolos saring,
    // dan leluhurnya ikut terbawa sampai akar. Tapi kesamaan itu kebetulan yang
    // bergantung pada aturan saringan hari ini; tanda DRAFT terlalu penting untuk
    // digantungkan padanya.
    const deltaRoot = hitungDeltaPergeseranRoot(asli)
    const tampil = hanyaBergeser ? saringYangBergeser(asli) : asli
    return renderPergeseranView(
      tampil, versi ?? tanggal, deltaRoot,
      hanyaBergeser ? { ditampilkan: tampil.length, total: asli.length } : null,
    )
  }
  if (menu === 'master-akun' && view === 'masterAkun') {
    return renderMasterAkunView(rows as MasterAkun[])
  }

  return {
    html: '<div style="padding:20px;color:#85B7EB;font-style:italic;">View tidak tersedia.</div>',
    rows: [],
    meta: { title: 'Tidak tersedia', columns: [] },
  }
}

// ──────────────────────────────────────────────────────────────────────────
// View: DPA BLUD — tabel hierarchical, semua kolom
// ──────────────────────────────────────────────────────────────────────────
function renderDpaView(rows: DpaBaris[], versi: string | null): RenderResult {
  const columns = ['Kode Rekening', 'Uraian', 'Vol', 'Satuan', 'Harga', 'Jumlah', 'Penanggung Jawab', 'Keterangan']
  const title = `Rekap DPA BLUD${versi ? ` — ${versi}` : ''}`

  // Sort by urutan (preserve hierarchy)
  const sorted = [...rows].sort((a, b) => a.urutan - b.urutan)

  const exportRows: ExportRow[] = sorted.map(r => [
    r.kode_rekening, r.uraian, r.vol ?? '', r.satuan ?? '', r.harga ?? '', r.jumlah,
    r.penanggung_jawab ?? '', r.keterangan ?? '',
  ])

  let html = `<h4 style="margin:0 0 12px;color:inherit;font-weight:800;">${esc(title)}</h4>`
  html += `<table><thead><tr>`
  for (const c of columns) html += `<th>${esc(c)}</th>`
  html += `</tr></thead><tbody>`
  for (const r of sorted) {
    const isHead = ['GRANDMASTER', 'MASTER', 'LEADER', 'PLETON-LEADER', 'KETUA-KELOMPOK-A', 'KETUA-KELOMPOK-B', 'L7-HEAD', 'L8-HEAD'].includes(r.tipe_baris)
    const rowStyle = isHead ? ' style="font-weight:700;"' : ''
    html += `<tr${rowStyle}>`
    html += `<td>${esc(r.kode_rekening)}</td>`
    html += `<td>${esc(r.uraian)}</td>`
    html += `<td style="text-align:right;font-family:monospace;">${r.vol ?? ''}</td>`
    html += `<td>${esc(r.satuan ?? '')}</td>`
    html += `<td style="text-align:right;font-family:monospace;">${fmt(r.harga)}</td>`
    html += `<td style="text-align:right;font-family:monospace;font-weight:600;">${fmt(r.jumlah)}</td>`
    html += `<td>${esc(r.penanggung_jawab ?? '')}</td>`
    html += `<td>${esc(r.keterangan ?? '')}</td>`
    html += `</tr>`
  }
  html += `</tbody></table>`

  return { html, rows: exportRows, meta: { title, columns } }
}

// ──────────────────────────────────────────────────────────────────────────
// View: Rekap Penanggung Jawab — group per PJ, subtotal, grand total
// Port dari blud.html line 6471-6580 loadAndRender logic.
// ──────────────────────────────────────────────────────────────────────────
function renderPjView(
  rows: AuditPjRow[],
  versi: string | null,
  sumber: 'dpa' | 'pergeseran',
  /** Selisih pagu akar terhadap DPA — != 0 berarti dokumennya masih DRAFT. */
  deltaRoot = 0,
): RenderResult {
  const columns = ['Penanggung Jawab', 'Uraian', 'Jumlah']
  const labelSumber = sumber === 'dpa' ? 'DPA' : 'Pergeseran'
  const title = `Rekap Penanggung Jawab${sumber === 'pergeseran' ? ' (Pergeseran)' : ''}`
    + (versi ? ` (${versi})` : ` (${labelSumber} Terbaru)`)
    + (deltaRoot !== 0 ? ' (DRAFT)' : '')

  // Filter rows yang punya PJ (skip '-' dan kosong)
  const pjRows = rows
    .filter(r => {
      const pj = (r.penanggung_jawab ?? '').trim()
      return pj && pj !== '-'
    })
    .map(r => ({
      pj: (r.penanggung_jawab ?? '').trim(),
      uraian: r.uraian,
      jumlah: Number(r.jumlah) || 0,
      tipe: r.tipe_baris,
      rowId: r.row_id,
      parentId: r.parent_id ?? '',
    }))

  // Group per PJ
  const grouped = new Map<string, typeof pjRows>()
  for (const r of pjRows) {
    if (!grouped.has(r.pj)) grouped.set(r.pj, [])
    grouped.get(r.pj)!.push(r)
  }

  // B3+B4: total DPA struktural + grand total bersih dobel-hitung — satu sumber
  // dari auditRekapPJ (subtotal per-PJ tetap mentah; selisihnya dijelaskan panel audit)
  const audit = auditRekapPJ(rows)
  const totalDpa = audit.totalDPA
  const grandTotal = audit.grandTotal

  // Build table data + export rows
  const exportRows: ExportRow[] = []
  exportRows.push(['TOTAL BELANJA BLUD', '', grandTotal])
  for (const [pj, items] of grouped.entries()) {
    const subtotal = items.reduce((s, it) => s + it.jumlah, 0)
    exportRows.push([pj, '', subtotal])
    for (const it of items) exportRows.push(['', it.uraian, it.jumlah])
    exportRows.push([`${pj} Total`, '', subtotal])
  }
  exportRows.push(['TOTAL BELANJA BLUD', '', grandTotal])

  // Build HTML
  let html = `<h4 style="margin:0 0 12px;color:inherit;font-weight:800;">${esc(title)}</h4>`
  html += spandukDraft(deltaRoot)
  html += `<div style="margin-bottom:8px;font-size:11px;color:#85B7EB;font-weight:600;">`
  html += `Total ${esc(labelSumber)} Belanja Daerah: <strong style="color:#7DD3FC;">${formatRupiah(totalDpa)}</strong> · `
  html += `Total Rekap PJ: <strong style="color:#FAC775;">${formatRupiah(grandTotal)}</strong> · `
  const diff = totalDpa - grandTotal
  html += `Selisih: <strong style="color:${diff === 0 ? '#6EE7B7' : '#FCA5A5'};">${formatRupiah(diff)}</strong>`
  if (audit.doubleEntries.length > 0) {
    html += ` · <span style="color:#FCA5A5;">${audit.doubleEntries.length} baris dobel-hitung dikecualikan dari total</span>`
  }
  html += `</div>`

  html += `<table><thead><tr>`
  for (const c of columns) html += `<th>${esc(c)}</th>`
  html += `</tr></thead><tbody>`

  html += `<tr style="background:rgba(239,159,39,.22);font-weight:800;color:#FFE6BF;"><td>TOTAL BELANJA BLUD</td><td></td><td style="text-align:right;font-family:monospace;">${formatRupiah(grandTotal)}</td></tr>`
  for (const [pj, items] of grouped.entries()) {
    const subtotal = items.reduce((s, it) => s + it.jumlah, 0)
    html += `<tr style="background:rgba(124,92,252,.22);font-weight:700;color:#DCD0FF;"><td>${esc(pj)}</td><td></td><td style="text-align:right;font-family:monospace;">${formatRupiah(subtotal)}</td></tr>`
    for (const it of items) {
      html += `<tr><td></td><td>${esc(it.uraian)}</td><td style="text-align:right;font-family:monospace;">${formatRupiah(it.jumlah)}</td></tr>`
    }
    html += `<tr style="background:rgba(124,92,252,.14);font-weight:700;color:#DCD0FF;"><td>${esc(pj)} Total</td><td></td><td style="text-align:right;font-family:monospace;">${formatRupiah(subtotal)}</td></tr>`
  }
  html += `<tr style="background:rgba(239,159,39,.22);font-weight:800;color:#FFE6BF;"><td>TOTAL BELANJA BLUD</td><td></td><td style="text-align:right;font-family:monospace;">${formatRupiah(grandTotal)}</td></tr>`
  html += `</tbody></table>`

  // Panel audit hybrid (rule-based, no AI)
  html += renderAuditPanel(audit, labelSumber)

  return { html, rows: exportRows, meta: { title, columns } }
}

// ──────────────────────────────────────────────────────────────────────────
// Render audit panel — ringkasan hasil auditRekapPJ
// ──────────────────────────────────────────────────────────────────────────
function renderAuditPanel(a: AuditResult, labelSumber: string): string {
  const statusCfg = {
    ok:     { bg: 'rgba(16,185,129,.15)',  border: '#10B981', ikon: '✅', label: 'SESUAI' },
    lebih:  { bg: 'rgba(239,68,68,.15)',   border: '#EF4444', ikon: '🔴', label: 'SELISIH LEBIH' },
    kurang: { bg: 'rgba(245,158,11,.15)',  border: '#F59E0B', ikon: '🟡', label: 'SELISIH KURANG' },
  } as const
  const s = statusCfg[a.statusSaldo]

  let h = `<div style="margin-top:18px;border:1.5px solid ${s.border};border-radius:10px;overflow:hidden;">`
  h += `<div style="background:${s.bg};padding:12px 16px;border-bottom:1.5px solid ${s.border};display:flex;justify-content:space-between;align-items:center;font-size:13px;">`
  h += `<strong>${s.ikon} Audit Rekap Penanggung Jawab — ${s.label}</strong>`
  h += `<span style="font-size:11px;opacity:.9;font-weight:600;">Hybrid rule-based (no AI)</span>`
  h += `</div>`

  // Kartu ringkasan. Divider pakai gray-neutral semi-transparent yang adaptif kedua tema.
  h += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1px;background:rgba(127,127,127,.30);">`
  h += kartu(`Total ${labelSumber} BLUD`, formatRupiah(a.totalDPA), '#7DD3FC')
  h += kartu('Total Rekap PJ', formatRupiah(a.grandTotal), '#C4B5FD')
  h += kartu(a.statusSaldo === 'ok' ? 'Selisih' : a.statusSaldo === 'lebih' ? 'Kelebihan' : 'Kekurangan',
             a.statusSaldo === 'ok' ? '0' : formatRupiah(Math.abs(a.selisih)),
             a.statusSaldo === 'ok' ? '#6EE7B7' : a.statusSaldo === 'lebih' ? '#FCA5A5' : '#FCD34D')
  h += kartu('Double Entry', `${a.doubleEntries.length} baris`,
             a.doubleEntries.length > 0 ? '#FCA5A5' : '#6EE7B7')
  h += kartu('Belum Entry', `${a.belumEntry.length} baris`,
             a.belumEntry.length > 0 ? '#FCD34D' : '#6EE7B7')
  h += kartu('Jumlah PJ Unik', `${a.totalPJ}`, '#FAC775')
  h += `</div>`

  // Detail issue (max 5 each, sisanya "+N more")
  if (a.doubleEntries.length > 0) {
    h += `<div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,.06);">`
    h += `<div style="font-weight:700;font-size:12px;margin-bottom:6px;color:#FCA5A5;">⚠️ Double Entry (${a.doubleEntries.length})</div>`
    const shown = a.doubleEntries.slice(0, 5)
    for (const d of shown) {
      h += `<div style="font-size:11.5px;margin:4px 0;padding:6px 10px;background:rgba(239,68,68,.15);border-left:3px solid #EF4444;border-radius:4px;">`
      h += `<strong>${esc(d.kode)} ${esc(d.uraian)}</strong> (${esc(d.pj)}) — ${formatRupiah(d.jumlah)}<br/>`
      h += `<span style="opacity:.9;">↳ konflik dengan ancestor: <strong>${esc(d.konflik.uraian)}</strong> (${esc(d.konflik.pj)})</span>`
      h += `</div>`
    }
    if (a.doubleEntries.length > 5) h += `<div style="font-size:11px;opacity:.6;font-style:italic;">+${a.doubleEntries.length - 5} lainnya...</div>`
    h += `</div>`
  }

  if (a.belumEntry.length > 0) {
    h += `<div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,.06);">`
    h += `<div style="font-weight:700;font-size:12px;margin-bottom:6px;color:#FCD34D;">🟡 Belum Entry PJ (${a.belumEntry.length})</div>`
    const shown = a.belumEntry.slice(0, 5)
    for (const b of shown) {
      h += `<div style="font-size:11.5px;margin:4px 0;padding:6px 10px;background:rgba(245,158,11,.15);border-left:3px solid #F59E0B;border-radius:4px;">`
      h += `<strong>${esc(b.kode)} ${esc(b.uraian)}</strong> — ${formatRupiah(b.jumlah)}`
      if (b.pjDiDPA) h += ` <span style="opacity:.9;">(DPA: ${esc(b.pjDiDPA)})</span>`
      h += `</div>`
    }
    if (a.belumEntry.length > 5) h += `<div style="font-size:11px;opacity:.6;font-style:italic;">+${a.belumEntry.length - 5} lainnya...</div>`
    h += `</div>`
  }

  if (a.doubleEntries.length === 0 && a.belumEntry.length === 0 && a.statusSaldo === 'ok') {
    h += `<div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,.06);color:#6EE7B7;font-weight:600;font-size:12.5px;">`
    h += `✅ Rekap sudah sesuai dengan ${esc(labelSumber)} BLUD. Tidak ada tindakan yang diperlukan.</div>`
  }

  h += `</div>`
  return h
}

function kartu(label: string, value: string, color: string): string {
  // bg pakai white-lift low-alpha → adaptif kedua tema (di light kelihatan ada cell,
  // di dark tetap kebaca tanpa over-darken). Label opacity dinaikkan dari .65 → .85.
  return `<div style="padding:10px 14px;background:rgba(255,255,255,.05);">`
       + `<div style="font-size:10px;font-weight:700;opacity:.85;text-transform:uppercase;letter-spacing:.6px;">${esc(label)}</div>`
       + `<div style="font-size:14px;font-weight:800;color:${color};margin-top:3px;font-family:monospace;">${esc(value)}</div>`
       + `</div>`
}

// ──────────────────────────────────────────────────────────────────────────
// View: Rekap Pergeseran — tabel hierarchical, kolom pergeseran-specific
// ──────────────────────────────────────────────────────────────────────────
function renderPergeseranView(
  rows: PergeseranBaris[],
  versi: string | null,
  /** B6: status DRAFT diturunkan dari delta akar — dihitung pemanggil dari daftar PENUH. */
  deltaRoot: number,
  /** Non-null = daftar sudah disaring "hanya yang bergeser". */
  sebagian: CakupanCetak | null,
): RenderResult {
  const columns = ['Kode Rekening', 'Uraian', 'Vol', 'Satuan', 'Harga', 'Jumlah', 'Vol P', 'Harga P', 'Pergeseran', 'Bertambah/Berkurang', 'Penanggung Jawab', 'Keterangan']
  const title = `Rekap Pergeseran${sebagian ? ' — Yang Bergeser' : ''}${versi ? `: ${versi}` : ' (Terakhir)'}${deltaRoot !== 0 ? ' (DRAFT)' : ''}`

  if (sebagian && rows.length === 0) {
    // Tabel kosong tanpa keterangan terbaca seperti kegagalan memuat data.
    const html = `<h4 style="margin:0 0 12px;color:inherit;font-weight:800;">${esc(title)}</h4>`
      + spandukDraft(deltaRoot)
      + `<div style="padding:20px;color:#85B7EB;font-style:italic;">`
      + `Belum ada baris yang bergeser pada versi ini — seluruh ${sebagian.total} barisnya masih sama dengan DPA.</div>`
    return { html, rows: [], meta: { title, columns } }
  }

  const sorted = [...rows].sort((a, b) => a.urutan - b.urutan)

  const exportRows: ExportRow[] = sorted.map(r => [
    r.kode_rekening, r.uraian,
    r.vol ?? '', r.satuan ?? '', r.harga ?? '', r.jumlah,
    r.vol_p ?? '', r.harga_p ?? '', r.pergeseran ?? 0, r.bertambah_berkurang ?? 0,
    r.penanggung_jawab ?? '', r.keterangan ?? '',
  ])

  let html = `<h4 style="margin:0 0 12px;color:inherit;font-weight:800;">${esc(title)}</h4>`
  html += spandukDraft(deltaRoot)
  if (sebagian) html += spandukSebagian(sebagian)
  html += `<table><thead><tr>`
  for (const c of columns) html += `<th>${esc(c)}</th>`
  html += `</tr></thead><tbody>`
  for (const r of sorted) {
    const isHead = ['GRANDMASTER', 'MASTER', 'LEADER', 'PLETON-LEADER', 'KETUA-KELOMPOK-A', 'KETUA-KELOMPOK-B', 'L7-HEAD', 'L8-HEAD'].includes(r.tipe_baris)
    const rowStyle = isHead ? ' style="font-weight:700;"' : ''
    const bb = r.bertambah_berkurang ?? 0
    const bbColor = bb > 0 ? '#6EE7B7' : bb < 0 ? '#FCA5A5' : ''
    html += `<tr${rowStyle}>`
    html += `<td>${esc(r.kode_rekening)}</td>`
    html += `<td>${esc(r.uraian)}</td>`
    html += `<td style="text-align:right;font-family:monospace;">${r.vol ?? ''}</td>`
    html += `<td>${esc(r.satuan ?? '')}</td>`
    html += `<td style="text-align:right;font-family:monospace;">${fmt(r.harga)}</td>`
    html += `<td style="text-align:right;font-family:monospace;">${fmt(r.jumlah)}</td>`
    html += `<td style="text-align:right;font-family:monospace;">${r.vol_p ?? ''}</td>`
    html += `<td style="text-align:right;font-family:monospace;">${fmt(r.harga_p)}</td>`
    html += `<td style="text-align:right;font-family:monospace;">${fmt(r.pergeseran)}</td>`
    html += `<td style="text-align:right;font-family:monospace;font-weight:600;color:${bbColor};">${bb !== 0 ? formatRupiah(bb) : ''}</td>`
    html += `<td>${esc(r.penanggung_jawab ?? '')}</td>`
    html += `<td>${esc(r.keterangan ?? '')}</td>`
    html += `</tr>`
  }
  html += `</tbody></table>`

  return { html, rows: exportRows, meta: { title, columns } }
}

// ──────────────────────────────────────────────────────────────────────────
// View: Master Akun — flat table
// ──────────────────────────────────────────────────────────────────────────
function renderMasterAkunView(rows: MasterAkun[]): RenderResult {
  const columns = ['Kode', 'Uraian']
  const title = 'Rekap Master Akun'

  const exportRows: ExportRow[] = rows.map(r => [r.kode, r.uraian])

  let html = `<h4 style="margin:0 0 12px;color:inherit;font-weight:800;">${esc(title)}</h4>`
  html += `<div style="margin-bottom:8px;font-size:11px;color:#85B7EB;">Total: <strong>${rows.length}</strong> akun</div>`
  html += `<table><thead><tr>`
  for (const c of columns) html += `<th>${esc(c)}</th>`
  html += `</tr></thead><tbody>`
  for (const r of rows) {
    html += `<tr><td style="font-family:monospace;font-weight:600;">${esc(r.kode)}</td><td>${esc(r.uraian)}</td></tr>`
  }
  html += `</tbody></table>`

  return { html, rows: exportRows, meta: { title, columns } }
}

// lib/blud/export/pdf-dokumen.ts — PDF DPA, Pergeseran, dan Rekap PJ sebagai DOKUMEN.
// Konsep: docs/konsep/blud/CONCEPT-blud-format-unduhan.md §3, §5a, §7 butir 3.
//
// Beda dgn `pdf.ts` (generik): menerima baris MENTAH (pohon), bukan `ExportRow` yang
// sudah rata, jadi hierarki (tebal, jorok, latar tingkat), baris JUMLAH = akar, dan
// tanda tangan Direktur bisa digambar. Gaya dari `gaya-dokumen.ts` — sama dgn Excel.
//
// PERF-C3: jsPDF diimpor dinamis di `buatPdf`. `buat*` memulangkan dokumennya supaya
// bisa diuji di Node; `export*` mengunduhnya.
import {
  kopPdf, kakiPdf, catatanPdf, tandaTanganPdf, opsiTabelPdf, gayaKepalaPdf, gayaTingkatPdf,
  gayaTotalPdf, rupiahPdf, namaBerkasPdf, tingkatBaris, rgb, type DokPdf, type SelAutoTable, type PejabatTtd,
} from '@/lib/blud/export/gaya-dokumen'
import { siapkanPohon, kopPerubahan, kopPergeseran, kalimatImbang, type Pohon, type BarisPohon } from '@/lib/blud/export/dpa-dokumen'
import { bahanRekapPj, KOLOM_REKAP_PJ, type UnduhRekapPjArgs } from '@/lib/blud/export/rekap-pj-dokumen'
import { uraiGeser, URAIAN_NOL } from '@/lib/blud/urai-geser'
import type { MutasiInput } from '@/lib/blud/mutasi'
import { formatTanggalId, tanggalHariIniWIB } from '@/lib/blud/tanggal'
import type { DpaBaris, PergeseranBaris } from '@/types'

type AutoTable = (doc: unknown, opsi: Record<string, unknown>) => void
interface DokPdfPenuh extends DokPdf { output(jenis: 'arraybuffer'): ArrayBuffer; save(nama: string): void }

async function buatPdf(mendatar: boolean): Promise<{ doc: DokPdfPenuh; autoTable: AutoTable }> {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: mendatar ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' }) as unknown as DokPdfPenuh
  return { doc, autoTable: (at.default ?? at) as unknown as AutoTable }
}

const tag = (versi: string | null) => versi ?? tanggalHariIniWIB()
const vol = (v: number | null | undefined) => (v == null ? '' : String(Number(v)).replace('.', ','))

/** Urutan + tingkat tiap baris (dari pohon), sejajar dgn badan tabel. */
function metaPohon<T extends BarisPohon>(pohon: Pohon<T>) {
  return pohon.urut.map(r => {
    const kedalaman = pohon.kedalaman.get(r.row_id) ?? 0
    const punyaAnak = (pohon.anak.get(r.row_id)?.length ?? 0) > 0
    return { r, kedalaman, punyaAnak, tingkat: tingkatBaris(kedalaman, punyaAnak) }
  })
}

const totalAkar = <T extends BarisPohon>(meta: Array<{ r: T; kedalaman: number }>, f: (r: T) => number) =>
  meta.filter(m => m.kedalaman === 0).reduce((s, m) => s + (Number(f(m.r)) || 0), 0)

// ─── DPA ─────────────────────────────────────────────────────────────────────

export interface UnduhPdfDokumenArgs<T> {
  tahun: number
  versi: string | null
  rows: T[]
  direktur?: PejabatTtd | null
  perubahanKe?: number | null
  acuanPerubahanKe?: number | null
  mutasi?: readonly MutasiInput[] | null
}

export async function buatPdfDpa(args: UnduhPdfDokumenArgs<DpaBaris>): Promise<DokPdfPenuh> {
  const { tahun, versi, rows, direktur = null, perubahanKe = null } = args
  if (!rows.length) throw new Error('Data kosong — tidak ada yang bisa diunduh')
  const { doc, autoTable } = await buatPdf(true)
  const y = kopPdf(doc, 'RINCIAN BELANJA ANGGARAN', tahun,
    perubahanKe ? kopPerubahan(perubahanKe, versi) : versi ? `DPA BLUD versi ${formatTanggalId(versi)}` : undefined)
  const meta = metaPohon(siapkanPohon(rows))
  const total = totalAkar(meta, r => r.jumlah)
  const kolom = ['Kode Rekening', 'Uraian', 'Vol', 'Satuan', 'Harga', 'Jumlah', 'Penanggung Jawab', 'Keterangan']
  autoTable(doc, {
    ...opsiTabelPdf(kolom),
    startY: y, margin: { left: 10, right: 10, bottom: 14 },
    body: [
      ...meta.map(({ r, kedalaman, punyaAnak }) => [
        r.kode_rekening ?? '', kedalaman === 0 ? (r.uraian ?? '').toUpperCase() : r.uraian ?? '',
        punyaAnak ? '' : vol(r.vol), punyaAnak ? '' : r.satuan ?? '', punyaAnak ? '' : rupiahPdf(r.harga),
        rupiahPdf(r.jumlah), r.penanggung_jawab ?? '', r.keterangan ?? '',
      ]),
      ['', 'JUMLAH BELANJA', '', '', '', rupiahPdf(total), '', ''],
    ],
    columnStyles: {
      0: { cellWidth: 36, font: 'courier', fontSize: 6.8 }, 2: { cellWidth: 11, halign: 'right' }, 3: { cellWidth: 15 },
      4: { cellWidth: 25, halign: 'right', font: 'courier' }, 5: { cellWidth: 27, halign: 'right', font: 'courier' },
      6: { cellWidth: 34 }, 7: { cellWidth: 30 },
    },
    didParseCell: (d: SelAutoTable) => {
      if (gayaKepalaPdf(d)) return
      const m = meta[d.row.index]
      if (!m) { gayaTotalPdf(d); return }
      gayaTingkatPdf(d, m.tingkat, m.kedalaman)
    },
  })
  tandaTanganPdf(doc, doc.internal.pageSize.getWidth() - 60, (doc.lastAutoTable?.finalY ?? y) + 10, direktur)
  kakiPdf(doc)
  return doc
}

export async function exportDpaPdf(args: UnduhPdfDokumenArgs<DpaBaris>): Promise<void> {
  const doc = await buatPdfDpa(args)
  doc.save(namaBerkasPdf(args.perubahanKe ? `DPA_BLUD_PERUBAHAN${args.perubahanKe}` : 'DPA_BLUD', args.tahun, tag(args.versi)))
}

// ─── Pergeseran ──────────────────────────────────────────────────────────────

export async function buatPdfPergeseran(args: UnduhPdfDokumenArgs<PergeseranBaris>): Promise<DokPdfPenuh> {
  const { tahun, versi, rows, direktur = null, mutasi = null, acuanPerubahanKe = null } = args
  if (!rows.length) throw new Error('Data kosong — tidak ada yang bisa diunduh')
  const { doc, autoTable } = await buatPdf(true)
  const y = kopPdf(doc, 'PERGESERAN RINCIAN BELANJA ANGGARAN', tahun,
    kopPergeseran(versi, rows[0]?.dpa_versi_tanggal ?? null, acuanPerubahanKe))
  const meta = metaPohon(siapkanPohon(rows))
  // Bertambah/Berkurang dari `uraiGeser` + catatan perpindahan — sama dgn Excel & layar.
  const urai = uraiGeser(rows, mutasi)
  const u = (r: PergeseranBaris) => urai.get(r.row_id) ?? URAIAN_NOL
  const tambah = totalAkar(meta, r => u(r).bertambah)
  const kurang = totalAkar(meta, r => u(r).berkurang)
  const kolom = ['Kode Rekening', 'Uraian', 'Jumlah', 'Vol P', 'Satuan', 'Harga P', 'Pergeseran', 'Bertambah', 'Berkurang', 'Penanggung Jawab']
  const bergeser = (r: PergeseranBaris) => !!(u(r).bertambah || u(r).berkurang)
  autoTable(doc, {
    ...opsiTabelPdf(kolom),
    startY: y, margin: { left: 10, right: 10, bottom: 14 },
    body: [
      ...meta.map(({ r, kedalaman, punyaAnak }) => [
        r.kode_rekening ?? '', kedalaman === 0 ? (r.uraian ?? '').toUpperCase() : r.uraian ?? '',
        rupiahPdf(r.jumlah), punyaAnak ? '' : vol(r.vol_p), punyaAnak ? '' : r.satuan ?? '',
        punyaAnak ? '' : rupiahPdf(r.harga_p), rupiahPdf(r.pergeseran),
        u(r).bertambah ? rupiahPdf(u(r).bertambah) : '', u(r).berkurang ? `(${rupiahPdf(u(r).berkurang)})` : '',
        r.penanggung_jawab ?? '',
      ]),
      ['', 'JUMLAH', rupiahPdf(totalAkar(meta, r => r.jumlah)), '', '', '', rupiahPdf(totalAkar(meta, r => r.pergeseran)),
        rupiahPdf(tambah), kurang ? `(${rupiahPdf(kurang)})` : '', ''],
    ],
    columnStyles: {
      0: { cellWidth: 33, font: 'courier', fontSize: 6.8 }, 2: { cellWidth: 26, halign: 'right', font: 'courier' },
      3: { cellWidth: 10, halign: 'right' }, 4: { cellWidth: 13 }, 5: { cellWidth: 25, halign: 'right', font: 'courier' },
      6: { cellWidth: 26, halign: 'right', font: 'courier' }, 7: { cellWidth: 22, halign: 'right', font: 'courier' },
      8: { cellWidth: 22, halign: 'right', font: 'courier' }, 9: { cellWidth: 27 },
    },
    didParseCell: (d: SelAutoTable) => {
      if (gayaKepalaPdf(d)) return
      const m = meta[d.row.index]
      if (!m) { gayaTotalPdf(d); return }
      gayaTingkatPdf(d, m.tingkat, m.kedalaman)
      const akar = m.tingkat === 'akar'
      if (d.column.index === 7) d.cell.styles.textColor = rgb(akar ? 'naikTerang' : 'naik')
      if (d.column.index === 8) d.cell.styles.textColor = rgb(akar ? 'turunTerang' : 'turun')
      if (!m.punyaAnak && bergeser(m.r) && d.column.index >= 7 && d.column.index <= 8) d.cell.styles.fontStyle = 'bold'
    },
    // Rincian yang bergeser: tanda tepi kiri amber (Excel: garis tebal amber).
    didDrawCell: (d: SelAutoTable) => {
      if (d.section !== 'body' || d.column.index !== 0) return
      const m = meta[d.row.index]
      if (!m || m.punyaAnak || !bergeser(m.r)) return
      doc.setFillColor(...rgb('amber'))
      doc.rect(d.cell.x, d.cell.y, 1.2, d.cell.height, 'F')
    },
  })
  const L = doc.internal.pageSize.getWidth()
  const yCatatan = catatanPdf(doc, kalimatImbang(tambah, kurang), 10, (doc.lastAutoTable?.finalY ?? y) + 4, L - 20)
  tandaTanganPdf(doc, L - 60, yCatatan + 6, direktur)
  kakiPdf(doc)
  return doc
}

export async function exportPergeseranPdf(args: UnduhPdfDokumenArgs<PergeseranBaris>): Promise<void> {
  const doc = await buatPdfPergeseran(args)
  doc.save(namaBerkasPdf('PERGESERAN_DPA', args.tahun, tag(args.versi)))
}

// ─── Rekap Penanggung Jawab ──────────────────────────────────────────────────

export async function buatPdfRekapPj(args: UnduhRekapPjArgs): Promise<DokPdfPenuh> {
  if (!args.rows.length) throw new Error('Data kosong — tidak ada yang bisa diunduh')
  const { susunan, judul, baris5 } = bahanRekapPj(args)
  if (!susunan.baris.length) throw new Error('Belum ada baris ber-Penanggung Jawab di versi ini.')
  const { doc, autoTable } = await buatPdf(false)
  const y = kopPdf(doc, judul, args.tahun, baris5)
  const persen = (p: number) => `${(p * 100).toFixed(1).replace('.', ',')}%`
  const body = susunan.baris.map(b =>
    b.jenis === 'kelompok' ? [b.huruf, b.pj, rupiahPdf(b.subtotal), persen(b.porsi), '']
      : b.jenis === 'rincian' ? [`${b.nomor}.`, b.uraian, rupiahPdf(b.jumlah), '', b.dobelDengan ? `* juga dihitung di ${b.dobelDengan}` : '']
        : ['', `Jumlah ${b.huruf}`, rupiahPdf(b.subtotal), '', ''])
  body.push(['', 'JUMLAH SELURUHNYA', rupiahPdf(susunan.total), '100%', ''])
  autoTable(doc, {
    ...opsiTabelPdf(KOLOM_REKAP_PJ),
    startY: y, margin: { left: 12, right: 12, bottom: 14 }, body,
    columnStyles: {
      0: { cellWidth: 10, halign: 'right' }, 2: { cellWidth: 34, halign: 'right', font: 'courier' },
      3: { cellWidth: 14, halign: 'right' }, 4: { cellWidth: 36, fontSize: 6.8 },
    },
    didParseCell: (d: SelAutoTable) => {
      if (gayaKepalaPdf(d)) return
      const b = susunan.baris[d.row.index]
      if (!b) { gayaTotalPdf(d); return }
      if (b.jenis === 'rincian') {
        if (d.column.index === 1) d.cell.styles.cellPadding = { left: 5, right: 1.4, top: 1.3, bottom: 1.3 }
        if (b.dobelDengan && (d.column.index === 2 || d.column.index === 4)) {
          d.cell.styles.fontStyle = 'italic'
          d.cell.styles.textColor = rgb('redup')
        }
        return
      }
      d.cell.styles.fontStyle = 'bold'
      d.cell.styles.textColor = rgb('navy')
      if (b.jenis === 'kelompok') {
        d.cell.styles.fillColor = rgb('krem')
        if (d.column.index === 0) d.cell.styles.halign = 'center'
      } else {
        d.cell.styles.fillColor = rgb('kremPucat')
        if (d.column.index === 1) d.cell.styles.halign = 'right'
      }
    },
    didDrawCell: (d: SelAutoTable) => {
      if (d.section !== 'body' || d.column.index !== 0 || susunan.baris[d.row.index]?.jenis !== 'kelompok') return
      doc.setFillColor(...rgb('amber'))
      doc.rect(d.cell.x, d.cell.y, 1.2, d.cell.height, 'F')
    },
  })
  const L = doc.internal.pageSize.getWidth()
  let yc = (doc.lastAutoTable?.finalY ?? y) + 5
  for (const c of susunan.catatan) yc = catatanPdf(doc, c, 12, yc, L - 24) + 1
  tandaTanganPdf(doc, L - 55, yc + 6, args.direktur ?? null)
  kakiPdf(doc)
  return doc
}

export async function exportRekapPjPdf(args: UnduhRekapPjArgs): Promise<void> {
  const doc = await buatPdfRekapPj(args)
  doc.save(namaBerkasPdf(args.sumber === 'pergeseran' ? 'REKAP_PJ_PERGESERAN' : 'REKAP_PJ', args.tahun, tag(args.versi)))
}

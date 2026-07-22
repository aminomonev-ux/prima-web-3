// lib/iki/layout.ts
// Layout descriptor bersama export PDF & Excel modul IKI (docs/CONCEPT-iki.md §5).
// Satu sumber grid (header 3 baris + body ber-rowspan) supaya kedua format
// selalu identik dengan 5 PDF referensi:
//   STANDAR  — 11 kolom bernomor (12 kolom fisik; kolom 9 = romawi+nilai)
//   DIREKTUR — 8 kolom bernomor (10 kolom fisik; kolom 3 & 6 span 2 fisik)
// Pure module tanpa import server — aman dipakai client component.

export type IkiVarian = 'STANDAR' | 'DIREKTUR';
export type IkiJenisDokumen = 'MURNI' | 'PERUBAHAN';

/** Judul dokumen — sumber tunggal PDF/Excel/editor. PERUBAHAN → suffix " PERUBAHAN". */
export function docTitle(jenis: IkiJenisDokumen | null | undefined): string {
  return jenis === 'PERUBAHAN' ? 'INDIKATOR KINERJA INDIVIDU PERUBAHAN' : 'INDIKATOR KINERJA INDIVIDU';
}

export type IkiGridDokumen = {
  varian: IkiVarian;
  jenis: IkiJenisDokumen;
  opd: string;
  nama: string;
  nip: string;
  jabatan: string;
  pangkat: string | null;
  ikhtisar: string | null;
  nama_atasan: string | null;
  nip_atasan: string | null;
  jabatan_atasan: string | null;
  pangkat_atasan: string | null;
  kota_ttd: string;
  tanggal_ttd: string | null; // YYYY-MM-DD
  rhk: {
    no_urut: number;
    rhk_intervensi: string | null;
    rhk: string;
    aspek_a: string;
    aspek_b: string;
    aspek_c: string;
    indikator: string;
    target_tahunan: string;
    formulasi: string | null;
    ekspektasi: string | null;
    triwulan: { triwulan: number; target_tw: string; uraian: string | null; target_aksi: string }[];
  }[];
};

export type IkiHeadCell = { text: string; colSpan?: number; rowSpan?: number };
export type IkiBodyCell = { text: string; rowSpan?: number; align?: 'center' | 'left'; valign?: 'top' | 'middle' };
/** null = tertutup rowspan sel di atasnya (skip saat render Excel, tidak di-emit di autotable) */
export type IkiBodyRow = (IkiBodyCell | null)[];

export type IkiGrid = {
  varian: IkiVarian;
  colCount: number;
  head: IkiHeadCell[][];      // 3 baris: label + sub (Uraian|Target) + penomoran
  body: IkiBodyRow[];
  /** Lebar kolom PDF (mm, landscape A4 usable ~281mm) */
  pdfWidths: number[];
  /** Lebar kolom Excel (wch) */
  xlsxWidths: number[];
};

const ROMAWI = ['I', 'II', 'III', 'IV'];

function aspekText(r: IkiGridDokumen['rhk'][number]): string {
  return `a. ${r.aspek_a}\nb. ${r.aspek_b}\nc. ${r.aspek_c}`;
}

function formulasiText(r: IkiGridDokumen['rhk'][number], varian: IkiVarian): string {
  const f = (r.formulasi ?? '').trim();
  if (varian === 'DIREKTUR') return f ? `Formulasi :\n${f}` : '';
  const e = (r.ekspektasi ?? '').trim();
  const parts: string[] = [];
  if (f) parts.push(`Formulasi : ${f}`);
  if (e) parts.push(`Ekspektasi Pimpinan :\n${e}`);
  return parts.join('\n');
}

export function buildIkiGrid(doc: IkiGridDokumen): IkiGrid {
  const isDir = doc.varian === 'DIREKTUR';

  // ── Header 3 baris ──
  const head: IkiHeadCell[][] = isDir
    ? [
        [
          { text: 'No.', rowSpan: 2 },
          { text: 'Rencana Hasil Kerja', rowSpan: 2 },
          { text: 'Indikator Kinerja Individu', colSpan: 2, rowSpan: 2 },
          { text: 'Target\nTahunan', rowSpan: 2 },
          { text: 'Formulasi', rowSpan: 2 },
          { text: 'Target Triwulan', colSpan: 2, rowSpan: 2 },
          { text: 'Rencana Aksi Triwulan', colSpan: 2 },
        ],
        [
          { text: 'Uraian' },
          { text: 'Target' },
        ],
        [
          { text: '1' }, { text: '2' }, { text: '3', colSpan: 2 }, { text: '4' },
          { text: '5' }, { text: '6', colSpan: 2 }, { text: '7' }, { text: '8' },
        ],
      ]
    : [
        [
          { text: 'No.', rowSpan: 2 },
          { text: 'Rencana Hasil Kerja\nyang diintervensi', rowSpan: 2 },
          { text: 'Rencana Hasil Kerja', rowSpan: 2 },
          { text: 'Indikator Kinerja Individu', colSpan: 2, rowSpan: 2 },
          { text: 'Target\nTahunan', rowSpan: 2 },
          { text: 'Formulasi & Ekspetasi\nPimpinan', rowSpan: 2 },
          { text: 'Target Triwulan', colSpan: 3, rowSpan: 2 },
          { text: 'Rencana Aksi Triwulan', colSpan: 2 },
        ],
        [
          { text: 'Uraian' },
          { text: 'Target' },
        ],
        [
          { text: '1' }, { text: '2' }, { text: '3' }, { text: '4' }, { text: '5' },
          { text: '6' }, { text: '7' }, { text: '8' }, { text: '9', colSpan: 2 },
          { text: '10' }, { text: '11' },
        ],
      ];

  // ── Body ──
  // Grup by no_urut → kolom No + RHK-diintervensi span seluruh baris grup.
  // Per RHK: kolom RHK/aspek/indikator/target/formulasi(/cara-hitung) span 4 baris TW.
  const groups = new Map<number, IkiGridDokumen['rhk']>();
  for (const r of doc.rhk) {
    const list = groups.get(r.no_urut) ?? [];
    list.push(r);
    groups.set(r.no_urut, list);
  }

  const body: IkiBodyRow[] = [];
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  for (const [noUrut, rhkList] of sortedGroups) {
    const groupRows = rhkList.length * 4;
    // Auto-merge kolom RHK se-grup kalau seluruh teksnya identik (pola dokumen
    // manual Direktur: 1 nomor + 1 RHK + banyak indikator). Teks beda = merge per-RHK.
    const rhkNorm = rhkList.map(r => r.rhk.replace(/\s+/g, ' ').trim());
    const mergeRhk = rhkList.length > 1 && rhkNorm[0] !== '' && rhkNorm.every(t => t === rhkNorm[0]);
    rhkList.forEach((r, ri) => {
      const tws = [...r.triwulan].sort((a, b) => a.triwulan - b.triwulan);
      for (let ti = 0; ti < 4; ti++) {
        const tw = tws[ti] ?? { triwulan: ti + 1, target_tw: '0', uraian: null, target_aksi: '0' };
        const row: IkiBodyRow = [];

        // Kolom grup (No + RHKI) hanya di baris pertama grup
        if (ri === 0 && ti === 0) {
          row.push({ text: String(noUrut), rowSpan: groupRows, align: 'center', valign: 'top' });
          if (!isDir) row.push({ text: rhkList[0].rhk_intervensi ?? '', rowSpan: groupRows, valign: 'top' });
        } else {
          row.push(null);
          if (!isDir) row.push(null);
        }

        // Kolom per-RHK hanya di baris TW pertama RHK itu
        if (ti === 0) {
          if (mergeRhk) {
            if (ri === 0) row.push({ text: r.rhk, rowSpan: groupRows, valign: 'top' });
            else row.push(null);
          } else {
            row.push({ text: r.rhk, rowSpan: 4, valign: 'top' });
          }
          row.push({ text: aspekText(r), rowSpan: 4, valign: 'top' });
          row.push({ text: r.indikator, rowSpan: 4, valign: 'top' });
          row.push({ text: r.target_tahunan, rowSpan: 4, align: 'center', valign: 'top' });
          row.push({ text: formulasiText(r, doc.varian), rowSpan: 4, valign: 'top' });
          if (!isDir) row.push({ text: r.aspek_b, rowSpan: 4, align: 'center', valign: 'top' });
        } else {
          row.push(null, null, null, null, null);
          if (!isDir) row.push(null);
        }

        // Kolom per-TW
        row.push({ text: ROMAWI[ti], align: 'center', valign: 'top' });
        row.push({ text: tw.target_tw, align: 'center', valign: 'top' });
        row.push({ text: tw.uraian ?? '', valign: 'top' });
        row.push({ text: tw.target_aksi, align: 'center', valign: 'top' });

        body.push(row);
      }
    });
  }

  return {
    varian: doc.varian,
    colCount: isDir ? 10 : 12,
    head,
    body,
    pdfWidths: isDir
      ? [10, 40, 26, 40, 18, 48, 10, 16, 55, 18]
      : [8, 30, 30, 22, 30, 16, 38, 16, 9, 14, 52, 16],
    xlsxWidths: isDir
      ? [5, 30, 18, 30, 11, 34, 6, 10, 42, 12]
      : [4.5, 22, 22, 15, 22, 10, 28, 11, 5, 9, 40, 11],
  };
}

/** Format tanggal Indonesia: 2026-01-15 → "15 Januari 2026". */
export function tanggalIndo(iso: string | null): string {
  if (!iso) return '';
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${BULAN[m - 1]} ${y}`;
}

export type TtdBlock = { lines: string[]; nama: string; pangkat: string; nip: string };

/** Buang golongan "(IV/b)" dst — TTD & form cukup nama pangkat (keputusan 2026-07-20). */
export function stripGolongan(pangkat: string | null | undefined): string {
  return (pangkat ?? '').replace(/\s*\(\s*[IVX]+\s*\/\s*[a-e]\s*\)/gi, '').replace(/\s+/g, ' ').trim();
}

/** Blok tanda tangan per varian (docs/CONCEPT-iki.md §2.4). */
export function buildTtd(doc: IkiGridDokumen): { kiri: TtdBlock | null; kanan: TtdBlock } {
  const tgl = tanggalIndo(doc.tanggal_ttd);
  if (doc.varian === 'DIREKTUR') {
    return {
      kiri: null,
      kanan: {
        lines: [`Mengetahui, ${tgl}`.trim().replace(/,\s*$/, ','), doc.jabatan, doc.opd],
        nama: doc.nama,
        pangkat: stripGolongan(doc.pangkat),
        nip: `NIP. ${doc.nip}`,
      },
    };
  }
  return {
    kiri: {
      lines: ['Mengetahui', doc.jabatan_atasan ?? ''],
      nama: doc.nama_atasan ?? '',
      pangkat: stripGolongan(doc.pangkat_atasan),
      nip: doc.nip_atasan ? `NIP. ${doc.nip_atasan}` : '',
    },
    kanan: {
      lines: [`${doc.kota_ttd}, ${tgl}`.replace(/,\s*$/, ','), doc.jabatan],
      nama: doc.nama,
      pangkat: stripGolongan(doc.pangkat),
      nip: `NIP. ${doc.nip}`,
    },
  };
}

export function ikiFilename(doc: IkiGridDokumen, tahun: string, ext: 'pdf' | 'xlsx'): string {
  const slug = doc.jabatan.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
  return `IKI_${slug}_${tahun}.${ext}`;
}

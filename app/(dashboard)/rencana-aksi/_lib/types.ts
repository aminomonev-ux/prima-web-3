export type RaLevel = 'tujuan' | 'sasaran' | 'program' | 'kegiatan' | 'sub-kegiatan';
export type RaJenis = 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan';

export interface RaRow {
  id: number;
  tahun: number;
  level: RaLevel;
  sasaran: string | null;
  tujuan: string | null;
  outcome_program: string | null;
  outcome_kegiatan: string | null;
  outcome_sub_kegiatan: string | null;
  program: string;
  kegiatan: string | null;
  sub_kegiatan: string | null;
  indikator: string;
  jenis: RaJenis;
  satuan: string;
  target_rpjmd: number;
  target_tahunan: number;
  q1_target: number;  q1_realisasi: number;
  q2_target: number;  q2_realisasi: number;
  q3_target: number;  q3_realisasi: number;
  q4_target: number;  q4_realisasi: number;
  anggaran_nominal: number | null;
  bulan_target: number[] | null;
  bulan_realisasi: number[] | null;
  version: number;
}

export const BULAN_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'] as const;

/**
 * Derive q1-q4 dari 12 target bulanan per `jenis` (Opsi A). Preview client-side;
 * server (lib/data/rencana-aksi.ts) yang otoritatif. Wajib sync dengan server.
 *   Akumulatif            → TWn = SUM 3 bulan triwulan itu
 *   Progres Pos/Neg/Ulang → TWn = bulan TERAKHIR terisi (>0) dalam triwulan itu
 */
export function deriveQuartersFromMonthly(months: number[], jenis: RaJenis): [number, number, number, number] {
  const seg = (start: number): number => {
    const part = months.slice(start, start + 3);
    if (jenis === 'Akumulatif') return part.reduce((a, b) => a + b, 0);
    for (let i = part.length - 1; i >= 0; i--) if (part[i] > 0) return part[i];
    return 0;
  };
  return [seg(0), seg(3), seg(6), seg(9)];
}

export const LEVEL_LABELS: Record<RaLevel, string> = {
  tujuan: 'Indikator Tujuan',
  sasaran: 'Indikator Sasaran',
  program: 'Indikator Program',
  kegiatan: 'Indikator Kegiatan',
  'sub-kegiatan': 'Indikator Sub Kegiatan',
};

export const YEAR_RANGE: number[] = (() => {
  const out: number[] = [];
  for (let y = 2026; y <= 2045; y++) out.push(y);
  return out;
})();

/**
 * Flatten 4-level rows ke 1 list hierarki untuk tabel cetak gabungan.
 * Pattern: parent kosong tree-style. Per baris cuma 1 kolom hierarki diisi
 * (sesuai level row), kolom indikator selalu diisi dari row.indikator.
 *
 * Algoritma:
 *   for sasaran in sasarans:
 *     emit row (sasaran=sas.program, others empty)
 *     for prog where prog.sasaran == sas.program:
 *       emit row (program=prog.program)
 *       for keg where keg.program == prog.program:
 *         emit row (kegiatan=keg.kegiatan)
 *         for sub where sub.kegiatan == keg.kegiatan && sub.program == prog.program:
 *           emit row (sub_kegiatan=sub.sub_kegiatan)
 *
 * Orphans (rows tanpa parent valid) di-append di akhir dgn flag isOrphan.
 */
export interface HierarchyRow {
  no: number;
  tujuan: string;
  sasaran: string;
  program: string;
  kegiatan: string;
  sub_kegiatan: string;
  source: RaRow;        // pointer ke original row utk akses indikator, jenis, target, dll
  isOrphan?: boolean;
}

export function buildHierarchyRows(allRows: RaRow[]): HierarchyRow[] {
  const out: HierarchyRow[] = [];
  const used = new Set<number>();
  let no = 0;

  const tujuans = allRows.filter(r => r.level === 'tujuan')
    .sort((a, b) => a.program.localeCompare(b.program));
  const sasarans = allRows.filter(r => r.level === 'sasaran')
    .sort((a, b) => a.program.localeCompare(b.program));
  const programs = allRows.filter(r => r.level === 'program');
  const kegiatans = allRows.filter(r => r.level === 'kegiatan');
  const subKegs  = allRows.filter(r => r.level === 'sub-kegiatan');

  // Emit 1 subtree Sasaran (Sasaran → Program → Kegiatan → Sub Kegiatan).
  // Guard `used.has` di tiap tingkat: nama parent kembar bisa match 2x → emit 2x
  // dgn source.id sama → React "duplicate key" + double row.
  const emitSasaran = (sas: RaRow): void => {
    if (used.has(sas.id)) return;
    no++;
    out.push({ no, tujuan: '', sasaran: sas.program, program: '', kegiatan: '', sub_kegiatan: '', source: sas });
    used.add(sas.id);

    const childPrograms = programs.filter(p => p.sasaran === sas.program)
      .sort((a, b) => a.program.localeCompare(b.program));
    for (const prog of childPrograms) {
      if (used.has(prog.id)) continue;
      no++;
      out.push({ no, tujuan: '', sasaran: '', program: prog.program, kegiatan: '', sub_kegiatan: '', source: prog });
      used.add(prog.id);

      const childKegs = kegiatans.filter(k => k.program === prog.program)
        .sort((a, b) => (a.kegiatan ?? '').localeCompare(b.kegiatan ?? ''));
      for (const keg of childKegs) {
        if (used.has(keg.id)) continue;
        no++;
        out.push({ no, tujuan: '', sasaran: '', program: '', kegiatan: keg.kegiatan ?? '', sub_kegiatan: '', source: keg });
        used.add(keg.id);

        const childSubs = subKegs.filter(s => s.program === prog.program && s.kegiatan === keg.kegiatan)
          .sort((a, b) => (a.sub_kegiatan ?? '').localeCompare(b.sub_kegiatan ?? ''));
        for (const sub of childSubs) {
          if (used.has(sub.id)) continue;
          no++;
          out.push({ no, tujuan: '', sasaran: '', program: '', kegiatan: '', sub_kegiatan: sub.sub_kegiatan ?? '', source: sub });
          used.add(sub.id);
        }
      }
    }
  };

  // Tujuan (root) → Sasaran subtree. Sasaran match by kolom `tujuan` = nama Tujuan.
  for (const tuj of tujuans) {
    if (used.has(tuj.id)) continue;
    no++;
    out.push({ no, tujuan: tuj.program, sasaran: '', program: '', kegiatan: '', sub_kegiatan: '', source: tuj });
    used.add(tuj.id);

    const childSasarans = sasarans.filter(s => s.tujuan === tuj.program)
      .sort((a, b) => a.program.localeCompare(b.program));
    for (const sas of childSasarans) emitSasaran(sas);
  }

  // Sasaran tanpa Tujuan induk (legacy / belum di-link) → tampil sbg root (backward-compat).
  for (const sas of sasarans) emitSasaran(sas);

  // Orphan rows: tidak match ke chain (parent NULL atau invalid)
  for (const r of allRows) {
    if (used.has(r.id)) continue;
    no++;
    out.push({
      no,
      tujuan: r.level === 'tujuan' ? r.program : '',
      sasaran: r.level === 'sasaran' ? r.program : '',
      program: r.level === 'program' ? r.program : '',
      kegiatan: r.level === 'kegiatan' ? (r.kegiatan ?? '') : '',
      sub_kegiatan: r.level === 'sub-kegiatan' ? (r.sub_kegiatan ?? '') : '',
      source: r,
      isOrphan: true,
    });
  }

  return out;
}

/**
 * Outcome statement per level. Untuk row sasaran (top-level), tidak ada outcome
 * separate karena `program` field row=sasaran sudah = nama sasaran itu sendiri.
 */
export function outcomeOf(row: RaRow): string {
  if (row.level === 'program')      return row.outcome_program ?? '';
  if (row.level === 'kegiatan')     return row.outcome_kegiatan ?? '';
  if (row.level === 'sub-kegiatan') return row.outcome_sub_kegiatan ?? '';
  return '';
}

export function quartersOf(row: RaRow): { id: 1 | 2 | 3 | 4; name: string; target: number; realisasi: number }[] {
  return [
    { id: 1, name: 'Triwulan 1', target: row.q1_target, realisasi: row.q1_realisasi },
    { id: 2, name: 'Triwulan 2', target: row.q2_target, realisasi: row.q2_realisasi },
    { id: 3, name: 'Triwulan 3', target: row.q3_target, realisasi: row.q3_realisasi },
    { id: 4, name: 'Triwulan 4', target: row.q4_target, realisasi: row.q4_realisasi },
  ];
}

export function realisasiAkhirTahun(row: RaRow): number {
  const qs = [row.q1_realisasi, row.q2_realisasi, row.q3_realisasi, row.q4_realisasi];
  if (row.jenis === 'Akumulatif') return qs.reduce((a, b) => a + b, 0);
  // Progres Positif/Negatif/Pengulangan: ambil realisasi triwulan TERAKHIR yang diisi
  // (snapshot terbaru), bukan max/min/rata-rata. realisasi>0 = "terisi" (0 nyata tidak
  // terekam — konvensi existing). Sync dengan lib/data/rencana-aksi.ts.
  for (let i = qs.length - 1; i >= 0; i--) {
    if (qs[i] > 0) return qs[i];
  }
  return 0;
}

/**
 * Anggaran (Rp) untuk row di menu Realisasi. Anggaran tersimpan di level
 * sub-kegiatan; level di atasnya = SUM seluruh sub-kegiatan keturunan (match
 * by nama program/kegiatan). Sasaran di luar scope → null.
 */
export function anggaranRollup(level: RaLevel, row: RaRow, rows: RaRow[]): number | null {
  const subKegs = rows.filter(r => r.level === 'sub-kegiatan');
  const sumSub = (pred: (s: RaRow) => boolean): number | null => {
    const subs = subKegs.filter(pred);
    return subs.length ? subs.reduce((a, s) => a + (s.anggaran_nominal ?? 0), 0) : null;
  };
  if (level === 'sub-kegiatan') return row.anggaran_nominal ?? null;
  if (level === 'program') return sumSub(s => s.program === row.program);
  if (level === 'kegiatan') return sumSub(s => s.program === row.program && s.kegiatan === row.kegiatan);
  if (level === 'sasaran') {
    // Row level sasaran: kolom `program` = nama sasaran. Cari program yang sasaran-nya
    // cocok, lalu sum seluruh sub-kegiatan di program-program tersebut.
    const progNames = new Set(
      rows.filter(r => r.level === 'program' && r.sasaran === row.program).map(r => r.program),
    );
    return progNames.size ? sumSub(s => progNames.has(s.program)) : null;
  }
  if (level === 'tujuan') {
    // Row level tujuan: kolom `program` = nama tujuan. Turun 2 tingkat: tujuan→sasaran→program,
    // lalu sum seluruh sub-kegiatan di program-program keturunan.
    const sasNames = new Set(
      rows.filter(r => r.level === 'sasaran' && r.tujuan === row.program).map(r => r.program),
    );
    if (!sasNames.size) return null;
    const progNames = new Set(
      rows.filter(r => r.level === 'program' && r.sasaran != null && sasNames.has(r.sasaran)).map(r => r.program),
    );
    return progNames.size ? sumSub(s => progNames.has(s.program)) : null;
  }
  return null;
}


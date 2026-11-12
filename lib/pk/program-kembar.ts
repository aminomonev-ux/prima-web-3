// lib/pk/program-kembar.ts — baris Master Program yang sama dianggap satu.
//
// PURE: dipakai route simpan (server) DAN tombol Rapikan Nama di layar Master Program.

export interface BarisProgram {
  program: string;
  kegiatan?: string | null;
  subkegiatan?: string | null;
  asal?: 'MANUAL' | 'RENAKSI';
}

/** Cermin kunci unik `pk_program` (kolasi tak peka huruf besar/kecil dan spasi di ujung). */
export function kunciProgram(r: BarisProgram): string {
  const rapat = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
  return [rapat(r.program), rapat(r.kegiatan), rapat(r.subkegiatan)].join('||');
}

/**
 * Kemunculan pertama dipertahankan, urutan tidak berubah. Tanda RENAKSI kembarannya ikut
 * diwariskan (docs/CONCEPT-renaksi-terhubung.md Tahap G) — kembar = jalur yang sama, jadi
 * yang dibuang dan yang dipertahankan sama-sama milik Renaksi; tanpa ini menggabungkan
 * "PROGRAM X ***" (RENAKSI) ke "PROGRAM X" (MANUAL) membuang tandanya.
 */
export function buangProgramKembar<T extends BarisProgram>(rows: readonly T[]): { unik: T[]; kembar: number } {
  const renaksi = new Set(rows.filter(r => r.asal === 'RENAKSI').map(kunciProgram));
  const sudah = new Set<string>();
  const unik: T[] = [];
  for (const r of rows) {
    const k = kunciProgram(r);
    if (sudah.has(k)) continue;
    sudah.add(k);
    unik.push(r.asal !== undefined && r.asal !== 'RENAKSI' && renaksi.has(k) ? { ...r, asal: 'RENAKSI' } : r);
  }
  return { unik, kembar: rows.length - unik.length };
}

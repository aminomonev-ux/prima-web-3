// lib/pk/program-kembar.ts — baris Master Program yang sama dianggap satu.
//
// PURE: dipakai route simpan (server) DAN tombol Rapikan Nama di layar Master Program.

export interface BarisProgram {
  program: string;
  kegiatan?: string | null;
  subkegiatan?: string | null;
}

/** Cermin kunci unik `pk_program` (kolasi tak peka huruf besar/kecil dan spasi di ujung). */
export function kunciProgram(r: BarisProgram): string {
  const rapat = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
  return [rapat(r.program), rapat(r.kegiatan), rapat(r.subkegiatan)].join('||');
}

/** Kemunculan pertama dipertahankan, urutan tidak berubah. */
export function buangProgramKembar<T extends BarisProgram>(rows: readonly T[]): { unik: T[]; kembar: number } {
  const sudah = new Set<string>();
  const unik = rows.filter(r => {
    const k = kunciProgram(r);
    if (sudah.has(k)) return false;
    sudah.add(k);
    return true;
  });
  return { unik, kembar: rows.length - unik.length };
}

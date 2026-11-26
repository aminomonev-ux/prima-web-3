// lib/bba/drive-kirim.ts — kapan laporan BBA dikirim ulang ke Drive (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5B.3). MURNI.
//
// Keputusan pelaksanaan: konsep menulis "tiap simpan menandai `bba_drive_kotor`". Yang dipasang membandingkan SIDIK isi
// (`sidikBahan`) dengan sidik yang terakhir terkirim, tanpa satu baris pun di jalur Simpan. Alasannya L69: BBA punya puluhan
// route tulis — satu yang lupa menandai = Drive basi tanpa gejala; sidik juga menangkap penghapusan, yang luput dari
// MAX(updated_at). Perilaku yang terlihat sama: rentetan simpan dalam rapat anggaran jadi satu unggahan, gagal Drive tidak
// pernah menyentuh Simpan, dan tanda "perlu dikirim" baru lepas bila unggahan berhasil.

/** Kirim hanya bila isi sudah DIAM selama ini — rentetan simpan menunggu yang terakhir. */
export const JEDA_DIAM_MS = 2 * 60_000;

export interface StatusBerkasDrive {
  /** Sidik yang terakhir berhasil diunggah. */
  sidik_terkirim?: string;
  /** Sidik yang terakhir dilihat pemeriksa, dan kapan (ms epoch) ia mulai berbeda. */
  sidik_terlihat?: string;
  berubah_pada?: number;
  terkirim_pada?: string | null;
  file_id?: string | null;
  galat?: string | null;
}

export function putuskanKirim(lama: StatusBerkasDrive | undefined, sidik: string, kini: number, paksa: boolean): { kirim: boolean; status: StatusBerkasDrive } {
  const status: StatusBerkasDrive = { ...lama };
  if (status.sidik_terlihat !== sidik) { status.sidik_terlihat = sidik; status.berubah_pada = kini; }
  if (status.sidik_terkirim === sidik && status.file_id) return { kirim: false, status };
  return { kirim: paksa || kini - (status.berubah_pada ?? kini) >= JEDA_DIAM_MS, status };
}

/** Sesudah unggahan: berhasil = sidik terkirim + id berkas dicatat; gagal = tanda tetap, galat disebut. */
export function catatHasilKirim(s: StatusBerkasDrive, sidik: string, hasil: { fileId: string; pada: string } | { galat: string }): StatusBerkasDrive {
  return 'galat' in hasil ? { ...s, galat: hasil.galat } : { ...s, sidik_terkirim: sidik, file_id: hasil.fileId, terkirim_pada: hasil.pada, galat: null };
}

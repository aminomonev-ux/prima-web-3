// lib/bba/drive-kirim.ts — kapan laporan BBA dikirim ulang ke Drive (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5B.3). MURNI.
//
// Keputusan pelaksanaan: konsep menulis "tiap simpan menandai `bba_drive_kotor`". Yang dipasang membandingkan SIDIK isi
// (`sidikBahan`) dengan sidik yang terakhir terkirim, tanpa satu baris pun di jalur Simpan. Alasannya L69: BBA punya puluhan
// route tulis — satu yang lupa menandai = Drive basi tanpa gejala; sidik juga menangkap penghapusan, yang luput dari
// MAX(updated_at). Perilaku yang terlihat sama: rentetan simpan dalam rapat anggaran jadi satu unggahan, gagal Drive tidak
// pernah menyentuh Simpan, dan tanda "perlu dikirim" baru lepas bila unggahan berhasil.

/** Kirim hanya bila isi sudah DIAM selama ini — rentetan simpan menunggu yang terakhir. */
export const JEDA_DIAM_MS = 2 * 60_000;

/** Suntingan di luar PRIMA yang menunggu ditinjau (CONCEPT-bba-drive-balik §3, §6A). Selama ada, berkas TIDAK ditimpa. */
export interface PerubahanLuar {
  /** Revisi Drive yang ditinjau — bisa bukan kepala berkas (`tertimpa`). */
  revisi: string;
  md5: string | null;
  oleh: string | null;
  /** Waktu Drive (ISO UTC). */
  pada: string | null;
  /** Suntingan itu sempat tertimpa kiriman otomatis; isinya dibaca dari riwayat revisi. */
  tertimpa: boolean;
}

export interface StatusBerkasDrive {
  /** Sidik yang terakhir berhasil diunggah. */
  sidik_terkirim?: string;
  /** Sidik yang terakhir dilihat pemeriksa, dan kapan (ms epoch) ia mulai berbeda. */
  sidik_terlihat?: string;
  berubah_pada?: number;
  terkirim_pada?: string | null;
  file_id?: string | null;
  galat?: string | null;
  /** Penanda isi & revisi kiriman PRIMA terakhir, dari jawaban Drive saat unggah. */
  md5_terkirim?: string | null;
  revisi_terkirim?: string | null;
  /** md5 berkas yang sudah DITINJAU (diterapkan/diabaikan) — tidak dianggap perubahan luar lagi sampai PRIMA menimpanya. */
  md5_ditinjau?: string | null;
  /** Revisi yang terakhir ditinjau — revisi sebelumnya bukan lagi "suntingan yang tertimpa". */
  revisi_ditinjau?: string | null;
  luar?: PerubahanLuar | null;
  /** Sesudah tinjauan: kirim pada putaran berikutnya TANPA menunggu diam — berkas di Drive harus segera memuat hasil gabungan. */
  kirim_segera?: boolean;
}

export function putuskanKirim(lama: StatusBerkasDrive | undefined, sidik: string, kini: number, paksa: boolean): { kirim: boolean; status: StatusBerkasDrive } {
  const status: StatusBerkasDrive = { ...lama };
  if (status.sidik_terlihat !== sidik) { status.sidik_terlihat = sidik; status.berubah_pada = kini; }
  // Ada suntingan luar yang belum ditinjau: menimpa = membuangnya. "Kirim sekarang" pun tidak.
  if (status.luar) return { kirim: false, status };
  if (status.kirim_segera) return { kirim: true, status };
  if (status.sidik_terkirim === sidik && status.file_id) return { kirim: false, status };
  return { kirim: paksa || kini - (status.berubah_pada ?? kini) >= JEDA_DIAM_MS, status };
}

/** Sesudah unggahan: berhasil = sidik terkirim + id berkas dicatat; gagal = tanda tetap, galat disebut. */
export function catatHasilKirim(s: StatusBerkasDrive, sidik: string, hasil: { fileId: string; pada: string; md5?: string | null; revisi?: string | null } | { galat: string }): StatusBerkasDrive {
  return 'galat' in hasil ? { ...s, galat: hasil.galat }
    : { ...s, sidik_terkirim: sidik, file_id: hasil.fileId, terkirim_pada: hasil.pada, galat: null,
      md5_terkirim: hasil.md5 ?? null, revisi_terkirim: hasil.revisi ?? null, md5_ditinjau: null, kirim_segera: false };
}

/**
 * Berkas di Drive sekarang berbeda dari kiriman PRIMA terakhir? Dibandingkan lewat md5 ISI, bukan revisi — Drive membuat
 * revisi baru walau isinya sama (dicek 2026-11-27). Tanpa md5 kiriman (status lama) = tidak bisa dinilai, tidak ditahan.
 */
export function periksaLuar(s: StatusBerkasDrive, meta: { md5: string | null; revisi: string | null; oleh: string | null; diubahPada: string | null; trashed: boolean }): PerubahanLuar | null {
  if (meta.trashed || !s.md5_terkirim || !meta.md5 || !meta.revisi) return s.luar ?? null;
  const kepalaBaru = meta.md5 !== s.md5_terkirim && meta.md5 !== s.md5_ditinjau && meta.md5 !== s.luar?.md5;
  // Disunting lagi sesudah terdeteksi → yang ditinjau versi TERBARU (Terapkan dengan revisi lama dijawab 409).
  if (kepalaBaru) return { revisi: meta.revisi, md5: meta.md5, oleh: meta.oleh, pada: meta.diubahPada, tertimpa: false };
  return s.luar ?? null;
}

/**
 * Suntingan yang tertimpa kiriman PRIMA barusan (§6A urutan 3): revisi di ANTARA titik awal (kiriman sebelumnya, atau revisi
 * yang terakhir ditinjau bila lebih baru) dan kiriman barusan, yang md5-nya bukan salah satu kiriman PRIMA. Yang terakhir
 * dipakai. `revisi` = urut lama → baru.
 */
export function revisiTertimpa(
  revisi: ReadonlyArray<{ id: string; md5: string | null; diubahPada: string | null; oleh: string | null }>,
  awal: ReadonlyArray<string | null | undefined>, barusan: string | null, md5Kami: ReadonlySet<string>,
): PerubahanLuar | null {
  if (!barusan) return null;
  const a = Math.max(-1, ...awal.map(x => (x ? revisi.findIndex(r => r.id === x) : -1)));
  const b = revisi.findIndex(r => r.id === barusan);
  if (a < 0 || b < 0 || b <= a + 1) return null;
  const sela = revisi.slice(a + 1, b).filter(r => r.md5 && !md5Kami.has(r.md5));
  const r = sela[sela.length - 1];
  return r ? { revisi: r.id, md5: r.md5, oleh: r.oleh, pada: r.diubahPada, tertimpa: true } : null;
}

/** Sesudah Terapkan/Abaikan: tahanan dilepas, isi yang ditinjau tidak dianggap baru lagi, dan kiriman berikutnya PASTI jalan. */
export function lepasTahanan(s: StatusBerkasDrive, md5Ditinjau: string | null): StatusBerkasDrive {
  return { ...s, luar: null, md5_ditinjau: md5Ditinjau, revisi_ditinjau: s.luar?.revisi ?? null, kirim_segera: true };
}

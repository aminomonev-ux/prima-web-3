// lib/blud/pengaturan-grup.ts — pengelompokan daftar versi per tahun anggaran
// untuk layar Pengaturan (hapus versi DPA & Pergeseran).
//
// Dipisah dari komponennya supaya bisa diuji tanpa menyeret React: aturan
// "baris mana yang BERLAKU" dan "apa kunci React-nya" adalah dua hal yang
// pernah salah di layar itu, dan dua-duanya murni fungsi data.

export interface SectionRow {
  /** `${tahun}:${versi}` — dua tahun yang disimpan pada tanggal kalender yang sama
   *  menghasilkan `versi_tanggal` kembar, jadi tanggal saja bukan kunci React. */
  key:     string
  versi:   string
  meta:    string
  berlaku: boolean
}

export interface GrupTahun { tahun: number; rows: SectionRow[] }

/**
 * Pecah daftar lintas-tahun jadi grup per tahun anggaran.
 *
 * `berlaku` = baris pertama dalam tahunnya. Aman karena server sudah
 * ORDER BY versi_tanggal DESC per tahun (`getDpaHistory`) — dan itu satu-satunya
 * alasan pengurutan tidak diulang di sini.
 *
 * Sebelum ini daftarnya datar dan lencananya dihitung `i === 0` atas seluruh
 * daftar: hanya versi terbaru dari tahun teratas yang bertanda, sedangkan versi
 * terbaru tahun lain — yang justru sedang berlaku — tampil polos seolah versi
 * lama yang aman dibuang. Di layar penghapusan, itu bukan kosmetik.
 */
export function kelompokkanPerTahun<T extends { tahun_anggaran: number; versi_tanggal: string }>(
  list: T[],
  meta: (v: T) => string,
): GrupTahun[] {
  const peta = new Map<number, SectionRow[]>()
  for (const v of list) {
    const sudahAda = peta.get(v.tahun_anggaran)
    const baris: SectionRow = {
      key:     `${v.tahun_anggaran}:${v.versi_tanggal}`,
      versi:   v.versi_tanggal,
      meta:    meta(v),
      berlaku: sudahAda === undefined,
    }
    if (sudahAda) sudahAda.push(baris)
    else peta.set(v.tahun_anggaran, [baris])
  }
  return [...peta].map(([tahun, rows]) => ({ tahun, rows }))
}

// lib/shared/pk-kolom.ts — nama kolom Master Sasaran untuk dipakai DALAM KALIMAT
//
// Berkas ini sengaja tanpa impor apa pun: ia dibaca route API (server), dan bentuknya
// dijaga tetap begitu supaya sisi klien juga boleh memakainya. Menaruhnya di
// `lib/data/pk-schemas.ts` tidak bisa — di sana ada `pkRateLimit`, yang akan menyeret
// ioredis/upstash ikut ke peramban.
//
// Gunanya satu: penolakan Zod menyebut `rows[46].subkegiatan`, dan orang di kantor
// tidak tahu itu yang mana. Yang mereka lihat judul kolom di layar.
//
// Sengaja TIDAK dipakai sebagai judul kolom tabelnya. Di layar, tiga kolom target
// cukup bertuliskan "Target" karena posisinya sudah menerangkan target yang mana;
// di dalam kalimat galat tidak ada posisi untuk bersandar, jadi ketiganya harus
// bernama lengkap. Dua kebutuhan berbeda, bukan dua salinan satu daftar.

export const LABEL_KOLOM_SASARAN: Record<string, string> = {
  program:               'Sasaran Program',
  indikator_program:     'Indikator Program',
  target_program:        'Target Program',
  kegiatan:              'Sasaran Kegiatan',
  indikator_kegiatan:    'Indikator Kegiatan',
  target_kegiatan:       'Target Kegiatan',
  subkegiatan:           'Sasaran Sub Kegiatan',
  indikator_subkegiatan: 'Indikator Sub-Kegiatan',
  target_subkegiatan:    'Target Sub-Kegiatan',
}

/**
 * Penolakan Zod → kalimat yang menyebut TEMPATNYA.
 *
 * `issues[0].message` sendirian berbunyi "Too big: expected string to have <=255
 * characters" pada layar berisi 117 baris × 9 kolom — benar, dan tidak menolong siapa
 * pun. Yang dibuang justru bagian yang menolong: `issue.path` sudah memegang
 * `['rows', 46, 'subkegiatan']`.
 *
 * Nomor barisnya dinaikkan +1 supaya cocok dengan nomor yang TERTULIS di kolom "#"
 * pada tabelnya; larik mulai dari 0, tabel di layar mulai dari 1.
 */
export function pesanTolakan(issue: { path: PropertyKey[]; message: string }): string {
  const [akar, indeks, kolom] = issue.path;
  if (akar !== 'rows' || typeof indeks !== 'number') return 'Data tidak valid: ' + issue.message;
  const nama = typeof kolom === 'string' ? (LABEL_KOLOM_SASARAN[kolom] ?? kolom) : 'baris ini';
  return `Baris ${indeks + 1}, kolom "${nama}": ${issue.message}`;
}

// ═══ PRIMA — LKJIP — Impor dari Word: bagian aman-klien ════════════════════════
// Jenis penanda, label, bentuk pratinjau, dan batas berkas — dipakai pembaca (server) DAN modal
// pratinjau, tanpa menyeret PizZip ke peramban. Konsep: docs/CONCEPT-lkjip-impor-word.md.

// 9,5 MB, bukan 20 MB (konsep §5): proxy.ts hanya meneruskan 10 MB pertama badan permintaan
// (`proxyClientMaxBodySize` bawaan Next 16) — berkas yang lebih besar tiba terpotong dan rusak.
export const BATAS_BERKAS_IMPOR = 9.5 * 1024 * 1024;
export const PESAN_TERLALU_BESAR = 'Berkas lebih dari 9,5 MB. Kecilkan gambarnya di Word (klik gambar → Format Gambar → Kompres Gambar) lalu coba lagi.';

export type JenisPenanda = 'bab' | 'sub' | 'subsub' | 'judul' | 'narasi' | 'buang';
export const JENIS_PENANDA: readonly JenisPenanda[] = ['bab', 'sub', 'subsub', 'judul', 'narasi', 'buang'];
export const LABEL_PENANDA: Record<JenisPenanda, string> = {
  bab: 'Bab', sub: 'Sub-bab', subsub: 'Sub-sub-bab', judul: 'Judul objek', narasi: 'Narasi', buang: 'Buang',
};
/** Koreksi pemakai di pratinjau: nomor unsur badan → jenis yang dipakai. */
export type Koreksi = Record<number, JenisPenanda>;

export type JenisObjek = 'Tabel' | 'Gambar' | 'Grafik';
export interface TandaTangan { tempatTanggal: string; jabatan: string; nama: string; pangkat: string; nip: string }

export type BarisPratinjau =
  | { jenis: 'penanda'; id: number; teks: string; dipakai: JenisPenanda; otomatis: JenisPenanda; kedalaman: number | null }
  | { jenis: 'objek'; objek: JenisObjek; judul: string; kedalaman: number; penanda: number | null; catatan: string }
  | { jenis: 'narasi'; paragraf: number; kedalaman: number };

export interface RingkasanImpor {
  bab: number; sub: number; subsub: number; narasi: number; tabel: number; gambar: number; grafik: number;
  tabelDitolak: number; gambarDilewati: number;
}

/** Jawaban `POST /api/lkjip/impor?step=pratinjau` — ringkasan saja, isi blok tidak dikirim ke peramban. */
export interface PratinjauImpor {
  sidik: string; namaBerkas: string; judulBerkas: string; tahunTebakan: number | null;
  ringkasan: RingkasanImpor; baris: BarisPratinjau[]; peringatan: string[];
  kataPengantar: { paragraf: number; ttd: TandaTangan };
}

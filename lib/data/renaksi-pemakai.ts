// lib/data/renaksi-pemakai.ts — siapa yang masih memegang nama Renaksi yang barusan diganti.
// Hanya MEMBACA (sesudah ganti nama ter-commit). Konsep: docs/CONCEPT-renaksi-terhubung.md §6 (Tahap F).
//
// Yang dihitung hanya salinan yang memang bertaut ke Renaksi: entri Master E-Anggaran & Master
// Program PK ber-asal RENAKSI dengan nama lama (kegiatan/sub dibatasi induknya — senama di induk
// lain entitas lain), dan kartu RHK IKI DRAFT yang bertaut ke baris berganti nama dan teks RHK-nya
// diambil dari nama (dengan outcome, ganti nama tidak mengubah isi kartu). Pembanding nama memakai
// aturan penanda yang sama dengan migrasi asal: bintang di ujung dibuang, kolasi tak peka huruf.

import { sql } from './db';
import { rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import type { GantiNama } from '@/lib/renaksi/ganti-nama';
import type { PemakaiNama } from '@/lib/renaksi/pemakai';

const angka = (rows: unknown) => Number((rows as Array<{ n: unknown }>)[0]?.n ?? 0);

export async function pemakaiNamaRenaksi(tahun: number, g: GantiNama): Promise<PemakaiNama[]> {
  if (g.level !== 'program' && g.level !== 'kegiatan' && g.level !== 'sub-kegiatan') return [];
  const dari = rapikanNamaEntitas(g.dari);
  const th = String(tahun);
  // Induk lama: kegiatan → program; sub → kegiatan + program. Program tanpa induk di modul penyalin.
  const prog = rapikanNamaEntitas((g.level === 'kegiatan' ? g.induk : g.indukProgram) ?? '');
  const keg = rapikanNamaEntitas((g.level === 'sub-kegiatan' ? g.induk : '') ?? '');

  // Tahap H: baris Renaksi sudah berada di induk BARU sesudah simpanan ini; entri E-Anggaran/PK
  // yang masih di jalur lama tetap dicari dengan induk LAMA (`prog`/`keg` di atas).
  const progKini = g.level === 'kegiatan' ? (g.indukBaru ?? g.induk) : (g.indukProgramBaru ?? g.indukProgram);
  const kegKini = g.indukBaru ?? g.induk;
  // Kartu IKI membandingkan nama & isi, bukan induk — pindah induk saja tidak mengubah kartu.
  const ikiTerkena = g.dari !== g.ke;
  let ea: number, pk: number;
  let iki: Array<{ n: unknown; dok: unknown }> = [];
  if (g.level === 'program') {
    ea = angka(await sql`SELECT COUNT(*) AS n FROM kinerja_master WHERE tahun = ${th} AND tipe = 'program' AND asal = 'RENAKSI'
      AND TRIM(REGEXP_REPLACE(nama, '[[:space:]*]+$', '')) = ${dari}`);
    pk = angka(await sql`SELECT COUNT(*) AS n FROM pk_program WHERE tahun = ${th} AND level = 'program' AND asal = 'RENAKSI'
      AND TRIM(REGEXP_REPLACE(program, '[[:space:]*]+$', '')) = ${dari}`);
    iki = await sql`SELECT COUNT(*) AS n, COUNT(DISTINCT d.id) AS dok FROM iki_rhk r JOIN iki_dokumen d ON d.id = r.dokumen_id
      WHERE d.tahun = ${th} AND d.status = 'DRAFT' AND r.renaksi_id IN (
        SELECT id FROM rencana_aksi WHERE tahun = ${tahun} AND level = 'program' AND program = ${g.ke} AND outcome_program IS NULL)` as typeof iki;
  } else if (g.level === 'kegiatan') {
    ea = angka(await sql`SELECT COUNT(*) AS n FROM kinerja_master WHERE tahun = ${th} AND tipe = 'kegiatan' AND asal = 'RENAKSI'
      AND TRIM(REGEXP_REPLACE(nama, '[[:space:]*]+$', '')) = ${dari}
      AND (COALESCE(program_ref, '') = '' OR TRIM(REGEXP_REPLACE(program_ref, '[[:space:]*]+$', '')) = ${prog})`);
    pk = angka(await sql`SELECT COUNT(*) AS n FROM pk_program WHERE tahun = ${th} AND level = 'kegiatan' AND asal = 'RENAKSI'
      AND TRIM(REGEXP_REPLACE(kegiatan, '[[:space:]*]+$', '')) = ${dari} AND TRIM(REGEXP_REPLACE(program, '[[:space:]*]+$', '')) = ${prog}`);
    if (ikiTerkena) iki = await sql`SELECT COUNT(*) AS n, COUNT(DISTINCT d.id) AS dok FROM iki_rhk r JOIN iki_dokumen d ON d.id = r.dokumen_id
      WHERE d.tahun = ${th} AND d.status = 'DRAFT' AND r.renaksi_id IN (
        SELECT id FROM rencana_aksi WHERE tahun = ${tahun} AND level = 'kegiatan' AND kegiatan = ${g.ke} AND program <=> ${progKini}
          AND outcome_kegiatan IS NULL)` as typeof iki;
  } else {
    ea = angka(await sql`SELECT COUNT(*) AS n FROM kinerja_master WHERE tahun = ${th} AND tipe = 'subkegiatan' AND asal = 'RENAKSI'
      AND TRIM(REGEXP_REPLACE(nama, '[[:space:]*]+$', '')) = ${dari}
      AND (COALESCE(program_ref, '') = '' OR TRIM(REGEXP_REPLACE(program_ref, '[[:space:]*]+$', '')) = ${prog})
      AND (COALESCE(kegiatan_ref, '') = '' OR TRIM(REGEXP_REPLACE(kegiatan_ref, '[[:space:]*]+$', '')) = ${keg})`);
    pk = angka(await sql`SELECT COUNT(*) AS n FROM pk_program WHERE tahun = ${th} AND level = 'subkegiatan' AND asal = 'RENAKSI'
      AND TRIM(REGEXP_REPLACE(subkegiatan, '[[:space:]*]+$', '')) = ${dari}
      AND TRIM(REGEXP_REPLACE(program, '[[:space:]*]+$', '')) = ${prog} AND TRIM(REGEXP_REPLACE(kegiatan, '[[:space:]*]+$', '')) = ${keg}`);
    if (ikiTerkena) iki = await sql`SELECT COUNT(*) AS n, COUNT(DISTINCT d.id) AS dok FROM iki_rhk r JOIN iki_dokumen d ON d.id = r.dokumen_id
      WHERE d.tahun = ${th} AND d.status = 'DRAFT' AND r.renaksi_id IN (
        SELECT id FROM rencana_aksi WHERE tahun = ${tahun} AND level = 'sub-kegiatan' AND sub_kegiatan = ${g.ke}
          AND kegiatan <=> ${kegKini} AND program <=> ${progKini} AND outcome_sub_kegiatan IS NULL)` as typeof iki;
  }

  return [
    { modul: 'E-Anggaran', tempat: 'Master', jumlah: ea },
    { modul: 'PK', tempat: 'Master Program', jumlah: pk },
    { modul: 'IKI', tempat: `kartu RHK di ${Number(iki[0]?.dok ?? 0)} dokumen DRAFT`, jumlah: Number(iki[0]?.n ?? 0) },
  ];
}

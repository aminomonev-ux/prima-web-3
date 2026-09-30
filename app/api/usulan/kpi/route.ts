
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { ADMIN_ROLES, BIDANG_ROLES, BIDANG_TO_SUBBIDANG } from '@/lib/constants';
import { itemUsulanTahun, paguBludTahun } from '@/lib/data/usulan';
import { POLA_TAHUN_ANGGARAN } from '@/lib/shared/pagu-blud';
import { usulanMati } from '../_guard';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    const mati = await usulanMati(session.role);
    if (mati) return mati;

    // B5: tahun anggaran mengikuti saringan layar. Tanpa tahun = semua tahun, dan
    // pagu `null` — pagu hanya sah dibandingkan dengan nilai tahun yang sama.
    const tahun = new URL(req.url).searchParams.get('tahun') || null;
    if (tahun !== null && !POLA_TAHUN_ANGGARAN.test(tahun)) {
      return NextResponse.json({ ok: false, message: 'Tahun anggaran tidak valid.' }, { status: 400 });
    }

    const isAdmin   = (ADMIN_ROLES as readonly string[]).includes(session.role);
    const isKasubag = session.role === 'ADMIN_KASUBAG';
    const isKabag   = session.role === 'ADMIN_KABAG';
    const isVerif   = isAdmin || isKasubag || isKabag;
    const isBidang  = (BIDANG_ROLES as readonly string[]).includes(session.role);
    const allowedSubs = isBidang ? ((BIDANG_TO_SUBBIDANG as Record<string,string[]>)[session.role] ?? []) : [];

    const pagu = tahun ? await paguBludTahun(tahun) : null;

    if (isBidang && allowedSubs.length) {
      const tahunHeader = tahun ? sql`AND tahun_anggaran = ${tahun}` : sql``;
      const tahunItem   = tahun ? sql`AND ${itemUsulanTahun(tahun)}` : sql``;
      const [hRows, iRows, vRows] = await Promise.all([
        sql`SELECT
          COUNT(CASE WHEN status_ringkas = 'DIAJUKAN_REVIEW' THEN 1 END)  AS antrian,
          COUNT(CASE WHEN status_ringkas = 'REVISI_BIDANG' THEN 1 END)    AS revisi,
          COUNT(CASE WHEN status_ringkas = 'DITOLAK_BIDANG' THEN 1 END)   AS ditolak_bidang,
          COUNT(CASE WHEN status_ringkas NOT IN ('DIAJUKAN_REVIEW','DRAFT') THEN 1 END) AS direview,
          COUNT(CASE WHEN status_ringkas NOT IN ('DIAJUKAN_REVIEW','REVISI_BIDANG','DITOLAK_BIDANG','DRAFT') THEN 1 END) AS diteruskan,
          COALESCE(SUM(CASE WHEN status_ringkas='DIAJUKAN_REVIEW' THEN total_nilai ELSE 0 END),0) AS nilai_antrian
        FROM usulan_headers WHERE sub_bidang IN (${allowedSubs}) ${tahunHeader}`,
        sql`SELECT sub_bidang, COUNT(*) as cnt, COALESCE(SUM(harga_est*qty),0) as total_est,
              COALESCE(SUM(CASE WHEN status='DISETUJUI' THEN nominal_disetujui ELSE 0 END),0) as nominal_disetujui
          FROM usulan_items WHERE sub_bidang IN (${allowedSubs}) ${tahunItem}
          GROUP BY sub_bidang ORDER BY cnt DESC`,
        sql`SELECT
          COALESCE(SUM(CASE WHEN status NOT IN ('DITOLAK','DITOLAK_ADMIN','DITOLAK_BIDANG','DRAFT') THEN harga_est*qty ELSE 0 END),0) AS nilai_aktif,
          COALESCE(SUM(CASE WHEN status IN ('DITELAAH','DIPROSES') THEN harga_est*qty ELSE 0 END),0) AS nilai_telaah,
          COALESCE(SUM(CASE WHEN status='DISETUJUI' THEN nominal_disetujui ELSE 0 END),0) AS nilai_disetujui
        FROM usulan_items WHERE sub_bidang IN (${allowedSubs}) ${tahunItem}`,
      ]);
      const h = hRows[0] as Record<string,unknown>;
      const v = vRows[0] as Record<string,unknown>;
      return NextResponse.json({ ok: true, data: {
        total: 0, disetujui: 0, ditolak: 0, proses: 0, menunggu_admin: 0,
        nominal: 0,
        nilai_aktif:     Number(v.nilai_aktif ?? 0),
        nilai_telaah:    Number(v.nilai_telaah ?? 0),
        nilai_disetujui: Number(v.nilai_disetujui ?? 0),
        pagu, tahun,
        chartStatus: [], chartBidang: iRows,
        bidang_antrian:    Number(h.antrian ?? 0),
        bidang_revisi:     Number(h.revisi ?? 0),
        bidang_ditolak:    Number(h.ditolak_bidang ?? 0),
        bidang_direview:   Number(h.direview ?? 0),
        bidang_diteruskan: Number(h.diteruskan ?? 0),
        bidang_nilai_antrian: Number(h.nilai_antrian ?? 0),
      }});
    }

    // Pemohon hanya miliknya sendiri; verifikator semua. Tahun menyaring keduanya.
    const syaratHeader = isVerif
      ? (tahun ? sql`WHERE h.tahun_anggaran = ${tahun}` : null)
      : (tahun ? sql`WHERE h.created_by = ${session.userId} AND h.tahun_anggaran = ${tahun}`
               : sql`WHERE h.created_by = ${session.userId}`);
    const scope  = syaratHeader ? sql`WHERE usulan_id IN (SELECT h.id FROM usulan_headers h ${syaratHeader})` : sql``;
    const scopeH = syaratHeader ?? sql``;

    const [rows, chartStatus, chartBidang] = await Promise.all([
      isVerif
        ? sql`SELECT
            COUNT(*)                                                                                    AS total,
            COUNT(CASE WHEN status = 'DISETUJUI' THEN 1 END)                                           AS disetujui,
            COUNT(CASE WHEN status IN ('DITOLAK','DITOLAK_ADMIN') THEN 1 END)                           AS ditolak,
            COUNT(CASE WHEN status IN ('DITELAAH','DIPROSES') THEN 1 END)                              AS proses,
            COUNT(CASE WHEN status = 'DIAJUKAN' THEN 1 END)                                            AS menunggu_admin,
            COALESCE(SUM(CASE WHEN status='DISETUJUI' THEN nominal_disetujui ELSE 0 END),0)            AS nominal,
            COALESCE(SUM(CASE WHEN status NOT IN ('DITOLAK','DITOLAK_ADMIN','DITOLAK_BIDANG','DRAFT') THEN harga_est*qty ELSE 0 END),0) AS nilai_aktif,
            COALESCE(SUM(CASE WHEN status IN ('DITELAAH','DIPROSES') THEN harga_est*qty ELSE 0 END),0) AS nilai_telaah,
            COALESCE(SUM(CASE WHEN status='DISETUJUI' THEN nominal_disetujui ELSE 0 END),0)            AS nilai_disetujui
          FROM usulan_items ${scope}`
        : sql`SELECT
            COUNT(*)                                                                                      AS total,
            COUNT(CASE WHEN i.status = 'DISETUJUI' THEN 1 END)                                           AS disetujui,
            COUNT(CASE WHEN i.status IN ('DITOLAK','DITOLAK_ADMIN') THEN 1 END)                           AS ditolak,
            COUNT(CASE WHEN i.status IN ('DITELAAH','DIPROSES') THEN 1 END)                              AS proses,
            COUNT(CASE WHEN i.status = 'DIAJUKAN' THEN 1 END)                                            AS menunggu_admin,
            COALESCE(SUM(CASE WHEN i.status='DISETUJUI' THEN i.nominal_disetujui ELSE 0 END),0)          AS nominal,
            COALESCE(SUM(CASE WHEN i.status NOT IN ('DITOLAK','DITOLAK_ADMIN','DITOLAK_BIDANG','DRAFT') THEN i.harga_est*i.qty ELSE 0 END),0) AS nilai_aktif,
            COALESCE(SUM(CASE WHEN i.status IN ('DITELAAH','DIPROSES') THEN i.harga_est*i.qty ELSE 0 END),0) AS nilai_telaah,
            COALESCE(SUM(CASE WHEN i.status='DISETUJUI' THEN i.nominal_disetujui ELSE 0 END),0)          AS nilai_disetujui
          FROM usulan_items i JOIN usulan_headers h ON h.id = i.usulan_id ${scopeH}`,
      sql`SELECT status, COUNT(*) as cnt FROM usulan_items ${scope} GROUP BY status`,
      sql`SELECT sub_bidang,
            COUNT(CASE WHEN status NOT IN ('DRAFT','DIAJUKAN_REVIEW','REVISI_BIDANG','DITOLAK_BIDANG') THEN 1 END) as cnt,
            COALESCE(SUM(CASE WHEN status NOT IN ('DRAFT','DIAJUKAN_REVIEW','REVISI_BIDANG','DITOLAK_BIDANG') THEN harga_est*qty ELSE 0 END),0) as total_est,
            COUNT(CASE WHEN status='DISETUJUI'      THEN 1 END) as disetujui,
            COUNT(CASE WHEN status IN ('DITOLAK','DITOLAK_ADMIN') THEN 1 END) as ditolak,
            COUNT(CASE WHEN status='DIAJUKAN'        THEN 1 END) as belum_ditelaah,
            COUNT(CASE WHEN status='DITELAAH'       THEN 1 END) as ditelaah,
            COUNT(CASE WHEN status='DITOLAK_ADMIN'  THEN 1 END) as ditolak_admin,
            COUNT(CASE WHEN status='DIREVISI_ADMIN' THEN 1 END) as direvisi_admin,
            COALESCE(SUM(CASE WHEN status NOT IN ('DITOLAK','DITOLAK_ADMIN','DRAFT') THEN admin_nominal ELSE 0 END),0) as nominal_admin,
            COALESCE(SUM(CASE WHEN status NOT IN ('DITOLAK','DITOLAK_ADMIN','DITOLAK_BIDANG','DRAFT') THEN kasubag_nominal ELSE 0 END),0) as nominal_kasubag,
            COALESCE(SUM(CASE WHEN status='DISETUJUI' THEN nominal_disetujui ELSE 0 END),0) as nominal_disetujui
          FROM usulan_items ${scope} GROUP BY sub_bidang ORDER BY cnt DESC LIMIT 20`,
    ]);

    const kpi = rows[0] as Record<string, unknown>;

    return NextResponse.json({
      ok: true,
      data: {
        total:           Number(kpi.total ?? 0),
        disetujui:       Number(kpi.disetujui ?? 0),
        ditolak:         Number(kpi.ditolak ?? 0),
        proses:          Number(kpi.proses ?? 0),
        menunggu_admin:  Number(kpi.menunggu_admin ?? 0),
        nominal:         Number(kpi.nominal ?? 0),
        nilai_aktif:     Number(kpi.nilai_aktif ?? 0),
        nilai_telaah:    Number(kpi.nilai_telaah ?? 0),
        nilai_disetujui: Number(kpi.nilai_disetujui ?? 0),
        pagu, tahun,
        chartStatus,
        chartBidang,
        bidang_antrian: 0, bidang_revisi: 0, bidang_ditolak: 0,
        bidang_direview: 0, bidang_diteruskan: 0, bidang_nilai_antrian: 0,
      },
    });

  } catch (error) {
    console.error('[KPI Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}

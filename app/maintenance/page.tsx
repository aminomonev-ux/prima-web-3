// app/maintenance/page.tsx — halaman pemeliharaan.
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md P6 (Tahap 4).
//
// Dulu halaman ini komponen klien yang menampilkan `?app=` MENTAH. Artinya siapa pun
// sekantor bisa membuka `/maintenance?app=Sistem%20Kepegawaian` dan memperlihatkan
// halaman resmi yang menyebut modul apa pun — termasuk yang sedang berjalan normal,
// termasuk yang tidak ada.
//
// Sekarang server yang menjawab, dan ia menjawab dua pertanyaan berurutan:
//   1. Apakah `?m=` sebuah kunci sakelar yang DIKENAL registry? Kalau tidak, namanya
//      tidak ditampilkan sama sekali.
//   2. Apakah sakelar itu (atau induknya) memang sedang mati DI DATABASE? Kalau tidak,
//      namanya juga tidak ditampilkan.
//
// Pemeriksaan kedua yang menutup lubangnya. Memvalidasi ke registry saja masih
// mengizinkan `?m=app_status_blud` dipakai untuk mengarang kabar bahwa BLUD mati
// padahal ia hidup — nama yang sah dipakai untuk pernyataan yang tidak benar.
//
// Gagal membaca DB = anggap tidak terbukti, tampilkan halaman umum. Sakelar yang
// hanya jujur saat semuanya lancar bukan sakelar (pola `modulMati`).
import { sql } from '@/lib/data/db';
import { formatSampai, infoSakelar, kunciPesan, kunciSampai } from '@/lib/registry/apps';

export const dynamic = 'force-dynamic';

type Terbukti = { label: string; pesan: string; sampai: string } | null;

async function buktikan(kunci: string | undefined): Promise<Terbukti> {
  if (!kunci) return null;
  const info = infoSakelar(kunci);
  if (!info) return null;

  // Induk ikut ditanyakan: mematikan BLUD ikut mematikan Realisasi, jadi tautan yang
  // menunjuk sub-sakelar tetap sah walau baris sub-nya sendiri masih 'online'.
  const kunciCek = [kunci, ...(info.induk ? [info.induk] : [])];
  try {
    const rows = await sql`
      SELECT \`key\`, value FROM app_config
      WHERE \`key\` IN (${[...kunciCek, kunciPesan(kunci), kunciSampai(kunci)]})
    ` as { key: string; value: string }[];
    const peta = new Map(rows.map((r) => [r.key, r.value]));
    const mati = kunciCek.some((k) => (peta.get(k) ?? 'online') !== 'online');
    if (!mati) return null;
    return {
      label: info.label,
      pesan: (peta.get(kunciPesan(kunci)) ?? '').trim(),
      sampai: formatSampai((peta.get(kunciSampai(kunci)) ?? '').trim()),
    };
  } catch {
    return null;
  }
}

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const m = Array.isArray(sp.m) ? sp.m[0] : sp.m;
  const terbukti = await buktikan(m);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;800&family=Share+Tech+Mono&display=swap');
        @keyframes scanline { 0%{transform:translateY(0)} 100%{transform:translateY(100vh)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse-glow { 0%,100%{box-shadow:0 0 20px rgba(255,204,0,.3)} 50%{box-shadow:0 0 50px rgba(255,204,0,.7),0 0 80px rgba(255,204,0,.3)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        .mn-body {
          min-height: 100vh;
          background: #020b14;
          background-image:
            linear-gradient(rgba(0,212,255,.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,212,255,.025) 1px, transparent 1px);
          background-size: 40px 40px;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          font-family: 'Exo 2', sans-serif;
          color: #e0f7ff;
          position: relative; overflow: hidden;
        }
        .mn-body::before {
          content: ''; position: fixed; top: -100vh; left: 0; right: 0; height: 200vh;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,.04) 2px, rgba(0,0,0,.04) 4px);
          pointer-events: none; z-index: 0;
          animation: scanline 12s linear infinite;
        }
        .mn-card {
          position: relative; z-index: 1;
          background: rgba(7,21,37,.92);
          border: 1px solid rgba(255,204,0,.35);
          border-radius: 16px;
          padding: 52px 60px;
          max-width: 540px; width: 90%;
          text-align: center;
          box-shadow: 0 0 60px rgba(255,204,0,.08), 0 0 120px rgba(0,0,0,.4);
        }
        .mn-icon-wrap {
          width: 80px; height: 80px; border-radius: 50%;
          background: rgba(255,204,0,.08);
          border: 2px solid rgba(255,204,0,.5);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 28px;
          animation: pulse-glow 2.5s ease-in-out infinite, float 4s ease-in-out infinite;
        }
        .mn-icon { font-size: 36px; }
        .mn-tag {
          display: inline-block;
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px; letter-spacing: 3px;
          color: #ffcc00; padding: 4px 14px;
          border: 1px solid rgba(255,204,0,.4);
          border-radius: 4px; background: rgba(255,204,0,.06);
          margin-bottom: 16px;
        }
        .mn-title {
          font-size: 28px; font-weight: 800;
          color: #e0f7ff; letter-spacing: 1.5px;
          margin-bottom: 10px;
        }
        .mn-app {
          font-size: 17px; font-weight: 700;
          color: #ffcc00; margin-bottom: 18px;
          text-shadow: 0 0 20px rgba(255,204,0,.4);
        }
        .mn-desc {
          font-size: 13px; color: #5a8ea8;
          line-height: 1.7; margin-bottom: 32px;
        }
        .mn-pesan {
          font-size: 13.5px; color: #e0f7ff;
          line-height: 1.7; margin-bottom: 22px;
          padding: 14px 18px; text-align: left;
          background: rgba(255,204,0,.06);
          border: 1px solid rgba(255,204,0,.22);
          border-left: 3px solid #ffcc00;
          border-radius: 8px;
          white-space: pre-line;
        }
        .mn-sampai {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 11.5px; color: #ffcc00;
          padding: 6px 14px; margin-bottom: 24px;
          border: 1px solid rgba(255,204,0,.3);
          border-radius: 6px; background: rgba(255,204,0,.05);
        }
        .mn-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(0,212,255,.2), transparent);
          margin-bottom: 28px;
        }
        .mn-status {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px; color: #5a8ea8; margin-bottom: 28px;
        }
        .mn-status-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #ffcc00;
          animation: spin 2s linear infinite;
          box-shadow: 0 0 8px rgba(255,204,0,.6);
        }
        .mn-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 28px; border-radius: 8px;
          border: 1px solid rgba(0,212,255,.45);
          background: rgba(0,212,255,.08);
          color: #00d4ff; font-size: 12px; font-weight: 700;
          letter-spacing: 1px; cursor: pointer;
          font-family: 'Exo 2', sans-serif;
          transition: all .2s; text-decoration: none;
        }
        .mn-btn:hover {
          background: rgba(0,212,255,.16);
          border-color: #00d4ff;
          box-shadow: 0 0 16px rgba(0,212,255,.25);
        }
        .mn-footer {
          position: relative; z-index: 1;
          margin-top: 32px;
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px; color: #2a4a5a; letter-spacing: 1px;
        }
        @media (prefers-reduced-motion: reduce) {
          .mn-body::before, .mn-icon-wrap, .mn-status-dot { animation: none; }
        }
      `}</style>

      <div className="mn-body">
        <div className="mn-card">
          <div className="mn-icon-wrap">
            <span className="mn-icon">🔧</span>
          </div>
          <div className="mn-tag">SISTEM MAINTENANCE</div>
          <div className="mn-title">Sedang Dalam Perbaikan</div>
          <div className="mn-app">{terbukti?.label ?? 'Modul PRIMA'}</div>
          {terbukti?.pesan
            ? <p className="mn-pesan">{terbukti.pesan}</p>
            : (
              <p className="mn-desc">
                Modul ini sedang dalam pemeliharaan sistem oleh tim administrator.
                Kami sedang bekerja untuk meningkatkan layanan dan akan segera kembali online.
              </p>
            )}
          {terbukti?.sampai && (
            <div className="mn-sampai">DIPERKIRAKAN SELESAI — {terbukti.sampai}</div>
          )}
          <div className="mn-divider" />
          <div className="mn-status">
            <div className="mn-status-dot" />
            MAINTENANCE IN PROGRESS — HARAP TUNGGU
          </div>
          <a className="mn-btn" href="/menu">← Kembali ke Menu</a>
        </div>
        <div className="mn-footer">
          PRIMA v2.0 · RSJD DR. AMINO GONDOHUTOMO
        </div>
      </div>
    </>
  );
}

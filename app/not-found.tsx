'use client';

export default function NotFound() {

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;800&display=swap');
        .nf-body {
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
        }
        .nf-card {
          background: rgba(7,21,37,.92);
          border: 1px solid rgba(0,212,255,.35);
          border-radius: 16px;
          padding: 52px 60px;
          max-width: 500px; width: 90%;
          text-align: center;
        }
        .nf-code {
          font-size: 72px; font-weight: 800;
          color: #00d4ff; letter-spacing: 4px;
          margin-bottom: 8px;
          text-shadow: 0 0 30px rgba(0,212,255,.4);
        }
        .nf-title {
          font-size: 20px; font-weight: 700;
          color: #e0f7ff; margin-bottom: 12px;
        }
        .nf-desc {
          font-size: 13px; color: #5a8ea8;
          line-height: 1.7; margin-bottom: 32px;
        }
        .nf-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 28px; border-radius: 8px;
          border: 1px solid rgba(0,212,255,.45);
          background: rgba(0,212,255,.08);
          color: #00d4ff; font-size: 12px; font-weight: 700;
          letter-spacing: 1px; cursor: pointer;
          font-family: 'Exo 2', sans-serif;
          transition: all .2s;
        }
        .nf-btn:hover {
          background: rgba(0,212,255,.16);
          border-color: #00d4ff;
        }
      `}</style>
      <div className="nf-body">
        <div className="nf-card">
          <div className="nf-code">404</div>
          <div className="nf-title">Halaman Tidak Ditemukan</div>
          <p className="nf-desc">
            Modul atau halaman yang kamu akses belum tersedia atau sedang dalam pengembangan.
          </p>
          <button className="nf-btn" onClick={() => { window.location.href = '/menu'; }}>
            ← Kembali ke Menu
          </button>
        </div>
      </div>
    </>
  );
}
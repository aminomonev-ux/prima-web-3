'use client';

export default function GlobalError() {

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700;800&display=swap');
        .err-body {
          min-height: 100vh;
          background: #020b14;
          background-image:
            linear-gradient(rgba(255,80,80,.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,80,80,.02) 1px, transparent 1px);
          background-size: 40px 40px;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          font-family: 'Exo 2', sans-serif;
          color: #e0f7ff;
        }
        .err-card {
          background: rgba(7,21,37,.92);
          border: 1px solid rgba(255,80,80,.35);
          border-radius: 16px;
          padding: 52px 60px;
          max-width: 500px; width: 90%;
          text-align: center;
        }
        .err-code {
          font-size: 72px; font-weight: 800;
          color: #ff5050; letter-spacing: 4px;
          margin-bottom: 8px;
          text-shadow: 0 0 30px rgba(255,80,80,.4);
        }
        .err-title {
          font-size: 20px; font-weight: 700;
          color: #e0f7ff; margin-bottom: 12px;
        }
        .err-desc {
          font-size: 13px; color: #5a8ea8;
          line-height: 1.7; margin-bottom: 32px;
        }
        .err-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .err-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 24px; border-radius: 8px;
          border: 1px solid rgba(0,212,255,.45);
          background: rgba(0,212,255,.08);
          color: #00d4ff; font-size: 12px; font-weight: 700;
          letter-spacing: 1px; cursor: pointer;
          font-family: 'Exo 2', sans-serif;
          transition: all .2s;
        }
        .err-btn:hover { background: rgba(0,212,255,.16); border-color: #00d4ff; }
        .err-btn.secondary {
          border-color: rgba(255,80,80,.45);
          background: rgba(255,80,80,.08);
          color: #ff8080;
        }
        .err-btn.secondary:hover { background: rgba(255,80,80,.16); border-color: #ff5050; }
      `}</style>
      <div className="err-body">
        <div className="err-card">
          <div className="err-code">500</div>
          <div className="err-title">Terjadi Kesalahan</div>
          <p className="err-desc">
            Terjadi kesalahan yang tidak terduga. Coba muat ulang halaman atau kembali ke menu utama.
          </p>
          <div className="err-btns">
            <button className="err-btn secondary" onClick={() => { window.location.reload(); }}>
              ↺ Coba Lagi
            </button>
            <button className="err-btn" onClick={() => { window.location.href = '/menu'; }}>
              ← Kembali ke Menu
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
'use client';
// app/(dashboard)/admin/_panels/TabDriveBackup.tsx — "Drive & Backup" (SUPER_ADMIN).
// Folder induk, tombol UJI, kesehatan per tujuan, 10 backup terakhir.
// Konsep: docs/CONCEPT-drive-terpusat.md §8, §10, §18.
import { useCallback, useEffect, useState } from 'react';
import { HardDrive, PlayCircle, Save } from 'lucide-react';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import { LABEL_TUJUAN, SARAN_KODE, bacaIdFolder, ukuranBerkas, type KodeUji } from '@/lib/services/drive-status';
import type { HasilUji, StatusDrive } from '@/lib/services/drive-uji';

const potongId = (id: string) => (id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-5)}` : id);
const tautanFolder = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

function Banner({ warna, children }: { warna: 'merah' | 'kuning' | 'info'; children: React.ReactNode }) {
  const v = warna === 'merah' ? 'bad' : warna === 'kuning' ? 'warn' : 'info';
  return (
    <div style={{
      border: `1px solid var(--ap-${v}-line)`, background: `var(--ap-${v}-bg)`, color: 'var(--ap-fg)',
      borderRadius: 10, padding: '10px 14px', fontSize: 12.5, lineHeight: 1.55, marginBottom: 14,
    }}>{children}</div>
  );
}

function HasilUjiTabel({ hasil }: { hasil: HasilUji }) {
  return (
    <div className="ap-table-wrap" style={{ marginTop: 12 }}>
      <table className="ap-table">
        <thead><tr><th>Tujuan</th><th>Hasil</th><th>Berkas lama</th><th>Keterangan</th></tr></thead>
        <tbody>
          {hasil.tujuan.map((t) => (
            <tr key={t.tujuan}>
              <td>{LABEL_TUJUAN[t.tujuan]}</td>
              <td>
                {t.ok ? <span className="ap-badge badge-green">OK{t.ms != null ? ` · ${t.ms} ms` : ''}</span>
                  : t.kode === 'kosong' ? <span className="ap-badge badge-gray">BELUM DIATUR</span>
                  : <span className="ap-badge badge-red">GAGAL</span>}
              </td>
              <td>{t.lama.diperiksa ? `${t.lama.terbaca}/${t.lama.diperiksa} terbaca` : '—'}</td>
              <td style={{ fontSize: 12, color: 'var(--ap-fg2)' }}>
                {t.kode ? SARAN_KODE[t.kode as KodeUji] : ''}
                {t.pesan ? <div style={{ color: 'var(--ap-dim)', marginTop: 2 }}>{t.pesan}</div> : null}
                {t.sisaProbe ? <div style={{ color: 'var(--ap-warn-fg)', marginTop: 2 }}>Berkas uji tidak terhapus: {t.sisaProbe}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TabDriveBackup() {
  const [s, setS] = useState<StatusDrive | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [isian, setIsian] = useState('');
  const [sibuk, setSibuk] = useState<'uji' | 'induk' | null>(null);
  const [hasilBaru, setHasilBaru] = useState<HasilUji | null>(null);

  const muat = useCallback(async () => {
    const r = await fetchJson<StatusDrive>('/api/admin/drive');
    if (!r.ok) { setGalat(r.message); return; }
    setGalat(null);
    const st = r as unknown as StatusDrive;
    setS(st);
    setIsian((lama) => lama || (st.induk.asal === 'panel' ? st.induk.id : ''));
  }, []);

  useEffect(() => { const t = setTimeout(() => { void muat(); }, 0); return () => clearTimeout(t); }, [muat]);

  async function uji() {
    setSibuk('uji');
    try {
      const r = await fetchJson<{ hasil: HasilUji }>('/api/admin/drive', { method: 'POST', body: JSON.stringify({ aksi: 'uji' }) });
      if (!r.ok) { toast.error(r.message); return; }
      const hasil = (r as unknown as { hasil: HasilUji }).hasil;
      setHasilBaru(hasil);
      const gagal = hasil.tujuan.filter((t) => !t.ok && t.kode !== 'kosong').length;
      if (gagal) toast.error(`${gagal} tujuan gagal diuji — lihat tabel hasil.`); else toast.success('Semua tujuan yang diatur lulus uji.');
      void muat();
    } finally { setSibuk(null); }
  }

  async function simpanInduk(nilai: string) {
    const v = bacaIdFolder(nilai);
    const ok = await confirmDialog({
      title: v ? 'Pakai folder induk ini?' : 'Kosongkan folder induk?',
      message: v
        ? 'Unggahan & backup BERIKUTNYA masuk subfolder di dalam folder ini (dibuat sendiri). Berkas lama tidak dipindah dan tetap terbuka.\n\nPastikan foldernya "Restricted" di Google Drive — subfolder mewarisi aksesnya.'
        : 'Isian panel dihapus. PRIMA kembali memakai GOOGLE_DRIVE_FOLDER_ID_ROOT di .env.local, atau folder per tujuan bila itu juga kosong.',
      confirmLabel: v ? 'Pakai' : 'Kosongkan',
    });
    if (!ok) return;
    setSibuk('induk');
    try {
      const r = await fetchJson('/api/admin/drive', { method: 'POST', body: JSON.stringify({ aksi: 'atur_induk', folder_id: v }) });
      if (!r.ok) { toast.error(r.message); return; }
      toast.success(v ? 'Folder induk disimpan. Tekan UJI SEKARANG untuk membuat & memeriksa subfolder.' : 'Folder induk panel dikosongkan.');
      setIsian(v);
      void muat();
    } finally { setSibuk(null); }
  }

  if (galat) return <Banner warna="merah">{galat}</Banner>;
  if (!s) return <div style={{ fontSize: 12, color: 'var(--ap-dim)' }}>Memuat…</div>;

  const uji_ = hasilBaru ?? s.ujiTerakhir;
  const kuota = uji_?.akun;

  return (
    <div>
      <div className="ap-section-title">DRIVE &amp; BACKUP</div>

      {!s.tabelAda && (
        <Banner warna="kuning">
          Tabel catatan Drive belum ada — jalankan <code>docs/migrations/migration-drive-arsip.sql</code> di MySQL server.
          Sampai itu, unggahan tetap jalan tapi kesehatan & daftar backup di bawah kosong.
        </Banner>
      )}
      {s.backup.tingkat !== 'aman' && (
        <Banner warna={s.backup.tingkat === 'merah' ? 'merah' : s.backup.tingkat === 'kuning' ? 'kuning' : 'info'}>
          {s.backup.kalimat} Panduan: <code>docs/PANDUAN-jadwal-backup.md</code>.
        </Banner>
      )}

      <div className="ap-card" style={{ marginBottom: 16 }}>
        <div className="ap-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><HardDrive size={14} /> Folder induk</div>
        <div style={{ fontSize: 12.5, color: 'var(--ap-fg2)', marginBottom: 10, lineHeight: 1.6 }}>
          {s.induk.id
            ? <>Berlaku: <a href={tautanFolder(s.induk.id)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ap-aksen)' }}>{potongId(s.induk.id)}</a>{' '}
                <span className="ap-badge badge-cyan">{s.induk.asal === 'panel' ? 'DARI PANEL' : 'DARI .env.local'}</span>
                {' '}— tiap tujuan memakai subfolder sendiri di dalamnya, mengalahkan GOOGLE_DRIVE_FOLDER_ID_* lainnya.</>
            : <>Tidak dipakai — tiap tujuan memakai GOOGLE_DRIVE_FOLDER_ID_* di <code>.env.local</code>.</>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input className="ap-input" value={isian} onChange={(e) => setIsian(e.target.value)} placeholder="Tempel URL folder Drive atau ID-nya"
            aria-label="ID folder induk Drive" style={{ flex: '1 1 280px', maxWidth: 420, fontFamily: "'JetBrains Mono', monospace" }} />
          <PrimaButton variant="primary" size="sm" iconLeft={<Save size={12} />} disabled={sibuk !== null || !isian.trim()} onClick={() => void simpanInduk(isian)}>Simpan</PrimaButton>
          {s.induk.asal === 'panel' && (
            <PrimaButton variant="ghost" size="sm" disabled={sibuk !== null} onClick={() => void simpanInduk('')}>Kosongkan</PrimaButton>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ap-dim)', marginTop: 8 }}>
          Berkas lama tidak dipindah — dibuka lewat ID-nya, jadi tetap terbaca. Atur foldernya &quot;Restricted&quot; di Drive: subfolder mewarisi aksesnya.
        </div>
      </div>

      <div className="ap-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="ap-card-title" style={{ margin: 0 }}>Sambungan Google Drive</div>
          <PrimaButton variant="success" size="sm" iconLeft={<PlayCircle size={12} />} disabled={sibuk !== null} onClick={() => void uji()}>
            {sibuk === 'uji' ? 'Menguji…' : 'UJI SEKARANG'}
          </PrimaButton>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ap-fg2)', marginTop: 10, lineHeight: 1.6 }}>
          {uji_ ? <>
            Uji terakhir {uji_.waktu}
            {kuota?.email ? <> · akun <b>{kuota.email}</b></> : null}
            {kuota ? <> · terpakai {ukuranBerkas(kuota.terpakai)}{kuota.batas ? ` dari ${ukuranBerkas(kuota.batas)}` : ''}
              {kuota.batas && kuota.terpakai != null && kuota.terpakai / kuota.batas > 0.8 ? <span className="ap-badge badge-yellow" style={{ marginLeft: 6 }}>HAMPIR PENUH</span> : null}</> : null}
            {uji_.galatAkun ? <div style={{ color: 'var(--ap-bad-fg)' }}>Akun tidak terbaca: {uji_.galatAkun}</div> : null}
          </> : 'Belum pernah diuji.'}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ap-dim)', marginTop: 6 }}>
          Uji menulis, membaca, lalu menghapus satu berkas kecil di tiap folder, dan memeriksa berkas LAMA tertua & terbaru masih terbaca.
          Dengan folder induk, subfolder yang belum ada ikut dibuat.
        </div>
        {uji_ && <HasilUjiTabel hasil={uji_} />}
      </div>

      <div className="ap-card" style={{ marginBottom: 16 }}>
        <div className="ap-card-title">Kesehatan per tujuan</div>
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead><tr><th>Tujuan</th><th>Folder</th><th>Terakhir berhasil</th><th>Terakhir gagal</th></tr></thead>
            <tbody>
              {s.tujuan.map((t) => (
                <tr key={t.tujuan}>
                  <td>{LABEL_TUJUAN[t.tujuan]}</td>
                  <td>
                    {!t.terkonfigurasi ? <span className="ap-badge badge-gray">BELUM DIATUR</span>
                      : t.folderId ? <a href={tautanFolder(t.folderId)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ap-aksen)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>{potongId(t.folderId)}</a>
                      : <span style={{ fontSize: 11.5, color: 'var(--ap-dim)' }}>dibuat saat pertama dipakai</span>}
                  </td>
                  <td>{t.kesehatan?.terakhir_ok ?? '—'}{t.kesehatan?.jumlah_ok ? <span style={{ color: 'var(--ap-dim)' }}> · {t.kesehatan.jumlah_ok}×</span> : null}</td>
                  <td style={{ fontSize: 12 }}>
                    {t.kesehatan?.terakhir_gagal ? <>
                      <span style={{ color: (t.kesehatan.terakhir_ok ?? '') < t.kesehatan.terakhir_gagal ? 'var(--ap-bad-fg)' : 'var(--ap-dim)' }}>{t.kesehatan.terakhir_gagal}</span>
                      {t.kesehatan.kode ? <div style={{ color: 'var(--ap-fg2)' }}>{SARAN_KODE[t.kesehatan.kode as KodeUji] ?? t.kesehatan.kode}</div> : null}
                      {t.kesehatan.pesan ? <div style={{ color: 'var(--ap-dim)' }}>{t.kesehatan.pesan}</div> : null}
                    </> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ap-card">
        <div className="ap-card-title">Backup database terbaru</div>
        {s.arsip.length === 0
          ? <div style={{ fontSize: 12, color: 'var(--ap-dim)' }}>Belum ada backup yang tercatat. Jalankan <code>node scripts/backup-db.js</code> di server.</div>
          : <div className="ap-table-wrap">
              <table className="ap-table">
                <thead><tr><th>Berkas</th><th>Ukuran</th><th>Diunggah</th><th>SHA-256</th></tr></thead>
                <tbody>
                  {s.arsip.map((a) => (
                    <tr key={a.file_id}>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>{a.nama}</td>
                      <td>{ukuranBerkas(a.ukuran)}</td>
                      <td>{a.dibuat ?? '—'}</td>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>{a.sha256 ? a.sha256.slice(0, 8) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>}
        <div style={{ fontSize: 11.5, color: 'var(--ap-dim)', marginTop: 8 }}>
          Memulihkan: unduh berkasnya dari Drive lalu ikuti <code>docs/BACKUP-RESTORE.md</code> §Restore. Uji restore minimal tiap 6 bulan.
        </div>
      </div>
    </div>
  );
}

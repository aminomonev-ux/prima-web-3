'use client';
// Cetak & Excel (docs/CONCEPT-bba-buku-aset.md §9, §14). Tahap B: KIB A–F format provinsi persis;
// KIR, hasil sensus, Rekap BMD, Buku Inventaris & format kerja PRIMA menyusul (Tahap C), daftar
// rencana per tahun (Tahap D).
import { FileSpreadsheet } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { GOLONGAN, NAMA_GOLONGAN, JUDUL_KIB, type Golongan } from '@/lib/bba/kib';
import type { InfoBeku } from '@/lib/security/beku';
import BbaShell from '../_components/BbaShell';
import type { PetaIzinLayar } from '../_components/BbaNav';

const MONO = "'JetBrains Mono', ui-monospace, monospace";

type Props = { username: string; role: string; themePreference: 'dark' | 'light'; beku: InfoBeku; izin: PetaIzinLayar; perGolongan: Record<Golongan, number> };

export default function CetakClient({ username, role, themePreference, beku, izin, perGolongan }: Props) {
  const total = Object.values(perGolongan).reduce((s, n) => s + n, 0);
  return (
    <BbaShell username={username} role={role} themePreference={themePreference} beku={beku} izin={izin} aktif="cetak" remah="Cetak & Excel">
      {c => {
        const kartu = (judul: string, ket: string, n: number, href: string) => (
          <div key={href} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <FileSpreadsheet size={22} style={{ color: '#1D9E75', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{judul}</div>
              <div style={{ fontSize: 11.5, color: c.sub }}>{ket} · <span style={{ fontFamily: MONO }}>{n.toLocaleString('id-ID')}</span> register</div>
            </div>
            {/* Berkas dikirim server dengan Content-Disposition attachment — halaman tidak berpindah. */}
            {n > 0
              ? <PrimaButton variant="success" size="sm" onClick={() => { window.location.href = href; }}>Unduh Excel</PrimaButton>
              : <span style={{ fontSize: 11.5, color: c.sub }}>kosong</span>}
          </div>
        );
        return (<>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>🖨️ Cetak & Excel</h1>
          <div style={{ fontSize: 12.5, color: c.sub, marginBottom: 16, lineHeight: 1.6 }}>
            Bentuknya sama dengan ekspor sistem aset provinsi: kop, kepala tiga baris, nomor kolom, baris Jumlah, dan tanda tangan Kepala SKPD &amp; Pengurus Barang
            (diatur di Master → Pengaturan). Hanya aset aktif; yang sudah dihapus tidak ikut.
          </div>
          <div style={{ fontSize: 11, color: c.sub, fontWeight: 600, margin: '4px 0 8px' }}>KARTU INVENTARIS BARANG</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 10, marginBottom: 12 }}>
            {GOLONGAN.map(g => kartu(`KIB ${g} — ${NAMA_GOLONGAN[g]}`, JUDUL_KIB[g].replace(/^KARTU INVENTARIS BARANG \(KIB\) /, ''), perGolongan[g], `/api/buku-besar-aset/aset/excel?golongan=${g}`))}
            {kartu('KIB A–F sekaligus', 'enam lembar dalam satu berkas', total, '/api/buku-besar-aset/aset/excel?golongan=SEMUA')}
          </div>
          <div style={{ fontSize: 11.5, color: c.sub }}>KIR per ruangan, hasil sensus, Rekap BMD, Buku Inventaris, dan daftar rencana per tahun menyusul di tahap berikutnya.</div>
        </>);
      }}
    </BbaShell>
  );
}

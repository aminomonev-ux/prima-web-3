'use client';
// components/ui/SpandukBeku.tsx — spanduk "modul dibekukan" (P5, Tahap 9).
//
// BERKAS DAUN: ia menerima keterangan yang SUDAH jadi dari server dan tidak mengimpor
// apa pun kecuali React. Satu impor nilai dari berkas ber-mysql2 di sini akan menyeret
// seluruh lapisan server ke bundel peramban dan merobohkan layar yang memuatnya —
// preseden Tahap 5, dengan `tsc` dan ESLint sama-sama lulus.
//
// Dipakai dua shell (BLUD, PK). Satu komponen, bukan dua salinan: dua kalimat yang
// menjelaskan hal yang sama pasti mulai berbeda begitu salah satunya disunting (L78).
import { Snowflake } from 'lucide-react';

type Props = {
  beku: boolean;
  /** Peran ini menembus pembekuan — kalimatnya berbeda, spanduknya tetap tampil. */
  tembus: boolean;
  pesan: string;
  sampai: string;
};

export default function SpandukBeku({ beku, tembus, pesan, sampai }: Props) {
  if (!beku) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '11px 14px', marginBottom: 14, borderRadius: 8,
      background: 'rgba(55,138,221,.12)', border: '1px solid rgba(55,138,221,.35)',
      color: '#378ADD', fontSize: 12, lineHeight: 1.6,
    }}>
      <Snowflake size={15} style={{ flex: '0 0 auto', marginTop: 2 }}/>
      <div>
        <b>Modul sedang dibekukan.</b>{' '}
        {tembus
          // Ditulis apa adanya. SUPER_ADMIN yang tidak diberi tahu akan mencoba
          // menyimpan, berhasil, lalu menyimpulkan pembekuannya tidak bekerja.
          ? <>Membuka, membaca, dan mencetak tetap bisa untuk semua orang; menyimpan ditutup —
              <b> kecuali untuk Anda</b>, karena SUPER_ADMIN menembus sakelar. Ujilah dengan akun lain.</>
          : <>Membuka, membaca, dan mencetak tetap bisa. Menyimpan ditutup sementara, jadi
              tombol simpan &amp; hapus dimatikan.</>}
        {pesan && <div style={{ marginTop: 6, whiteSpace: 'pre-line' }}>{pesan}</div>}
        {sampai && (
          <div style={{ marginTop: 4, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>
            Diperkirakan selesai {sampai}
          </div>
        )}
      </div>
    </div>
  );
}

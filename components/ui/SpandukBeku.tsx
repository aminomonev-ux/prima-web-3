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
  /**
   * P12 — yang membekukan sakelar SELURUH APLIKASI, bukan sakelar modul ini.
   *
   * `infoBeku` sudah memulangkan bedanya sejak Tahap 12, tapi spanduk ini tidak pernah
   * memakainya: pembekuan global berbunyi "Modul sedang dibekukan", lalu orang bertanya
   * ke penanggung jawab modulnya tentang sesuatu yang hari itu berlaku di mana-mana.
   * Aturan 11.3 — layar menyebut SEBABNYA, bukan cuma akibatnya.
   */
  global?: boolean;
};

export default function SpandukBeku({ beku, tembus, pesan, sampai, global }: Props) {
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
        <b>{global ? 'Seluruh aplikasi sedang dibekukan.' : 'Modul sedang dibekukan.'}</b>{' '}
        {tembus
          // Ditulis apa adanya. SUPER_ADMIN yang tidak diberi tahu akan mencoba
          // menyimpan, berhasil, lalu menyimpulkan pembekuannya tidak bekerja.
          ? <>Membuka, membaca, dan mencetak tetap bisa untuk semua orang; menyimpan ditutup —
              <b> kecuali untuk Anda</b>, karena SUPER_ADMIN menembus sakelar. Ujilah dengan akun lain.</>
          // Dulu berbunyi "tombol simpan & hapus dimatikan". Tidak pernah benar: `beku`
          // di BLUD & PK dipakai HANYA untuk merender spanduk ini, dan di enam modul
          // berikutnya juga. Akibatnya orang membaca "tombolnya mati", menekan tombol
          // yang jelas-jelas hidup, lalu menerima galat umum ("Gagal membuat dokumen")
          // yang tidak menyebut pembekuan sama sekali — persis kebingungan yang spanduk
          // ini dibuat untuk mencegah, dan spanduknya sendiri yang mengantar ke sana.
          // Yang benar: pagarnya di API (503), bukan di tombol (L82).
          : <>Membuka, membaca, dan mencetak tetap bisa. Menyimpan ditolak sampai
              pembekuan selesai — tombolnya masih bisa ditekan, tapi simpanannya akan
              gagal.</>}
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

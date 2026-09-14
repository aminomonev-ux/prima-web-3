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
import { Lock } from 'lucide-react';

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
  /** Tahap 14a — nama bagian yang dibekukan kalau sebabnya sub-sakelar ("Realisasi BLUD"). */
  bagian?: string;
};

export default function SpandukBeku({ beku, tembus, pesan, sampai, global, bagian }: Props) {
  if (!beku) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '11px 14px', marginBottom: 14, borderRadius: 8,
      background: 'rgba(55,138,221,.12)', border: '1px solid rgba(55,138,221,.35)',
      color: '#378ADD', fontSize: 12, lineHeight: 1.6,
    }}>
      <Lock size={15} style={{ flex: '0 0 auto', marginTop: 2 }}/>
      <div>
        <b>{global ? 'Seluruh aplikasi sedang dalam mode hanya baca.' : bagian ? `${bagian} sedang dalam mode hanya baca.` : 'Modul ini sedang dalam mode hanya baca.'}</b>{' '}
        {tembus
          // Ditulis apa adanya. SUPER_ADMIN yang tidak diberi tahu akan mencoba
          // menyimpan, berhasil, lalu menyimpulkan sakelarnya tidak bekerja.
          ? <>Semua orang tetap bisa membuka, membaca, dan mencetak, tapi tidak bisa menyimpan.
              <b> Anda masih bisa menyimpan</b> karena Anda Super Admin. Untuk memastikan, coba dengan akun lain.</>
          // Tahap 14b (K1=C): tombol simpan BENAR-BENAR mati di kesembilan modul, dan
          // tindakan tulis lain ditolak API dengan pesan yang terbaca (Tahap 13).
          : <>Anda tetap bisa membuka, membaca, dan mencetak. Tombol simpan dimatikan sampai
              mode ini selesai. Perubahan lain yang dicoba juga akan ditolak.</>}
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

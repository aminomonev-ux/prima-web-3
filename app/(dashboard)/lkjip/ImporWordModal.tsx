'use client';

// Impor dari Word (docs/CONCEPT-lkjip-impor-word.md §3): pilih berkas → pratinjau + koreksi → Buat.
// Isi dokumen tidak pernah dikirim dari sini: server membaca ulang berkas yang sama saat Buat,
// layar hanya mengirim koreksi + sidik berkas yang dipratinjau.
import { useState } from 'react';
import { toast } from 'sonner';
import { FileUp, Table2, Image as ImageIcon, BarChart3, AlignLeft, AlertTriangle, PenLine } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import {
  BATAS_BERKAS_IMPOR, PESAN_TERLALU_BESAR, JENIS_PENANDA, LABEL_PENANDA,
  type JenisPenanda, type Koreksi, type PratinjauImpor, type BarisPratinjau,
} from '@/lib/lkjip/impor-word-jenis';

interface Props { tahunAwal: number; onTutup: () => void; onSelesai: (id: number) => void }

type Jawaban = { ok: boolean; msg?: string; code?: string; id?: number; peringatan?: string[] } & Partial<Omit<PratinjauImpor, 'peringatan'>>;
type Penanda = Extract<BarisPratinjau, { jenis: 'penanda' }>;
interface BarisTampil { kunci: string; b: BarisPratinjau; kedalaman: number; nomor: number | null; pen?: Penanda }

async function kirim(fd: FormData): Promise<Jawaban> {
  let res: Response;
  try { res = await fetch('/api/lkjip/impor', { method: 'POST', body: fd }); }
  catch { return { ok: false, msg: 'Gagal terhubung ke server.' }; }
  try { return (await res.json()) as Jawaban; }
  catch { return { ok: false, msg: `Server menjawab ${res.status} tanpa isi yang terbaca.` }; }
}

/** Keterangan objek digambar di baris objeknya; nomor objek urut seperti nomor yang akan dipakai LKJIP. */
function susunTampil(baris: BarisPratinjau[]): BarisTampil[] {
  const judulPenanda = new Map<number, Penanda>();
  for (const b of baris) if (b.jenis === 'penanda' && b.dipakai === 'judul') judulPenanda.set(b.id, b);
  const hitung: Record<string, number> = { Tabel: 0, Gambar: 0, Grafik: 0 };
  const out: BarisTampil[] = [];
  let terakhir = 0;
  baris.forEach((b, i) => {
    if (b.jenis === 'penanda') {
      if (b.dipakai === 'judul') return;
      if (b.kedalaman != null) terakhir = b.kedalaman;
      out.push({ kunci: `p${b.id}`, b, kedalaman: b.kedalaman ?? terakhir + 1, nomor: null });
    } else if (b.jenis === 'narasi') {
      out.push({ kunci: `n${i}`, b, kedalaman: b.kedalaman + 1, nomor: null });
    } else {
      const dimuat = !b.catatan.startsWith('tidak diimpor');
      out.push({
        kunci: `o${i}`, b, kedalaman: b.kedalaman + 1, nomor: dimuat ? ++hitung[b.objek] : null,
        pen: b.penanda != null ? judulPenanda.get(b.penanda) : undefined,
      });
    }
  });
  return out;
}

const IKON = { Tabel: Table2, Gambar: ImageIcon, Grafik: BarChart3 } as const;

export default function ImporWordModal({ tahunAwal, onTutup, onSelesai }: Props) {
  const [berkas, setBerkas] = useState<File | null>(null);
  const [tahun, setTahun] = useState(tahunAwal);
  const [tahunDisentuh, setTahunDisentuh] = useState(false);
  const [judul, setJudul] = useState('');
  const [koreksi, setKoreksi] = useState<Koreksi>({});
  const [pratinjau, setPratinjau] = useState<PratinjauImpor | null>(null);
  const [sibuk, setSibuk] = useState<'' | 'baca' | 'buat'>('');

  async function baca(file: File, kor: Koreksi) {
    if (file.size > BATAS_BERKAS_IMPOR) { toast.error(PESAN_TERLALU_BESAR); return; }
    setSibuk('baca');
    const fd = new FormData();
    fd.append('step', 'pratinjau');
    fd.append('file', file);
    fd.append('koreksi', JSON.stringify(kor));
    const j = await kirim(fd);
    setSibuk('');
    if (!j.ok || !j.sidik) { toast.error(j.msg ?? 'Berkas tidak terbaca.'); return; }
    const p = j as unknown as PratinjauImpor;
    setPratinjau(p);
    setKoreksi(kor);
    if (!tahunDisentuh && p.tahunTebakan) setTahun(p.tahunTebakan);
  }

  function ubahJenis(b: Penanda, jenis: JenisPenanda) {
    if (!berkas) return;
    const kor = { ...koreksi };
    if (jenis === b.otomatis) delete kor[b.id]; else kor[b.id] = jenis;
    void baca(berkas, kor);
  }

  async function buat() {
    if (!berkas || !pratinjau) return;
    setSibuk('buat');
    const fd = new FormData();
    fd.append('step', 'buat');
    fd.append('file', berkas);
    fd.append('koreksi', JSON.stringify(koreksi));
    fd.append('sidik', pratinjau.sidik);
    fd.append('tahun', String(tahun));
    if (judul.trim()) fd.append('judul', judul.trim());
    const j = await kirim(fd);
    setSibuk('');
    if (!j.ok || !j.id) {
      toast.error(j.msg ?? 'Gagal membuat dokumen.');
      if (j.code === 'PRATINJAU_BASI') { setPratinjau(null); setKoreksi({}); setBerkas(null); }
      return;
    }
    const n = j.peringatan?.length ?? 0;
    toast.success(`Dokumen E-LKJIP dibuat dari Word${n ? ` — ${n} catatan seperti di pratinjau` : ''}`);
    onSelesai(j.id);
  }

  const r = pratinjau?.ringkasan;
  const ttd = pratinjau?.kataPengantar.ttd;
  const tampil = pratinjau ? susunTampil(pratinjau.baris) : [];

  const pilihJenis = (b: Penanda) => (
    <select className="lk-iw-pilih" value={b.dipakai} disabled={!!sibuk} aria-label={`Jenis "${b.teks.slice(0, 40)}"`}
      onChange={e => ubahJenis(b, e.target.value as JenisPenanda)}>
      {JENIS_PENANDA.map(j => <option key={j} value={j}>{LABEL_PENANDA[j]}{j === b.otomatis ? ' (terbaca)' : ''}</option>)}
    </select>
  );

  return (
    <div className="lk-modal-bg" onClick={() => !sibuk && !pratinjau && onTutup()}>
      <style>{CSS}</style>
      <div className={`lk-iw${pratinjau ? ' lebar' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="lk-iw-kepala">
          <h3><FileUp size={18} /> Impor dari Word</h3>
          <p>Hasilnya selalu dokumen DRAFT <b>baru</b>. Dokumen yang sudah ada tidak disentuh.</p>
        </div>

        {!pratinjau ? (
          <div className="lk-iw-isi">
            <label className="lk-field">
              <span>Berkas Word (.docx, maks 9,5 MB)</span>
              <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={!!sibuk}
                onChange={e => setBerkas(e.target.files?.[0] ?? null)} />
            </label>
            <p className="lk-hint">Bab, sub-bab, narasi, tabel, gambar, dan Kata Pengantar dikenali dari gaya Judul dan keterangan &quot;Tabel n&quot; / &quot;Gambar n&quot; / &quot;Grafik n&quot;. Sebelum dokumen dibuat, Anda melihat pratinjau dan bisa membetulkan jenis tiap judul.</p>
          </div>
        ) : (
          <div className="lk-iw-isi lk-iw-grid">
            <div className="lk-iw-pohon" aria-busy={sibuk === 'baca'}>
              {tampil.map(({ kunci, b, kedalaman: k, nomor, pen }) => {
                if (b.jenis === 'penanda') {
                  const kelas = b.kedalaman === 0 ? 'bab' : b.kedalaman == null ? 'mati' : '';
                  return (
                    <div key={kunci} className={`lk-iw-baris ${kelas}`} style={{ paddingLeft: 10 + k * 18 }}>
                      <span className="lk-iw-teks">{b.teks || '(tanpa teks)'}</span>
                      {b.kedalaman == null && <span className="lk-iw-cat">{b.dipakai === 'buang' ? 'dibuang' : 'jadi narasi'}</span>}
                      {pilihJenis(b)}
                    </div>
                  );
                }
                if (b.jenis === 'narasi') {
                  return (
                    <div key={kunci} className="lk-iw-baris narasi" style={{ paddingLeft: 10 + k * 18 }}>
                      <AlignLeft size={12} /> <span>Narasi · {b.paragraf} paragraf</span>
                    </div>
                  );
                }
                const Ikon = IKON[b.objek];
                return (
                  <div key={kunci} className={`lk-iw-baris objek${nomor ? '' : ' gagal'}`} style={{ paddingLeft: 10 + k * 18 }}>
                    <Ikon size={13} />
                    <span className="lk-iw-teks"><b>{b.objek}{nomor ? ` ${nomor}` : ''}</b>{b.judul ? ` · ${b.judul}` : ' · (tanpa judul)'}</span>
                    {b.catatan && <span className="lk-iw-cat">{b.catatan}</span>}
                    {pen && pilihJenis(pen)}
                  </div>
                );
              })}
            </div>

            <div className="lk-iw-samping">
              <div className="lk-iw-kartu">
                <div className="lk-iw-nama">{pratinjau.namaBerkas}</div>
                <label className="lk-field">
                  <span>Tahun Laporan</span>
                  <PrimaNumberField value={tahun} min={2015} max={2100} onChange={e => { setTahunDisentuh(true); setTahun(Number(e.target.value)); }} />
                </label>
                <label className="lk-field">
                  <span>Judul dokumen</span>
                  <input className="lk-iw-input" value={judul} maxLength={255} placeholder={pratinjau.judulBerkas || `Laporan Kinerja Instansi Pemerintah Tahun ${tahun}`}
                    onChange={e => setJudul(e.target.value)} />
                </label>
              </div>
              {r && (
                <div className="lk-iw-kartu">
                  <div className="lk-iw-sub">Hasil baca</div>
                  <div className="lk-iw-angka">
                    <span>Bab</span><b>{r.bab}</b>
                    <span>Sub-bab</span><b>{r.sub}</b>
                    {r.subsub > 0 && <><span>Sub-sub-bab</span><b>{r.subsub}</b></>}
                    <span>Blok narasi</span><b>{r.narasi}</b>
                    <span>Tabel</span><b>{r.tabel}{r.tabelDitolak ? ` (+${r.tabelDitolak} tidak muat)` : ''}</b>
                    <span>Gambar</span><b>{r.gambar}{r.gambarDilewati ? ` (+${r.gambarDilewati} dilewati)` : ''}</b>
                    <span>Grafik</span><b>{r.grafik}</b>
                  </div>
                </div>
              )}
              <div className="lk-iw-kartu">
                <div className="lk-iw-sub"><PenLine size={12} /> Kata Pengantar</div>
                {pratinjau.kataPengantar.paragraf
                  ? <p className="lk-iw-kp">{pratinjau.kataPengantar.paragraf} paragraf → Pengaturan Dokumen.{ttd?.nama ? <> Tanda tangan: <b>{ttd.nama}</b>{ttd.nip ? ` · ${ttd.nip}` : ''}.</> : ' Tanda tangan tidak terbaca.'}</p>
                  : <p className="lk-iw-kp">Tidak dikenali — bisa diisi di Pengaturan Dokumen.</p>}
              </div>
              {pratinjau.peringatan.length > 0 && (
                <div className="lk-iw-kartu">
                  <div className="lk-iw-sub"><AlertTriangle size={12} /> Perlu diperhatikan ({pratinjau.peringatan.length})</div>
                  <ul className="lk-iw-ingat">{pratinjau.peringatan.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
              <p className="lk-hint">Ubah jenis sebuah judul di daftar kiri bila pengenalannya salah — pratinjau dibaca ulang. BAB I–IV berjudul standar dikunci seperti template standar.</p>
            </div>
          </div>
        )}

        <div className="lk-iw-kaki">
          {sibuk && <span className="lk-iw-sibuk">{sibuk === 'baca' ? 'Membaca berkas…' : 'Mengunggah gambar & menyusun dokumen…'}</span>}
          {pratinjau && <PrimaButton variant="ghost" size="sm" disabled={!!sibuk} onClick={() => { setPratinjau(null); setKoreksi({}); setBerkas(null); }}>Ganti berkas</PrimaButton>}
          <PrimaButton variant="ghost" size="sm" disabled={!!sibuk} onClick={onTutup}>Batal</PrimaButton>
          {!pratinjau
            ? <PrimaButton variant="purple" size="sm" disabled={!berkas || !!sibuk} onClick={() => berkas && void baca(berkas, {})}>{sibuk ? 'Membaca…' : 'Baca berkas'}</PrimaButton>
            : <PrimaButton variant="purple" size="sm" disabled={!!sibuk || !r || r.bab === 0} onClick={() => void buat()}>{sibuk === 'buat' ? 'Membuat…' : 'Buat dokumen'}</PrimaButton>}
        </div>
      </div>
    </div>
  );
}

const CSS = `
  .lk-iw { background: #042C53; border: 1px solid #0C447C; border-radius: 14px; width: 440px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); display: flex; flex-direction: column; }
  .lk-iw.lebar { width: 1080px; }
  .lk-iw-kepala { padding: 20px 22px 6px; }
  .lk-iw-kepala h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 16px; font-weight: 800; }
  .lk-iw-kepala p { margin: 0; font-size: 12px; color: #85B7EB; }
  .lk-iw-isi { padding: 12px 22px; overflow: auto; flex: 1; min-height: 0; }
  .lk-iw-isi input[type=file] { font-size: 12.5px; color: #B5D4F4; max-width: 100%; }
  .lk-iw-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
  .lk-iw-pohon { border: 1px solid #0C447C; border-radius: 10px; max-height: calc(100vh - 260px); overflow: auto; background: #020F1C; }
  .lk-iw-pohon[aria-busy=true] { opacity: .55; }
  .lk-iw-baris { display: flex; align-items: center; gap: 8px; padding: 5px 10px; border-bottom: 1px solid rgba(12,68,124,.55); font-size: 12.5px; color: #E6F1FB; min-height: 32px; }
  .lk-iw-baris.bab { font-weight: 800; color: #EF9F27; background: rgba(239,159,39,.06); }
  .lk-iw-baris.mati .lk-iw-teks { color: #85B7EB; text-decoration: line-through; text-decoration-color: rgba(133,183,235,.5); }
  .lk-iw-baris.narasi { color: #85B7EB; font-size: 11.5px; min-height: 26px; }
  .lk-iw-baris.objek { color: #B5D4F4; }
  .lk-iw-baris.gagal { color: #FCA5A5; }
  .lk-iw-teks { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .lk-iw-cat { font-size: 10.5px; color: #85B7EB; white-space: nowrap; }
  .lk-iw-pilih { background: #042C53; color: #E6F1FB; border: 1px solid #0C447C; border-radius: 6px; font-size: 11.5px; padding: 3px 4px; flex-shrink: 0; }
  .lk-iw-kartu { background: #020F1C; border: 1px solid #0C447C; border-radius: 10px; padding: 12px; margin-bottom: 10px; }
  .lk-iw-nama { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: #B5D4F4; margin-bottom: 10px; overflow-wrap: anywhere; }
  .lk-iw-input { background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; padding: 8px 10px; color: #E6F1FB; font-size: 13px; font-family: inherit; }
  .lk-iw-input:focus { outline: none; border-color: #185FA5; }
  .lk-iw-sub { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: #85B7EB; margin-bottom: 8px; }
  .lk-iw-angka { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; font-size: 12.5px; color: #B5D4F4; }
  .lk-iw-angka b { font-family: 'JetBrains Mono', monospace; color: #E6F1FB; text-align: right; }
  .lk-iw-kp { margin: 0; font-size: 12px; line-height: 1.5; color: #B5D4F4; }
  .lk-iw-ingat { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; line-height: 1.45; color: #FBBF24; }
  .lk-iw-kaki { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; padding: 14px 22px; border-top: 1px solid #0C447C; }
  .lk-iw-sibuk { margin-right: auto; font-size: 12px; color: #85B7EB; }
  @media (max-width: 860px) {
    .lk-iw-grid { grid-template-columns: 1fr; }
    .lk-iw-pohon { max-height: 50vh; }
    .lk-iw-baris { flex-wrap: wrap; }
  }
  [data-theme="light"] .lk-iw { background: #FFFFFF; border-color: rgba(0,0,0,.1); }
  [data-theme="light"] .lk-iw-kepala p, [data-theme="light"] .lk-iw-baris.narasi, [data-theme="light"] .lk-iw-cat, [data-theme="light"] .lk-iw-sub, [data-theme="light"] .lk-iw-sibuk { color: #6B7280; }
  [data-theme="light"] .lk-iw-pohon, [data-theme="light"] .lk-iw-kartu { background: #F9FAFB; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-iw-baris { color: #0F0F12; border-bottom-color: rgba(0,0,0,.08); }
  [data-theme="light"] .lk-iw-baris.bab { color: #B26B00; }
  [data-theme="light"] .lk-iw-baris.mati .lk-iw-teks { color: #6B7280; }
  [data-theme="light"] .lk-iw-baris.objek, [data-theme="light"] .lk-iw-angka, [data-theme="light"] .lk-iw-kp, [data-theme="light"] .lk-iw-nama, [data-theme="light"] .lk-iw-isi input[type=file] { color: #374151; }
  [data-theme="light"] .lk-iw-angka b { color: #0F0F12; }
  [data-theme="light"] .lk-iw-baris.gagal { color: #E24B4A; }
  [data-theme="light"] .lk-iw-pilih, [data-theme="light"] .lk-iw-input { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #0F0F12; }
  [data-theme="light"] .lk-iw-ingat { color: #B45309; }
  [data-theme="light"] .lk-iw-kaki { border-top-color: rgba(0,0,0,.1); }
`;

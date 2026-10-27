'use client';
// Impor KIB (docs/CONCEPT-bba-buku-aset.md §7.1): pilih berkas → pratinjau (server membaca &
// membandingkan, tanpa menulis) → Simpan mengunggah berkas yang SAMA sekali lagi; server membaca
// ulang lalu menulis dalam satu transaksi. Baris tidak pernah dikirim dari layar.
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { X, Upload } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { NAMA_GOLONGAN, type Golongan } from '@/lib/bba/kib';
import type { RingkasImpor, HasilSimpanImpor } from '@/lib/data/bba-aset';
import type { KopBaca, LembarBaca } from '@/lib/bba/kib-baca';
import type { WarnaBba } from './BbaShell';

const MONO = "'JetBrains Mono', ui-monospace, monospace";

type Pratinjau = { lembar: LembarBaca[]; peringatan: string[]; kop: KopBaca | null; jumlah: number; rencana: RingkasImpor };
type Tolak = { message: string; masalah?: string[]; peringatan?: string[] };

async function kirim(berkas: File, step: 'pratinjau' | 'simpan'): Promise<{ ok: true; isi: Record<string, unknown> } | { ok: false; isi: Tolak }> {
  const fd = new FormData();
  fd.append('file', berkas);
  try {
    const res = await fetch(`/api/buku-besar-aset/aset/impor?step=${step}`, { method: 'POST', body: fd });
    let isi: Record<string, unknown> = {};
    try { isi = await res.json(); } catch { isi = { message: `Server menjawab ${res.status}` }; }
    return res.ok && isi.ok ? { ok: true, isi } : { ok: false, isi: isi as Tolak };
  } catch {
    return { ok: false, isi: { message: 'Tidak bisa menghubungi server. Periksa jaringan, lalu coba lagi.' } };
  }
}

export default function ModalImporKib({ c, onTutup, onTersimpan }: { c: WarnaBba; onTutup: () => void; onTersimpan: () => void }) {
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null);
  const [tolak, setTolak] = useState<Tolak | null>(null);
  const [sibuk, setSibuk] = useState<'' | 'baca' | 'simpan'>('');
  const pilih = useRef<HTMLInputElement>(null);

  async function baca(f: File) {
    setBerkas(f); setPratinjau(null); setTolak(null); setSibuk('baca');
    try {
      const r = await kirim(f, 'pratinjau');
      if (r.ok) setPratinjau(r.isi as unknown as Pratinjau); else setTolak(r.isi);
    } finally { setSibuk(''); }
  }

  async function simpan() {
    if (!berkas) return;
    setSibuk('simpan');
    try {
      const r = await kirim(berkas, 'simpan');
      if (!r.ok) { setTolak(r.isi); setPratinjau(null); toast.error(r.isi.message || 'Gagal menyimpan'); return; }
      const t = (r.isi as { tersimpan: HasilSimpanImpor }).tersimpan;
      toast.success(`Impor selesai — ${t.baru} baru${t.cocok ? `, ${t.cocok} mengisi barang yang belum teregister` : ''}, ${t.berubah} diperbarui, ${t.sama} sama`);
      onTersimpan();
    } finally { setSibuk(''); }
  }

  const th: React.CSSProperties = { padding: '6px 8px', fontSize: 11, color: c.sub, textAlign: 'right', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: 12, borderBottom: `1px solid ${c.border}`, fontFamily: MONO, textAlign: 'right' };
  const p = pratinjau?.rencana;
  const adaPerubahan = !!p && p.perGolongan.some(g => g.baru + g.cocok + g.berubah > 0);

  return (
    <div onClick={() => sibuk !== 'simpan' && onTutup()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 14, width: 'min(760px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${c.border}` }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Impor KIB dari sistem aset provinsi</div>
          <button type="button" aria-label="Tutup" onClick={onTutup} disabled={sibuk === 'simpan'} style={{ background: 'none', border: 'none', color: c.text, cursor: 'pointer', padding: 4, display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12.5 }}>
          <div style={{ color: c.sub, lineHeight: 1.6 }}>
            Unggah berkas ekspor KIB (.xlsx, lembar KIBA … KIBF). PRIMA membaca kolomnya dari judul, mencocokkan aset lewat kode barang + register,
            lalu menampilkan apa yang akan berubah <b style={{ color: c.text }}>sebelum</b> menyimpan. Nama sehari-hari, ruangan, dan kondisi yang sudah dicek di PRIMA tidak ditimpa;
            register yang tidak ada di berkas hanya dilaporkan, tidak dihapus.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <PrimaButton variant="purple" onClick={() => pilih.current?.click()} disabled={!!sibuk}><Upload size={14} style={{ marginRight: 5, verticalAlign: -2 }} />{berkas ? 'Ganti berkas' : 'Pilih berkas'}</PrimaButton>
            {berkas && <span style={{ fontFamily: MONO, fontSize: 12 }}>{berkas.name}</span>}
            {sibuk === 'baca' && <span style={{ color: c.sub }}>Membaca berkas…</span>}
            <input ref={pilih} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void baca(f); }} />
          </div>

          {tolak && (
            <div style={{ border: '1px solid rgba(226,75,74,.5)', background: 'rgba(226,75,74,.08)', borderRadius: 10, padding: '10px 12px' }}>
              <b style={{ color: '#E24B4A' }}>{tolak.message}</b>
              {tolak.masalah?.length ? <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{tolak.masalah.map((m, i) => <li key={i}>{m}</li>)}</ul> : null}
              <div style={{ color: c.sub, marginTop: 6 }}>Tidak ada yang disimpan. Betulkan berkasnya, lalu pilih lagi.</div>
            </div>
          )}

          {pratinjau && p && (<>
            <div style={{ color: c.sub }}>
              Terbaca <b style={{ color: c.text, fontFamily: MONO }}>{pratinjau.jumlah.toLocaleString('id-ID')}</b> register dari lembar {pratinjau.lembar.map(l => `${l.nama} (${l.jumlah})`).join(', ')}
              {pratinjau.kop?.satuan_kerja ? <> · satuan kerja <b style={{ color: c.text }}>{pratinjau.kop.satuan_kerja}</b></> : null}.
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${c.border}`, borderRadius: 10 }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left' }}>Golongan</th><th style={th}>Baru</th><th style={th}>Mengisi belum teregister</th><th style={th}>Diperbarui</th><th style={th}>Sama</th>
                <th style={th}>Tak ada di berkas</th><th style={th}>Sudah dihapus di PRIMA</th>
              </tr></thead>
              <tbody>{p.perGolongan.map(g => (
                <tr key={g.golongan}>
                  <td style={{ ...td, textAlign: 'left', fontFamily: 'inherit' }}>KIB {g.golongan} · {NAMA_GOLONGAN[g.golongan as Golongan]}</td>
                  <td style={{ ...td, color: g.baru ? '#1D9E75' : undefined }}>{g.baru}</td>
                  <td style={{ ...td, color: g.cocok ? '#1D9E75' : undefined }}>{g.cocok}</td>
                  <td style={{ ...td, color: g.berubah ? '#EF9F27' : undefined }}>{g.berubah}</td>
                  <td style={td}>{g.sama}</td>
                  <td style={{ ...td, color: g.tidakDiBerkas ? '#BA7517' : undefined }}>{g.tidakDiBerkas}</td>
                  <td style={td}>{g.dihapusDiPrima}</td>
                </tr>
              ))}</tbody>
            </table>
            {p.contohCocok.length > 0 && (
              <details open>
                <summary style={{ cursor: 'pointer' }}>Barang diterima yang mendapat register dari berkas ({p.contohCocok.length}{p.contohCocok.length === 20 ? '+' : ''}) — dicocokkan lewat golongan, tahun perolehan, dan harga</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{p.contohCocok.map((x, i) => <li key={i}>{x.nama} <span style={{ fontFamily: MONO, color: c.sub }}>→ {x.register ?? ''}{x.tahun ? ` · ${x.tahun}` : ''}</span></li>)}</ul>
              </details>
            )}
            {p.contohBerubah.length > 0 && (
              <details>
                <summary style={{ cursor: 'pointer' }}>Yang diperbarui ({p.contohBerubah.length}{p.contohBerubah.length === 50 ? '+' : ''})</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{p.contohBerubah.map((x, i) => <li key={i}>{x.nama} <span style={{ fontFamily: MONO, color: c.sub }}>{x.register ?? ''}</span> — {x.kolom.join(', ')}</li>)}</ul>
              </details>
            )}
            {p.contohTidakDiBerkas.length > 0 && (
              <details>
                <summary style={{ cursor: 'pointer', color: '#BA7517' }}>Tercatat di PRIMA tapi tidak ada di berkas — mungkin sudah dihapus di provinsi, atau berkasnya ekspor sebagian</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{p.contohTidakDiBerkas.map((x, i) => <li key={i}>{x.nama} <span style={{ fontFamily: MONO, color: c.sub }}>{x.register ?? ''}{x.tahun ? ` · ${x.tahun}` : ''}</span></li>)}</ul>
              </details>
            )}
            {pratinjau.peringatan.length > 0 && (
              <div style={{ border: '1px solid rgba(186,117,23,.45)', background: 'rgba(186,117,23,.08)', borderRadius: 10, padding: '8px 12px' }}>
                <b style={{ color: '#BA7517' }}>Catatan pembacaan</b>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{pratinjau.peringatan.map((m, i) => <li key={i}>{m}</li>)}</ul>
              </div>
            )}
          </>)}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '10px 16px', borderTop: `1px solid ${c.border}`, flexWrap: 'wrap' }}>
          <PrimaButton variant="ghost" onClick={onTutup} disabled={sibuk === 'simpan'}>Batal</PrimaButton>
          <PrimaButton menulis variant="primary" onClick={() => void simpan()} disabled={!pratinjau || !adaPerubahan || !!sibuk}
            data-tooltip={pratinjau && !adaPerubahan ? 'Isi berkas sama dengan buku aset — tidak ada yang perlu disimpan' : undefined}>
            {sibuk === 'simpan' ? 'Menyimpan…' : 'Simpan impor'}
          </PrimaButton>
        </div>
      </div>
    </div>
  );
}

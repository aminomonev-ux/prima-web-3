'use client';
// "Ambil dari penawaran" di tab Referensi harga modal rencana (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A.2): daftar
// penawaran untuk barang rencana itu, termurah & yang masih berlaku di atas. Yang dipilih DISALIN ke isian referensi
// (`referensiDariPenawaran`) — berhenti di form; yang menulis tetap tombol Simpan item (L78).
import { useEffect, useState } from 'react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import { urutUntukRencana, referensiDariPenawaran, type ItemPenawaran } from '@/lib/bba/penawaran';
import { fmtTanggal } from '@/lib/bba/kondisi';
import type { ReferensiIsian } from '@/lib/bba/referensi';
import { Bingkai } from './AksiAset';
import type { WarnaBba } from './BbaShell';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

export default function AmbilPenawaran({ c, barangId, barangNama, sisa, sudah, onPakai, onTutup }: {
  c: WarnaBba; barangId: number; barangNama: string; sisa: number;
  /** Jejak penawaran yang sudah ada di isian — tidak ditawarkan dua kali. */
  sudah: ReadonlySet<number>;
  onPakai: (refs: ReferensiIsian[]) => void; onTutup: () => void;
}) {
  const [daftar, setDaftar] = useState<Array<ItemPenawaran & { berlaku: boolean }> | null>(null);
  const [pilih, setPilih] = useState<Set<number>>(new Set());
  useEffect(() => {
    let batal = false;
    void fetchJson<unknown>(`/api/buku-besar-aset/penawaran?barang=${barangId}`).then(d => {
      if (!batal) setDaftar(d.ok ? urutUntukRencana((d as unknown as { item: ItemPenawaran[] }).item, tanggalHariIniWIB()) : []);
    });
    return () => { batal = true; };
  }, [barangId]);
  const tawar = (daftar ?? []).filter(i => !sudah.has(i.id));
  const penuh = pilih.size >= sisa;

  return (
    <Bingkai c={c} judul={`Ambil dari penawaran — ${barangNama}`} lebar={760} onTutup={onTutup}
      sub={sisa > 0 ? `Bisa ditambah ${sisa} referensi lagi` : 'Referensi sudah penuh'}
      kaki={<>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton variant="purple" disabled={pilih.size === 0} onClick={() => onPakai(tawar.filter(i => pilih.has(i.id)).map(referensiDariPenawaran))}>Pakai {pilih.size} penawaran</PrimaButton>
      </>}>
      {daftar === null ? <div style={{ fontSize: 12.5, color: c.sub }}>Memuat penawaran…</div>
        : tawar.length === 0 ? <div style={{ fontSize: 12.5, color: c.sub }}>Belum ada penawaran rekanan untuk barang ini{daftar.length ? ' yang belum dipakai' : ''}. Catat suratnya di menu Penawaran, atau ketik referensi manual.</div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tawar.map(i => (
              <label key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', border: `1px solid ${c.border}`, borderRadius: 8, cursor: 'pointer', opacity: i.berlaku ? 1 : .6 }}>
                <input type="checkbox" checked={pilih.has(i.id)} disabled={!pilih.has(i.id) && penuh}
                  onChange={e => setPilih(p => { const x = new Set(p); if (e.target.checked) x.add(i.id); else x.delete(i.id); return x; })} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                  <b>{i.rekanan}</b>{i.merk_tipe ? ` · ${i.merk_tipe}` : ''}
                  <div style={{ fontSize: 11.5, color: c.sub }}>
                    {[i.nomor_surat ? `No. ${i.nomor_surat}` : null, `surat ${fmtTanggal(i.tgl_surat)}`, i.berlaku_sampai ? `berlaku s.d. ${fmtTanggal(i.berlaku_sampai)}` : null, i.satuan, i.spesifikasi].filter(Boolean).join(' · ')}
                    {!i.berlaku && <b style={{ color: '#BA7517' }}> · kedaluwarsa</b>}
                    {!i.file_id && <span style={{ color: '#BA7517' }}> · tanpa berkas surat (belum dihitung sah sampai diberi berkas/tautan)</span>}
                  </div>
                </span>
                <span style={{ fontFamily: MONO, fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtRp(i.harga_satuan)}</span>
              </label>
            ))}
          </div>
        )}
    </Bingkai>
  );
}

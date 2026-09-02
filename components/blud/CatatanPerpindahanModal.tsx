'use client'
// components/blud/CatatanPerpindahanModal.tsx — mencatat uang berpindah dari
// rekening mana ke rekening mana. Aturannya: lib/blud/mutasi.ts
// Konsep: docs/CONCEPT-blud-catatan-perpindahan.md
//
// BERHENTI DI FORM, seperti Impor (L78), Salin Versi (L80), dan Tutup Pergeseran
// (L82): modal ini mengubah isi layar, yang menulis ke basis data tetap tombol
// Simpan di halaman. Nol jalur tulis baru — jadi izin menu, sakelar maintenance,
// kunci setahun, dan angka kunci berlaku dengan sendirinya, dan hak mencatat
// perpindahan sama dengan hak menyunting pergeseran tanpa satu guard baru.
import { useMemo, useState } from 'react'
import { X, Shuffle, AlertTriangle, ArrowRight } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import DeleteButton from '@/components/ui/DeleteButton'
import { InputNominal } from '@/components/ui/input-nominal'
import { formatRupiah } from '@/lib/blud/format'
import { formatTanggalId } from '@/lib/blud/tanggal'
import {
  periksaMutasi, periksaSasaranMutasi, totalMutasi,
  type MutasiInput, type TebakanPasangan,
} from '@/lib/blud/mutasi'
import type { PergeseranBarisInput } from '@/types'

interface Pilihan { row_id: string; label: string; selisih: number }

/** Baris yang boleh jadi asal/tujuan: DAUN saja, dan harus ada di dokumen ini. */
function pilihanBaris(rows: readonly PergeseranBarisInput[]): Pilihan[] {
  const punyaAnak = new Set<string>()
  for (const r of rows) if (r.parent_id) punyaAnak.add(r.parent_id)
  return rows
    .filter(r => !punyaAnak.has(r.row_id))
    .map(r => ({
      row_id: r.row_id,
      label: `${r.kode_rekening ? r.kode_rekening + ' — ' : ''}${r.uraian || '(tanpa uraian)'}`,
      selisih: Number(r.pergeseran ?? 0) - Number(r.jumlah ?? 0),
    }))
}

const BARIS_KOSONG: MutasiInput = { dari_row: '', ke_row: '', nilai: 0, keterangan: '' }

export default function CatatanPerpindahanModal({
  versi, rows, awal, fokusRow, tebakan, onTutup, onTerapkan,
}: {
  /** Tanggal versi yang sedang disunting — keterangan, bukan pilihan. */
  versi:      string
  rows:       readonly PergeseranBarisInput[]
  awal:       readonly MutasiInput[]
  /** Baris yang membuka modal (pintu 2 / pintu 3) — dipakai menyiapkan barisnya. */
  fokusRow?:  string | null
  /** Tebakan pintu 0 — hanya terisi kalau jawabannya tunggal. */
  tebakan?:   TebakanPasangan | null
  onTutup:    () => void
  onTerapkan: (mutasi: MutasiInput[]) => void
}) {
  const pilihan = useMemo(() => pilihanBaris(rows), [rows])

  const [daftar, setDaftar] = useState<MutasiInput[]>(() => {
    const isi = awal.map(m => ({ ...m }))
    if (isi.length === 0 && tebakan) {
      return [{ dari_row: tebakan.dari_row, ke_row: tebakan.ke_row, nilai: tebakan.nilai, keterangan: '' }]
    }
    if (fokusRow && !isi.some(m => m.dari_row === fokusRow || m.ke_row === fokusRow)) {
      // Sisi mana yang diisi ditentukan arah geseran barisnya: yang pagunya NAIK
      // adalah penerima. Menebak sisi yang salah memaksa orang membetulkan dua
      // kotak, bukan satu.
      const b = pilihan.find(p => p.row_id === fokusRow)
      const naik = (b?.selisih ?? 0) > 0
      isi.push({
        ...BARIS_KOSONG,
        [naik ? 'ke_row' : 'dari_row']: fokusRow,
        nilai: Math.abs(b?.selisih ?? 0),
      } as MutasiInput)
    }
    return isi.length ? isi : [{ ...BARIS_KOSONG }]
  })

  /** Baris yang belum lengkap tidak ikut dinilai maupun disimpan. */
  const terisi = useMemo(
    () => daftar.filter(m => m.dari_row && m.ke_row && Number(m.nilai) > 0),
    [daftar],
  )
  const sasaranSalah = useMemo(() => periksaSasaranMutasi(rows, terisi), [rows, terisi])
  const tidakCocok   = useMemo(() => periksaMutasi(rows, terisi), [rows, terisi])
  const beres        = sasaranSalah.length === 0 && tidakCocok.length === 0

  const ubah = (i: number, patch: Partial<MutasiInput>) =>
    setDaftar(prev => prev.map((m, j) => (j === i ? { ...m, ...patch } : m)))

  const namaBaris = (rowId: string) => pilihan.find(p => p.row_id === rowId)?.label ?? rowId

  return (
    <div
      onClick={onTutup}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="blud-imp-text"
        style={{ background: 'var(--surface-card, #042C53)', borderRadius: 14, width: 'min(860px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <Shuffle size={17} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Catatan Perpindahan</div>
            <div className="blud-imp-muted" style={{ fontSize: 11.5 }}>
              {versi ? `Versi ${formatTanggalId(versi)}` : 'Versi baru'}
            </div>
          </div>
          <button onClick={onTutup} aria-label="Tutup" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: .7 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className={beres ? 'cp-strip ok' : 'cp-strip bad'}>
            {beres
              ? `${terisi.length} perpindahan · Rp ${formatRupiah(totalMutasi(terisi))} · cocok dengan pagu`
              : `${sasaranSalah.length + tidakCocok.length} hal perlu dibetulkan`}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="cp-tabel">
              <thead>
                <tr>
                  <th style={{ width: '31%' }}>Dari</th>
                  <th style={{ width: '31%' }}>Ke</th>
                  <th style={{ width: '18%', textAlign: 'right' }}>Nilai</th>
                  <th style={{ width: '20%' }}>Keterangan</th>
                  <th style={{ width: 44 }}></th>
                </tr>
              </thead>
              <tbody>
                {daftar.map((m, i) => (
                  <tr key={i}>
                    <td>
                      <select value={m.dari_row} onChange={e => ubah(i, { dari_row: e.target.value })}>
                        <option value="">— Pilih rekening asal —</option>
                        {pilihan.map(p => <option key={p.row_id} value={p.row_id}>{p.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={m.ke_row} onChange={e => ubah(i, { ke_row: e.target.value })}>
                        <option value="">— Pilih rekening tujuan —</option>
                        {pilihan.map(p => <option key={p.row_id} value={p.row_id}>{p.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <InputNominal
                        value={Number(m.nilai) || 0}
                        onChange={v => ubah(i, { nilai: v })}
                        style={{ textAlign: 'right', width: '100%' }}
                      />
                    </td>
                    <td>
                      <input
                        type="text" maxLength={255}
                        value={m.keterangan ?? ''}
                        onChange={e => ubah(i, { keterangan: e.target.value })}
                        placeholder="mis. kegiatan batal"
                        style={{ width: '100%' }}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <DeleteButton
                        onClick={() => setDaftar(prev => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ ...BARIS_KOSONG }]))}
                        title="Hapus perpindahan ini"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <PrimaButton variant="purple" size="sm" onClick={() => setDaftar(prev => [...prev, { ...BARIS_KOSONG }])}>
              + Tambah perpindahan
            </PrimaButton>
          </div>

          {!beres && (
            <div className="cp-recon">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 12.5 }}>
                <AlertTriangle size={14} /> Perlu dibetulkan sebelum bisa disimpan
              </div>
              {sasaranSalah.slice(0, 4).map((s, i) => <div key={`s${i}`} style={{ fontSize: 12 }}>{s.pesan}</div>)}
              {tidakCocok.slice(0, 4).map(t => (
                <div key={t.row_id} style={{ fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong>{t.kode_rekening || t.uraian || namaBaris(t.row_id)}</strong>
                  <span>catatan Rp {formatRupiah(t.catatan)}</span>
                  <ArrowRight size={12} />
                  <span>pagunya bergeser Rp {formatRupiah(t.selisih)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 20px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <span className="blud-imp-muted" style={{ fontSize: 11.5, marginRight: 'auto', maxWidth: '46ch' }}>
            Perubahan baru tersimpan setelah Anda menekan Simpan di halaman.
          </span>
          <PrimaButton variant="ghost" size="sm" onClick={onTutup}>Batal</PrimaButton>
          {/* SENGAJA tidak dimatikan waktu belum cocok: modal ini tidak menulis apa
              pun, dan mematikannya membuat isian yang sudah diketik terkurung —
              satu-satunya jalan keluar jadi membuangnya. Yang menahan tetap Simpan,
              dengan pesan yang menyebut rekeningnya. */}
          <PrimaButton variant="success" size="sm" onClick={() => onTerapkan(terisi)}>
            Terapkan ke tabel
          </PrimaButton>
        </div>
      </div>
    </div>
  )
}

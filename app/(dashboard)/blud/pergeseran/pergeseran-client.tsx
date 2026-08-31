'use client'
 
// app/(dashboard)/blud/pergeseran/pergeseran-client.tsx
// Port dari blud-app: PergeseranTable + pergeseran-dpa/page — shadcn/ui + Tailwind

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'

import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Sparkles, RefreshCw, Calendar, X, AlertTriangle, Search, Copy, Lock } from 'lucide-react'
import DeleteIcon from '@/components/ui/DeleteIcon'
import PrimaButton from '@/components/ui/PrimaButton'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { useSentinelSwap } from '@/lib/blud/use-sentinel-swap'
import RowActionsMenu from '@/components/blud/RowActionsMenu'
import { InputNominal } from '@/components/ui/input-nominal'
import { formatRupiah, hitungJumlah, genRowId, TIPE_LABEL } from '@/lib/blud/format'
import { partialRecalcPergeseran, recalcPergeseranJumlah, hitungDeltaPergeseranRoot } from '@/lib/blud/recalc'
import { pergeseranKeInput, dpaKePergeseranInput } from '@/lib/blud/row-map'
import { BLUD_SIMPAN_MAKS_BARIS } from '@/lib/blud/import-dpa-shared'
import MasterAkunCombobox, { type AkunOption } from '@/components/blud/MasterAkunCombobox'
import PenanggungJawabCombobox from '@/components/blud/PenanggungJawabCombobox'
import VersiDropdown from '@/components/blud/VersiDropdown'
import type { SimpananItem } from '@/components/blud/VersiDropdown'
import TahunDropdown from '@/components/blud/TahunDropdown'
import PeriodeVersiSelect from '@/components/blud/PeriodeVersiSelect'
import SpandukLihat from '@/components/blud/SpandukLihat'
import { formatTanggalId, tanggalHariIniWIB, expectedVersionUntuk, periodeUntukVersi, sasaranSimpan } from '@/lib/blud/tanggal'
import {
  alasanKunciSalinVersi, petakanPergeseranRows, totalAkarPergeseran, type AsalSalin,
} from '@/lib/blud/salin-versi'
import {
  tutupPergeseranRows, periodeSetelahTutup, alasanTolakTutup, labelSasaranTutup,
  catatanVersi, totalPaguAkar, type TutupPergeseran, type AsalTutup,
} from '@/lib/blud/tutup-pergeseran'
import { bedaSinkron, sinkronMengubahAngka, type BedaSinkron } from '@/lib/blud/sinkron-dpa'
import SalinVersiModal from '@/components/blud/SalinVersiModal'
import MuatBerkasButton from '@/components/blud/MuatBerkasButton'
import type { BerkasCadangan } from '@/lib/blud/cadangan-berkas'
import { useSentinelFeed, useSentinelPreSave } from '@/components/sentinel/SentinelProvider'
import { useIngatkanBelumTersimpan } from '@/lib/shared/belum-tersimpan'
import type { SentinelAckPayload } from '@/lib/sentinel/types'
import type { PergeseranBarisInput, PergeseranBaris, DpaBaris, TipeBaris } from '@/types'

// ─── KONSTANTA ────────────────────────────────────────────────────────────────

// Mirror dpa-client: TIPE_LABEL urutan → lv-l1 .. lv-l81 utk styling v2.
// CSS rules ada di app/globals.css blok "BLUD v2 — Spec-faithful redesign".
const TIPE_ROW_CLASS: Record<TipeBaris, string> = {
  GRANDMASTER:          'lv-l1',
  MASTER:               'lv-l2',
  CHILD:                'lv-l21',
  LEADER:               'lv-l3',
  MEMBER:               'lv-l31',
  'PLETON-LEADER':      'lv-l4',
  'PLETON-MEMBER':      'lv-l41',
  'KETUA-KELOMPOK-A':   'lv-l5',
  'ANGGOTA-KELOMPOK-A': 'lv-l51',
  'KETUA-KELOMPOK-B':   'lv-l6',
  'ANGGOTA-KELOMPOK-B': 'lv-l61',
  'L7-HEAD':            'lv-l7',
  'L7-SUB':             'lv-l71',
  'L8-HEAD':            'lv-l8',
  'L8-SUB':             'lv-l81',
}

const EDITABLE_TYPES = new Set<TipeBaris>([
  'MASTER',  'CHILD',
  'LEADER',  'MEMBER',
  'PLETON-LEADER',     'PLETON-MEMBER',
  'KETUA-KELOMPOK-A',  'ANGGOTA-KELOMPOK-A',
  'KETUA-KELOMPOK-B',  'ANGGOTA-KELOMPOK-B',
  'L7-HEAD', 'L7-SUB',
  'L8-HEAD', 'L8-SUB',
])

// TIPE_LABEL imported dari lib/blud/format.ts (shared dgn dpa-client + BlockedModal)

/**
 * Chain rule (strict, mirror DPA): kecuali MASTER & GRANDMASTER (root + L2)
 * yang wajib dari DPA original. Selain itu setiap tipe → tepat 1 anak chain.
 */
const TIPE_CHILD_OPTIONS_PG: Partial<Record<TipeBaris, TipeBaris[]>> = {
  MASTER:               ['CHILD'],             // L2   → L2.1
  CHILD:                ['LEADER'],            // L2.1 → L3   (aggregator mode)
  LEADER:               ['MEMBER'],            // L3   → L3.1
  MEMBER:               ['PLETON-LEADER'],     // L3.1 → L4   (aggregator mode)
  'PLETON-LEADER':      ['PLETON-MEMBER'],     // L4   → L4.1
  'PLETON-MEMBER':      ['KETUA-KELOMPOK-A'],  // L4.1 → L5   (aggregator mode)
  'KETUA-KELOMPOK-A':   ['ANGGOTA-KELOMPOK-A'],// L5   → L5.1
  'ANGGOTA-KELOMPOK-A': ['KETUA-KELOMPOK-B'],  // L5.1 → L6   (aggregator mode)
  'KETUA-KELOMPOK-B':   ['ANGGOTA-KELOMPOK-B'],// L6   → L6.1
  'ANGGOTA-KELOMPOK-B': ['L7-HEAD'],           // L6.1 → L7   (aggregator mode)
  'L7-HEAD':            ['L7-SUB'],            // L7   → L7.1
  'L7-SUB':             ['L8-HEAD'],           // L7.1 → L8   (aggregator mode)
  'L8-HEAD':            ['L8-SUB'],            // L8   → L8.1
  // 'L8-SUB' → no children (max depth)
}

// Helper: baris ini hasil add manual di Pergeseran (bukan import dari DPA)?
function isNewRow(row: PergeseranBarisInput): boolean {
  return row.row_id?.startsWith('pgnew_') ?? false
}
function genPgRowId(): string { return 'pgnew_' + genRowId() }

// ─── PERGESERAN TABLE ─────────────────────────────────────────────────────────

/** Konstanta modul: `setBlocked` yang stabil. Pergeseran tidak memakai geser blok. */
const abaikanBlocked = () => {}

/** Berkas aksi satu baris Pergeseran — cermin `AksiBaris` di layar DPA. */
interface AksiBarisPg {
  updateVolHarga: (rowId: string, field: 'vol_p' | 'harga_p', value: number | null) => void
  updateText:     (rowId: string, field: 'kode_rekening' | 'uraian' | 'penanggung_jawab' | 'keterangan', value: string) => void
  pickAkun:       (rowId: string, akun: AkunOption) => void
  toggleCheckbox: (rowId: string) => void
  addSibling:     (row: PergeseranBarisInput) => void
  deleteBaris:    (rowId: string) => void
  bukaTambahAnak: (row: PergeseranBarisInput) => void
}

const fmtRp = (v: number | null | undefined) => (v != null && v !== 0) ? formatRupiah(v) : '-'

/**
 * Satu baris tabel Pergeseran — Tahap 4, cermin `DpaRow`.
 *
 * Tabel ini 13 kolom (DPA 10) dan lahir dari salinan DPA, jadi jumlah barisnya
 * sama besar. Alasan dan syaratnya identik: `memo` hanya menggigit kalau tiap
 * prop stabil, jadi yang dioper `terpilih`/`disorot`/`isAgg` sebagai boolean —
 * bukan Set, bukan Map — dan seluruh penangan lewat satu objek `aksi`.
 */
const PergeseranRow = memo(function PergeseranRow({
  row, terpilih, disorot, isAgg, bolehUbah, akunOptions, pjOptions, aksi,
}: {
  row:         PergeseranBarisInput
  terpilih:    boolean
  disorot:     boolean
  isAgg:       boolean
  bolehUbah:   boolean
  akunOptions: AkunOption[]
  pjOptions:   string[]
  aksi:        AksiBarisPg
}) {
  const editable = bolehUbah && EDITABLE_TYPES.has(row.tipe_baris) && !isAgg
  const isBold   = ['GRANDMASTER','MASTER','LEADER','PLETON-LEADER','KETUA-KELOMPOK-A','KETUA-KELOMPOK-B','L7-HEAD','L8-HEAD'].includes(row.tipe_baris)
  const isGM     = row.tipe_baris === 'GRANDMASTER'
  const bb       = row.bertambah_berkurang ?? 0
  const isNew    = isNewRow(row)
  const canAdd   = !!TIPE_CHILD_OPTIONS_PG[row.tipe_baris]

  return (
    <tr id={`perg-row-${row.row_id}`}
        className={`${TIPE_ROW_CLASS[row.tipe_baris]}${disorot ? ' row-highlight' : ''}`}>
      {/* Checkbox multi-hapus — hanya baris baru */}
      <td style={{ padding: '2px 4px', textAlign: 'center' }}>
        {bolehUbah && isNew && (
          <input
            type="checkbox"
            className="dpa-row-checkbox"
            checked={terpilih}
            onChange={() => aksi.toggleCheckbox(row.row_id)}
            data-tooltip="Centang untuk menghapus beberapa baris sekaligus — baris di bawahnya ikut tercentang"
          />
        )}
      </td>

      {/* Level badge L1/L2/.. — sama seperti DPA */}
      <td style={{ padding: '2px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <span data-tooltip={TIPE_LABEL[row.tipe_baris]} className="blud-level-badge">
          {TIPE_LABEL[row.tipe_baris].replace('Level ', 'L')}
        </span>
      </td>

      {/* Kode */}
      <td style={{ fontSize: 12, color: isGM ? 'var(--blud-l1-text)' : undefined }}>
        {isNew ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="text"
              value={row.kode_rekening}
              readOnly
              placeholder="auto-fill dari pilihan uraian"
              style={{ flex: 1, minWidth: 60, cursor: 'default' }}
            />
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '.5px',
              padding: '2px 5px', borderRadius: 3,
              background: '#10B981', color: '#FFFFFF', flexShrink: 0,
            }}>BARU</span>
          </div>
        ) : row.kode_rekening}
      </td>

      {/* Uraian — combobox kalau baris baru, span kalau dari DPA */}
      <td>
        {isNew && bolehUbah ? (
          <MasterAkunCombobox
            value={row.uraian}
            options={akunOptions}
            onChange={v => aksi.updateText(row.row_id, 'uraian', v)}
            onSelect={akun => aksi.pickAkun(row.row_id, akun)}
            placeholder="Cari atau ketik uraian..."
          />
        ) : (
          <span style={{ fontWeight: isBold ? 700 : 400, fontSize: 13, color: isGM ? 'var(--blud-l1-text)' : undefined, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {row.uraian}
            {/* Warning kalau DPA aggregator (vol=null, jumlah>0) tapi
                Pergeseran local leaf (tidak punya anak) — struktur beda
                antara DPA & Pergeseran setelah inject */}
            {!isAgg && row.vol == null && row.harga == null && (row.jumlah ?? 0) > 0 && (
              <AlertTriangle
                className="w-3 h-3"
                style={{ color: '#F59E0B', flexShrink: 0 }}
                aria-label="Struktur berbeda dengan DPA"
              >
                <title>Di DPA baris ini punya rincian di bawahnya, di sini belum. Pertimbangkan menambahkan rinciannya.</title>
              </AlertTriangle>
            )}
          </span>
        )}
      </td>

      {/* Vol DPA (readOnly) */}
      <td style={{ textAlign: 'right', fontSize: 12, color: isGM ? 'var(--blud-l1-text)' : undefined }}>
        {row.vol ?? '-'}
      </td>

      {/* Satuan */}
      <td style={{ fontSize: 12, color: isGM ? 'var(--blud-l1-text)' : undefined }}>{row.satuan ?? '-'}</td>

      {/* Harga DPA */}
      <td style={{ textAlign: 'right', fontSize: 12, color: isGM ? 'var(--blud-l1-text)' : undefined }}>
        {fmtRp(row.harga)}
      </td>

      {/* Jumlah DPA */}
      <td style={{ textAlign: 'right' }}>
        <strong style={{ fontSize: 13, color: isGM ? 'var(--blud-l1-text)' : undefined }}>
          {fmtRp(row.jumlah)}
        </strong>
      </td>

      {/* Vol P (editable saat LEAF) */}
      <td style={{ textAlign: 'right' }}>
        {editable
          ? <input type="number" value={row.vol_p ?? ''} min={0} style={{ textAlign: 'right' }}
              onChange={e => aksi.updateVolHarga(row.row_id, 'vol_p', e.target.value === '' ? null : Number(e.target.value))} />
          : <span style={{ fontSize: 12, opacity: isAgg ? .55 : 1 }}>
              {isAgg ? '—' : (row.vol_p ?? '-')}
            </span>
        }
      </td>

      {/* Harga P (editable saat LEAF) */}
      <td style={{ textAlign: 'right' }}>
        {editable
          ? <InputNominal value={row.harga_p ?? 0} style={{ textAlign: 'right' }}
              onChange={v => aksi.updateVolHarga(row.row_id, 'harga_p', v || null)} />
          : <span style={{ fontSize: 12, opacity: isAgg ? .55 : 1 }}>
              {isAgg ? '—' : fmtRp(row.harga_p)}
            </span>
        }
      </td>

      {/* Pergeseran */}
      <td style={{ textAlign: 'right' }}>
        <strong style={{ fontSize: 13, color: '#7DD3FC' }}>{fmtRp(row.pergeseran)}</strong>
      </td>

      {/* +/− */}
      <td style={{ textAlign: 'right' }}>
        <strong style={{
          fontSize: 13,
          color: bb > 0 ? '#6EE7B7' : bb < 0 ? '#FCA5A5' : '#85B7EB',
        }}>
          {bb > 0 ? '+' : ''}{bb !== 0 ? formatRupiah(bb) : '-'}
        </strong>
      </td>

      {/* Penanggung Jawab — bisa diubah di SEMUA baris (cermin aturan DPA).
          Nilainya lahir sebagai salinan DPA, tapi pemilik pos bisa berpindah
          justru KARENA pergeseran, jadi mengunci baris turunan memaksa orang
          memutar lewat menu DPA untuk sesuatu yang cuma berlaku di dokumen ini.
          Catatan: "Sinkronkan DPA" tetap menimpanya dari DPA — itu memang
          tugasnya, dan `bedaSinkron` sengaja hanya melaporkan selisih UANG.
          Sengaja tanpa penjaga konflik chain seperti DPA: pemiliknya DPA,
          dan chain-conflict tetap ketahuan di panel audit menu Cetak. */}
      <td>
        {bolehUbah ? (
          <PenanggungJawabCombobox
            value={row.penanggung_jawab ?? ''}
            options={pjOptions}
            onChange={v => aksi.updateText(row.row_id, 'penanggung_jawab', v ?? '')}
            style={{ color: isGM ? 'var(--blud-l1-text)' : undefined }}
            placeholder="— Pilih PJ —"
          />
        ) : (
          <span style={{ fontSize: 12, color: isGM ? 'var(--blud-l1-text)' : undefined }}>
            {row.penanggung_jawab || '-'}
          </span>
        )}
      </td>

      {/* Keterangan — sama aturannya dengan PJ */}
      <td>
        {isNew && bolehUbah ? (
          <input
            type="text"
            value={row.keterangan ?? ''}
            onChange={e => aksi.updateText(row.row_id, 'keterangan', e.target.value)}
            placeholder="Keterangan…"
            style={{ width: '100%' }}
          />
        ) : (
          <span style={{ fontSize: 12, color: isGM ? 'var(--blud-l1-text)' : undefined }}>
            {row.keterangan || '-'}
          </span>
        )}
      </td>

      {/* Aksi — kebab menu */}
      {bolehUbah && (
      <td style={{ textAlign: 'center', padding: '2px 4px' }}>
        <RowActionsMenu
          canAdd={canAdd}
          canSibling={!!row.parent_id}
          locked={!isNew && !canAdd}  // tampilkan kebab hanya kalau ada aksi tersedia
          onAddChild={canAdd ? () => aksi.bukaTambahAnak(row) : undefined}
          onAddSibling={row.parent_id ? () => aksi.addSibling(row) : undefined}
          onDelete={isNew ? () => aksi.deleteBaris(row.row_id) : undefined}
          title={isAgg ? 'Aggregator: hapus anak dulu' : 'Hapus baris (hanya untuk baris baru)'}
        />
      </td>
      )}
    </tr>
  )
})

function PergeseranTable({
  rows,
  onChange,
  akunOptions,
  pjOptions,
  hiddenLevels,
  highlightId,
  bolehUbah,
}: {
  rows: PergeseranBarisInput[]
  onChange: (rows: PergeseranBarisInput[]) => void
  akunOptions: AkunOption[]
  /** Master Penanggung Jawab — dipakai SEMUA baris; nilainya lahir dari DPA. */
  pjOptions:   string[]
  hiddenLevels: Set<string>
  highlightId:  string | null
  /** LIHAT: seluruh isian jadi teks, kolom aksi & checkbox tidak dirender. */
  bolehUbah:    boolean
}) {
  const [addParent, setAddParent] = useState<PergeseranBarisInput | null>(null)
  const [delGuard,  setDelGuard]  = useState<{ uraian: string; childCount: number } | null>(null)

  // Tahap 4 — cermin `DpaTable`: baris terbaru yang sudah commit, dibaca lewat ref
  // supaya penangan per-baris punya identitas tetap dan `memo` pada barisnya
  // benar-benar menggigit. Diisi di efek (sesudah commit), bukan saat render.
  const rowsRef = useRef(rows)
  useEffect(() => { rowsRef.current = rows })

  // Build child-count map untuk dynamic leaf/aggregator
  const childCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      if (r.parent_id) m.set(r.parent_id, (m.get(r.parent_id) ?? 0) + 1)
    }
    return m
  }, [rows])

  // Edit vol_p / harga_p (baris editable) — auto recalc parent chain
  const updateVolHarga = useCallback((rowId: string, field: 'vol_p' | 'harga_p', value: number | null) => {
    const updated = rowsRef.current.map(r => {
      if (r.row_id !== rowId) return r
      const next = { ...r, [field]: value }
      next.pergeseran          = hitungJumlah(next.vol_p, next.harga_p)
      next.bertambah_berkurang = next.pergeseran - (next.jumlah || 0)
      return next
    })
    onChange(partialRecalcPergeseran(updated, rowId))
  }, [onChange])

  // Edit kolom teks. kode_rekening/uraian/keterangan hanya untuk baris baru hasil
  // add manual; `penanggung_jawab` terbuka di semua baris (lihat catatan di selnya).
  const updateText = useCallback((
    rowId: string,
    field: 'kode_rekening' | 'uraian' | 'penanggung_jawab' | 'keterangan',
    value: string,
  ) => {
    onChange(rowsRef.current.map(r => r.row_id === rowId ? { ...r, [field]: value } : r))
  }, [onChange])

  // Pick dari Master Akun → fill kode + uraian sekaligus
  const pickAkun = useCallback((rowId: string, akun: AkunOption) => {
    onChange(rowsRef.current.map(r => r.row_id === rowId ? { ...r, kode_rekening: akun.kode, uraian: akun.uraian } : r))
  }, [onChange])

  // Add baris baru sebagai child dari parent — CHAIN: leaf parent switch ke
  // aggregator (clear vol_p/harga_p) saat anak pertama ditambahkan.
  const addChild = useCallback((tipe: TipeBaris, parentRowId: string) => {
    const rows = rowsRef.current
    const parentIdx = rows.findIndex(r => r.row_id === parentRowId)
    if (parentIdx === -1) return
    const parent = rows[parentIdx]
    const parentHasChildren = rows.some(r => r.parent_id === parentRowId)
    const willSwitchToAggregator = !parentHasChildren && EDITABLE_TYPES.has(parent.tipe_baris)

    // descendant set utk cari insert position (di bawah seluruh sub-tree parent)
    const descendants = new Set<string>()
    const queue = [parentRowId]
    while (queue.length) {
      const pid = queue.shift()!
      for (const r of rows) {
        if (r.parent_id === pid) { descendants.add(r.row_id); queue.push(r.row_id) }
      }
    }
    let insertIdx = parentIdx
    for (let i = parentIdx + 1; i < rows.length; i++) {
      if (descendants.has(rows[i].row_id)) insertIdx = i
      else break
    }

    const newRow: PergeseranBarisInput = {
      kode_rekening: '', uraian: '',
      vol: null, satuan: null, harga: null, jumlah: 0,
      vol_p: null, harga_p: null, pergeseran: 0, bertambah_berkurang: 0,
      penanggung_jawab: '', keterangan: '',
      tipe_baris: tipe, row_id: genPgRowId(),
      parent_id: parentRowId, urutan: insertIdx + 1,
    }
    let next = [...rows]
    if (willSwitchToAggregator) {
      next = next.map(r => r.row_id === parentRowId
        ? { ...r, vol_p: null, harga_p: null, pergeseran: 0, bertambah_berkurang: 0 - (r.jumlah ?? 0) }
        : r)
    }
    next.splice(insertIdx + 1, 0, newRow)
    onChange(recalcPergeseranJumlah(next.map((r, i) => ({ ...r, urutan: i }))))
    // Auto-scroll + flash ke baris baru (tunggu DOM commit; reuse anim sentinel)
    setTimeout(() => {
      const el = document.getElementById(`perg-row-${newRow.row_id}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('pj-sentinel-row-flash')
      window.setTimeout(() => el.classList.remove('pj-sentinel-row-flash'), 1700)
    }, 80)
  }, [onChange])

  // Tambah baris level sama (sibling) — tipe & parent sama, sisip setelah subtree baris ini
  const addSibling = useCallback((row: PergeseranBarisInput) => {
    const rows = rowsRef.current
    const idx = rows.findIndex(r => r.row_id === row.row_id)
    if (idx === -1 || !row.parent_id) return

    const descendants = new Set<string>()
    const queue = [row.row_id]
    while (queue.length) {
      const pid = queue.shift()!
      for (const r of rows) {
        if (r.parent_id === pid) { descendants.add(r.row_id); queue.push(r.row_id) }
      }
    }
    let insertIdx = idx
    for (let i = idx + 1; i < rows.length; i++) {
      if (descendants.has(rows[i].row_id)) insertIdx = i
      else break
    }

    const newRow: PergeseranBarisInput = {
      kode_rekening: '', uraian: '',
      vol: null, satuan: null, harga: null, jumlah: 0,
      vol_p: null, harga_p: null, pergeseran: 0, bertambah_berkurang: 0,
      penanggung_jawab: '', keterangan: '',
      tipe_baris: row.tipe_baris, row_id: genPgRowId(),
      parent_id: row.parent_id, urutan: insertIdx + 1,
    }
    const next = [...rows]
    next.splice(insertIdx + 1, 0, newRow)
    onChange(recalcPergeseranJumlah(next.map((r, i) => ({ ...r, urutan: i }))))
    setTimeout(() => {
      const el = document.getElementById(`perg-row-${newRow.row_id}`)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('pj-sentinel-row-flash')
      window.setTimeout(() => el.classList.remove('pj-sentinel-row-flash'), 1700)
    }, 80)
  }, [onChange])

  // Multi-hapus — reuse seleksi cascade Sentinel Swap (geser tidak dipakai di Pergeseran).
  // Hanya baris baru (pgnew_*) yang dapat checkbox; descendant baris baru selalu baru juga.
  // `setBlocked` HARUS stabil — arrow baru tiap render membuat `geser`/`toggleCheckbox`
  // ikut berganti identitas dan `memo` di `PergeseranRow` tidak pernah menggigit.
  const { selectedRowIds, toggleCheckbox, selectAll, clearSelection } = useSentinelSwap({
    rows, onChange, setBlocked: abaikanBlocked,
  })
  const { newRowIds, allNewSelected } = useMemo(() => {
    const ids = rows.filter(isNewRow).map(r => r.row_id)
    return { newRowIds: ids, allNewSelected: ids.length > 0 && ids.every(id => selectedRowIds.has(id)) }
  }, [rows, selectedRowIds])

  // Delete baris. Aggregator (punya anak) blocked — modal peringatan.
  // Hanya baris baru (pgnew_*) atau leaf yang bisa dihapus langsung.
  const deleteBaris = useCallback((rowId: string) => {
    const rows = rowsRef.current
    const target = rows.find(r => r.row_id === rowId)
    if (!target) return
    const directChildren = rows.filter(r => r.parent_id === rowId)
    if (directChildren.length > 0) {
      setDelGuard({ uraian: target.uraian || 'baris ini', childCount: directChildren.length })
      return
    }
    const filtered = rows
      .filter(r => r.row_id !== rowId)
      .map((r, i) => ({ ...r, urutan: i }))
    onChange(recalcPergeseranJumlah(filtered))
    toast.success(`Baris "${target.uraian || target.kode_rekening || 'tanpa uraian'}" dihapus`)
  }, [onChange])

  // Multi-hapus: seleksi cascade = subtree utuh, aman filter sekali jalan
  const deleteSelected = useCallback(async () => {
    const count = selectedRowIds.size
    if (count === 0) return
    const ok = await confirmDialog({
      title: `Hapus ${count} baris?`,
      message: `${count} baris yang Anda tambahkan sendiri akan dihapus sekaligus. Belum permanen — baru hilang dari database setelah Anda menekan Simpan.`,
      confirmLabel: `Hapus ${count} baris`,
      variant: 'danger',
    })
    if (!ok) return
    const filtered = rows
      .filter(r => !selectedRowIds.has(r.row_id))
      .map((r, i) => ({ ...r, urutan: i }))
    onChange(recalcPergeseranJumlah(filtered))
    clearSelection()
    toast.success(`${count} baris dihapus dari tabel — tekan Simpan untuk menetapkannya`)
  }, [rows, selectedRowIds, onChange, clearSelection])

  // Satu berkas aksi, satu identitas — cermin `aksi` di `DpaTable`.
  const aksi = useMemo(() => ({
    updateVolHarga, updateText, pickAkun, toggleCheckbox, addSibling, deleteBaris,
    bukaTambahAnak: setAddParent,
  }), [updateVolHarga, updateText, pickAkun, toggleCheckbox, addSibling, deleteBaris])

  return (
    <>
      {selectedRowIds.size > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 12, opacity: .75 }}>{selectedRowIds.size} baris terpilih</span>
          <PrimaButton variant="danger" size="sm" iconLeft={<DeleteIcon size={14} />} onClick={deleteSelected}>
            Hapus Terpilih ({selectedRowIds.size})
          </PrimaButton>
        </div>
      )}
      <div className="blud-scroll-wrapper v2">
        <table className="dpa-table v2">
          <thead>
            <tr>
              <th style={{ width: bolehUbah ? 36 : 20, textAlign: 'center' }}>
                {bolehUbah && (
                  <input
                    type="checkbox"
                    className="dpa-row-checkbox"
                    checked={allNewSelected}
                    disabled={newRowIds.length === 0}
                    onChange={() => allNewSelected ? clearSelection() : selectAll(newRowIds)}
                    data-tooltip={allNewSelected ? 'Lepas semua centang' : 'Centang semua baris yang Anda tambahkan sendiri'}
                  />
                )}
              </th>
              <th style={{ width: 48, textAlign: 'center' }}>Level</th>
              <th style={{ width: 150 }}>Kode Rekening</th>
              <th style={{ minWidth: 240 }}>Uraian</th>
              <th style={{ width: 60, textAlign: 'right' }}>Vol</th>
              <th style={{ width: 120 }}>Satuan</th>
              <th style={{ width: 140, textAlign: 'right' }}>Harga</th>
              <th style={{ width: 150, textAlign: 'right' }}>Jumlah</th>
              {/* Harga P pakai minWidth, bukan width: `.dpa-table` memakai
                  table-layout bawaan (auto), jadi `width` cuma USULAN — kolom
                  berisi teks panjang (Uraian, PJ) menarik jatah kolom angka
                  sampai nominal miliar terpotong jadi "3.774.2". `minWidth`
                  yang tidak bisa diperas, plus PJ & Keterangan dipersempit
                  untuk mengembalikan ruangnya. */}
              <th data-rima="pergeseran.kolom-vol-p" style={{ width: 80, textAlign: 'right' }}>Vol P</th>
              <th data-rima="pergeseran.kolom-harga-p" style={{ minWidth: 180, textAlign: 'right' }}>Harga P</th>
              <th data-rima="pergeseran.kolom-selisih" style={{ minWidth: 160, textAlign: 'right' }}>Pergeseran</th>
              <th style={{ minWidth: 160, textAlign: 'right' }}>+/−</th>
              <th data-rima="pergeseran.kolom-pj" style={{ width: 120 }}>Penanggung Jawab</th>
              <th style={{ width: 110 }}>Keterangan</th>
              {bolehUbah && <th style={{ width: 44, textAlign: 'center' }}>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              if (hiddenLevels.has(TIPE_LABEL[row.tipe_baris])) return null
              return (
                <PergeseranRow
                  key={row.row_id}
                  row={row}
                  terpilih={selectedRowIds.has(row.row_id)}
                  disorot={row.row_id === highlightId}
                  isAgg={(childCount.get(row.row_id) ?? 0) > 0}
                  bolehUbah={bolehUbah}
                  akunOptions={akunOptions}
                  pjOptions={pjOptions}
                  aksi={aksi}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {addParent && (
        <AddPergeseranBarisModal
          parentRow={addParent}
          onAdd={addChild}
          onClose={() => setAddParent(null)}
        />
      )}
      {delGuard && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 1000, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
        >
          <div className="blud-modal-card rounded-xl w-96">
            <div className="blud-modal-header flex items-center justify-between px-5 py-4">
              <span className="blud-modal-title font-semibold">Tidak Bisa Menghapus</span>
              <button onClick={() => setDelGuard(null)} className="blud-modal-close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="blud-modal-subtitle text-sm">
                Baris <strong>{delGuard.uraian}</strong> punya <strong>{delGuard.childCount} anak</strong>.
                Hapus semua anak terlebih dahulu, baris ini akan otomatis kembali ke mode leaf
                dan dapat dihapus.
              </p>
              <div className="flex justify-end">
                <PrimaButton variant="primary" size="sm" onClick={() => setDelGuard(null)}>Mengerti</PrimaButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── ADD MODAL ─────────────────────────────────────────────────────────────────
function AddPergeseranBarisModal({
  parentRow, onAdd, onClose,
}: {
  parentRow: PergeseranBarisInput
  onAdd: (tipe: TipeBaris, parentRowId: string) => void
  onClose: () => void
}) {
  const options = TIPE_CHILD_OPTIONS_PG[parentRow.tipe_baris] ?? []
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 1000, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div className="blud-modal-card rounded-xl w-80" onClick={e => e.stopPropagation()}>
        <div className="blud-modal-header flex items-center justify-between px-5 py-4">
          <span className="blud-modal-title font-semibold">Tambah Baris Pergeseran</span>
          <button onClick={onClose} className="blud-modal-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-2">
          <p className="blud-modal-subtitle text-sm mb-3">
            Tambah di bawah <strong>{parentRow.uraian || TIPE_LABEL[parentRow.tipe_baris]}</strong>:
          </p>
          {options.map(tipe => (
            <button
              key={tipe}
              onClick={() => { onAdd(tipe, parentRow.row_id); onClose() }}
              className="blud-modal-option w-full text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
            >
              + {TIPE_LABEL[tipe]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── PERGESERAN PAGE ──────────────────────────────────────────────────────────

export default function PergeseranClient({ bolehUbah }: { bolehUbah: boolean }) {
  const [rows,      setRows]      = useState<PergeseranBarisInput[]>([])
  const [history,   setHistory]   = useState<{ versi_tanggal: string }[]>([])
  const [riwayat,   setRiwayat]   = useState<SimpananItem[]>([])
  const [versi,     setVersi]     = useState('')
  const [dpaVersi,  setDpaVersi]  = useState('')
  // Periode yang akan DITULIS saat Simpan. '' = bulan berjalan (perilaku bawaan).
  // Ia juga menentukan DPA mana yang ditarik "Buat Pergeseran": Pergeseran Januari
  // harus lahir dari DPA Januari, bukan DPA terbaru.
  const [periodeTulis, setPeriodeTulis] = useState('')
  // Cermin layar DPA: `versi` menjawab "slot mana yang dibuka", ini menjawab
  // "apakah yang di layar sudah sama dengan yang tersimpan di slot itu".
  const [belumTersimpan, setBelumTersimpan] = useState(false)
  // Jejak "baris ini dipulihkan dari simpanan jam sekian" — semata memperpanjang
  // baris detail audit, sepadan `asalSalinRef` di layar DPA.
  const asalPulihkanRef = useRef<{ id: number; versi_ke: number; disimpan_pada: string } | null>(null)
  /**
   * Baris yang dimuat dari BERKAS cadangan. Dipisah dari `asalPulihkanRef`
   * dengan sengaja: pemulihan dari riwayat mengambil dari tabel di server,
   * yang ini datang dari luar — audit tidak boleh menyamakan keduanya.
   */
  const asalBerkasRef = useRef<
    { nama: string; versi_tanggal: string; versi_ke: number; disimpan_pada: string } | null
  >(null)
  // Sepadan, untuk baris yang datang dari versi lain tahun yang sama.
  const asalSalinRef = useRef<AsalSalin | null>(null)
  const [salinVersiBuka, setSalinVersiBuka] = useState(false)
  // ── Tutup Pergeseran ───────────────────────────────────────────────────────
  // Daftar penutupan setahun. Dipakai tiga tempat: lencana di daftar versi,
  // penolakan "sudah ditutup", dan peringatan Sinkron DPA pada versi basis.
  const [tutupList, setTutupList] = useState<TutupPergeseran[]>([])
  // Berbeda dari `asalSalinRef`/`asalPulihkanRef` yang berhenti di baris audit:
  // yang ini juga menerbitkan baris `blud_pergeseran_tutup`. Ref, bukan state —
  // ia dibaca di dalam `doSimpanInternal` yang bisa dipanggil ulang dari jalur
  // retry, dan nilainya tidak boleh ikut basi bersama closure render lama.
  const asalTutupRef = useRef<AsalTutup | null>(null)
  const [konfirmTutup, setKonfirmTutup] = useState<{
    versiDitutup: string; sasaran: string; periode: string
    paguSebelum: number; paguSesudah: number; jumlahBaris: number; halangan: string
  } | null>(null)
  // Hasil sinkron yang MENUNGGU persetujuan — hanya diisi kalau ada angka yang
  // berubah. Tidak ada perubahan = langsung diterapkan, tanpa satu pun dialog.
  // `low` ikut disimpan, bukan dibuang: peringatan "dipasangkan berdasarkan
  // kemiripan" justru paling penting di jalur ini — yang ini jalur yang MENGUBAH
  // angka. Sempat hilang karena tombol Terapkan mengoper larik kosong.
  const [pratinjauSinkron, setPratinjauSinkron] = useState<{
    rows: PergeseranBarisInput[]; beda: BedaSinkron; dpaVersi: string
    low: { kode_rekening: string; uraian: string }[]
  } | null>(null)
  // Tahun Anggaran (CONCEPT-blud-tahun-anggaran §2.1) — pilih tahun dulu, sama pola DPA.
  const CURRENT_YEAR = new Date().getFullYear()
  const [tahun,     setTahun]     = useState<number>(CURRENT_YEAR)
  const [tahunList, setTahunList] = useState<number[]>([])
  const [loading,   setLoading]   = useState(false)
  const [injecting, setInjecting] = useState(false)
  const [saving,    setSaving]    = useState(false)
  // Audit BLUD v1.2 (B-NEW-3): modal konfirmasi kalau save drop >50% baris
  const [safetyWarning, setSafetyWarning] = useState<{ versiTanggal: string; existing: number; incoming: number; dropPct: number } | null>(null)
  // CONCEPT-blud-realisasi §4.3: pagu turun di bawah realisasi yang sudah terjadi
  const [bentrokPagu, setBentrokPagu] = useState<{
    versiTanggal: string
    detail: { kode_rekening: string; uraian: string; pagu_baru: number; terserap: number; minus: number; hilang: boolean }[]
  } | null>(null)
  const [alasanTurun, setAlasanTurun] = useState('')
  const [akunOptions,   setAkunOptions]   = useState<AkunOption[]>([])
  const [pjOptions,     setPjOptions]     = useState<string[]>([])
  // Filter level (B) + search jump (C)
  const [hiddenLevels, setHiddenLevels] = useState<Set<string>>(new Set())
  const [searchQ,      setSearchQ]      = useState('')
  const [highlightId,  setHighlightId]  = useState<string | null>(null)

  const doSearch = useCallback(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return
    const match = rows.find(r =>
      r.kode_rekening.toLowerCase().includes(q) ||
      r.uraian.toLowerCase().includes(q),
    )
    if (!match) {
      toast.error(`Tidak ada baris yang mengandung "${searchQ}"`)
      return
    }
    const matchLabel = TIPE_LABEL[match.tipe_baris]
    setHiddenLevels(prev => {
      if (!prev.has(matchLabel)) return prev
      const next = new Set(prev); next.delete(matchLabel); return next
    })
    setHighlightId(match.row_id)
    setTimeout(() => {
      const el = document.getElementById(`perg-row-${match.row_id}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    setTimeout(() => setHighlightId(null), 2600)
  }, [rows, searchQ])

  // §4.1: notifikasi permintaan menautkan ke ?fokus=<anggaran_key>. Barisnya
  // disorot + di-scroll, tapi TETAP KOSONG — angkanya ditentukan pengelola,
  // sistem hanya mengantar ke tempat yang benar. Sekali sorot per tautan.
  const searchParams = useSearchParams()
  const fokus = searchParams.get('fokus')
  const fokusSudah = useRef<string | null>(null)
  useEffect(() => {
    if (!fokus || !rows.length || fokusSudah.current === fokus) return
    const match = rows.find(r => r.anggaran_key === fokus)
    fokusSudah.current = fokus
    const sorot = setTimeout(() => {
      if (!match) {
        toast.warning('Baris yang dituju tidak ada di versi ini. Kemungkinan sudah diubah atau dihapus sejak permintaannya dikirim.')
        return
      }
      setHiddenLevels(prev => {
        const label = TIPE_LABEL[match.tipe_baris]
        if (!prev.has(label)) return prev
        const next = new Set(prev); next.delete(label); return next
      })
      setHighlightId(match.row_id)
      document.getElementById(`perg-row-${match.row_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 60)
    const padam = setTimeout(() => setHighlightId(null), 6000)
    return () => { clearTimeout(sorot); clearTimeout(padam) }
  }, [fokus, rows])

  // Master akun (dropdown Uraian) + master PJ (dropdown Penanggung Jawab), keduanya
  // hanya terpakai di baris baru hasil add manual.
  useEffect(() => {
    let alive = true
    fetch('/api/blud/master-akun')
      .then(r => r.json())
      .then(j => { if (alive && j.ok) setAkunOptions(j.data as AkunOption[]) })
      .catch(() => { /* silent */ })
    fetch('/api/blud/penanggung-jawab')
      .then(r => r.json())
      .then(j => { if (alive && j.ok) setPjOptions((j.data as { label: string }[]).map(d => d.label)) })
      .catch(() => { /* silent */ })
    return () => { alive = false }
  }, [])

  // L58: notif standar sonner (richColors dari Toaster global)
  function showToast(msg: string, ok = true) {
    if (ok) toast.success(msg)
    else toast.error(msg)
  }

  /**
   * SATU-SATUNYA jalan bagi tabel untuk mengubah baris — dipasang sebagai
   * `onChange` PergeseranTable, jadi tiap sunting sel ikut menandai layar belum
   * tersimpan. `setRows` langsung tetap dipakai untuk yang BUKAN suntingan
   * orang: muatan server dan penyerapan jangkar sesudah Simpan berhasil.
   */
  const ubahRows = useCallback((next: PergeseranBarisInput[]) => {
    setBelumTersimpan(true)
    setRows(next)
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const res  = await fetch(`/api/blud/pergeseran?mode=history&tahun=${tahun}`)
      const json = await res.json()
      // Daftar penutupan ikut di balasan yang sama — satu tembakan, satu pagar
      // akses. Keduanya metadata tentang versi, jadi memisahkannya cuma menambah
      // permukaan tanpa menambah jawaban.
      if (json.ok) { setHistory(json.data); setTutupList(json.tutup ?? []) }
    } catch { /* skip */ }
  }, [tahun])

  const loadRiwayat = useCallback(async () => {
    try {
      const res  = await fetch(`/api/blud/riwayat-simpan?jenis=PERGESERAN&tahun=${tahun}`)
      const json = await res.json()
      if (json.ok) setRiwayat(json.data)
    } catch { /* riwayat itu pelengkap — kegagalannya tidak boleh menahan layar */ }
  }, [tahun])

  const loadTahunList = useCallback(async () => {
    try {
      const res  = await fetch('/api/blud/pergeseran?mode=tahun-list')
      const json = await res.json()
      if (!json.ok) return
      const list: number[] = Array.isArray(json.data) ? json.data : []
      setTahunList(list)
      const cur = Number(json.current) || CURRENT_YEAR
      setTahun(prev => (list.includes(prev) ? prev : list.includes(cur) ? cur : (list[0] ?? cur)))
    } catch { /* skip */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // L51 optimistic locking + R2 abort + R3 double-submit guard
  const [version, setVersion] = useState<number>(0)
  const loadCtrlRef = useRef<AbortController | null>(null)
  const submittingRef = useRef(false)

  // RIMA F1: feed snapshot rows ke bot pengawas — readonly (G16), banner lama
  // tetap berdampingan. Ack di ref supaya ikut force-retry SAFETY_THRESHOLD.
  useSentinelFeed('blud/pergeseran', rows, 'perg-row-')
  const sentinelPreSave = useSentinelPreSave()
  const sentinelAckRef  = useRef<SentinelAckPayload | null>(null)
  // B6 draft: di-ref supaya ikut terbawa saat retry force=true (SAFETY_THRESHOLD)
  const draftRef        = useRef(false)
  // §4.3: alasan menurunkan pagu di bawah realisasi — ref, sebab satu penyimpanan
  // bisa kena dua penolakan berturut-turut (safety threshold lalu pagu minus).
  const paksaTurunRef   = useRef<string | null>(null)
  // Penembus ambang drop baris. Dulu dioper sebagai argumen `doSimpanInternal`, dan
  // justru skenario yang disebut komentar di atas yang mematikannya: percobaan ulang
  // dari modal pagu melempar `false`, jadi ambang baris diperiksa ulang dari nol dan
  // konfirmasi yang sudah dijawab muncul lagi. Kedua bendera sekarang sama-sama ref.
  const paksaDropRef    = useRef(false)

  const loadPergeseran = useCallback(async (tanggal?: string) => {
    loadCtrlRef.current?.abort()
    const ctrl = new AbortController()
    loadCtrlRef.current = ctrl
    setLoading(true)
    try {
      const qs = new URLSearchParams({ tahun: String(tahun) })
      if (tanggal) qs.set('tanggal', tanggal)
      const res  = await fetch(`/api/blud/pergeseran?${qs.toString()}`, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      const json = await res.json()
      if (json.ok && json.data?.length) {
        setRows((json.data as PergeseranBaris[]).map(pergeseranKeInput))
        setVersi(json.versi_tanggal || '')
        setVersion(typeof json.version === 'number' ? json.version : 0)
        setBelumTersimpan(false)
        const firstRow = json.data[0] as PergeseranBaris
        if (firstRow?.dpa_versi_tanggal) setDpaVersi(firstRow.dpa_versi_tanggal)
        // Barisnya diganti muatan server — jejak "ini pulihan/salinan" tidak berlaku lagi.
        asalPulihkanRef.current = null
        asalBerkasRef.current   = null
        asalSalinRef.current    = null
        asalTutupRef.current    = null
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      showToast('Data pergeseran tidak bisa dimuat — periksa sambungan, lalu muat ulang halaman.', false)
    }
    finally  { setLoading(false) }
  }, [tahun])

  /**
   * Muat satu simpanan lama ke FORM — cermin `pulihkanSimpanan` di layar DPA.
   * Tidak ada yang ditulis di sini; Simpan biasa yang menuliskannya.
   */
  const pulihkanSimpanan = useCallback(async (s: SimpananItem) => {
    // L75b: yang tidak merusak jadi bawaan — confirmDialog memulangkan false utk Esc.
    const lanjut = await confirmDialog({
      title:   'Muat simpanan lama ke layar?',
      message: `Simpan ke-${s.versi_ke} pada ${formatTanggalId(s.versi_tanggal)} pukul ${s.disimpan_pada.slice(11, 16)} `
        + `(${s.jumlah_baris} baris) akan menggantikan ${rows.length} baris yang sekarang di layar.\n\n`
        + `Belum ada yang tersimpan sampai Anda menekan Simpan.`,
      confirmLabel: 'Muat ke layar',
      cancelLabel:  'Batal',
      variant:      'warning',
    })
    if (!lanjut) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/blud/riwayat-simpan?id=${s.id}`)
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Riwayat simpan tidak bisa diambil.')
      // Angka kunci SEGAR dari server, bukan `versi_ke` snapshot — kalau tidak,
      // L75 lahir kembali: snapshot lama membawa angka lama, kuncinya sudah maju.
      const vRes  = await fetch(`/api/blud/pergeseran?tahun=${tahun}&tanggal=${encodeURIComponent(s.versi_tanggal)}`)
      const vJson = await vRes.json()
      // Dibatalkan, bukan dilanjutkan dengan angka 0 — sebabnya sama dengan
      // jalur DPA: angka 0 menghasilkan 409 "diubah orang lain" yang palsu.
      if (!vRes.ok || typeof vJson.version !== 'number') {
        throw new Error('Angka kunci versi tidak bisa diambil, jadi pemulihan dibatalkan. Coba lagi sebentar lagi.')
      }
      // Di-recalc, sama seperti jalur DPA. Kolom turunan (`pergeseran`, `+/−`)
      // di dalam snapshot adalah angka yang dikirim klien saat itu; server
      // SELALU menghitung ulang sebelum menilai, dan lencana DRAFT di layar ini
      // juga. Memuat apa adanya membuat tabel memperlihatkan angka yang tidak
      // dipakai satu pun keputusan.
      setRows(recalcPergeseranJumlah(json.data.isi as PergeseranBarisInput[]))
      setVersi(s.versi_tanggal)
      setVersion(vJson.version)
      // Periode ikut pindah ke tanggal snapshot — cermin layar DPA. Tanpa ini
      // layar memperlihatkan simpanan 31 Juli sementara Simpan menulis ke bulan
      // berjalan.
      setPeriodeTulis(periodeUntukVersi(s.versi_tanggal))
      setBelumTersimpan(true)
      // Acuan DPA ikut dipulihkan dari snapshot — kalau tidak, Simpan berikutnya
      // memakai acuan yang kebetulan sedang terpilih di layar, bukan acuan aslinya.
      if (json.data.dpa_versi_tanggal) setDpaVersi(json.data.dpa_versi_tanggal)
      asalPulihkanRef.current = { id: s.id, versi_ke: s.versi_ke, disimpan_pada: s.disimpan_pada }
      asalSalinRef.current    = null
      asalBerkasRef.current   = null
      asalTutupRef.current    = null
      showToast(`${json.data.jumlah_baris} baris dari simpanan pukul ${s.disimpan_pada.slice(11, 16)} dimuat — belum tersimpan, periksa lalu tekan Simpan.`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), false)
    } finally { setLoading(false) }
  }, [tahun, rows.length])

  /**
   * Muat baris dari berkas cadangan JSON — pintu masuk kedua ke jalur Pulihkan.
   *
   * Mengganti ISI, TIDAK PERNAH sasaran (L80): periode & versi dibiarkan apa
   * adanya, jadi Simpan tetap mendarat di tempat yang sudah terlihat di layar.
   * Yang dari berkas cuma barisnya.
   */
  async function muatDariBerkas(data: BerkasCadangan, nama: string) {
    const lanjut = await confirmDialog({
      title:   'Muat cadangan ke layar?',
      message: `Berkas "${nama}" berisi ${data.rows.length} baris — versi `
        + `${formatTanggalId(data.versi_tanggal)}, simpan ke-${data.versi_ke} `
        + `(${data.disimpan_pada}). Isinya akan menggantikan ${rows.length} baris yang sekarang di layar.

`
        + `Belum ada yang tersimpan sampai Anda menekan Simpan, dan sasarannya tetap `
        + `${formatTanggalId(sasaranSimpan(periodeTulis))}.`,
      confirmLabel: 'Muat ke layar',
      cancelLabel:  'Batal',
      variant:      'warning',
    })
    if (!lanjut) return
    // Di-recalc seperti jalur Pulihkan: kolom turunan di dalam berkas adalah
    // angka yang dikirim klien saat itu, sedangkan server SELALU menghitung ulang
    // sebelum menilai. Memuat apa adanya membuat tabel memperlihatkan angka yang
    // tidak dipakai satu pun keputusan.
    setRows(recalcPergeseranJumlah(data.rows as unknown as PergeseranBarisInput[]))
    setBelumTersimpan(true)
    asalBerkasRef.current   = {
      nama, versi_tanggal: data.versi_tanggal, versi_ke: data.versi_ke, disimpan_pada: data.disimpan_pada,
    }
    asalSalinRef.current    = null
    asalPulihkanRef.current = null
    asalTutupRef.current    = null
    showToast(`${data.rows.length} baris dari berkas cadangan dimuat — belum tersimpan, periksa lalu tekan Simpan.`)
  }

  // Generate: ambil DPA terbaru DALAM TAHUN TERPILIH, jadikan tabel pergeseran baru.
  // Empty-state (§2.1): kalau tahun itu belum punya DPA → guard arahkan buat DPA dulu.
  const generate = useCallback(async () => {
    setLoading(true)
    try {
      // Periode historis WAJIB menarik DPA periode yang sama. Tanpa `?tanggal=`,
      // server memulangkan DPA TERBARU — dan Pergeseran Januari akan lahir dari
      // angka Agustus. Servernya juga menolaknya (`dpa_versi_tanggal` tidak boleh
      // lebih baru dari versinya), tapi penolakan itu baru datang saat Simpan,
      // sesudah seluruh geserannya diisi.
      //
      // Yang dicari BUKAN DPA bertanggal persis akhir bulan, melainkan DPA yang
      // BERLAKU pada akhir bulan itu — versi terakhir yang tanggalnya ≤ periode.
      // Versi DPA lahir pada hari orang menyimpannya (mis. 2026-07-26), jadi
      // pencarian tanggal persis ke 2026-07-31 tidak akan menemukan apa pun
      // padahal DPA Julinya jelas ada.
      const qs = new URLSearchParams({ tahun: String(tahun) })
      if (periodeTulis) {
        const rh = await fetch(`/api/blud/dpa?mode=history&tahun=${tahun}`)
        const jh = await rh.json()
        const berlaku = ((jh.data ?? []) as { versi_tanggal: string }[])
          .map(d => d.versi_tanggal)
          .filter(v => v <= periodeTulis)
          .sort()
          .pop()
        if (!berlaku) {
          showToast(`Belum ada DPA yang berlaku sampai ${formatTanggalId(periodeTulis)}. Susun DPA periode itu dulu di menu DPA BLUD.`, false)
          return
        }
        qs.set('tanggal', berlaku)
      }
      const res  = await fetch(`/api/blud/dpa?${qs.toString()}`)
      const json = await res.json()
      if (!json.ok || !json.data?.length) {
        showToast(
          periodeTulis
            ? `Belum ada DPA untuk periode ${formatTanggalId(periodeTulis)}. Susun DPA periode itu dulu di menu DPA BLUD.`
            : `Tahun ${tahun} belum punya DPA. Susun DPA ${tahun} dulu di menu DPA BLUD, baru pergeserannya bisa dibuat.`,
          false,
        )
        return
      }
      // Ditolak DI MUKA, bukan saat Simpan — sepadan penjaga `kegemukan` di
      // SalinTahunModal. Tanpa ini tabelnya tetap tampil, orang mengisi seluruh
      // geserannya, lalu Zod menolak di ujung dan Sinkronkan DPA ikut buntu.
      if (json.data.length > BLUD_SIMPAN_MAKS_BARIS) {
        showToast(
          `DPA ${tahun} berisi ${json.data.length} baris, di atas batas ${BLUD_SIMPAN_MAKS_BARIS} baris per simpan. Rampingkan dulu di menu DPA BLUD — kalau diteruskan, geserannya tidak akan bisa disimpan.`,
          false,
        )
        return
      }

      const generated: PergeseranBarisInput[] = (json.data as DpaBaris[]).map(dpaKePergeseranInput)

      setRows(generated)
      setDpaVersi(json.versi_tanggal || '')
      setVersi('')
      setBelumTersimpan(true)
      // Barisnya lahir dari DPA, bukan dari pulihan/salinan/penutupan. Ref yang
      // dibiarkan menempel akan membuat baris audit simpan berikutnya berbohong —
      // dan untuk `asalTutupRef` lebih dari berbohong: ia akan mencoba menutup
      // versi yang barisnya sudah tidak ada lagi di layar.
      asalPulihkanRef.current = null
      asalBerkasRef.current   = null
      asalSalinRef.current    = null
      asalTutupRef.current    = null
      showToast(periodeTulis
        ? `Tabel disalin dari DPA ${formatTanggalId(json.versi_tanggal || periodeTulis)} — belum tersimpan, isi kolom pergeserannya lalu tekan Simpan.`
        : `Tabel disalin dari DPA ${tahun} terbaru — belum tersimpan, isi kolom pergeserannya lalu tekan Simpan.`)
    } catch { showToast('Tabel gagal dibuat — periksa sambungan, lalu coba lagi.', false) }
    finally  { setLoading(false) }
  }, [tahun, periodeTulis])

  /**
   * Cermin `gantiPeriode` di layar DPA. Pengosongannya sudah benar sejak awal di
   * sini; yang ditambahkan cuma pertanyaannya — "Buat Pergeseran" bisa
   * menghasilkan ratusan baris yang belum tersimpan di mana pun, dan berpindah
   * periode membuangnya tanpa sepatah kata pun.
   */
  async function gantiPeriode(tanggal: string) {
    if (tanggal === periodeTulis) return
    // Periode yang SUDAH punya arsip: memilihnya berarti MEMBUKA arsip itu,
    // bukan menyiapkan yang baru — cermin layar DPA.
    if (tanggal && history.some(h => h.versi_tanggal === tanggal)) {
      await bukaVersi(tanggal)
      return
    }
    // Patokannya `belumTersimpan`, BUKAN `versi` kosong — sesudah Pulihkan atau
    // sesudah satu sel disunting, `versi` terisi padahal isinya belum tersimpan.
    if (rows.length > 0 && belumTersimpan) {
      const buang = await confirmDialog({
        title:   'Ganti periode?',
        message: `Ada ${rows.length} baris di layar yang belum tersimpan di mana pun. `
          + `Berpindah periode mengosongkan tabel ini.`,
        confirmLabel: 'Ganti, buang isian',
        cancelLabel:  'Tetap di sini',
        variant:      'danger',
      })
      if (!buang) return
    }
    setPeriodeTulis(tanggal)
    // Mengganti periode LEWAT PEMILIH berarti tabelnya dibuang atau dimuat ulang,
    // jadi jejak penutupan tidak lagi menggambarkan apa yang ada di layar.
    // Perpindahan periode yang dilakukan `terapkanTutup` sengaja TIDAK lewat sini
    // — di sana pindahnya justru bagian dari pekerjaannya.
    asalTutupRef.current = null
    if (tanggal) {
      setRows([])
      setVersi('')
      setVersion(0)
      setBelumTersimpan(false)
    } else {
      await loadPergeseran()
    }
  }

  /** Ganti tahun anggaran — sepadan `gantiPeriode`, dan sama-sama mengganti layar. */
  async function gantiTahun(t: number) {
    if (t === tahun) return
    if (rows.length > 0 && belumTersimpan) {
      const buang = await confirmDialog({
        title:   'Ganti tahun anggaran?',
        message: `Ada ${rows.length} baris di layar yang belum tersimpan di mana pun. `
          + `Berpindah ke tahun ${t} membuangnya.`,
        confirmLabel: 'Ganti, buang isian',
        cancelLabel:  'Tetap di sini',
        variant:      'danger',
      })
      if (!buang) return
    }
    setTahun(t)
    setVersi('')
    setRows([])
    setPeriodeTulis('')
    setBelumTersimpan(false)
  }

  /**
   * Membuka satu versi tersimpan dari daftar — cermin `bukaVersi` di layar DPA.
   * Periode IKUT ke versi yang dibuka, jadi Simpan selalu menulis ke tempat
   * yang sedang dibaca layar.
   */
  async function bukaVersi(v: string) {
    if (!v || v === versi) return
    if (rows.length > 0 && belumTersimpan) {
      const buang = await confirmDialog({
        title:   'Buka versi lain?',
        message: `Ada ${rows.length} baris di layar yang belum tersimpan di mana pun. `
          + `Membuka versi ${formatTanggalId(v)} menggantikannya.`,
        confirmLabel: 'Buka, buang isian',
        cancelLabel:  'Tetap di sini',
        variant:      'danger',
      })
      if (!buang) return
    }
    setVersi(v)
    setPeriodeTulis(periodeUntukVersi(v))
    await loadPergeseran(v)
  }

  /**
   * "Salin dari Versi Lain" — cermin `terapkanSalinVersi` di layar DPA, dan
   * sama-sama TIDAK menyentuh `versi`/`periodeTulis`/`version`: menyalin
   * mengganti ISI layar, tidak pernah sasaran Simpan.
   *
   * Satu tambahan yang khas Pergeseran: `dpaVersi` IKUT pindah. Baris pergeseran
   * membawa salinan kolom DPA-nya sendiri, jadi kalau labelnya tidak ikut,
   * tabelnya memuat angka DPA versi sumber sambil mengaku mengacu DPA versi lain
   * — dan `PERGESERAN_TIDAK_BERIMBANG` menghitungnya terhadap acuan yang salah.
   */
  function terapkanSalinVersi(
    baris: PergeseranBarisInput[], asal: AsalSalin, dpaVersiSumber: string | null,
  ) {
    setRows(recalcPergeseranJumlah(baris))
    if (dpaVersiSumber) setDpaVersi(dpaVersiSumber)
    setBelumTersimpan(true)
    asalSalinRef.current    = asal
    asalPulihkanRef.current = null
    asalBerkasRef.current   = null
    asalTutupRef.current    = null
    setSalinVersiBuka(false)
    showToast(`${baris.length} baris disalin dari versi ${formatTanggalId(asal.versi)} — belum tersimpan, `
      + `periksa lalu tekan Simpan.`)
  }

  /** Baris hasil sinkron dipasang ke layar — dipakai jalur "tidak ada yang berubah" DAN tombol Terapkan. */
  const pasangHasilSinkron = useCallback((
    baris: PergeseranBarisInput[], versiDpa: string,
    low: { kode_rekening: string; uraian: string }[],
  ) => {
    setRows(baris)
    setBelumTersimpan(true)
    if (versiDpa) setDpaVersi(versiDpa)
    // B5: match tier heuristik longgar bisa salah tempel vol_p/harga_p — minta user periksa
    if (low.length > 0) {
      const contoh = low.slice(0, 3).map(l => l.uraian || l.kode_rekening).join(', ')
      toast.warning(
        `${low.length} baris dipasangkan berdasarkan kemiripan, bukan kecocokan pasti — tolong periksa: ${contoh}${low.length > 3 ? ', dan lainnya' : ''}`,
        { duration: 8000 },
      )
    }
  }, [])

  // Sinkronkan DPA: segarkan kolom sisi DPA dari versi DPA yang BERLAKU pada
  // sasaran Simpan — bukan yang terbaru (lihat catatan di InjectBodySchema).
  //
  // Bandingkan dulu, baru bertanya (CONCEPT §9.2). Dialog "yakin?" yang dulu
  // berdiri di depan sudah dibuang: ia menanyakan sesuatu yang sekarang bisa
  // DIJAWAB. Nol perubahan angka → langsung diterapkan tanpa mengganggu siapa
  // pun; ada perubahan → barisnya dan nominalnya ditampilkan lebih dulu.
  const inject = useCallback(async () => {
    if (!rows.length) { showToast('Belum ada tabelnya. Tekan "Buat Pergeseran" dulu.', false); return }
    setInjecting(true)
    try {
      const res  = await fetch('/api/blud/pergeseran/inject', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tahun_anggaran: tahun,
          versi_tanggal:  sasaranSimpan(periodeTulis),
          pergeseran_rows: rows,
        }),
      })
      const json = await res.json()
      if (!json.ok) {
        showToast(json.error || json.message || 'Kolom DPA gagal disamakan. Coba lagi.', false)
        return
      }
      const hasil = json.data as PergeseranBarisInput[]
      const beda  = bedaSinkron(rows, hasil)
      const low   = (json.low_confidence ?? []) as { kode_rekening: string; uraian: string }[]
      if (!sinkronMengubahAngka(beda)) {
        pasangHasilSinkron(hasil, json.dpa_versi, low)
        // Baris baru dari DPA sengaja TIDAK menahan penerapan — menambah rekening
        // memang tujuan tombol ini dan tidak membatalkan apa pun. Tapi jumlahnya
        // tetap disebut: "tidak ada angka yang berubah" sambil diam-diam menyisipkan
        // 5 rekening baru itu kalimat yang tidak benar.
        showToast(beda.barisBaru > 0
          ? `Disamakan dengan DPA ${formatTanggalId(json.dpa_versi)} — ${beda.barisBaru} rekening baru ditambahkan, `
            + `angka yang sudah ada tidak berubah.`
          : `Sudah sama dengan DPA ${formatTanggalId(json.dpa_versi)} — tidak ada angka yang berubah.`)
        return
      }
      setPratinjauSinkron({ rows: hasil, beda, dpaVersi: json.dpa_versi, low })
    } catch { showToast('Kolom DPA gagal disamakan — periksa sambungan, lalu coba lagi.', false) }
    finally  { setInjecting(false) }
  }, [rows, tahun, periodeTulis, pasangHasilSinkron])

  // ── Tutup Pergeseran ───────────────────────────────────────────────────────
  // Menyusun lembar konfirmasi. Tidak mengubah apa pun — yang mengubah layar
  // `terapkanTutup`, dan yang menulis tetap tombol Simpan (CONCEPT §3).
  function mulaiTutup() {
    const periodeBaru = periodeSetelahTutup(versi)
    const sasaranTgl  = sasaranSimpan(periodeBaru)
    const sudah       = tutupList.find(t => t.versi_ditutup === versi)
    const sesudah     = tutupPergeseranRows(rows)
    setKonfirmTutup({
      versiDitutup: versi,
      sasaran:      sasaranTgl,
      periode:      periodeBaru,
      // Dihitung dari pohon yang di-recalc, bukan dari kolom tersimpan — sumber
      // yang sama dengan `tutupPergeseranRows`, supaya dua angka di lembar ini
      // tidak pernah lahir dari dua cara hitung.
      paguSebelum:  totalPaguAkar(recalcPergeseranJumlah(rows)),
      paguSesudah:  totalPaguAkar(sesudah),
      jumlahBaris:  rows.length,
      halangan: sudah
        ? `Versi ${formatTanggalId(versi)} sudah ditutup — basisnya ${formatTanggalId(sudah.versi_basis)}. `
          + `Satu putaran hanya bisa ditutup sekali.`
        : alasanTolakTutup(sasaranTgl, versi, history.map(h => h.versi_tanggal)),
    })
  }

  function terapkanTutup() {
    if (!konfirmTutup || konfirmTutup.halangan) return
    setRows(tutupPergeseranRows(rows))
    // SATU-SATUNYA aksi di layar ini yang memindahkan sasaran Simpan, dan
    // pengecualiannya disengaja (CONCEPT §5): L80 melarangnya untuk Salin Versi
    // karena di sana perpindahan sasaran adalah efek samping; di sini periode
    // berikutnya ADALAH pekerjaannya. Syaratnya dipenuhi — chip periode berganti
    // di depan mata, dan lembar konfirmasi sudah menyebut tujuannya lebih dulu.
    setPeriodeTulis(konfirmTutup.periode)
    setBelumTersimpan(true)
    asalTutupRef.current    = { versi_ditutup: konfirmTutup.versiDitutup }
    asalSalinRef.current    = null
    asalPulihkanRef.current = null
    asalBerkasRef.current   = null
    setKonfirmTutup(null)
    showToast(`Kolom pergeseran disalin ke kolom kiri. Basis akan disimpan sebagai `
      + `${labelSasaranTutup(konfirmTutup.sasaran, konfirmTutup.periode)} — belum tersimpan, tekan Simpan.`)
  }

  /** Alasan tombol Tutup mati — kosong berarti hidup. Sekaligus jadi tooltipnya (L79c). */
  const alasanKunciTutup = !rows.length
    ? 'Belum ada tabelnya.'
    : !versi
      ? 'Simpan dulu versi pergeserannya. Yang ditutup harus versi yang sudah tercatat, bukan isian di layar.'
      : belumTersimpan
        ? 'Ada perubahan yang belum tersimpan. Tekan Simpan dulu, baru versinya bisa ditutup.'
        : tutupList.some(t => t.versi_ditutup === versi)
          ? `Versi ${formatTanggalId(versi)} sudah ditutup.`
          : ''

  async function simpan() {
    if (!rows.length) { showToast('Tabel masih kosong — belum ada yang bisa disimpan.', false); return }
    if (submittingRef.current) return
    submittingRef.current = true
    try {
      // RIMA F1 pre-save (CONCEPT §4): critical blokir, warning konfirmasi, ack → audit G8
      const gate = await sentinelPreSave()
      if (!gate.ok) return
      sentinelAckRef.current = gate.ack
      // B6: pergeseran WAJIB berimbang (pagu tetap). Belum berimbang → tawarkan
      // simpan DRAFT (pengakuan eksplisit, flag ke server); status draft
      // diturunkan dari delta, tidak disimpan di DB
      // Hitung dari pohon, JANGAN percaya kolom `bertambah_berkurang` yang
      // menempel di baris: server selalu `recalcPergeseranJumlah` dulu sebelum
      // menilai (route.ts), jadi klien yang membaca angka tersimpan bisa yakin
      // "sudah berimbang", melewatkan tawaran draf, lalu ditolak 400 tanpa
      // jalan keluar. Dua cara hitung untuk satu keputusan = dua jawaban.
      const rootDelta = hitungDeltaPergeseranRoot(recalcPergeseranJumlah(rows))
      draftRef.current = false
      paksaTurunRef.current = null
      paksaDropRef.current = false
      if (rootDelta !== 0) {
        const simpanDraft = await confirmDialog({
          title: 'Belum berimbang',
          message: `Dibanding DPA, total anggarannya ${rootDelta > 0 ? 'bertambah' : 'berkurang'} ${formatRupiah(Math.abs(rootDelta))}. Menggeser anggaran hanya memindahkan uang antar pos — jumlah totalnya harus tetap sama. Simpan dulu sebagai draf dan lanjutkan nanti?`,
          confirmLabel: 'Simpan sebagai draf',
          variant: 'warning',
        })
        if (!simpanDraft) return
        draftRef.current = true
      }
      setSaving(true)
      await doSimpanInternal(sasaranSimpan(periodeTulis))
    } finally { submittingRef.current = false; setSaving(false) }
  }

  // Audit BLUD v1.2 (B-NEW-3): split jadi internal supaya bisa retry dengan force=true
  // L51: kirim expected_version + handle VERSION_CONFLICT
  // Bendera penembus (`force`, alasan §4.3) SENGAJA tidak ada di tanda tangan — lihat
  // catatan di deklarasi `paksaTurunRef`/`paksaDropRef`.
  async function doSimpanInternal(versiTanggal: string) {
    try {
      const res  = await fetch('/api/blud/pergeseran', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tahun_anggaran: tahun, versi_tanggal: versiTanggal, dpa_versi_tanggal: dpaVersi || undefined,
          rows, force: paksaDropRef.current, draft: draftRef.current,
          // Diturunkan dari tanggalnya sendiri, BUKAN dari state `periodeTulis`:
          // fungsi ini dipanggil ulang dari jalur retry dengan tanggal yang sudah
          // ditangkap lebih dulu (lihat catatan yang sama di dpa-client).
          entri_historis: versiTanggal !== tanggalHariIniWIB(),
          expected_version: expectedVersionUntuk(versiTanggal, versi, version),
          turunkan_paksa: !!paksaTurunRef.current,
          alasan_turun: paksaTurunRef.current ?? undefined,
          sentinel_ack: sentinelAckRef.current ?? undefined,
          asal_salin: asalSalinRef.current ?? undefined,
          asal_pulihkan: asalPulihkanRef.current ?? undefined,
          asal_berkas: asalBerkasRef.current ?? undefined,
          asal_tutup: asalTutupRef.current ?? undefined,
        }),
      })
      const json = await res.json()
      if (res.status === 409 && json.code === 'PAGU_DIBAWAH_REALISASI') {
        setAlasanTurun('')
        setBentrokPagu({ versiTanggal, detail: json.detail ?? [] })
        return
      }
      if (res.status === 409 && json.code === 'VERSION_CONFLICT') {
        // Sama dengan jalur DPA: yang belum tersimpan tidak boleh hilang tanpa
        // ditanya. Di sini malah lebih buruk sebelumnya — `loadPergeseran` hanya
        // menyetel state kalau server mengirim baris, jadi memuat versi yang belum
        // ada tidak mengubah apa pun dan Simpan berikutnya ditolak lagi, terus
        // berputar tanpa jalan keluar.
        //
        // Cermin layar DPA: `expected = 0` berarti layar menyusun versi BARU dan
        // tanggalnya ternyata sudah terisi — paling sering simpanan sendiri yang
        // lebih awal, bukan rekan kerja. Menuduh "orang lain" di situ membuat
        // orang mencari tersangka yang tidak ada.
        const versiBaruTernyataAda = json.expected === 0
        const ambilYangTersimpan = await confirmDialog({
          title: versiBaruTernyataAda
            ? `Versi ${formatTanggalId(versiTanggal)} sudah ada isinya`
            : 'Versi ini berubah sejak layar dibuka',
          message: (versiBaruTernyataAda
            ? `Layar ini menyusun versi baru, tapi versi ${formatTanggalId(versiTanggal)} ternyata sudah tersimpan — bisa simpanan Anda sendiri yang lebih awal, bisa rekan kerja. `
            : `Sementara layar ini terbuka, versi ${formatTanggalId(versiTanggal)} disimpan ulang — bisa dari tab Anda yang lain, bisa rekan kerja. `)
            + `Isian di layar (${rows.length} baris) belum tersimpan di mana pun.\n\n`
            + `Muat yang tersimpan — isian di layar hilang.\n`
            + `Tetap pakai isian layar — yang tersimpan tertimpa, begitu Anda tekan Simpan sekali lagi.`,
          confirmLabel: 'Muat yang tersimpan',
          cancelLabel:  'Tetap pakai isian saya',
          variant:      'warning',
        })
        if (ambilYangTersimpan) { await loadPergeseran(versiTanggal); return }
        if (typeof json.actual === 'number') { setVersi(versiTanggal); setVersion(json.actual) }
        showToast('Isian Anda dipertahankan. Tekan Simpan sekali lagi kalau memang mau menimpa yang tersimpan.', false)
        return
      }
      if (res.status === 409 && json.code === 'SAFETY_THRESHOLD') {
        setSafetyWarning({
          versiTanggal,
          existing: json.existing,
          incoming: json.incoming,
          dropPct:  json.dropPct,
        })
        return
      }
      if (res.status === 409 && json.code === 'HISTORIS_JADI_PAGU') {
        showToast(json.error, false)
        return
      }
      // Dua pagar penutupan. Barisnya TIDAK dibuang dan `asalTutupRef` TIDAK
      // dikosongkan: keduanya hilang begitu periodenya diganti, jadi menekan
      // Simpan lagi sesudah itu harus tetap tercatat sebagai penutupan.
      if (res.status === 409 && (json.code === 'SASARAN_TUTUP_TERPAKAI' || json.code === 'SUDAH_DITUTUP')) {
        toast.error(json.error, { duration: 9000 })
        return
      }
      if (json.ok) {
        showToast(json.message)
        setVersi(versiTanggal)
        // Periode TETAP di versi yang barusan ditulis — cermin layar DPA.
        // `setPeriodeTulis('')` di sini dulu membuat koreksi kedua mendarat di
        // bulan berjalan, bukan di bulan yang barusan disimpan.
        setPeriodeTulis(periodeUntukVersi(versiTanggal))
        setBelumTersimpan(false)
        loadHistory(); loadTahunList(); loadRiwayat()
        // Sudah tercatat di audit simpan ini; simpan berikutnya bukan lagi pemulihan/salinan.
        asalPulihkanRef.current = null
        asalBerkasRef.current   = null
        asalSalinRef.current    = null
        // Wajib dikosongkan, dan lebih keras dari dua di atas: kalau tertinggal,
        // koreksi berikutnya akan mencoba menutup versi yang SAMA sekali lagi dan
        // ditolak PRIMARY KEY — orangnya cuma melihat "sudah ditutup" pada simpan
        // biasa yang tidak ada hubungannya dengan penutupan.
        asalTutupRef.current    = null
        if (json.dpa_versi) setDpaVersi(json.dpa_versi)
        if (typeof json.version === 'number') setVersion(json.version)
        // Jangkar baris baru dicetak server saat simpan — tanpa diserap ke state,
        // simpan KEDUA tanpa muat ulang akan ditolak `periksaJangkar` tanpa sebab.
        if (json.jangkar) {
          const peta = json.jangkar as Record<string, string>
          setRows(prev => prev.map(r => (r.anggaran_key ? r : { ...r, anggaran_key: peta[r.row_id] ?? null })))
        }
        if (draftRef.current) {
          toast.warning('Tersimpan sebagai draf. Belum bisa dipakai sebagai dokumen resmi sampai selisihnya nol.', { duration: 6000 })
        }
      } else {
        showToast(json.error || json.message || 'Belum tersimpan. Coba lagi.', false)
      }
    } catch { showToast('Belum tersimpan — sambungan ke server terputus. Coba lagi sebentar lagi.', false) }
  }

  useEffect(() => { void (async () => { await loadTahunList() })() }, [loadTahunList])
  // loadPergeseran/loadHistory ber-dep [tahun] → efek refire saat tahun berganti.
  useEffect(() => { void (async () => { await loadPergeseran(); await loadHistory(); await loadRiwayat() })() }, [loadPergeseran, loadHistory, loadRiwayat])

  // B6: status DRAFT diturunkan dari delta akar (tidak disimpan) — badge live,
  // hilang sendiri begitu angka berimbang. Sumber hitungannya sama persis
  // dengan `simpan()` dan server: pohon yang di-recalc, bukan kolom tersimpan.
  // `useMemo` supaya recalc tidak jalan di tiap render, hanya saat baris berubah.
  const deltaBerimbang = useMemo(
    () => (rows.length > 0 ? hitungDeltaPergeseranRoot(recalcPergeseranJumlah(rows)) : 0),
    [rows],
  )

  // L78 — "Buat Pergeseran" bisa menghasilkan ratusan baris yang belum tersimpan
  // di mana pun; satu klik menu atau satu Ctrl+R dulu membuangnya diam-diam.
  useIngatkanBelumTersimpan(
    belumTersimpan && rows.length > 0
      ? `Ada ${rows.length} baris Pergeseran ${tahun} di layar yang belum tersimpan. Meninggalkan halaman ini membuangnya.`
      : null,
  )

  // Cermin layar DPA: tombol yang mengganti SELURUH tabel dikunci selama versi
  // tersimpan sedang terbuka. Di sini cuma satu — "Buat Pergeseran". "Sinkronkan
  // DPA" SENGAJA tidak ikut: ia memperbarui kolom sisi DPA di tempat, menjaga
  // `row_id` dan vol_p/harga_p, jadi jangkarnya utuh dan itu pekerjaan normal
  // pada versi yang sudah tersimpan.
  const alasanKunciBorongan = versi
    ? `Versi ${formatTanggalId(versi)} sedang terbuka. Pilih periode yang belum punya versi, atau hapus versinya dulu di menu Pengaturan.`
    : ''
  // Sasaran Simpan, satu rumus dengan tombol Simpan (`sasaranSimpan`).
  const sasaran = sasaranSimpan(periodeTulis)
  // Cermin layar DPA: Salin Versi SENGAJA di luar `alasanKunciBorongan`. "Buat
  // Pergeseran" dikunci karena menarik DPA — baris yang jangkarnya belum ada;
  // Salin Versi mengambil baris pergeseran tahun yang sama dengan jangkar utuh,
  // dan sasaran yang sudah berisi justru pemakaian utamanya.
  const alasanKunciVersi = alasanKunciSalinVersi(tahun, history, [versi, sasaran])

  // Lencana penutupan di daftar versi. Dua peran berbeda dan keduanya perlu
  // terbaca: versi yang DITUTUP (dokumen putaran itu) dan versi BASIS yang lahir
  // darinya. Tanpa keduanya, daftar versi cuma menampilkan deretan tanggal dan
  // "kenapa versi ini selisihnya nol" tidak terjawab di mana pun.
  const historyBerlencana = useMemo(
    () => history.map(h => ({ ...h, catatan: catatanVersi(tutupList, h.versi_tanggal) })),
    [history, tutupList],
  )

  return (
    <div className="space-y-4">
      {/* Sinkronkan DPA — pratinjau perubahan. Dialog "yakin?" yang dulu berdiri
          di DEPAN sudah dibuang: pertanyaannya sekarang bisa dijawab, dan panel
          ini yang menjawabnya. Muncul HANYA kalau ada angka yang berubah. */}
      {pratinjauSinkron && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.5)', backdropFilter:'blur(4px)', padding:16 }}>
          <div style={{ background:'#042C53', border:'1px solid #0C447C', borderRadius:16, boxShadow:'0 24px 60px rgba(0,0,0,.5)', width:'min(720px,100%)', maxHeight:'86vh', display:'flex', flexDirection:'column', padding:24 }}>
            <h2 style={{ fontWeight:800, color:'#E6F1FB', marginBottom:6 }}>
              Menyamakan dengan DPA {formatTanggalId(pratinjauSinkron.dpaVersi)} akan mengubah angka
            </h2>
            <p style={{ fontSize:13, color:'#85B7EB', marginBottom:14, lineHeight:1.6 }}>
              {pratinjauSinkron.beda.baris.length} baris berubah nominalnya
              {pratinjauSinkron.beda.barisBaru > 0 && ` · ${pratinjauSinkron.beda.barisBaru} baris baru dari DPA`}
              {pratinjauSinkron.beda.barisHilang > 0 && ` · ${pratinjauSinkron.beda.barisHilang} baris hilang`}
              {Math.abs(pratinjauSinkron.beda.deltaPagu) >= 0.005 && (
                <> · total pagu <strong style={{ color:'#FCD34D' }}>
                  {pratinjauSinkron.beda.deltaPagu > 0 ? '+' : '−'}{formatRupiah(Math.abs(pratinjauSinkron.beda.deltaPagu))}
                </strong></>
              )}
            </p>

            {/* Versi hasil penutupan: kolom kirinya BUKAN angka DPA lagi, jadi
                seluruh barisnya terbaca "belum digeser" oleh pencocok inject dan
                bisa ditarik balik ke DPA murni sekaligus. Ini satu-satunya tempat
                orang bisa tahu sebelum menekan. */}
            {tutupList.some(t => t.versi_basis === versi) && (
              <div className="tp-galat" style={{ marginBottom:14 }}>
                <strong>Versi ini basis hasil penutupan.</strong>{' '}
                Kolom kirinya berisi hasil pergeseran putaran sebelumnya, bukan angka DPA murni.
                Menerapkan sinkron akan mengembalikannya ke angka DPA — hasil penutupan itu batal,
                dan pagu realisasi ikut mundur.
              </div>
            )}

            <div style={{ flex:1, overflowY:'auto', border:'1px solid #0C447C', borderRadius:8 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead style={{ position:'sticky', top:0, background:'#042C53' }}>
                  <tr style={{ color:'#85B7EB', textAlign:'left' }}>
                    <th style={{ padding:'7px 10px' }}>Rekening</th>
                    <th style={{ padding:'7px 10px', textAlign:'right' }}>Pagu sekarang</th>
                    <th style={{ padding:'7px 10px', textAlign:'right' }}>Jadi</th>
                    <th style={{ padding:'7px 10px', textAlign:'right' }}>Selisih</th>
                  </tr>
                </thead>
                <tbody>
                  {pratinjauSinkron.beda.baris.slice(0, 60).map(b => {
                    const d = b.pergeseranBaru - b.pergeseranLama
                    return (
                      <tr key={b.row_id} style={{ borderTop:'1px solid #0C447C', color:'#B5D4F4' }}>
                        <td style={{ padding:'6px 10px' }}>
                          <span style={{ fontFamily:'var(--font-mono,monospace)', color:'#85B7EB' }}>{b.kode_rekening}</span>{' '}
                          {b.uraian}
                        </td>
                        <td style={{ padding:'6px 10px', textAlign:'right', fontFamily:'var(--font-mono,monospace)' }}>{formatRupiah(b.pergeseranLama)}</td>
                        <td style={{ padding:'6px 10px', textAlign:'right', fontFamily:'var(--font-mono,monospace)' }}>{formatRupiah(b.pergeseranBaru)}</td>
                        <td style={{ padding:'6px 10px', textAlign:'right', fontFamily:'var(--font-mono,monospace)', color: d === 0 ? '#85B7EB' : d > 0 ? '#1D9E75' : '#E24B4A' }}>
                          {d === 0 ? '—' : `${d > 0 ? '+' : '−'}${formatRupiah(Math.abs(d))}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {pratinjauSinkron.beda.baris.length > 60 && (
                <div style={{ padding:'8px 10px', fontSize:11.5, color:'#85B7EB', borderTop:'1px solid #0C447C' }}>
                  …dan {pratinjauSinkron.beda.baris.length - 60} baris lain.
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <PrimaButton variant="ghost" size="sm" onClick={() => setPratinjauSinkron(null)}>Batal</PrimaButton>
              <PrimaButton variant="warning" size="sm" onClick={() => {
                pasangHasilSinkron(pratinjauSinkron.rows, pratinjauSinkron.dpaVersi, pratinjauSinkron.low)
                setPratinjauSinkron(null)
                showToast('Kolom DPA disamakan — belum tersimpan, periksa lalu tekan Simpan.')
              }}>
                Terapkan perubahan ini
              </PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* Tutup Pergeseran — lembar yang MENAMPILKAN, bukan modal yang menyuruh
          memilih. Yang ditutup selalu versi yang sedang dilihat (CONCEPT §11). */}
      {konfirmTutup && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.5)', backdropFilter:'blur(4px)', padding:16 }}>
          <div style={{ background:'#042C53', border:'1px solid #0C447C', borderRadius:16, boxShadow:'0 24px 60px rgba(0,0,0,.5)', width:'min(560px,100%)', padding:24 }}>
            <h2 style={{ fontWeight:800, color:'#E6F1FB', marginBottom:14 }}>Tutup pergeseran ini?</h2>

            <dl style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'8px 14px', fontSize:13, marginBottom:16 }}>
              <dt style={{ color:'#85B7EB' }}>Yang ditutup</dt>
              <dd style={{ color:'#E6F1FB', fontWeight:700 }}>
                {formatTanggalId(konfirmTutup.versiDitutup)} · {konfirmTutup.jumlahBaris} baris
              </dd>
              <dt style={{ color:'#85B7EB' }}>Disimpan sebagai</dt>
              <dd style={{ color:'#E6F1FB', fontWeight:700 }}>
                {labelSasaranTutup(konfirmTutup.sasaran, konfirmTutup.periode)}
              </dd>
              <dt style={{ color:'#85B7EB' }}>Total pagu</dt>
              {/* Kedua angka WAJIB sama — penutupan tidak menyentuh vol_p/harga_p.
                  Kalau sampai berbeda, ada yang salah, dan itu terlihat SEBELUM
                  disimpan, bukan sesudah. */}
              <dd style={{ fontFamily:'var(--font-mono,monospace)', color: Math.abs(konfirmTutup.paguSesudah - konfirmTutup.paguSebelum) < 0.005 ? '#1D9E75' : '#E24B4A' }}>
                {formatRupiah(konfirmTutup.paguSebelum)} → {formatRupiah(konfirmTutup.paguSesudah)}
                {Math.abs(konfirmTutup.paguSesudah - konfirmTutup.paguSebelum) < 0.005
                  ? ' · tidak berubah'
                  : ' · BERUBAH — jangan diteruskan, laporkan ini'}
              </dd>
              <dt style={{ color:'#85B7EB' }}>Yang berubah</dt>
              <dd style={{ color:'#B5D4F4', lineHeight:1.6 }}>
                Kolom volume, harga, dan jumlah diisi angka pergeseran. Selisihnya jadi nol,
                dan geseran berikutnya dihitung terhadap hasil putaran ini.
              </dd>
            </dl>

            {konfirmTutup.halangan
              ? (
                <div className="tp-galat" style={{ marginBottom:16 }}>{konfirmTutup.halangan}</div>
              )
              : (
                <div className="tp-ingat" style={{ marginBottom:16 }}>
                  Belum tersimpan sampai Anda menekan <strong>Simpan</strong>. Sampai saat itu, tidak ada
                  satu pun yang berubah di server.
                </div>
              )}

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <PrimaButton variant="ghost" size="sm" onClick={() => setKonfirmTutup(null)}>Batal</PrimaButton>
              <PrimaButton variant="success" size="sm" disabled={!!konfirmTutup.halangan} onClick={terapkanTutup}>
                Tutup pergeseran
              </PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background:'#042C53', border:'1px solid #0C447C', borderRadius:10, padding:'10px 16px', display:'flex', flexWrap:'wrap', alignItems:'center', gap:10 }}>
        <h1 style={{ fontWeight:800, fontSize:14, color:'#E6F1FB' }}>Pergeseran DPA</h1>

        {/* Tahun Anggaran — pilih tahun dulu (§2.1) */}
        <div data-rima="pergeseran.tahun-dropdown" style={{ display:'inline-flex' }}>
          <TahunDropdown
            value={tahun}
            items={tahunList}
            current={CURRENT_YEAR}
            onChange={t => { void gantiTahun(t) }}
          />
        </div>

        {bolehUbah && (
          <PeriodeVersiSelect
            tahun={tahun}
            versiTerpakai={history.map(h => h.versi_tanggal)}
            value={periodeTulis}
            onChange={v => { void gantiPeriode(v) }}
          />
        )}

        {bolehUbah && (
          <>
            <PrimaButton variant="purple" iconLeft={<Sparkles className="w-3.5 h-3.5" />}
              disabled={loading || !!alasanKunciBorongan} onClick={generate}
              data-tooltip={alasanKunciBorongan
                || 'Salin isi DPA terbaru tahun ini jadi tabel pergeseran baru'}
              data-rima="pergeseran.buat">
              Buat Pergeseran
            </PrimaButton>

            {/* Pagar 5 dulu MEMATIKAN tombol ini pada periode historis, karena
                `inject` selalu menarik DPA TERBARU: menekannya di Pergeseran
                Januari akan menimpa kolom DPA dengan angka Agustus. Sekarang
                servernya mengambil DPA yang BERLAKU pada sasaran Simpan, jadi
                sebabnya hilang dan tombolnya hidup lagi di periode historis —
                menutup Januari lalu menyamakan dengan DPA Januari kini bisa. */}
            <PrimaButton variant="success" iconLeft={<RefreshCw className="w-3.5 h-3.5" />}
              disabled={injecting || !rows.length}
              onClick={() => { void inject() }}
              data-tooltip={`Samakan kode, uraian, volume, dan harga dengan DPA yang berlaku pada ${formatTanggalId(sasaran)} — perubahannya ditampilkan dulu sebelum diterapkan`}
              data-rima="pergeseran.sinkron-dpa">
              {injecting ? 'Membandingkan…' : 'Sinkronkan DPA'}
            </PrimaButton>

            <PrimaButton variant="warning" iconLeft={<Lock className="w-3.5 h-3.5" />}
              disabled={loading || !!alasanKunciTutup} onClick={mulaiTutup}
              data-tooltip={alasanKunciTutup
                || `Kunci hasil pergeseran ${formatTanggalId(versi)} dan jadikan patokan putaran berikutnya`}
              data-rima="pergeseran.tutup">
              Tutup Pergeseran
            </PrimaButton>

            <PrimaButton variant="ghost" iconLeft={<Copy className="w-3.5 h-3.5" />}
              disabled={loading || !!alasanKunciVersi}
              data-tooltip={alasanKunciVersi
                || `Ambil isi versi pergeseran lain tahun ${tahun} ke layar ini — sasaran Simpan tetap ${formatTanggalId(sasaran)}`}
              onClick={() => setSalinVersiBuka(true)} data-rima="pergeseran.salin-versi">
              Salin Versi Lain
            </PrimaButton>

            {/* Sasarannya sengaja TIDAK ikut berpindah — lihat `muatDariBerkas`.
                Ikut `alasanKunciBorongan` karena ia mengganti SELURUH tabel. */}
            <MuatBerkasButton
              jenis="PERGESERAN" tahun={tahun}
              alasanKunci={alasanKunciBorongan}
              onMuat={(d, n) => { void muatDariBerkas(d, n) }}
            />
          </>
        )}

        {/* data-rima: anchor tur RIMA F3 — wrapper inline-flex (display:contents rect-nya kosong) */}
        <div data-rima="pergeseran.versi-dropdown" style={{ display:'inline-flex' }}>
          <VersiDropdown
            value={versi}
            items={historyBerlencana}
            onChange={v => { void bukaVersi(v) }}
            placeholder="— Pilih History —"
            riwayat={riwayat}
            onPulihkan={bolehUbah ? pulihkanSimpanan : undefined}
            belumTersimpan={belumTersimpan}
          />
        </div>

        {bolehUbah && (
          <div style={{ marginLeft: 'auto' }}>
            <PrimaButton variant="primary" iconLeft={<Save className="w-3.5 h-3.5" />}
              disabled={saving} onClick={simpan} data-rima="pergeseran.simpan">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </PrimaButton>
          </div>
        )}

        {dpaVersi && (
          <span data-rima="pergeseran.sumber-dpa" style={{ fontSize:11, color:'#85B7EB', display:'flex', alignItems:'center', gap:4 }}>
            <Calendar style={{ width:12, height:12 }} /> Sumber DPA: {dpaVersi}
          </span>
        )}

        {deltaBerimbang !== 0 && (
          <span style={{ fontSize:11, fontWeight:800, color:'#FCD34D', background:'rgba(245,158,11,.15)', border:'1px solid #F59E0B', borderRadius:999, padding:'3px 10px', display:'inline-flex', alignItems:'center', gap:5 }}>
            <AlertTriangle style={{ width:12, height:12 }} />
            DRAFT — belum berimbang ({deltaBerimbang > 0 ? '+' : '−'}{formatRupiah(Math.abs(deltaBerimbang))})
          </span>
        )}
      </div>

      {!bolehUbah && <SpandukLihat menu="pergeseran" />}

      {/* Search bar + Legenda functional (filter level) */}
      <div style={{ background:'#042C53', border:'1px solid #0C447C', borderRadius:10, padding:'8px 16px', display:'flex', flexWrap:'wrap', gap:10, alignItems:'center' }}>
        <div style={{ position:'relative', flex:'0 0 240px' }}>
          <Search size={13} style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'#85B7EB', pointerEvents:'none' }} />
          <input
            type="text"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
            placeholder="Cari kode / uraian, lalu Enter..."
            style={{ width:'100%', padding:'5px 8px 5px 26px', borderRadius:6, border:'1px solid #185FA5', background:'#021A33', color:'#E6F1FB', fontSize:11.5 }}
          />
        </div>
        <button onClick={doSearch} disabled={!searchQ.trim()} style={{
          padding:'5px 12px', borderRadius:6, border:'1px solid #185FA5',
          background: searchQ.trim() ? '#185FA5' : 'transparent',
          color: searchQ.trim() ? '#FFFFFF' : '#85B7EB',
          fontSize:11.5, fontWeight:700, cursor: searchQ.trim() ? 'pointer' : 'not-allowed',
          fontFamily:'inherit', display:'inline-flex', alignItems:'center', gap:4,
        }}>Jump</button>

        <div style={{ width:1, height:22, background:'rgba(255,255,255,.10)', margin:'0 4px' }} />

        {[
          { bg:'#B45309',               label:'Level 1' },
          { bg:'rgba(16,185,129,.34)',  label:'Level 2' },
          { bg:'#334155',               label:'Level 2.1 ✎' },
          { bg:'rgba(139,92,246,.34)',  label:'Level 3' },
          { bg:'rgba(217,70,239,.22)',  label:'Level 3.1 ✎' },
          { bg:'rgba(6,182,212,.28)',   label:'Level 4' },
          { bg:'rgba(56,189,248,.20)',  label:'Level 4.1 ✎' },
        ].map(item => {
          const cleanLabel = item.label.replace(/ ✎$/, '')
          const hidden = hiddenLevels.has(cleanLabel)
          return (
            <button
              key={item.label}
              type="button"
              className={`blud-legend-chip ${hidden ? 'is-hidden' : 'is-active'}`}
              data-tooltip={hidden ? `Tampilkan ${cleanLabel}` : `Sembunyikan ${cleanLabel}`}
              onClick={() => setHiddenLevels(prev => {
                const next = new Set(prev)
                if (next.has(cleanLabel)) next.delete(cleanLabel)
                else next.add(cleanLabel)
                return next
              })}
            >
              <span className="swatch" style={{ background: item.bg }} />
              {item.label}
            </button>
          )
        })}
        {/* Level Lainnya — grup toggle untuk L5..L8.1 (hierarki dalam, jarang dipakai) */}
        {(() => {
          const extended = ['Level 5','Level 5.1','Level 6','Level 6.1','Level 7','Level 7.1','Level 8','Level 8.1']
          const allHidden = extended.every(l => hiddenLevels.has(l))
          return (
            <button
              type="button"
              className={`blud-legend-chip ${allHidden ? 'is-hidden' : 'is-active'}`}
              data-tooltip={allHidden ? 'Tampilkan Level 5 – 8.1' : 'Sembunyikan Level 5 – 8.1'}
              onClick={() => setHiddenLevels(prev => {
                const next = new Set(prev)
                if (allHidden) extended.forEach(l => next.delete(l))
                else           extended.forEach(l => next.add(l))
                return next
              })}
            >
              <span className="swatch" style={{
                background: 'linear-gradient(135deg, rgba(249,115,22,.45) 0%, rgba(244,63,94,.45) 35%, rgba(99,102,241,.45) 70%, rgba(100,116,139,.45) 100%)',
              }} />
              Level Lainnya
            </button>
          )
        })()}
        <span style={{ color:'#85B7EB', marginLeft:4, fontSize:11 }}>✎ = bisa input vol &amp; harga</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:192, color:'#85B7EB', background:'#042C53', border:'1px solid #0C447C', borderRadius:12 }}>
          <p style={{ fontSize:13 }}>Belum ada data Pergeseran.</p>
          <p style={{ fontSize:11, marginTop:4 }}>Tekan &quot;Buat Pergeseran&quot; untuk menyalin isi DPA terbaru ke sini.</p>
        </div>
      ) : (
        <PergeseranTable rows={rows} onChange={ubahRows} akunOptions={akunOptions} pjOptions={pjOptions} hiddenLevels={hiddenLevels} highlightId={highlightId} bolehUbah={bolehUbah} />
      )}

      {salinVersiBuka && (
        <SalinVersiModal<PergeseranBaris, PergeseranBarisInput>
          tahun={tahun}
          jenis="PERGESERAN"
          history={history}
          versiTerbuka={versi}
          sasaran={sasaran}
          jumlahDiLayar={rows.length}
          petakan={petakanPergeseranRows}
          hitungTotal={totalAkarPergeseran}
          onTutup={() => setSalinVersiBuka(false)}
          onSalin={terapkanSalinVersi}
        />
      )}

      {/* Audit BLUD v1.2 (B-NEW-3): modal konfirmasi safety threshold drop >50% */}
      {safetyWarning && (
        <div onClick={() => setSafetyWarning(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#042C53', border:'2px solid #E24B4A', borderRadius:'14px', padding:'24px', maxWidth:'500px', width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize:'15px', fontWeight:800, color:'#E24B4A', marginBottom:'10px' }}>
              ⚠️ Peringatan: Drop Banyak Baris (Pergeseran)
            </div>
            <div style={{ fontSize:'12px', color:'#B5D4F4', lineHeight:1.7, marginBottom:'16px' }}>
              Versi <strong style={{ color:'#FAC775' }}>{safetyWarning.versiTanggal}</strong>: Anda akan menggantikan <strong style={{ color:'#FAC775' }}>{safetyWarning.existing}</strong> baris existing dengan <strong style={{ color:'#FAC775' }}>{safetyWarning.incoming}</strong> baris baru — drop <strong style={{ color:'#E24B4A' }}>{safetyWarning.dropPct.toFixed(1)}%</strong>.
              <br /><br />
              <strong style={{ color:'#E24B4A' }}>Tindakan PERMANEN.</strong> Pastikan disengaja.
            </div>
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <PrimaButton variant="ghost" onClick={() => setSafetyWarning(null)} disabled={saving}>
                Batal
              </PrimaButton>
              <PrimaButton variant="danger" onClick={() => { const v = safetyWarning.versiTanggal; paksaDropRef.current = true; setSafetyWarning(null); setSaving(true); void doSimpanInternal(v).finally(() => setSaving(false)) }} disabled={saving}>
                Ya, Tetap Simpan
              </PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* §4.3: pagu turun di bawah realisasi. Boleh ditembus, tapi harus beralasan
          dan alasannya masuk audit log — yang menanggung risiko yang memutuskan. */}
      {bentrokPagu && (
        <div className="blud-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setBentrokPagu(null) }}>
          <div className="blud-modal-card rl-reg" role="dialog" aria-modal="true">
            <div className="blud-modal-header">
              <div>
                <div className="blud-modal-title">Pagu turun di bawah realisasi</div>
                <div className="blud-modal-subtitle">
                  {bentrokPagu.detail.length} baris · versi {formatTanggalId(bentrokPagu.versiTanggal)}
                </div>
              </div>
              <button className="blud-modal-close" onClick={() => setBentrokPagu(null)} aria-label="Tutup">✕</button>
            </div>

            <div className="rl-reg-body">
              <div className="bk-warn">
                Uangnya sudah keluar. Menyimpan pergeseran ini membuat baris di bawah jadi minus di layar
                Realisasi sampai diperbaiki.
              </div>

              <table className="dpa-table rl-reg-table">
                <thead>
                  <tr>
                    <th style={{ width: 170 }}>Kode</th>
                    <th>Uraian</th>
                    <th style={{ width: 130 }}>Pagu baru</th>
                    <th style={{ width: 130 }}>Terserap</th>
                    <th style={{ width: 130 }}>Minus</th>
                  </tr>
                </thead>
                <tbody>
                  {bentrokPagu.detail.map((d, i) => (
                    <tr key={i}>
                      <td className="bk-kode">{d.kode_rekening}</td>
                      <td>{d.uraian}{d.hilang && <span className="bk-tag-parkir">baris dihapus</span>}</td>
                      <td className="bk-r bk-num-inline">{formatRupiah(d.pagu_baru)}</td>
                      <td className="bk-r bk-num-inline">{formatRupiah(d.terserap)}</td>
                      <td className="bk-r bk-num-inline rl-neg">{formatRupiah(d.minus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <label className="bk-field">
                <span className="blud-imp-muted">Alasan (wajib, minimal 10 karakter — tercatat di audit log)</span>
                <textarea className="blud-imp-input" rows={3} value={alasanTurun}
                  onChange={e => setAlasanTurun(e.target.value)}
                  placeholder="Contoh: pagu dipindah ke belanja obat atas disposisi Direktur tanggal …" />
              </label>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <PrimaButton variant="ghost" onClick={() => setBentrokPagu(null)} disabled={saving}>
                  Batal
                </PrimaButton>
                <PrimaButton variant="danger" disabled={saving || alasanTurun.trim().length < 10}
                  onClick={() => {
                    const v = bentrokPagu.versiTanggal
                    paksaTurunRef.current = alasanTurun.trim()
                    setBentrokPagu(null); setSaving(true)
                    void doSimpanInternal(v).finally(() => setSaving(false))
                  }}>
                  Tetap Lanjut
                </PrimaButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

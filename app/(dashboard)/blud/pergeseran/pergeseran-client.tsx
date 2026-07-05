'use client'
 
// app/(dashboard)/blud/pergeseran/pergeseran-client.tsx
// Port dari blud-app: PergeseranTable + pergeseran-dpa/page — shadcn/ui + Tailwind

import { useState, useEffect, useCallback, useRef } from 'react'

import { toast } from 'sonner'
import { Save, Sparkles, RefreshCw, Calendar, X, AlertTriangle, Search } from 'lucide-react'
import DeleteIcon from '@/components/ui/DeleteIcon'
import PrimaButton from '@/components/ui/PrimaButton'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { useSentinelSwap } from '@/lib/blud/use-sentinel-swap'
import RowActionsMenu from '@/components/blud/RowActionsMenu'
import { InputNominal } from '@/components/ui/input-nominal'
import { formatRupiah, hitungJumlah, genRowId, TIPE_LABEL } from '@/lib/blud/format'
import { partialRecalcPergeseran, recalcPergeseranJumlah, hitungDeltaPergeseranRoot } from '@/lib/blud/recalc'
import MasterAkunCombobox, { type AkunOption } from '@/components/blud/MasterAkunCombobox'
import VersiDropdown from '@/components/blud/VersiDropdown'
import { useSentinelFeed, useSentinelPreSave } from '@/components/sentinel/SentinelProvider'
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

function PergeseranTable({
  rows,
  onChange,
  akunOptions,
  hiddenLevels,
  highlightId,
}: {
  rows: PergeseranBarisInput[]
  onChange: (rows: PergeseranBarisInput[]) => void
  akunOptions: AkunOption[]
  hiddenLevels: Set<string>
  highlightId:  string | null
}) {
  const [addParent, setAddParent] = useState<PergeseranBarisInput | null>(null)
  const [delGuard,  setDelGuard]  = useState<{ uraian: string; childCount: number } | null>(null)

  // Build child-count map untuk dynamic leaf/aggregator
  const childCount = new Map<string, number>()
  for (const r of rows) {
    if (r.parent_id) childCount.set(r.parent_id, (childCount.get(r.parent_id) ?? 0) + 1)
  }

  // Edit vol_p / harga_p (baris editable) — auto recalc parent chain
  const updateVolHarga = useCallback((rowId: string, field: 'vol_p' | 'harga_p', value: number | null) => {
    const updated = rows.map(r => {
      if (r.row_id !== rowId) return r
      const next = { ...r, [field]: value }
      next.pergeseran          = hitungJumlah(next.vol_p, next.harga_p)
      next.bertambah_berkurang = next.pergeseran - (next.jumlah || 0)
      return next
    })
    onChange(partialRecalcPergeseran(updated, rowId))
  }, [rows, onChange])

  // Edit kode_rekening / uraian (hanya untuk baris baru hasil add manual)
  const updateText = useCallback((rowId: string, field: 'kode_rekening' | 'uraian', value: string) => {
    onChange(rows.map(r => r.row_id === rowId ? { ...r, [field]: value } : r))
  }, [rows, onChange])

  // Pick dari Master Akun → fill kode + uraian sekaligus
  const pickAkun = useCallback((rowId: string, akun: AkunOption) => {
    onChange(rows.map(r => r.row_id === rowId ? { ...r, kode_rekening: akun.kode, uraian: akun.uraian } : r))
  }, [rows, onChange])

  // Add baris baru sebagai child dari parent — CHAIN: leaf parent switch ke
  // aggregator (clear vol_p/harga_p) saat anak pertama ditambahkan.
  const addChild = useCallback((tipe: TipeBaris, parentRowId: string) => {
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
  }, [rows, onChange])

  // Tambah baris level sama (sibling) — tipe & parent sama, sisip setelah subtree baris ini
  const addSibling = useCallback((row: PergeseranBarisInput) => {
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
  }, [rows, onChange])

  // Multi-hapus — reuse seleksi cascade Sentinel Swap (geser tidak dipakai di Pergeseran).
  // Hanya baris baru (pgnew_*) yang dapat checkbox; descendant baris baru selalu baru juga.
  const { selectedRowIds, toggleCheckbox, selectAll, clearSelection } = useSentinelSwap({
    rows, onChange, setBlocked: () => {},
  })
  const newRowIds = rows.filter(isNewRow).map(r => r.row_id)
  const allNewSelected = newRowIds.length > 0 && newRowIds.every(id => selectedRowIds.has(id))

  // Delete baris. Aggregator (punya anak) blocked — modal peringatan.
  // Hanya baris baru (pgnew_*) atau leaf yang bisa dihapus langsung.
  const deleteBaris = useCallback((rowId: string) => {
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
  }, [rows, onChange])

  // Multi-hapus: seleksi cascade = subtree utuh, aman filter sekali jalan
  const deleteSelected = useCallback(async () => {
    const count = selectedRowIds.size
    if (count === 0) return
    const ok = await confirmDialog({
      title: 'Hapus Baris Terpilih',
      message: `${count} baris baru terpilih akan dihapus sekaligus. Lanjutkan?`,
      variant: 'danger',
    })
    if (!ok) return
    const filtered = rows
      .filter(r => !selectedRowIds.has(r.row_id))
      .map((r, i) => ({ ...r, urutan: i }))
    onChange(recalcPergeseranJumlah(filtered))
    clearSelection()
    toast.success(`${count} baris dihapus`)
  }, [rows, selectedRowIds, onChange, clearSelection])

  const fmt = (v: number | null | undefined) => (v != null && v !== 0) ? formatRupiah(v) : '-'

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
              <th style={{ width: 36, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  className="dpa-row-checkbox"
                  checked={allNewSelected}
                  disabled={newRowIds.length === 0}
                  onChange={() => allNewSelected ? clearSelection() : selectAll(newRowIds)}
                  data-tooltip={allNewSelected ? 'Uncheck semua' : 'Check semua baris baru (utk multi-hapus)'}
                />
              </th>
              <th style={{ width: 48, textAlign: 'center' }}>Level</th>
              <th style={{ width: 150 }}>Kode Rekening</th>
              <th style={{ minWidth: 240 }}>Uraian</th>
              <th style={{ width: 60, textAlign: 'right' }}>Vol</th>
              <th style={{ width: 120 }}>Satuan</th>
              <th style={{ width: 140, textAlign: 'right' }}>Harga</th>
              <th style={{ width: 150, textAlign: 'right' }}>Jumlah</th>
              <th data-rima="pergeseran.kolom-vol-p" style={{ width: 80, textAlign: 'right' }}>Vol P</th>
              <th data-rima="pergeseran.kolom-harga-p" style={{ width: 150, textAlign: 'right' }}>Harga P</th>
              <th data-rima="pergeseran.kolom-selisih" style={{ width: 150, textAlign: 'right' }}>Pergeseran</th>
              <th style={{ width: 150, textAlign: 'right' }}>+/−</th>
              <th style={{ width: 44, textAlign: 'center' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              if (hiddenLevels.has(TIPE_LABEL[row.tipe_baris])) return null
              const _isHighlighted = row.row_id === highlightId
              const isAgg    = (childCount.get(row.row_id) ?? 0) > 0
              const editable = EDITABLE_TYPES.has(row.tipe_baris) && !isAgg
              const isBold   = ['GRANDMASTER','MASTER','LEADER','PLETON-LEADER','KETUA-KELOMPOK-A','KETUA-KELOMPOK-B','L7-HEAD','L8-HEAD'].includes(row.tipe_baris)
              const isGM     = row.tipe_baris === 'GRANDMASTER'
              const bb       = row.bertambah_berkurang ?? 0
              const isNew    = isNewRow(row)
              const canAdd   = !!TIPE_CHILD_OPTIONS_PG[row.tipe_baris]

              return (
                <tr key={row.row_id}
                    id={`perg-row-${row.row_id}`}
                    className={`${TIPE_ROW_CLASS[row.tipe_baris]}${_isHighlighted ? ' row-highlight' : ''}`}>
                  {/* Checkbox multi-hapus — hanya baris baru */}
                  <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                    {isNew && (
                      <input
                        type="checkbox"
                        className="dpa-row-checkbox"
                        checked={selectedRowIds.has(row.row_id)}
                        onChange={() => toggleCheckbox(row.row_id)}
                        data-tooltip="Check utk multi-hapus (cascade anak)"
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
                  <td style={{ fontSize: 12, color: isGM ? '#fff' : undefined }}>
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
                    {isNew ? (
                      <MasterAkunCombobox
                        value={row.uraian}
                        options={akunOptions}
                        onChange={v => updateText(row.row_id, 'uraian', v)}
                        onSelect={akun => pickAkun(row.row_id, akun)}
                        placeholder="Cari atau ketik uraian..."
                      />
                    ) : (
                      <span style={{ fontWeight: isBold ? 700 : 400, fontSize: 13, color: isGM ? '#fff' : undefined, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
                            <title>DPA punya struktur aggregator (anak), Pergeseran disini leaf. Pertimbangkan tambah anak chain.</title>
                          </AlertTriangle>
                        )}
                      </span>
                    )}
                  </td>

                  {/* Vol DPA (readOnly) */}
                  <td style={{ textAlign: 'right', fontSize: 12, color: isGM ? '#fff' : undefined }}>
                    {row.vol ?? '-'}
                  </td>

                  {/* Satuan */}
                  <td style={{ fontSize: 12, color: isGM ? '#fff' : undefined }}>{row.satuan ?? '-'}</td>

                  {/* Harga DPA */}
                  <td style={{ textAlign: 'right', fontSize: 12, color: isGM ? '#fff' : undefined }}>
                    {fmt(row.harga)}
                  </td>

                  {/* Jumlah DPA */}
                  <td style={{ textAlign: 'right' }}>
                    <strong style={{ fontSize: 13, color: isGM ? '#fff' : undefined }}>
                      {fmt(row.jumlah)}
                    </strong>
                  </td>

                  {/* Vol P (editable saat LEAF) */}
                  <td style={{ textAlign: 'right' }}>
                    {editable
                      ? <input type="number" value={row.vol_p ?? ''} min={0} style={{ textAlign: 'right' }}
                          onChange={e => updateVolHarga(row.row_id, 'vol_p', e.target.value === '' ? null : Number(e.target.value))} />
                      : <span style={{ fontSize: 12, opacity: isAgg ? .55 : 1 }}>
                          {isAgg ? '—' : (row.vol_p ?? '-')}
                        </span>
                    }
                  </td>

                  {/* Harga P (editable saat LEAF) */}
                  <td style={{ textAlign: 'right' }}>
                    {editable
                      ? <InputNominal value={row.harga_p ?? 0} style={{ textAlign: 'right' }}
                          onChange={v => updateVolHarga(row.row_id, 'harga_p', v || null)} />
                      : <span style={{ fontSize: 12, opacity: isAgg ? .55 : 1 }}>
                          {isAgg ? '—' : fmt(row.harga_p)}
                        </span>
                    }
                  </td>

                  {/* Pergeseran */}
                  <td style={{ textAlign: 'right' }}>
                    <strong style={{ fontSize: 13, color: '#7DD3FC' }}>{fmt(row.pergeseran)}</strong>
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

                  {/* Aksi — kebab menu */}
                  <td style={{ textAlign: 'center', padding: '2px 4px' }}>
                    <RowActionsMenu
                      canAdd={canAdd}
                      canSibling={!!row.parent_id}
                      locked={!isNew && !canAdd}  // tampilkan kebab hanya kalau ada aksi tersedia
                      onAddChild={canAdd ? () => setAddParent(row) : undefined}
                      onAddSibling={row.parent_id ? () => addSibling(row) : undefined}
                      onDelete={isNew ? () => deleteBaris(row.row_id) : undefined}
                      title={isAgg ? 'Aggregator: hapus anak dulu' : 'Hapus baris (hanya untuk baris baru)'}
                    />
                  </td>
                </tr>
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

export default function PergeseranClient() {
  const [rows,      setRows]      = useState<PergeseranBarisInput[]>([])
  const [history,   setHistory]   = useState<{ versi_tanggal: string }[]>([])
  const [versi,     setVersi]     = useState('')
  const [dpaVersi,  setDpaVersi]  = useState('')
  const [loading,   setLoading]   = useState(false)
  const [injecting, setInjecting] = useState(false)
  const [saving,    setSaving]    = useState(false)
  // Audit BLUD v1.2 (B-NEW-3): modal konfirmasi kalau save drop >50% baris
  const [safetyWarning, setSafetyWarning] = useState<{ versiTanggal: string; existing: number; incoming: number; dropPct: number } | null>(null)
  const [confirmInject, setConfirmInject] = useState(false)
  const [akunOptions,   setAkunOptions]   = useState<AkunOption[]>([])
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
      toast.error(`Tidak ada baris yang match "${searchQ}"`)
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

  // Fetch master akun list utk dropdown Uraian di baris baru
  useEffect(() => {
    let alive = true
    fetch('/api/blud/master-akun')
      .then(r => r.json())
      .then(j => { if (alive && j.ok) setAkunOptions(j.data as AkunOption[]) })
      .catch(() => { /* silent */ })
    return () => { alive = false }
  }, [])

  // L58: notif standar sonner (richColors dari Toaster global)
  function showToast(msg: string, ok = true) {
    if (ok) toast.success(msg)
    else toast.error(msg)
  }

  const loadHistory = useCallback(async () => {
    try {
      const res  = await fetch('/api/blud/pergeseran?mode=history')
      const json = await res.json()
      if (json.ok) setHistory(json.data)
    } catch { /* skip */ }
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

  const loadPergeseran = useCallback(async (tanggal?: string) => {
    loadCtrlRef.current?.abort()
    const ctrl = new AbortController()
    loadCtrlRef.current = ctrl
    setLoading(true)
    try {
      const url  = tanggal ? `/api/blud/pergeseran?tanggal=${tanggal}` : '/api/blud/pergeseran'
      const res  = await fetch(url, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      const json = await res.json()
      if (json.ok && json.data?.length) {
        setRows((json.data as PergeseranBaris[]).map(d => ({
          kode_rekening:       d.kode_rekening,
          uraian:              d.uraian,
          vol:                 d.vol,
          satuan:              d.satuan,
          harga:               d.harga,
          jumlah:              d.jumlah,
          vol_p:               d.vol_p,
          harga_p:             d.harga_p,
          pergeseran:          d.pergeseran,
          bertambah_berkurang: d.bertambah_berkurang,
          tipe_baris:          d.tipe_baris,
          row_id:              d.row_id || `row_${d.id}`,
          parent_id:           d.parent_id,
          urutan:              d.urutan,
        })))
        setVersi(json.versi_tanggal || '')
        setVersion(typeof json.version === 'number' ? json.version : 0)
        const firstRow = json.data[0] as PergeseranBaris
        if (firstRow?.dpa_versi_tanggal) setDpaVersi(firstRow.dpa_versi_tanggal)
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      showToast('Gagal memuat data Pergeseran', false)
    }
    finally  { setLoading(false) }
  }, [])

  // Generate: ambil DPA terbaru, jadikan tabel pergeseran baru
  const generate = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/blud/dpa')
      const json = await res.json()
      if (!json.ok || !json.data?.length) { showToast('Data DPA tidak ditemukan', false); return }

      const generated: PergeseranBarisInput[] = (json.data as DpaBaris[]).map((d, i) => ({
        kode_rekening:       d.kode_rekening,
        uraian:              d.uraian,
        vol:                 d.vol,
        satuan:              d.satuan,
        harga:               d.harga,
        jumlah:              d.jumlah,
        vol_p:               null,
        harga_p:             null,
        pergeseran:          0,
        bertambah_berkurang: 0,
        tipe_baris:          d.tipe_baris,
        row_id:              d.row_id || `row_${i}`,
        parent_id:           d.parent_id,
        urutan:              i,
      }))

      setRows(generated)
      setDpaVersi(json.versi_tanggal || '')
      setVersi('')
      showToast('Tabel berhasil di-generate dari DPA terbaru')
    } catch { showToast('Gagal generate', false) }
    finally  { setLoading(false) }
  }, [])

  // Inject: update kolom 0-5 dari DPA terbaru tanpa ubah vol_p/harga_p
  const inject = useCallback(async () => {
    if (!rows.length) { showToast('Generate tabel dulu', false); return }
    setInjecting(true)
    try {
      const res  = await fetch('/api/blud/pergeseran/inject', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergeseran_rows: rows }),
      })
      const json = await res.json()
      if (json.ok) {
        setRows(json.data)
        if (json.dpa_versi) setDpaVersi(json.dpa_versi)
        showToast('Inject berhasil — kolom DPA diperbarui')
        // B5: match tier heuristik longgar bisa salah tempel vol_p/harga_p — minta user periksa
        const low = (json.low_confidence ?? []) as { kode_rekening: string; uraian: string }[]
        if (low.length > 0) {
          const contoh = low.slice(0, 3).map(l => l.uraian || l.kode_rekening).join(', ')
          toast.warning(
            `${low.length} baris di-match dengan heuristik longgar — periksa hasilnya: ${contoh}${low.length > 3 ? ', …' : ''}`,
            { duration: 8000 },
          )
        }
      } else {
        showToast(json.error || json.message || 'Gagal inject', false)
      }
    } catch { showToast('Gagal inject', false) }
    finally  { setInjecting(false); setConfirmInject(false) }
  }, [rows])

  async function simpan() {
    if (!rows.length) { showToast('Tidak ada data untuk disimpan', false); return }
    if (submittingRef.current) return
    submittingRef.current = true
    try {
      // RIMA F1 pre-save (CONCEPT §4): critical blokir, warning konfirmasi, ack → audit G8
      const gate = await sentinelPreSave()
      if (!gate.ok) return
      sentinelAckRef.current = gate.ack
      // B6: pergeseran WAJIB berimbang (geser antar rekening, pagu tetap) —
      // blokir save; server juga menolak (PERGESERAN_TIDAK_BERIMBANG)
      const rootDelta = hitungDeltaPergeseranRoot(rows)
      if (rootDelta !== 0) {
        toast.error(
          `Pergeseran tidak berimbang: total anggaran ${rootDelta > 0 ? 'bertambah' : 'berkurang'} ${formatRupiah(Math.abs(rootDelta))} terhadap DPA. Sesuaikan dulu — pergeseran wajib berimbang.`,
          { duration: 8000 },
        )
        return
      }
      setSaving(true)
      const today = new Date().toISOString().split('T')[0]
      await doSimpanInternal(today, false)
    } finally { submittingRef.current = false; setSaving(false) }
  }

  // Audit BLUD v1.2 (B-NEW-3): split jadi internal supaya bisa retry dengan force=true
  // L51: kirim expected_version + handle VERSION_CONFLICT
  async function doSimpanInternal(versiTanggal: string, force: boolean) {
    try {
      const res  = await fetch('/api/blud/pergeseran', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versi_tanggal: versiTanggal, dpa_versi_tanggal: dpaVersi || versiTanggal,
          rows, force, expected_version: version,
          sentinel_ack: sentinelAckRef.current ?? undefined,
        }),
      })
      const json = await res.json()
      if (res.status === 409 && json.code === 'VERSION_CONFLICT') {
        showToast('⚠️ Data sudah diubah pengguna lain. Memuat versi terbaru…', false)
        await loadPergeseran(versiTanggal)
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
      if (json.ok) {
        showToast(json.message); setVersi(versiTanggal); loadHistory()
        if (typeof json.version === 'number') setVersion(json.version)
      } else {
        showToast(json.error || json.message || 'Gagal simpan', false)
      }
    } catch { showToast('Gagal menyimpan', false) }
  }

  useEffect(() => { void (async () => { await loadPergeseran(); await loadHistory() })() }, [loadPergeseran, loadHistory])

  return (
    <div className="space-y-4">
      {/* Confirm Inject Dialog */}
      {confirmInject && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.5)', backdropFilter:'blur(4px)' }}>
          <div style={{ background:'#042C53', border:'1px solid #0C447C', borderRadius:16, boxShadow:'0 24px 60px rgba(0,0,0,.5)', width:384, padding:24 }}>
            <h2 style={{ fontWeight:800, color:'#E6F1FB', marginBottom:12 }}>Inject DPA</h2>
            <p style={{ fontSize:13, color:'#85B7EB', marginBottom:20, lineHeight:1.6 }}>
              Kolom Vol, Harga, Jumlah akan diperbarui dari DPA terbaru.
              Vol P dan Harga P <strong style={{ color:'#B5D4F4' }}>tidak akan berubah</strong>.
            </p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <PrimaButton variant="ghost" size="sm" onClick={() => setConfirmInject(false)}>Batal</PrimaButton>
              <PrimaButton variant="primary" size="sm" disabled={injecting} onClick={inject}>
                {injecting ? 'Injecting...' : 'Ya, Inject'}
              </PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background:'#042C53', border:'1px solid #0C447C', borderRadius:10, padding:'10px 16px', display:'flex', flexWrap:'wrap', alignItems:'center', gap:10 }}>
        <h1 style={{ fontWeight:800, fontSize:14, color:'#E6F1FB' }}>Pergeseran DPA</h1>

        <PrimaButton variant="purple" iconLeft={<Sparkles className="w-3.5 h-3.5" />}
          disabled={loading} onClick={generate}
          data-tooltip="Buat tabel pergeseran dari snapshot DPA terbaru" data-rima="pergeseran.buat">
          Buat Pergeseran
        </PrimaButton>

        <PrimaButton variant="success" iconLeft={<RefreshCw className="w-3.5 h-3.5" />}
          disabled={injecting || !rows.length}
          onClick={() => setConfirmInject(true)}
          data-tooltip="Sinkronkan kolom kode/uraian/vol/harga dari DPA terbaru" data-rima="pergeseran.sinkron-dpa">
          Sinkronkan DPA
        </PrimaButton>

        {/* data-rima: anchor tur RIMA F3 — wrapper inline-flex (display:contents rect-nya kosong) */}
        <div data-rima="pergeseran.versi-dropdown" style={{ display:'inline-flex' }}>
          <VersiDropdown
            value={versi}
            items={history}
            onChange={v => { setVersi(v); if (v) loadPergeseran(v) }}
            placeholder="— Pilih History —"
          />
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <PrimaButton variant="primary" iconLeft={<Save className="w-3.5 h-3.5" />}
            disabled={saving} onClick={simpan} data-rima="pergeseran.simpan">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </PrimaButton>
        </div>

        {dpaVersi && (
          <span data-rima="pergeseran.sumber-dpa" style={{ fontSize:11, color:'#85B7EB', display:'flex', alignItems:'center', gap:4 }}>
            <Calendar style={{ width:12, height:12 }} /> Sumber DPA: {dpaVersi}
          </span>
        )}
      </div>

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
          <p style={{ fontSize:11, marginTop:4 }}>Klik Generate untuk membuat dari DPA terbaru.</p>
        </div>
      ) : (
        <PergeseranTable rows={rows} onChange={setRows} akunOptions={akunOptions} hiddenLevels={hiddenLevels} highlightId={highlightId} />
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
              <PrimaButton variant="danger" onClick={() => { const v = safetyWarning.versiTanggal; setSafetyWarning(null); setSaving(true); void doSimpanInternal(v, true).finally(() => setSaving(false)) }} disabled={saving}>
                Ya, Tetap Simpan
              </PrimaButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

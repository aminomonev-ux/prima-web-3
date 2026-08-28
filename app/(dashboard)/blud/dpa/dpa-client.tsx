'use client'
 
// app/(dashboard)/blud/dpa/dpa-client.tsx
// Port dari blud-app: DpaTable + dpa-blud/page — shadcn/ui + Tailwind

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ChevronUp, ChevronDown, Save,
  AlertTriangle, X, FilePlus, Search, ExternalLink, Upload, Inbox, CalendarClock, Copy,
} from 'lucide-react'
import ImportDpaModal, { type AsalImpor } from '@/components/blud/ImportDpaModal'
import SalinMasterModal from '@/components/blud/SalinMasterModal'
import SalinTahunModal from '@/components/blud/SalinTahunModal'
import SalinVersiModal from '@/components/blud/SalinVersiModal'
import DeleteButton from '@/components/ui/DeleteButton'
import DeleteIcon from '@/components/ui/DeleteIcon'
import PrimaButton from '@/components/ui/PrimaButton'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import Tip from '@/components/ui/Tip'
import { InputNominal } from '@/components/ui/input-nominal'
import { formatRupiah, genRowId, TIPE_LABEL } from '@/lib/blud/format'
import { partialRecalcDpa, recalcDpaJumlah } from '@/lib/blud/recalc'
import { dpaKeInput } from '@/lib/blud/row-map'
import { tanggalHariIniWIB, formatTanggalId, expectedVersionUntuk, periodeUntukVersi, sasaranSimpan } from '@/lib/blud/tanggal'
import {
  alasanKunciSalinVersi, petakanDpaRows, totalAkarDpa, type AsalSalin,
} from '@/lib/blud/salin-versi'
import { buildDpaRowsFromKodeBesar } from '@/lib/blud/dpa-skeleton-builder'
import { useSentinelSwap } from '@/lib/blud/use-sentinel-swap'
import BlockedModal, { type BlockedInfo } from '@/components/blud/BlockedModal'
import AddBarisModal from '@/components/blud/AddBarisModal'
import RowActionsMenu from '@/components/blud/RowActionsMenu'
import ImportUsulanModal, { buildImportedRows, type ImportPick, type ImportResult } from '@/components/blud/ImportUsulanModal'
import type { DpaImportCandidate } from '@/lib/blud/import-usulan-data'
import { validateDupRules } from '@/lib/blud/dup-guard'
import MasterAkunCombobox, { type AkunOption } from '@/components/blud/MasterAkunCombobox'
import PenanggungJawabCombobox from '@/components/blud/PenanggungJawabCombobox'
import SatuanCombobox from '@/components/shared/SatuanCombobox'
import VersiDropdown from '@/components/blud/VersiDropdown'
import type { SimpananItem } from '@/components/blud/VersiDropdown'
import TahunDropdown from '@/components/blud/TahunDropdown'
import PeriodeVersiSelect from '@/components/blud/PeriodeVersiSelect'
import SpandukLihat from '@/components/blud/SpandukLihat'
import { PjConflictDialog, PjMutationDialog } from '@/components/blud/PjGuardDialogs'
import { findAncestorPjOnAdd } from '@/lib/blud/pj-conflict'
import { useSentinelPjGuard } from '@/lib/blud/use-sentinel-pj-guard'
import { useSentinelFeed, useSentinelPreSave } from '@/components/sentinel/SentinelProvider'
import { useIngatkanBelumTersimpan } from '@/lib/shared/belum-tersimpan'
import type { SentinelAckPayload } from '@/lib/sentinel/types'
import type { DpaBarisInput, DpaBaris, TipeBaris } from '@/types'

// ─── KONSTANTA ────────────────────────────────────────────────────────────────

// Mirror TIPE_LABEL urutan (Level 1..Level 8.1) → class lv-l1 .. lv-l81 utk styling v2.
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

// TIPE_LABEL imported dari lib/blud/format.ts (shared dgn pergeseran + BlockedModal)

/**
 * Tipe yang BISA input vol/harga langsung (mode LEAF).
 * Catatan: row LEAF bisa switch ke AGGREGATOR saat user klik `+` (Task #2);
 * saat itu vol/harga di-clear & dibuat read-only via flag `is_aggregator`
 * (heuristik: punya minimal 1 anak chain).
 */
const EDITABLE_TYPES = new Set<TipeBaris>([
  'MASTER',  'CHILD',
  'LEADER',  'MEMBER',
  'PLETON-LEADER',     'PLETON-MEMBER',
  'KETUA-KELOMPOK-A',  'ANGGOTA-KELOMPOK-A',
  'KETUA-KELOMPOK-B',  'ANGGOTA-KELOMPOK-B',
  'L7-HEAD', 'L7-SUB',
  'L8-HEAD', 'L8-SUB',
])

/** Tipe yang tidak bisa digeser maupun dihapus */
const LOCKED_TYPES = new Set<TipeBaris>(['GRANDMASTER'])

/**
 * Chain rule (strict): tiap tipe spawn TEPAT 1 anak di chain berikutnya.
 * Tidak ada branching A/B — chain absorbsi A→B.
 * Aturan spawn anak via tombol `+` di row LN.1 (leaf) → next level (HEAD).
 * L8-SUB = leaf maksimum, tidak punya anak.
 */
const TIPE_CHILD_OPTIONS: Partial<Record<TipeBaris, TipeBaris[]>> = {
  GRANDMASTER:          ['MASTER'],            // L1   → L2
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

// ─── INIT SKELETON ────────────────────────────────────────────────────────────

/** Struktur awal DPA BLUD standar (helper unused after refactor — keep for ref).
 *  Tetap di-export-prefix `_` agar tidak ke-tree-shake jika kebutuhan template muncul lagi. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _initSkeleton(): DpaBarisInput[] {
  const gmId = genRowId()
  const m1Id = genRowId()
  const m2Id = genRowId()
  return [
    {
      kode_rekening: '', uraian: 'TOTAL BELANJA BLUD',
      vol: null, satuan: null, harga: null, jumlah: 0,
      penanggung_jawab: '', keterangan: '',
      tipe_baris: 'GRANDMASTER', row_id: gmId, parent_id: null, urutan: 0,
    },
    {
      kode_rekening: '5.1', uraian: 'Belanja Operasional BLUD',
      vol: null, satuan: null, harga: null, jumlah: 0,
      penanggung_jawab: '', keterangan: '',
      tipe_baris: 'MASTER', row_id: m1Id, parent_id: gmId, urutan: 1,
    },
    {
      kode_rekening: '5.2', uraian: 'Belanja Modal BLUD',
      vol: null, satuan: null, harga: null, jumlah: 0,
      penanggung_jawab: '', keterangan: '',
      tipe_baris: 'MASTER', row_id: m2Id, parent_id: gmId, urutan: 2,
    },
  ]
}

// BlockedModal extracted ke components/blud/BlockedModal.tsx (shared dgn pergeseran)

// AddBarisModal extracted ke components/blud/AddBarisModal.tsx

// ─── DPA TABLE ────────────────────────────────────────────────────────────────

// RowActionsMenu extracted ke components/blud/RowActionsMenu.tsx (shared dgn pergeseran)

function DpaTable({
  rows, onChange, akunOptions, pjOptions, hiddenLevels, highlightId, bolehUbah,
}: {
  rows: DpaBarisInput[]
  onChange: (rows: DpaBarisInput[]) => void
  akunOptions: AkunOption[]
  pjOptions:   string[]               // master list Penanggung Jawab utk dropdown
  hiddenLevels: Set<string>
  highlightId:  string | null
  /** LIHAT: seluruh isian jadi teks, kolom aksi & checkbox tidak dirender. */
  bolehUbah:    boolean
}) {
  const [blocked,   setBlocked]   = useState<BlockedInfo | null>(null)
  const [addParent, setAddParent] = useState<DpaBarisInput | null>(null)
  const [delGuard,  setDelGuard]  = useState<{ uraian: string; childCount: number } | null>(null)
  const [importAnchor, setImportAnchor] = useState<DpaBarisInput | null>(null)

  // Sentinel Swap — hook (BLUD-OPT-1 mitigation, ref: lib/blud/use-sentinel-swap.ts)
  const { selectedRowIds, toggleCheckbox, geser, selectAll, clearSelection } = useSentinelSwap({
    rows, onChange, setBlocked,
  })

  // Select-all mengikuti aturan checkbox per-row: GRANDMASTER (locked) & MASTER di-skip
  const selectableIds = rows
    .filter(r => !LOCKED_TYPES.has(r.tipe_baris) && r.tipe_baris !== 'MASTER')
    .map(r => r.row_id)
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedRowIds.has(id))

  // Build child-count map sekali per render — dipakai untuk dynamic leaf/aggregator
  const childCount = new Map<string, number>()
  for (const r of rows) {
    if (r.parent_id) childCount.set(r.parent_id, (childCount.get(r.parent_id) ?? 0) + 1)
  }

  // Edit field
  const updateRow = useCallback((rowId: string, field: keyof DpaBarisInput, value: unknown) => {
    const updated  = rows.map(r => r.row_id === rowId ? { ...r, [field]: value } : r)
    const recalced = (field === 'vol' || field === 'harga') ? partialRecalcDpa(updated, rowId) : updated
    onChange(recalced)
  }, [rows, onChange])

  // Sentinel PJ — hook (BLUD-OPT-1 closure, ref: lib/blud/use-sentinel-pj-guard.ts)
  // Hook menyediakan: state + handlePjChange + jumpToRow + computeds untuk banner/icon.
  const {
    pjConflict, setPjConflict,
    pjMutation, setPjMutation,
    handlePjChange, jumpToRow,
    pjConflictPairs, pjConflictPartners,
  } = useSentinelPjGuard({ rows, updateRow })

  // toggleCheckbox + geser sudah disediakan oleh useSentinelSwap hook di atas.
  // Logic detail ada di lib/blud/use-sentinel-swap.ts.

  // Tambah baris anak
  // CHAIN: kalau parent adalah LEAF (EDITABLE + belum punya anak), saat tambah
  // anak pertama → parent switch ke AGGREGATOR: vol/satuan/harga di-clear,
  // jumlah akan di-recalc jadi Σ children oleh recalcDpaJumlah.
  // Sentinel PJ: cek findAncestorPjOnAdd dulu; kalau ada PJ di chain ancestor parent,
  // tampilkan PjMutationDialog → user pilih Tetap/Hapus/Batal sebelum addChildCore jalan.
  const addChildCore = useCallback((tipe: TipeBaris, parentRowId: string, sourceRows: DpaBarisInput[]) => {
    const parentIdx = sourceRows.findIndex(r => r.row_id === parentRowId)
    if (parentIdx === -1) return
    const parent = sourceRows[parentIdx]

    // Cek apakah parent saat ini LEAF (akan switch ke aggregator)
    const parentHasChildren = sourceRows.some(r => r.parent_id === parentRowId)
    const willSwitchToAggregator = !parentHasChildren && EDITABLE_TYPES.has(parent.tipe_baris)

    // Temukan semua descendant dari parent
    const descendants = new Set<string>()
    const queue = [parentRowId]
    while (queue.length) {
      const pid = queue.shift()!
      for (const r of sourceRows) {
        if (r.parent_id === pid) { descendants.add(r.row_id); queue.push(r.row_id) }
      }
    }

    // Cari posisi terakhir descendant
    let insertIdx = parentIdx
    for (let i = parentIdx + 1; i < sourceRows.length; i++) {
      if (descendants.has(sourceRows[i].row_id)) insertIdx = i
      else break
    }

    const newRow: DpaBarisInput = {
      kode_rekening: '', uraian: '', vol: null, satuan: null,
      harga: null, jumlah: 0, penanggung_jawab: '', keterangan: '',
      tipe_baris: tipe, row_id: genRowId(),
      parent_id: parentRowId, urutan: insertIdx + 1,
    }
    let next = [...sourceRows]
    if (willSwitchToAggregator) {
      // Clear vol/satuan/harga parent supaya jadi aggregator murni
      next = next.map(r => r.row_id === parentRowId
        ? { ...r, vol: null, satuan: null, harga: null, jumlah: 0 }
        : r)
    }
    next.splice(insertIdx + 1, 0, newRow)
    onChange(recalcDpaJumlah(next.map((r, i) => ({ ...r, urutan: i }))))
    // Auto-scroll + flash ke baris baru (tunggu DOM commit dulu)
    setTimeout(() => jumpToRow(newRow.row_id), 80)
  }, [onChange, jumpToRow])

  // Sentinel PJ wrapper untuk addChild
  const addChild = useCallback((tipe: TipeBaris, parentRowId: string) => {
    const ancestorsPj = findAncestorPjOnAdd(rows, parentRowId)
    if (ancestorsPj.length === 0) {
      addChildCore(tipe, parentRowId, rows)
      return
    }
    setPjMutation({
      ancestorsPj,
      proceed: (clearAncestor: boolean) => {
        const sourceRows = clearAncestor
          ? rows.map(r => ancestorsPj.some(a => a.row_id === r.row_id)
              ? { ...r, penanggung_jawab: null }
              : r)
          : rows
        addChildCore(tipe, parentRowId, sourceRows)
      },
    })
  }, [rows, addChildCore, setPjMutation])

  // Tambah baris saudara (sibling — tipe & parent sama, sisip tepat di bawah baris ini)
  const addSiblingCore = useCallback((row: DpaBarisInput, sourceRows: DpaBarisInput[]) => {
    const idx = sourceRows.findIndex(r => r.row_id === row.row_id)
    if (idx === -1) return

    // Cari posisi setelah seluruh sub-tree baris ini
    const descendants = new Set<string>()
    const queue = [row.row_id]
    while (queue.length) {
      const pid = queue.shift()!
      for (const r of sourceRows) {
        if (r.parent_id === pid) { descendants.add(r.row_id); queue.push(r.row_id) }
      }
    }
    let insertIdx = idx
    for (let i = idx + 1; i < sourceRows.length; i++) {
      if (descendants.has(sourceRows[i].row_id)) insertIdx = i
      else break
    }

    const newRow: DpaBarisInput = {
      kode_rekening: '', uraian: '', vol: null, satuan: null,
      harga: null, jumlah: 0, penanggung_jawab: '', keterangan: '',
      tipe_baris: row.tipe_baris, row_id: genRowId(),
      parent_id: row.parent_id, urutan: insertIdx + 1,
    }
    const next = [...sourceRows]
    next.splice(insertIdx + 1, 0, newRow)
    onChange(next.map((r, i) => ({ ...r, urutan: i })))
    setTimeout(() => jumpToRow(newRow.row_id), 80)
  }, [onChange, jumpToRow])

  // Sentinel PJ wrapper untuk addSibling
  const addSibling = useCallback((row: DpaBarisInput) => {
    const ancestorsPj = findAncestorPjOnAdd(rows, row.parent_id)
    if (ancestorsPj.length === 0) {
      addSiblingCore(row, rows)
      return
    }
    setPjMutation({
      ancestorsPj,
      proceed: (clearAncestor: boolean) => {
        const sourceRows = clearAncestor
          ? rows.map(r => ancestorsPj.some(a => a.row_id === r.row_id)
              ? { ...r, penanggung_jawab: null }
              : r)
          : rows
        addSiblingCore(row, sourceRows)
      },
    })
  }, [rows, addSiblingCore, setPjMutation])

  // Hapus baris. CHAIN: aggregator (punya anak) tidak bisa langsung dihapus —
  // user wajib hapus semua anak dulu satu per satu. Setelah anak habis, row
  // otomatis revert ke LEAF (vol/harga kosong editable) lalu bisa dihapus.
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
    onChange(recalcDpaJumlah(filtered))
    toast.success(`Baris "${target.uraian || target.kode_rekening || 'tanpa uraian'}" dihapus`)
  }, [rows, onChange])

  // Import Usulan (CONCEPT-import-usulan-dpa): sisip block baris baru setelah
  // subtree anchor — parent sudah resolved oleh buildImportedRows.
  const importUsulanCore = useCallback((anchor: DpaBarisInput, picks: ImportPick[], sourceRows: DpaBarisInput[]) => {
    const idx = sourceRows.findIndex(r => r.row_id === anchor.row_id)
    if (idx === -1) return
    const newRows = buildImportedRows(anchor, picks)
    if (!newRows.length) return

    const descendants = new Set<string>()
    const queue = [anchor.row_id]
    while (queue.length) {
      const pid = queue.shift()!
      for (const r of sourceRows) {
        if (r.parent_id === pid) { descendants.add(r.row_id); queue.push(r.row_id) }
      }
    }
    let insertIdx = idx
    for (let i = idx + 1; i < sourceRows.length; i++) {
      if (descendants.has(sourceRows[i].row_id)) insertIdx = i
      else break
    }

    const next = [...sourceRows]
    next.splice(insertIdx + 1, 0, ...newRows)
    onChange(recalcDpaJumlah(next.map((r, i) => ({ ...r, urutan: i }))))
    toast.success(`${newRows.length} item usulan disisipkan di bawah "${anchor.uraian || TIPE_LABEL[anchor.tipe_baris]}"`)
    setTimeout(() => jumpToRow(newRows[0].row_id), 80)
  }, [onChange, jumpToRow])

  // Sentinel PJ wrapper — sama dgn addChild/addSibling: import murni sibling
  // cek chain dari parent anchor, ada keturunan → cek dari anchor sendiri
  const handleImportPicks = useCallback((picks: ImportPick[]) => {
    const anchor = importAnchor
    if (!anchor) return
    const hasDesc = picks.some(p => p.tipe !== anchor.tipe_baris)
    const guardTarget = hasDesc ? anchor.row_id : anchor.parent_id
    const ancestorsPj = guardTarget ? findAncestorPjOnAdd(rows, guardTarget) : []
    if (ancestorsPj.length === 0) {
      importUsulanCore(anchor, picks, rows)
      return
    }
    setPjMutation({
      ancestorsPj,
      proceed: (clearAncestor: boolean) => {
        const sourceRows = clearAncestor
          ? rows.map(r => ancestorsPj.some(a => a.row_id === r.row_id)
              ? { ...r, penanggung_jawab: null }
              : r)
          : rows
        importUsulanCore(anchor, picks, sourceRows)
      },
    })
  }, [rows, importAnchor, importUsulanCore, setPjMutation])

  // Mode "Isi Baris Ini" (CONCEPT-import-usulan-dpa-v2 P1): timpa konten anchor,
  // pertahankan row_id/parent/kode_rekening/PJ/posisi — struktur pohon tidak berubah.
  const fillFromUsulan = useCallback(async (cand: DpaImportCandidate) => {
    const anchor = importAnchor
    if (!anchor) return
    if (rows.some(r => r.parent_id === anchor.row_id)) return  // modal sudah disable; guard ulang
    const hasContent = !!(anchor.uraian?.trim() || anchor.jumlah)
    if (hasContent) {
      const ok = await confirmDialog({
        title: 'Ganti isi baris ini?',
        message: `Baris "${anchor.uraian || '(belum ada uraian)'}" sudah ada isinya. Uraian, volume, satuan, dan harganya akan diganti dengan usulan "${cand.uraian}". Kode rekening dan penanggung jawabnya tetap.`,
        confirmLabel: 'Ganti isinya',
        variant: 'warning',
      })
      if (!ok) return
    }
    const next = rows.map(r => r.row_id === anchor.row_id
      ? { ...r, uraian: cand.uraian, vol: cand.vol || null, satuan: cand.satuan || null,
          harga: cand.harga || null, jumlah: cand.jumlah,
          origin: 'USULAN' as const, usulan_item_id: cand.usulan_item_id, usulan_no: cand.usulan_no }
      : r)
    onChange(recalcDpaJumlah(next))
    toast.success(`Baris diisi dari usulan "${cand.uraian}"`)
    setTimeout(() => jumpToRow(anchor.row_id), 80)
  }, [rows, importAnchor, onChange, jumpToRow])

  const handleImportResult = useCallback((result: ImportResult) => {
    if (result.mode === 'fill') { void fillFromUsulan(result.cand); return }
    handleImportPicks(result.picks)
  }, [fillFromUsulan, handleImportPicks])

  // Multi-hapus: cascade toggleCheckbox menjamin seleksi selalu subtree utuh,
  // jadi aman filter sekali jalan — parent yang kehilangan semua anak otomatis
  // revert ke leaf (isAgg dihitung ulang dari childCount tiap render).
  const deleteSelected = useCallback(async () => {
    const count = selectedRowIds.size
    if (count === 0) return
    const ok = await confirmDialog({
      title: `Hapus ${count} baris?`,
      message: `${count} baris yang dicentang akan dihapus sekaligus, beserta baris di bawahnya. Belum permanen — baru hilang dari database setelah Anda menekan Simpan.`,
      confirmLabel: `Hapus ${count} baris`,
      variant: 'danger',
    })
    if (!ok) return
    const filtered = rows
      .filter(r => !selectedRowIds.has(r.row_id))
      .map((r, i) => ({ ...r, urutan: i }))
    onChange(recalcDpaJumlah(filtered))
    clearSelection()
    toast.success(`${count} baris dihapus dari form — tekan Simpan untuk menetapkannya`)
  }, [rows, selectedRowIds, onChange, clearSelection])

  return (
    <>
      {/* Sentinel PJ — banner overview konflik chain vertikal.
          DIPISAH dari scroll-wrapper supaya tidak overlap thead saat scroll. */}
      {pjConflictPairs.length > 0 && (
        <div className="pj-sentinel-banner">
          <AlertTriangle style={{ width: 16, height: 16, color: '#E24B4A', flexShrink: 0 }} />
          <strong>{pjConflictPairs.length} konflik Penanggung Jawab</strong>
          <span style={{ opacity: .75 }}>
            ditemukan di rantai vertikal — rekap PJ akan menghitung ganda. Klik tombol untuk lompat ke baris:
          </span>
          {pjConflictPairs.slice(0, 10).map((p, i) => (
            <span key={`${p.row.row_id}-${p.conflict.row_id}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <Tip label={`Ancestor: ${p.conflict.uraian} → ${p.conflict.pj}`}><button
                type="button"
                className="pj-jump"
                onClick={() => jumpToRow(p.conflict.row_id)}
              >{p.conflict.kode_rekening || '?'}</button></Tip>
              <span style={{ opacity: .55 }}>↔</span>
              <Tip label={`Descendant: ${p.row.uraian} → ${p.row.pj}`}><button
                type="button"
                className="pj-jump"
                onClick={() => jumpToRow(p.row.row_id)}
              >{p.row.kode_rekening || '?'}</button></Tip>
              {i < Math.min(pjConflictPairs.length, 10) - 1 && <span style={{ opacity: .35, marginLeft: 4 }}>·</span>}
            </span>
          ))}
          {pjConflictPairs.length > 10 && (
            <span style={{ opacity: .65, fontStyle: 'italic' }}>… +{pjConflictPairs.length - 10} lagi</span>
          )}
        </div>
      )}
      {(() => {
        // Sentinel Guard (CONCEPT-import-usulan-dpa §5 lapis 2) — warning only
        const dups = validateDupRules(rows)
        if (dups.length === 0) return null
        return (
          <div className="pj-sentinel-banner" style={{ borderColor: 'rgba(186,117,23,.55)' }}>
            <AlertTriangle style={{ width: 16, height: 16, color: '#BA7517', flexShrink: 0 }} />
            <strong>{dups.length} baris kemungkinan kembar</strong>
            <span style={{ opacity: .75 }}>— klik namanya untuk melihat:</span>
            {dups.slice(0, 8).map((d, i) => (
              <span key={`${d.a.row_id}-${d.b.row_id}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                <Tip label={`${d.kind === 'hard' ? 'Kembar persis' : 'Mirip'}: ${d.reason} — "${d.a.uraian}"`}><button
                  type="button" className="pj-jump" onClick={() => jumpToRow(d.a.row_id)}
                >{(d.a.uraian || '?').slice(0, 18)}</button></Tip>
                <span style={{ opacity: .55 }}>≈</span>
                <Tip label={`Pasangannya — "${d.b.uraian}"`}><button
                  type="button" className="pj-jump" onClick={() => jumpToRow(d.b.row_id)}
                >{(d.b.uraian || '?').slice(0, 18)}</button></Tip>
                {i < Math.min(dups.length, 8) - 1 && <span style={{ opacity: .35, marginLeft: 4 }}>·</span>}
              </span>
            ))}
            {dups.length > 8 && <span style={{ opacity: .65, fontStyle: 'italic' }}>… +{dups.length - 8} lagi</span>}
          </div>
        )
      })()}
      {selectedRowIds.size > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 12, opacity: .75 }}>{selectedRowIds.size} baris terpilih</span>
          <PrimaButton variant="danger" size="sm" iconLeft={<DeleteIcon size={14} />} onClick={deleteSelected} data-rima="dpa.hapus-terpilih">
            Hapus Terpilih ({selectedRowIds.size})
          </PrimaButton>
        </div>
      )}
      <div className="blud-scroll-wrapper v2">
        <table className="dpa-table v2">
          <thead>
            <tr>
              <th style={{ width: bolehUbah ? 90 : 28, textAlign: 'center' }}>
                {bolehUbah && (
                  <input
                    type="checkbox"
                    className="dpa-row-checkbox"
                    checked={allSelected}
                    disabled={selectableIds.length === 0}
                    onChange={() => allSelected ? clearSelection() : selectAll(selectableIds)}
                    data-tooltip={allSelected ? 'Lepas semua centang' : 'Centang semua — untuk menghapus atau menggeser banyak baris sekaligus'}
                  />
                )}
              </th>
              <th style={{ width: 48, textAlign: 'center' }}>Level</th>
              <th style={{ width: 140 }}>Kode Rekening</th>
              <th data-rima="dpa.kolom-uraian">Uraian</th>{/* Uraian shrinks ~10% otomatis krn fixed cols total naik */}
              <th data-rima="dpa.kolom-vol" style={{ width: 76, textAlign: 'right' }}>Vol</th>
              <th style={{ width: 114 }}>Satuan</th>{/* was 120, -5% */}
              <th style={{ width: 148, textAlign: 'right' }}>Harga (Rp)</th>
              <th style={{ width: 158, textAlign: 'right' }}>Jumlah (Rp)</th>
              <th data-rima="dpa.kolom-pj" style={{ width: 136 }}>Penanggung Jawab</th>{/* was 124, +10% */}
              {bolehUbah && <th style={{ width: 44, textAlign: 'center' }}>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              // Filter B: skip row kalau level-nya di hiddenLevels.
              // Catatan: rows tetap full array supaya childCount + recalc cascade
              // jalan benar — hanya RENDER yang di-skip via early-return null.
              if (hiddenLevels.has(TIPE_LABEL[row.tipe_baris])) return null
              const _isHighlighted = row.row_id === highlightId  // dipakai di className tr
              // CHAIN: row di EDITABLE_TYPES jadi AGGREGATOR (vol/harga read-only)
              // saat punya minimal 1 anak. Revert ke LEAF saat anak habis.
              const isAgg     = (childCount.get(row.row_id) ?? 0) > 0
              const editable  = bolehUbah && EDITABLE_TYPES.has(row.tipe_baris) && !isAgg
              const locked    = LOCKED_TYPES.has(row.tipe_baris)
              const canAdd    = !!TIPE_CHILD_OPTIONS[row.tipe_baris]
              const canSibling = !locked && !!row.parent_id  // bisa tambah saudara
              const isGM      = row.tipe_baris === 'GRANDMASTER'
              const isBold    = ['GRANDMASTER','MASTER','LEADER','PLETON-LEADER','KETUA-KELOMPOK-A','KETUA-KELOMPOK-B','L7-HEAD','L8-HEAD'].includes(row.tipe_baris)

              return (
                <tr key={row.row_id}
                  id={`dpa-row-${row.row_id}`}
                  className={`${TIPE_ROW_CLASS[row.tipe_baris]}${_isHighlighted ? ' row-highlight' : ''}`}>

                  {/* Col 1 (NEW): Checkbox + panah geser. Sentinel Swap: panah leaf=enabled, parent=butuh check dulu. */}
                  <td style={{ padding: '2px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {(() => {
                      const hasChildren = isAgg
                      const isChecked   = selectedRowIds.has(row.row_id)
                      const inBlock     = selectedRowIds.size > 0 && isChecked
                      const geserEnabled = !hasChildren || isChecked
                      const showCheckbox = bolehUbah && !locked && row.tipe_baris !== 'MASTER'
                      const showArrows = bolehUbah && !locked && row.tipe_baris !== 'MASTER'
                      return (
                        <div className="flex gap-1 justify-center items-center">
                          {showCheckbox && (
                            <input
                              type="checkbox"
                              className="dpa-row-checkbox"
                              checked={isChecked}
                              onChange={() => toggleCheckbox(row.row_id)}
                              data-tooltip={hasChildren
                                ? (isChecked ? 'Lepas centang — baris di bawahnya ikut terlepas' : 'Centang baris ini beserta seluruh baris di bawahnya, supaya bisa digeser sebagai satu blok')
                                : (isChecked ? 'Lepas centang' : 'Centang untuk memilih beberapa baris sekaligus')}
                            />
                          )}
                          {showArrows && (
                            <div className="flex gap-0.5 items-center">
                              <button
                                disabled={idx === 0 || !geserEnabled}
                                onClick={() => geser(row.row_id, 'up')}
                                className="p-0.5 rounded hover:bg-white/40 disabled:opacity-25"
                                data-tooltip={!geserEnabled ? 'Centang dulu untuk geser grup' : (inBlock ? 'Geser blok atas' : 'Geser atas')}
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                disabled={idx === rows.length - 1 || !geserEnabled}
                                onClick={() => geser(row.row_id, 'down')}
                                className="p-0.5 rounded hover:bg-white/40 disabled:opacity-25"
                                data-tooltip={!geserEnabled ? 'Centang dulu untuk geser grup' : (inBlock ? 'Geser blok bawah' : 'Geser bawah')}
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </td>

                  {/* Col 2: Level badge L1/L2/.. (terpisah dari checkbox col supaya pill standalone) */}
                  <td style={{ padding: '2px 4px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <span data-tooltip={TIPE_LABEL[row.tipe_baris]} className="blud-level-badge">
                      {TIPE_LABEL[row.tipe_baris].replace('Level ', 'L')}
                    </span>
                  </td>

                  {/* Kode Rekening read-only — source dari uraian combobox pick */}
                  <td>
                    <input type="text" value={row.kode_rekening ?? ''}
                      readOnly
                      style={{ color: isGM ? 'var(--blud-l1-text)' : undefined, fontWeight: isGM ? 700 : undefined, cursor: 'default' }} />
                  </td>

                  {/* ─ Uraian ─ */}
                  <td>
                    {bolehUbah ? (
                      <MasterAkunCombobox
                        value={row.uraian ?? ''}
                        options={akunOptions}
                        onChange={v => updateRow(row.row_id, 'uraian', v)}
                        onSelect={akun => {
                          // Atomic update — 1× map set 2 field, hindari stale-closure race
                          onChange(rows.map(r => r.row_id === row.row_id
                            ? { ...r, uraian: akun.uraian, kode_rekening: akun.kode }
                            : r))
                        }}
                        style={{
                          fontWeight: isBold ? 700 : 400,
                          color: isGM ? 'var(--blud-l1-text)' : undefined,
                        } as React.CSSProperties}
                      />
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: isBold ? 700 : 400, color: isGM ? 'var(--blud-l1-text)' : undefined }}>
                        {row.uraian ?? ''}
                      </span>
                    )}
                  </td>

                  {/* ─ Vol ─ */}
                  <td style={{ textAlign: 'right' }}>
                    {editable
                      ? <input type="number" value={row.vol ?? ''} min={0} style={{ textAlign: 'right' }}
                          onChange={e => updateRow(row.row_id, 'vol', e.target.value === '' ? null : Number(e.target.value))} />
                      : <span style={{ fontSize: 12, color: isGM ? 'var(--blud-l1-text)' : undefined, opacity: isAgg ? .55 : 1 }}>
                          {isAgg ? '—' : (row.vol ?? '')}
                        </span>
                    }
                  </td>

                  {/* ─ Satuan ─ */}
                  <td>
                    {editable
                      ? <SatuanCombobox
                          value={row.satuan ?? ''}
                          onChange={v => updateRow(row.row_id, 'satuan', v || null)}
                          style={{ color: isGM ? 'var(--blud-l1-text)' : undefined }}
                          placeholder="—"
                        />
                      : <span style={{ fontSize: 12, color: isGM ? 'var(--blud-l1-text)' : undefined, opacity: isAgg ? .55 : 1 }}>
                          {isAgg ? '—' : (row.satuan ?? '')}
                        </span>
                    }
                  </td>

                  {/* ─ Harga ─ */}
                  <td style={{ textAlign: 'right' }}>
                    {editable
                      ? <InputNominal value={row.harga ?? 0} style={{ textAlign: 'right' }}
                          onChange={v => updateRow(row.row_id, 'harga', v || null)} />
                      : <span style={{ fontSize: 12, color: isGM ? 'var(--blud-l1-text)' : undefined, opacity: isAgg ? .55 : 1 }}>
                          {isAgg ? '—' : (row.harga ? formatRupiah(row.harga) : '')}
                        </span>
                    }
                  </td>

                  {/* ─ Jumlah ─ */}
                  <td style={{ textAlign: 'right' }}>
                    <strong style={{ fontSize: 13, color: isGM ? 'var(--blud-l1-text)' : undefined }}>
                      {formatRupiah(row.jumlah)}
                    </strong>
                  </td>

                  {/* Penanggung Jawab — combobox dari master data */}
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {bolehUbah ? (
                          <PenanggungJawabCombobox
                            value={row.penanggung_jawab ?? ''}
                            options={pjOptions}
                            onChange={v => handlePjChange(row, v ?? '')}
                            style={{ color: isGM ? 'var(--blud-l1-text)' : undefined }}
                            placeholder="— Pilih PJ —"
                          />
                        ) : (
                          <span style={{ fontSize: 12, color: isGM ? 'var(--blud-l1-text)' : undefined }}>
                            {row.penanggung_jawab ?? ''}
                          </span>
                        )}
                      </div>
                      {(() => {
                        const partners = row.penanggung_jawab ? pjConflictPartners.get(row.row_id) : undefined
                        if (!partners || partners.length === 0) return null
                        const first = partners[0]
                        const tipLabel = partners.length === 1
                          ? `Konflik chain dgn ${first.kode || '—'} · ${first.uraian || '(tanpa uraian)'} → PJ ${first.pj}. Klik untuk lompat.`
                          : `Konflik chain dgn ${partners.length} baris (terdekat: ${first.kode || '—'}). Klik untuk lompat.`
                        return (
                          <button
                            type="button"
                            aria-label="Konflik PJ chain — klik untuk lompat"
                            data-tooltip={tipLabel}
                            onClick={() => jumpToRow(first.row_id)}
                            style={{
                              display: 'inline-flex', padding: 0, border: 'none',
                              background: 'transparent', cursor: 'pointer', flexShrink: 0,
                            }}
                          >
                            <AlertTriangle style={{ width: 14, height: 14, color: '#E24B4A' }} />
                          </button>
                        )
                      })()}
                    </div>
                  </td>

                  {/* ─ Kolom aksi kanan: Tambah anak / saudara / Hapus ─ */}
                  {bolehUbah && (
                  <td style={{ textAlign: 'center', padding: '2px' }}>
                    <RowActionsMenu
                      canAdd={canAdd}
                      canSibling={canSibling}
                      locked={locked}
                      onAddChild={canAdd ? () => setAddParent(row) : undefined}
                      onAddSibling={canSibling ? () => addSibling(row) : undefined}
                      onImport={!locked && row.tipe_baris !== 'GRANDMASTER' ? () => setImportAnchor(row) : undefined}
                      onDelete={!locked ? () => deleteBaris(row.row_id) : undefined}
                    />
                  </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {blocked   && <BlockedModal info={blocked} onClose={() => setBlocked(null)} />}
      {importAnchor && (
        <ImportUsulanModal
          anchor={importAnchor}
          anchorHasChildren={rows.some(r => r.parent_id === importAnchor.row_id)}
          presentIds={new Set(rows.filter(r => r.usulan_item_id != null).map(r => r.usulan_item_id as number))}
          onImport={handleImportResult}
          onClose={() => setImportAnchor(null)}
        />
      )}
      {addParent && (
        <AddBarisModal
          parentRow={addParent}
          options={TIPE_CHILD_OPTIONS[addParent.tipe_baris] ?? []}
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
              <span className="blud-modal-title font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Tidak Bisa Menghapus
              </span>
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

      {/* Sentinel PJ — modal konflik saat assign PJ baru */}
      <PjConflictDialog
        open={pjConflict !== null}
        newPj={pjConflict?.newPj ?? ''}
        targetUraian={pjConflict?.targetUraian ?? ''}
        ancestors={pjConflict?.ancestors ?? []}
        descendants={pjConflict?.descendants ?? []}
        onConfirm={() => {
          if (!pjConflict) return
          updateRow(pjConflict.rowId, 'penanggung_jawab', pjConflict.newPj)
          setPjConflict(null)
        }}
        onCancel={() => setPjConflict(null)}
      />

      {/* Sentinel PJ — modal mutasi saat add child/sibling di bawah row ber-PJ */}
      <PjMutationDialog
        open={pjMutation !== null}
        ancestorsPj={pjMutation?.ancestorsPj ?? []}
        onKeep={() => {
          pjMutation?.proceed(false)
          setPjMutation(null)
        }}
        onClear={() => {
          pjMutation?.proceed(true)
          setPjMutation(null)
        }}
        onCancel={() => setPjMutation(null)}
      />
    </>
  )
}

// buildDpaRowsFromKodeBesar + KbBuildInput extracted ke lib/blud/dpa-skeleton-builder.ts

// ─── DPA PAGE ─────────────────────────────────────────────────────────────────

export default function DpaClient({
  bolehUbah, bolehImpor = false, bolehUbahMasterAkun = false, bolehUbahKodeBesar = false,
  bolehBacaPergeseran = false,
}: {
  bolehUbah: boolean
  bolehImpor?: boolean
  bolehUbahMasterAkun?: boolean
  bolehUbahKodeBesar?: boolean
  /** Menentukan pilihan "Pasca-Pergeseran" di Salin dari Tahun Lain muncul atau tidak. */
  bolehBacaPergeseran?: boolean
}) {
  const [importDpaBuka, setImportDpaBuka] = useState(false)
  const [salinBuka,    setSalinBuka]    = useState(false)
  const [salinTahunBuka, setSalinTahunBuka] = useState(false)
  const [salinVersiBuka, setSalinVersiBuka] = useState(false)
  // Asal salinan disimpan sampai Simpan ditekan — semata untuk baris detail audit.
  // Dilepas begitu barisnya diubah lewat jalur lain supaya jejaknya tidak berbohong.
  const asalSalinRef = useRef<AsalSalin | null>(null)
  // Sepadan `asalSalinRef` tapi untuk pemulihan snapshot — tanpa ini tidak ada
  // apa pun di basis data yang bilang versi hari ini lahir dari simpanan jam 09:15.
  const asalPulihkanRef = useRef<{ id: number; versi_ke: number; disimpan_pada: string } | null>(null)
  // Sepadan dua ref di atas, untuk baris yang datang dari berkas Excel. Sejak
  // modal impor berhenti menulis sendiri, `BLUD_DPA_IMPORT_COMMIT` tidak ada lagi
  // — ini satu-satunya yang menyatakan versi itu lahir dari sebuah berkas.
  const asalImporRef = useRef<AsalImpor | null>(null)
  const bolehSalinInduk = bolehUbahMasterAkun || bolehUbahKodeBesar
  const [rows,        setRows]        = useState<DpaBarisInput[]>([])
  const [history,     setHistory]     = useState<{ versi_tanggal: string; jumlah_baris: number }[]>([])
  const [riwayat,     setRiwayat]     = useState<SimpananItem[]>([])
  const [versi,       setVersi]       = useState('')
  // Periode yang akan DITULIS saat Simpan. '' = bulan berjalan (perilaku bawaan).
  // Beda peran dengan `versi` di atas: itu versi yang sedang DIBUKA/dibaca.
  const [periodeTulis, setPeriodeTulis] = useState('')
  // `versi` menjawab "slot mana yang sedang dibuka". Ini menjawab pertanyaan
  // yang LAIN: "apakah yang di layar sudah sama dengan yang tersimpan di slot
  // itu". Dulu keduanya diwakili `versi` saja, dan itu salah di dua arah —
  // sesudah Pulihkan `versi` terisi padahal isinya justru belum tersimpan, dan
  // menyunting satu sel pada versi yang dimuat tidak terdeteksi sama sekali.
  const [belumTersimpan, setBelumTersimpan] = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [akunOptions, setAkunOptions] = useState<AkunOption[]>([])
  const [pjOptions,   setPjOptions]   = useState<string[]>([])
  // Filter level (B) + search jump (C)
  const [hiddenLevels, setHiddenLevels] = useState<Set<string>>(new Set())
  const [searchQ,      setSearchQ]      = useState('')
  const [highlightId,  setHighlightId]  = useState<string | null>(null)

  // === FORM BARU FLOW (via Kode Besar) ====================================
  // - emptyKbModal: tampil saat klik 'Form Baru' tapi kode_besar kosong (→ link ke menu)
  // - overlayItems: list kode besar yang ditampilkan di overlay select (user bisa hapus per row)
  // - overwriteConfirm: confirm modal kalau form sekarang ada isi
  type KbRow = { kode: string; uraian: string; level: 'L1' | 'L2' | 'L2.1'; parent_kode: string | null }
  const [emptyKbModal,    setEmptyKbModal]    = useState(false)
  const [overlayItems,    setOverlayItems]    = useState<KbRow[] | null>(null)
  const [overwriteConfirm, setOverwriteConfirm] = useState<KbRow[] | null>(null)
  const router = useRouter()

  // Search jump — case-insensitive cari di kode_rekening | uraian.
  // Auto un-hide level kalau match ke-filter (opsi yang dipilih user).
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
      const el = document.getElementById(`dpa-row-${match.row_id}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    setTimeout(() => setHighlightId(null), 2600)
  }, [rows, searchQ])
  // Audit BLUD v1.2 (B-NEW-3): modal konfirmasi kalau save drop >50% baris
  const [safetyWarning, setSafetyWarning] = useState<{ versiTanggal: string; existing: number; incoming: number; dropPct: number } | null>(null)
  // CONCEPT-blud-realisasi §4.3: pagu turun di bawah realisasi yang sudah terjadi.
  // B2 memasang pagarnya di `saveDpa`; tanpa modal ini 409-nya jatuh ke toast merah
  // biasa dan bendahara kehilangan satu-satunya jalan sah untuk menembusnya.
  const [bentrokPagu, setBentrokPagu] = useState<{
    versiTanggal: string
    detail: { kode_rekening: string; uraian: string; pagu_baru: number; terserap: number; minus: number; hilang: boolean }[]
  } | null>(null)
  const [alasanTurun, setAlasanTurun] = useState('')

  // Dipisah supaya bisa dipanggil lagi sesudah "Salin ke Data Induk" — kalau tidak,
  // kode yang baru saja disalin belum muncul di combobox sampai halaman dimuat ulang.
  const muatAkunOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/blud/master-akun', { cache: 'no-store' })
      const j = await res.json() as { ok?: boolean; data?: AkunOption[] }
      if (j.ok && j.data) setAkunOptions(j.data)
    } catch { /* combobox tetap memakai daftar lama */ }
  }, [])

  // Fetch master akun + penanggung jawab list sekali saat mount
  useEffect(() => {
    let alive = true
    // `muatAkunOptions` menyetel state hanya sesudah `await` — tidak ada render
    // berantai. Preseden: fetch-on-open di `iki/[id]/editor-client.tsx`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void muatAkunOptions()
    fetch('/api/blud/penanggung-jawab')
      .then(r => r.json())
      .then(j => { if (alive && j.ok) setPjOptions((j.data as { label: string }[]).map(d => d.label)) })
      .catch(() => {})
    return () => { alive = false }
  }, [muatAkunOptions])

  // L58: notif standar sonner (richColors dari Toaster global)
  function showToast(msg: string, ok = true) {
    if (ok) toast.success(msg)
    else toast.error(msg)
  }

  /**
   * SATU-SATUNYA jalan bagi tabel untuk mengubah baris. Dipasang sebagai
   * `onChange` DpaTable, jadi setiap sunting sel — juga tambah/hapus baris dan
   * geser Sentinel — lewat sini dan menandai layar belum tersimpan.
   *
   * Jalur `setRows` langsung sengaja dibiarkan untuk yang BUKAN suntingan orang:
   * muatan dari server, dan penyerapan jangkar sesudah Simpan berhasil.
   */
  const ubahRows = useCallback((next: DpaBarisInput[]) => {
    setBelumTersimpan(true)
    setRows(next)
  }, [])

  // L51: optimistic locking version state (R1 prevent lost update)
  const [version, setVersion] = useState<number>(0)
  // Tahun Anggaran (CONCEPT-blud-tahun-anggaran §7) — dimensi di atas versi.
  const CURRENT_YEAR = new Date().getFullYear()
  const [tahun, setTahun] = useState<number>(CURRENT_YEAR)
  const [tahunList, setTahunList] = useState<number[]>([])
  // R2: abort pending load saat user switch versi cepat
  const loadCtrlRef = useRef<AbortController | null>(null)
  // R3: hard-guard double submit (useRef lebih cepat dari setState window)
  const submittingRef = useRef(false)

  // RIMA F1: feed snapshot rows ke bot pengawas — readonly (G16), banner lama
  // tetap berdampingan. Ack disimpan di ref supaya ikut force-retry SAFETY_THRESHOLD.
  useSentinelFeed('blud/dpa', rows, 'dpa-row-')
  const sentinelPreSave = useSentinelPreSave()
  const sentinelAckRef  = useRef<SentinelAckPayload | null>(null)
  // Dua bendera penembus, keduanya ref dan keduanya SENGAJA tidak ada di tanda tangan
  // `doSimpanInternal`. Alasannya: satu penyimpanan bisa memicu dua konfirmasi (ambang
  // drop baris + pagu §4.3), dan jawaban yang dioper lewat argumen hilang begitu
  // pengguna menjawab konfirmasi yang satunya — konfirmasi yang sudah dijawab muncul
  // lagi. Dengan ref, tidak ada pemanggil yang bisa lupa membawanya.
  const paksaTurunRef   = useRef<string | null>(null)
  const paksaDropRef    = useRef(false)

  const loadDpa = useCallback(async (tanggal?: string) => {
    loadCtrlRef.current?.abort()
    const ctrl = new AbortController()
    loadCtrlRef.current = ctrl
    setLoading(true)
    try {
      const qs = new URLSearchParams({ tahun: String(tahun) })
      if (tanggal) qs.set('tanggal', tanggal)
      const res  = await fetch(`/api/blud/dpa?${qs.toString()}`, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      const json = await res.json()
      if (json.ok) {
        setRows((json.data as DpaBaris[]).map(dpaKeInput))
        setVersi(json.versi_tanggal || '')
        setVersion(typeof json.version === 'number' ? json.version : 0)
        setBelumTersimpan(false)
        // Barisnya diganti muatan dari server — jejak "ini salinan tahun X" tidak
        // berlaku lagi. Dibiarkan menempel, ia akan mengotori audit simpan berikutnya.
        asalSalinRef.current    = null
        asalPulihkanRef.current = null
        asalImporRef.current    = null
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      showToast('Data DPA tidak bisa dimuat — periksa sambungan, lalu muat ulang halaman.', false)
    }
    finally   { setLoading(false) }
  }, [tahun])

  const loadHistory = useCallback(async () => {
    try {
      const res  = await fetch(`/api/blud/dpa?mode=history&tahun=${tahun}`)
      const json = await res.json()
      if (json.ok) setHistory(json.data)
    } catch { /* skip */ }
  }, [tahun])

  const loadRiwayat = useCallback(async () => {
    try {
      const res  = await fetch(`/api/blud/riwayat-simpan?jenis=DPA&tahun=${tahun}`)
      const json = await res.json()
      if (json.ok) setRiwayat(json.data)
    } catch { /* riwayat itu pelengkap — kegagalannya tidak boleh menahan layar */ }
  }, [tahun])

  /**
   * Muat satu simpanan lama ke FORM. Tidak ada yang ditulis di sini — yang
   * menyimpannya tetap tombol Simpan biasa, jadi seluruh pagar (gembok
   * optimistik, pagar pagu, periksaJangkar, Sentinel) berlaku tanpa ditulis ulang.
   */
  const pulihkanSimpanan = useCallback(async (s: SimpananItem) => {
    // L75b: memuat membuang isian yang sedang di layar, jadi pilihan yang TIDAK
    // merusak harus jadi bawaan — confirmDialog memulangkan false untuk Esc.
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
      // Angka kunci diambil SEGAR dari server, BUKAN dari `versi_ke` snapshot.
      // Snapshot jam 09:15 membawa angka 1; kalau angka itu yang dikirim saat
      // Simpan sementara kunci tanggal itu sudah di angka 3, Simpan ditolak
      // "diubah orang lain" — L75 lahir kembali lewat pintu lain.
      const vRes  = await fetch(`/api/blud/dpa?tahun=${tahun}&tanggal=${encodeURIComponent(s.versi_tanggal)}`)
      const vJson = await vRes.json()
      // Dibatalkan, bukan dilanjutkan dengan angka 0. Endpoint ini dijaga
      // `bludRateLimit('view-dpa', 60)`; kalau ia menolak, `vJson.version`
      // kosong dan angka 0 akan membuat Simpan berikutnya ditolak 409 sebagai
      // "diubah orang lain" — konflik yang tidak pernah terjadi. Lebih baik
      // gagal di sini dengan sebab yang benar daripada di sana dengan sebab palsu.
      if (!vRes.ok || typeof vJson.version !== 'number') {
        throw new Error('Angka kunci versi tidak bisa diambil, jadi pemulihan dibatalkan. Coba lagi sebentar lagi.')
      }
      // Tanpa `dpaKeInput`: `isi` memang disimpan dalam bentuk payload POST, jadi
      // ia sudah `DpaBarisInput`. Recalc tetap dijalankan supaya total induk di
      // layar sama dengan yang nanti dihitung server, bukan angka warisan.
      setRows(recalcDpaJumlah(json.data.isi as DpaBarisInput[]))
      setVersi(s.versi_tanggal)
      setVersion(vJson.version)
      // Periode ikut pindah ke tanggal snapshot-nya. Tanpa ini layar
      // memperlihatkan simpanan 31 Juli sementara Simpan tetap menulis ke bulan
      // berjalan — pintu ketiga dari bug yang sama, lewat tombol Pulihkan.
      setPeriodeTulis(periodeUntukVersi(s.versi_tanggal))
      setBelumTersimpan(true)
      asalSalinRef.current  = null
      asalImporRef.current  = null
      asalPulihkanRef.current = { id: s.id, versi_ke: s.versi_ke, disimpan_pada: s.disimpan_pada }
      showToast(`${json.data.jumlah_baris} baris dari simpanan pukul ${s.disimpan_pada.slice(11, 16)} dimuat — belum tersimpan, periksa lalu tekan Simpan.`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), false)
    } finally { setLoading(false) }
  }, [tahun, rows.length])

  const loadTahunList = useCallback(async () => {
    try {
      const res  = await fetch('/api/blud/dpa?mode=tahun-list')
      const json = await res.json()
      if (!json.ok) return
      const list: number[] = Array.isArray(json.data) ? json.data : []
      setTahunList(list)
      const cur = Number(json.current) || CURRENT_YEAR
      // Default (§9 #1): pertahankan pilihan user kalau masih ada data; else tahun
      // berjalan bila ada data; else tahun LATEST yang ada data.
      setTahun(prev => (list.includes(prev) ? prev : list.includes(cur) ? cur : (list[0] ?? cur)))
    } catch { /* skip */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { void (async () => { await loadTahunList() })() }, [loadTahunList])
  // loadDpa/loadHistory ber-dep [tahun] → efek ini refire saat tahun berganti.
  useEffect(() => { void (async () => { await loadDpa(); await loadHistory(); await loadRiwayat() })() }, [loadDpa, loadHistory, loadRiwayat])

  // L78 — hasil impor/Form Baru/Salin Tahun/Pulihkan hidup di FORM sampai Simpan
  // ditekan. Sebelum ini satu klik menu, satu Ctrl+R, atau satu klik Keluar bisa
  // membuang ratusan baris tanpa sepatah kata pun.
  useIngatkanBelumTersimpan(
    belumTersimpan && rows.length > 0
      ? `Ada ${rows.length} baris DPA ${tahun} di layar yang belum tersimpan. Meninggalkan halaman ini membuangnya.`
      : null,
  )

  async function simpan() {
    if (!rows.length) { showToast('Form masih kosong — belum ada yang bisa disimpan.', false); return }
    if (submittingRef.current) return
    submittingRef.current = true
    paksaTurunRef.current = null
    paksaDropRef.current = false
    try {
      // RIMA F1 pre-save (CONCEPT §4): critical blokir, warning konfirmasi, ack → audit G8
      const gate = await sentinelPreSave()
      if (!gate.ok) return
      sentinelAckRef.current = gate.ack
      setSaving(true)
      await doSimpanInternal(sasaranSimpan(periodeTulis))
    } finally { submittingRef.current = false; setSaving(false) }
  }

  // Audit BLUD v1.2 (B-NEW-3): split jadi internal supaya bisa di-retry dengan force=true
  // L51: kirim expected_version + handle VERSION_CONFLICT
  /**
   * Jangkar baris baru dicetak server saat simpan. Tanpa menyerapnya ke state,
   * simpan KEDUA (tanpa muat ulang halaman) mengirim baris yang sama tanpa
   * jangkar dan ditolak `periksaJangkar` — padahal tidak ada yang salah.
   */
  function serapJangkar(peta: Record<string, string> | undefined) {
    if (!peta) return
    setRows(prev => prev.map(r => (r.anggaran_key ? r : { ...r, anggaran_key: peta[r.row_id] ?? null })))
  }

  async function doSimpanInternal(versiTanggal: string) {
    try {
      const res  = await fetch('/api/blud/dpa', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tahun_anggaran: tahun, versi_tanggal: versiTanggal, rows,
          force: paksaDropRef.current,
          // Diturunkan dari tanggalnya sendiri, BUKAN dari state `periodeTulis`:
          // fungsi ini juga dipanggil ulang dari jalur retry (ambang turun /
          // pagu di bawah realisasi) dengan tanggal yang sudah ditangkap lebih
          // dulu. Membaca state di situ bisa memberi jawaban yang sudah bergeser.
          entri_historis: versiTanggal !== tanggalHariIniWIB(),
          expected_version: expectedVersionUntuk(versiTanggal, versi, version),
          turunkan_paksa: !!paksaTurunRef.current,
          alasan_turun: paksaTurunRef.current ?? undefined,
          sentinel_ack: sentinelAckRef.current ?? undefined,
          asal_salin: asalSalinRef.current ?? undefined,
          asal_pulihkan: asalPulihkanRef.current ?? undefined,
          asal_impor: asalImporRef.current ?? undefined,
        }),
      })
      const json = await res.json()
      if (res.status === 409 && json.code === 'PAGU_DIBAWAH_REALISASI') {
        setAlasanTurun('')
        setBentrokPagu({ versiTanggal, detail: json.detail ?? [] })
        return
      }
      if (res.status === 409 && json.code === 'VERSION_CONFLICT') {
        // Dulu muatan server langsung menimpa isian di layar. Akibatnya pekerjaan
        // yang belum tersimpan hilang tanpa bisa dibatalkan — padahal pesannya
        // justru menyuruh "periksa dulu, lalu simpan ulang", yang mustahil kalau
        // isiannya sudah lenyap. Sekarang orangnya yang memutuskan, dan pilihan
        // yang TIDAK menghancurkan apa pun jadi jawaban bawaan (Esc / klik luar).
        //
        // Dua keadaan yang berbeda, dan dulu keduanya dituduh "orang lain":
        //   expected > 0 → versi yang SEDANG dibuka bergerak sejak layar dibuka.
        //   expected = 0 → layar menyusun versi BARU, tapi tanggalnya ternyata
        //                  sudah terisi. Paling sering itu simpanan SENDIRI yang
        //                  lebih awal — mis. menyimpan ke periode Juli dari layar
        //                  yang belum memuat versi Julinya. Menyebut "orang lain"
        //                  di situ membuat orang mencari rekan kerja yang tidak ada.
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
        if (ambilYangTersimpan) { await loadDpa(versiTanggal); return }
        // Menyejajarkan angka kunci ke keadaan server. Tanpa ini Simpan berikutnya
        // ditolak lagi memakai angka yang sudah basi, dan "tetap pakai isian saya"
        // berubah jadi jalan buntu.
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
      if (json.ok) {
        showToast(json.message)
        setVersi(versiTanggal)
        // Periode TETAP di versi yang barusan ditulis, tidak dipulangkan ke bulan
        // berjalan. Dulu `setPeriodeTulis('')` di sini, dan itu yang membuat
        // "simpan Juli" terasa seperti menimpa Agustus: labelnya melompat ke
        // "PERIODE BULAN BERJALAN" tepat sesudah berhasil, lalu koreksi kedua
        // benar-benar mendarat di Agustus. Satu-satunya cara membetulkan hasil
        // impor adalah menyunting lalu Simpan lagi — dan itu harus jatuh di
        // bulan yang sama.
        setPeriodeTulis(periodeUntukVersi(versiTanggal))
        setBelumTersimpan(false)
        loadHistory(); loadTahunList(); loadRiwayat()
        if (typeof json.version === 'number') setVersion(json.version)
        serapJangkar(json.jangkar)
        // Sudah tercatat di audit simpan ini; simpan berikutnya bukan lagi salinan.
        asalSalinRef.current    = null
        asalPulihkanRef.current = null
        asalImporRef.current    = null
      } else {
        showToast(json.error || json.message || 'Belum tersimpan. Coba lagi.', false)
      }
    } catch { showToast('Belum tersimpan — sambungan ke server terputus. Coba lagi sebentar lagi.', false) }
  }

  // Form Baru flow: fetch kode_besar → conditional modal/overlay
  async function mulaiFormBaru() {
    try {
      const res  = await fetch('/api/blud/kode-besar', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        showToast(json.error || 'Daftar Kode Besar tidak bisa dibuka. Coba lagi sebentar lagi.', false)
        return
      }
      const items = (json.data as KbRow[]) ?? []
      if (items.length === 0) {
        setEmptyKbModal(true)
        return
      }
      // Default semua di-include — user bisa hapus per baris di overlay
      setOverlayItems(items)
    } catch {
      showToast('Daftar Kode Besar tidak bisa dibuka — periksa sambungan, lalu coba lagi.', false)
    }
  }

  // Eksekusi build DPA rows dari list kode besar (setelah confirm overwrite kalau ada)
  function executeBuildForm(items: KbRow[]) {
    const built = buildDpaRowsFromKodeBesar(items)
    if (built.length === 0) {
      // `parent_kode` dulu disebut apa adanya di sini — itu nama kolom database,
      // bukan sesuatu yang bisa dicari orang di layar mana pun.
      showToast('Kerangka tidak bisa dibuat. Di menu Kode Besar, pastikan tiap baris L2.1 sudah menunjuk induknya.', false)
      return
    }
    setRows(built)
    setVersi('')  // unset versi tersimpan (form baru)
    setBelumTersimpan(true)
    asalSalinRef.current    = null
    asalPulihkanRef.current = null
    asalImporRef.current    = null
    setOverlayItems(null)
    setOverwriteConfirm(null)
    showToast(`Kerangka ${built.length} baris dibuat dari Kode Besar — belum tersimpan, isi dulu lalu tekan Simpan.`)
  }

  /**
   * "Salin dari Tahun Lain" — barisnya sudah dipetakan di dalam modal, di sini
   * tinggal mendaratkannya. `setVersi('')` sama seperti Form Baru: yang di layar
   * belum punya padanan tersimpan, jadi Simpan akan menulis versi tanggal HARI INI
   * di tahun yang sedang dipilih — bukan menimpa versi tahun sumber.
   */
  /**
   * Hasil impor Excel mendarat di form — sepadan `terapkanSalinTahun` di bawah,
   * dan itu memang inti perbaikannya. Modal impor dulu menulis DB sendiri
   * memakai tanggalnya sendiri, jadi memilih "Periode Juli" lalu mengimpor
   * menghasilkan versi Agustus. Sekarang ia cuma mengisi layar; yang menulis
   * tetap satu tombol Simpan, dengan target `periodeTulis` yang sama.
   */
  function terapkanImpor(baris: DpaBarisInput[], asal: AsalImpor) {
    setRows(recalcDpaJumlah(baris))
    setVersi('')
    setBelumTersimpan(true)
    asalImporRef.current    = asal
    asalSalinRef.current    = null
    asalPulihkanRef.current = null
    setImportDpaBuka(false)
    showToast(`${baris.length} baris dibaca dari "${asal.berkas}" — belum tersimpan, periksa lalu tekan ${periodeTulis ? 'Simpan Periode' : 'Simpan'}.`)
    // Tawaran menyalin data induk menunggu barisnya benar-benar ada di layar —
    // modalnya membaca `rows`, bukan muatan pratinjau impor.
    if (bolehSalinInduk) setSalinBuka(true)
  }

  /**
   * Ganti periode = ganti konteks seluruh layar, bukan cuma target Simpan.
   *
   * Dulu ini `setPeriodeTulis` polos, dan itu separuh dari bug yang dilaporkan:
   * memilih Juli meninggalkan 558 baris Agustus di layar, lalu Simpan menulis
   * baris Agustus itu ke dalam versi Juli. Layar Pergeseran sudah mengosongkan
   * sejak awal; DPA tertinggal.
   *
   * Periode historis hanya ditawarkan untuk bulan yang BELUM punya versi
   * (`periodeHistorisTersedia`), jadi jawaban yang benar selalu "kosong" — tidak
   * ada yang bisa dimuat. Kembali ke bulan berjalan memuat ulang versi terbaru,
   * bukan meninggalkan layar kosong.
   */
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
    setPeriodeTulis('')
    setBelumTersimpan(false)
  }

  async function gantiPeriode(tanggal: string) {
    if (tanggal === periodeTulis) return
    // Periode yang SUDAH punya arsip: memilihnya berarti MEMBUKA arsip itu,
    // bukan menyiapkan yang baru. Mengosongkan layar di sini jadi jebakan —
    // layar kosong dengan sasaran Simpan yang justru sudah berisi.
    if (tanggal && history.some(h => h.versi_tanggal === tanggal)) {
      await bukaVersi(tanggal)
      return
    }
    // Membuang pekerjaan orang tanpa bertanya tidak boleh. Patokannya
    // `belumTersimpan`, BUKAN `versi` kosong: sesudah Pulihkan atau sesudah satu
    // sel disunting, `versi` terisi padahal yang di layar belum ada di mana pun.
    // Jawaban bawaan (Esc/klik luar) sengaja yang TIDAK menghancurkan apa pun.
    if (rows.length > 0 && belumTersimpan) {
      const buang = await confirmDialog({
        title:   'Ganti periode?',
        message: `Ada ${rows.length} baris di layar yang belum tersimpan di mana pun. `
          + `Berpindah periode mengosongkan form ini.`,
        confirmLabel: 'Ganti, buang isian',
        cancelLabel:  'Tetap di sini',
        variant:      'danger',
      })
      if (!buang) return
    }
    setPeriodeTulis(tanggal)
    asalSalinRef.current    = null
    asalPulihkanRef.current = null
    asalImporRef.current    = null
    if (tanggal) {
      setRows([])
      setVersi('')
      setVersion(0)
      setBelumTersimpan(false)
    } else {
      await loadDpa()
    }
  }

  /**
   * Membuka satu versi tersimpan dari daftar riwayat — pintu KEDUA dari L78b.
   *
   * Dulu isinya `setVersi(v); loadDpa(v)` saja. Dua akibat, dua-duanya senyap:
   * isian yang belum tersimpan lenyap tanpa ditanya, dan pemilih periode tetap
   * menunjuk tempat lain — layar memperlihatkan Agustus sementara Simpan
   * menulis ke Juli. Periode sekarang IKUT ke versi yang dibuka, jadi tombol
   * Simpan selalu menulis ke tempat yang sedang dibaca layar.
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
    await loadDpa(v)
  }

  function terapkanSalinTahun(baris: DpaBarisInput[], asal: AsalSalin) {
    // Recalc supaya total induk di layar langsung sama dengan yang nanti dihitung
    // server, bukan angka warisan yang kebetulan cocok.
    setRows(recalcDpaJumlah(baris))
    setVersi('')
    setBelumTersimpan(true)
    asalSalinRef.current    = asal
    asalPulihkanRef.current = null
    asalImporRef.current    = null
    setSalinTahunBuka(false)
    const label = asal.sumber === 'DPA' ? `DPA ${asal.tahun}` : `Pergeseran ${asal.tahun}`
    showToast(`${baris.length} baris disalin dari ${label} — belum tersimpan, periksa lalu tekan Simpan.`)
  }

  /**
   * "Salin dari Versi Lain" — Tahap 3, pengganti alur yang dibuang di L79d.
   *
   * Perhatikan apa yang TIDAK ada di sini: `setVersi`, `setPeriodeTulis`, dan
   * `setVersion`. Itu bukan kelalaian, itu seluruh rancangannya. Menyalin
   * mengganti ISI layar; sasaran Simpan tetap milik pemilih periode. Kalau
   * salinan ikut memindahkan sasaran, kita menghidupkan lagi bentuk L78 — modal
   * yang menulis ke tempat lain daripada yang ditunjuk toolbar.
   *
   * `versi` yang tetap terisi juga yang membuat `expectedVersionUntuk`
   * memulangkan angka kunci yang BENAR: menimpa versi yang sedang terbuka
   * memang harus membawa angka kuncinya, bukan 0.
   */
  function terapkanSalinVersi(baris: DpaBarisInput[], asal: AsalSalin) {
    setRows(recalcDpaJumlah(baris))
    setBelumTersimpan(true)
    asalSalinRef.current    = asal
    asalPulihkanRef.current = null
    asalImporRef.current    = null
    setSalinVersiBuka(false)
    showToast(`${baris.length} baris disalin dari versi ${formatTanggalId(asal.versi)} — belum tersimpan, `
      + `periksa lalu tekan ${periodeTulis ? 'Simpan Periode' : 'Simpan'}.`)
  }

  // Handler tombol "Buat Form" di overlay — branch: overwrite-confirm atau langsung
  function confirmBuildForm() {
    if (!overlayItems) return
    if (rows.length > 0) {
      // Form sekarang ada isi → confirm overwrite
      setOverwriteConfirm(overlayItems)
      setOverlayItems(null)
      return
    }
    executeBuildForm(overlayItems)
  }

  // Hapus 1 row dari overlay
  function removeFromOverlay(idx: number) {
    setOverlayItems(prev => prev ? prev.filter((_, i) => i !== idx) : prev)
  }
  // Reorder row di overlay (local state only — TIDAK sync ke menu Kode Besar).
  // Reasoning: overlay = staging untuk build DPA sekali pakai, KB = persistent template.
  function moveInOverlay(idx: number, direction: 'up' | 'down') {
    setOverlayItems(prev => {
      if (!prev) return prev
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  // ── Kunci tombol yang mengganti SELURUH tabel sekaligus ────────────────────
  // Bukan karena tombolnya berbahaya, tapi karena satu klik di layar yang sedang
  // memegang versi tersimpan menghapus ratusan baris dan menggantinya — lalu
  // Simpan berikutnya menuliskannya ke slot yang sama. Pintunya dibuka lagi
  // dengan memilih periode yang masih kosong, atau menghapus versinya.
  const alasanKunciBorongan = versi
    ? `Versi ${formatTanggalId(versi)} sedang terbuka. Pilih periode yang belum punya versi, atau hapus versinya dulu di menu Pengaturan.`
    : ''
  // Salin Tahun patokannya SENGAJA berbeda: sasarannya tahun yang sedang dibuka,
  // bukan slot versi. Menyalin ke tahun yang sudah berisi tidak pernah benar,
  // sekalipun layarnya kebetulan kosong karena sedang memilih periode historis.
  const alasanKunciSalinTahun = tahunList.filter(t => t !== tahun).length === 0
    ? 'Belum ada tahun lain yang punya DPA untuk disalin.'
    : history.length > 0
      ? `DPA ${tahun} sudah punya ${history.length} versi. Salin dari tahun lain hanya untuk tahun yang masih kosong.`
      : ''
  // Sasaran Simpan, sekali dihitung: dipakai untuk menyaring daftar sumber DAN
  // untuk ditampilkan di modal. Rumusnya milik `sasaranSimpan`, yang juga dipakai
  // tombol Simpan — kalau ada dua rumus, modalnya menjanjikan tempat yang salah.
  const sasaran = sasaranSimpan(periodeTulis)
  // Salin Versi SENGAJA tidak ikut `alasanKunciBorongan`. Tombol-tombol itu
  // dikunci karena mengganti tabel dengan baris dari LUAR tahun ini (atau dari
  // nol): `anggaran_key`-nya kosong, jadi menuliskannya di atas versi tersimpan
  // memutus tautan ke belanja yang sudah tercatat. Salin Versi mengambil baris
  // dari tahun yang SAMA dengan jangkar utuh — dan sasaran yang sudah berisi
  // justru pemakaian utamanya: "mulai versi hari ini dari angka Juli".
  const alasanKunciVersi = alasanKunciSalinVersi(tahun, history, [versi, sasaran])

  return (
    <div className="space-y-4">
      {/* Header / Toolbar */}
      <div style={{ background:'#042C53', border:'1px solid #0C447C', borderRadius:10, padding:'10px 16px', display:'flex', flexWrap:'wrap', alignItems:'center', gap:12 }}>
        <h1 style={{ fontWeight:800, fontSize:14, color:'#E6F1FB' }}>Form BLUD — DPA BLUD</h1>

        {/* Tahun Anggaran — dimensi di atas versi (pilih tahun dulu) */}
        <div data-rima="dpa.tahun-dropdown" style={{ display:'inline-flex' }}>
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
            onChange={t => { void gantiPeriode(t) }}
          />
        )}

        {/* History selector — custom pill dropdown */}
        {/* data-rima: anchor tur RIMA F3 — wrapper inline-flex (display:contents rect-nya kosong) */}
        <div data-rima="dpa.versi-dropdown" style={{ display:'inline-flex' }}>
          <VersiDropdown
            value={versi}
            items={history}
            onChange={v => { void bukaVersi(v) }}
            placeholder="— Pilih Versi —"
            riwayat={riwayat}
            onPulihkan={bolehUbah ? pulihkanSimpanan : undefined}
          />
        </div>

        {bolehUbah && (
          <div style={{ display:'flex', gap:8, marginLeft:'auto' }}>
            <PrimaButton variant="purple" size="sm" iconLeft={<FilePlus className="w-3.5 h-3.5" />}
              disabled={!!alasanKunciBorongan} data-tooltip={alasanKunciBorongan}
              onClick={mulaiFormBaru} data-rima="dpa.form-baru">
              Form Baru
            </PrimaButton>

            <PrimaButton variant="ghost" size="sm" iconLeft={<CalendarClock className="w-3.5 h-3.5" />}
              disabled={!!alasanKunciSalinTahun} data-tooltip={alasanKunciSalinTahun}
              onClick={() => setSalinTahunBuka(true)} data-rima="dpa.salin-tahun">
              Salin Tahun Lain
            </PrimaButton>

            <PrimaButton variant="ghost" size="sm" iconLeft={<Copy className="w-3.5 h-3.5" />}
              disabled={!!alasanKunciVersi}
              data-tooltip={alasanKunciVersi
                || `Ambil isi versi lain tahun ${tahun} ke layar ini — sasaran Simpan tetap ${formatTanggalId(sasaran)}`}
              onClick={() => setSalinVersiBuka(true)} data-rima="dpa.salin-versi">
              Salin Versi Lain
            </PrimaButton>

            {bolehImpor && (
              <PrimaButton variant="success" size="sm" iconLeft={<Upload className="w-3.5 h-3.5" />}
                disabled={!!alasanKunciBorongan} data-tooltip={alasanKunciBorongan}
                onClick={() => setImportDpaBuka(true)} data-rima="dpa.impor">
                Impor
              </PrimaButton>
            )}

            {bolehSalinInduk && (
              <PrimaButton variant="ghost" size="sm" iconLeft={<Inbox className="w-3.5 h-3.5" />}
                disabled={!rows.length} onClick={() => setSalinBuka(true)} data-rima="dpa.salin-induk">
                Salin ke Induk
              </PrimaButton>
            )}

            <PrimaButton variant="primary" size="sm" iconLeft={<Save className="w-3.5 h-3.5" />}
              disabled={saving || !rows.length} onClick={simpan} data-rima="dpa.simpan">
              {saving ? 'Menyimpan...' : periodeTulis ? 'Simpan Periode' : 'Simpan'}
            </PrimaButton>
          </div>
        )}
      </div>

      {!bolehUbah && <SpandukLihat menu="dpa" />}

      {/* Search bar + Legenda functional (filter level via chip toggle) */}
      <div style={{ background:'#042C53', border:'1px solid #0C447C', borderRadius:10, padding:'8px 16px', display:'flex', flexWrap:'wrap', gap:10, alignItems:'center' }}>
        {/* Search jump (C) */}
        <div data-rima="dpa.search-jump" style={{ position:'relative', flex:'0 0 240px' }}>
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

        {/* Legend functional (B) — span anchor membungkus chips utk tur RIMA */}
        <span data-rima="dpa.legend-chips" style={{ display:'inline-flex', flexWrap:'wrap', gap:10, alignItems:'center' }}>
        {[
          { bg:'#B45309',               label:'Level 1' },
          { bg:'rgba(16,185,129,.34)',  label:'Level 2' },
          { bg:'#334155',               label:'Level 2.1 ✎' },
          { bg:'rgba(139,92,246,.34)',  label:'Level 3' },
          { bg:'rgba(217,70,239,.22)',  label:'Level 3.1 ✎' },
          { bg:'rgba(6,182,212,.28)',   label:'Level 4' },
          { bg:'rgba(56,189,248,.20)',  label:'Level 4.1 ✎' },
        ].map(item => {
          // strip ' ✎' supaya cocok dengan TIPE_LABEL value
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
              {/* Swatch gradient multi-color untuk indikasi "grup" */}
              <span className="swatch" style={{
                background: 'linear-gradient(135deg, rgba(249,115,22,.45) 0%, rgba(244,63,94,.45) 35%, rgba(99,102,241,.45) 70%, rgba(100,116,139,.45) 100%)',
              }} />
              Level Lainnya
            </button>
          )
        })()}
        </span>
        <span style={{ color:'#85B7EB', marginLeft:4, fontSize:11 }}>✎ = bisa input vol &amp; harga</span>
      </div>

      {/* Konten utama */}
      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:192 }}>
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-400 border-t-transparent" />
        </div>
      ) : rows.length === 0 ? (
        /* ── Empty state ── */
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, padding:'80px 20px', background:'#042C53', border:'1px solid #0C447C', borderRadius:12, textAlign:'center' }}>
          <div style={{ color:'#0C447C' }}>
            <FilePlus style={{ width:56, height:56 }} />
          </div>
          <div>
            <p style={{ color:'#E6F1FB', fontWeight:700, fontSize:15, marginBottom:4 }}>Belum ada data DPA</p>
            <p style={{ fontSize:13, color:'#85B7EB', maxWidth:360 }}>
              {bolehUbah
                ? <>Klik <strong style={{ color:'#B5D4F4' }}>Mulai Form DPA Baru</strong> untuk membuat struktur awal, salin isi tahun lain, atau pilih versi dari history di atas.</>
                : 'Pilih versi dari history di atas. Penyusunan DPA bukan wewenang peran Anda.'}
            </p>
          </div>
          {bolehUbah && (
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
              <PrimaButton variant="primary" iconLeft={<FilePlus className="w-4 h-4" />}
                onClick={mulaiFormBaru}>
                Mulai Form DPA Baru
              </PrimaButton>
              {tahunList.filter(t => t !== tahun).length > 0 && (
                <PrimaButton variant="ghost" iconLeft={<CalendarClock className="w-4 h-4" />}
                  onClick={() => setSalinTahunBuka(true)}>
                  Salin dari Tahun Lain
                </PrimaButton>
              )}
            </div>
          )}

          {/* Panduan singkat hierarki */}
          <div style={{ marginTop:8, textAlign:'left', background:'rgba(12,68,124,.2)', border:'1px solid #0C447C', borderRadius:10, padding:16, fontSize:11, color:'#85B7EB', maxWidth:420 }}>
            <p style={{ fontWeight:700, color:'#B5D4F4', marginBottom:8 }}>Hierarki tipe baris DPA:</p>
            <p>🔵 <strong>Level 1</strong> → rekening level 1</p>
            <p style={{ paddingLeft:16 }}>📗 <strong>Level 2</strong> → rekening level 2</p>
            <p style={{ paddingLeft:32 }}>📄 <strong>Level 2.1</strong> → rekening level 2.1 ✎</p>
            <p style={{ paddingLeft:32 }}>🟣 <strong>Level 3</strong> → rekening level 3</p>
            <p style={{ paddingLeft:48 }}>🟤 <strong>Level 3.1</strong> → rekening level 3.1 ✎</p>
            <p style={{ paddingLeft:32 }}>🔷 <strong>Level 4</strong> → rekening level 4</p>
            <p style={{ paddingLeft:48 }}>🔸 <strong>Level 4.1</strong> → rekening level 4.1 ✎</p>
          </div>
        </div>
      ) : (
        <DpaTable rows={rows} onChange={ubahRows} akunOptions={akunOptions} pjOptions={pjOptions} hiddenLevels={hiddenLevels} highlightId={highlightId} bolehUbah={bolehUbah} />
      )}

      {importDpaBuka && (
        <ImportDpaModal
          tahun={tahun}
          periodeLabel={periodeTulis ? formatTanggalId(periodeTulis) : 'bulan berjalan (hari ini)'}
          onTutup={() => setImportDpaBuka(false)}
          onTerapkan={terapkanImpor}
        />
      )}

      {salinBuka && (
        <SalinMasterModal
          rows={rows}
          bolehMasterAkun={bolehUbahMasterAkun}
          bolehKodeBesar={bolehUbahKodeBesar}
          onTutup={() => setSalinBuka(false)}
          onSelesai={() => { void muatAkunOptions() }}
        />
      )}

      {salinTahunBuka && (
        <SalinTahunModal
          tahunTujuan={tahun}
          tahunList={tahunList}
          bolehBacaPergeseran={bolehBacaPergeseran}
          adaIsiDiForm={rows.length > 0}
          onTutup={() => setSalinTahunBuka(false)}
          onSalin={terapkanSalinTahun}
        />
      )}

      {salinVersiBuka && (
        <SalinVersiModal<DpaBaris, DpaBarisInput>
          tahun={tahun}
          jenis="DPA"
          history={history}
          versiTerbuka={versi}
          sasaran={sasaran}
          jumlahDiLayar={rows.length}
          petakan={petakanDpaRows}
          hitungTotal={totalAkarDpa}
          onTutup={() => setSalinVersiBuka(false)}
          onSalin={terapkanSalinVersi}
        />
      )}

      {/* Audit BLUD v1.2 (B-NEW-3): modal konfirmasi safety threshold drop >50% */}
      {safetyWarning && (
        <div onClick={() => setSafetyWarning(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#042C53', border:'2px solid #E24B4A', borderRadius:'14px', padding:'24px', maxWidth:'500px', width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize:'15px', fontWeight:800, color:'#E24B4A', marginBottom:'10px' }}>
              Banyak baris akan hilang
            </div>
            <div style={{ fontSize:'12px', color:'#B5D4F4', lineHeight:1.7, marginBottom:'16px' }}>
              Versi <strong style={{ color:'#FAC775' }}>{formatTanggalId(safetyWarning.versiTanggal)}</strong> sekarang berisi <strong style={{ color:'#FAC775' }}>{safetyWarning.existing}</strong> baris.
              Yang akan Anda simpan cuma <strong style={{ color:'#FAC775' }}>{safetyWarning.incoming}</strong> baris — <strong style={{ color:'#E24B4A' }}>{safetyWarning.dropPct.toFixed(1)}%</strong> isinya lenyap.
              <br /><br />
              Kalau memang disengaja, misalnya susunannya baru saja diringkas, lanjutkan saja.
              Kalau tidak, batalkan dan periksa dulu — <strong style={{ color:'#E24B4A' }}>baris yang hilang tidak bisa dikembalikan.</strong>
            </div>
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <PrimaButton variant="ghost" onClick={() => setSafetyWarning(null)} disabled={saving}>
                Periksa dulu
              </PrimaButton>
              <PrimaButton variant="danger" onClick={() => { const v = safetyWarning.versiTanggal; paksaDropRef.current = true; setSafetyWarning(null); setSaving(true); void doSimpanInternal(v).finally(() => setSaving(false)) }} disabled={saving}>
                Memang disengaja, simpan
              </PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* §4.3: pagu turun di bawah realisasi. Boleh ditembus, tapi harus beralasan
          dan alasannya masuk audit log — yang menanggung risiko yang memutuskan.
          Bentuknya sengaja identik dengan layar Pergeseran: keputusannya sama. */}
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
                Uangnya sudah keluar. Menyimpan DPA ini membuat baris di bawah jadi minus di layar
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
                <span className="blud-imp-muted">Alasannya apa? Wajib diisi, minimal 10 huruf. Ini ikut tercatat dan bisa ditanyakan kembali di kemudian hari.</span>
                <textarea className="blud-imp-input" rows={3} value={alasanTurun}
                  onChange={e => setAlasanTurun(e.target.value)}
                  placeholder="Contoh: pagu dikoreksi mengikuti DPA definitif atas disposisi Direktur tanggal …" />
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

      {/* ─── Modal: kode_besar kosong → block + link ke menu ─────────────── */}
      {emptyKbModal && (
        <div onClick={() => setEmptyKbModal(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#042C53', border:'1px solid rgba(139,92,246,.45)', borderRadius:12, padding:24, maxWidth:480, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.6)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(139,92,246,.20)', color:'#A78BFA', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <AlertTriangle size={18} />
              </div>
              <h2 style={{ fontWeight:800, color:'#E6F1FB', fontSize:15 }}>Belum ada data Kode Besar</h2>
            </div>
            <p style={{ fontSize:12.5, color:'#B5D4F4', lineHeight:1.7, marginBottom:16 }}>
              Kerangka form DPA disusun dari daftar di menu <strong style={{ color:'#A78BFA' }}>Kode Besar</strong> — daftar itu yang
              menentukan baris tingkat 1, 2, dan 2.1 muncul apa saja. Isi dulu daftarnya, lalu kembali ke sini.
            </p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <PrimaButton variant="ghost" onClick={() => setEmptyKbModal(false)}>
                Tutup
              </PrimaButton>
              <PrimaButton variant="purple" iconLeft={<ExternalLink size={13} />}
                onClick={() => { setEmptyKbModal(false); router.push('/blud/kode-besar') }}>
                Buka Kode Besar
              </PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* ─── Overlay select: pilih row dari Kode Besar untuk inject ke form ─ */}
      {overlayItems && (
        <div onClick={() => setOverlayItems(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#042C53', border:'1px solid rgba(124,92,252,.45)', borderRadius:12, padding:20, maxWidth:680, width:'100%', maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,.6)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <FilePlus size={18} style={{ color:'#A78BFA' }} />
              <h2 style={{ fontWeight:800, color:'#E6F1FB', fontSize:15 }}>Pilih baris untuk kerangka DPA</h2>
              <button onClick={() => setOverlayItems(null)} style={{ marginLeft:'auto', background:'transparent', border:'none', color:'#85B7EB', cursor:'pointer', padding:4 }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize:11.5, color:'#85B7EB', lineHeight:1.5, marginBottom:12 }}>
              <strong style={{ color:'#B5D4F4' }}>{overlayItems.length} baris</strong> dari Kode Besar akan jadi kerangka form.
              Yang tidak dipakai, buang lewat <span style={{ display:'inline-flex', verticalAlign:'middle' }}><DeleteIcon size={11} /></span>.
            </p>

            <div style={{ flex:1, overflowY:'auto', border:'1px solid #0C447C', borderRadius:8 }}>
              {overlayItems.length === 0 ? (
                <div style={{ padding:32, textAlign:'center', color:'#85B7EB', fontSize:12 }}>
                  Semua baris sudah dibuang. Tutup jendela ini untuk membatalkan.
                </div>
              ) : (
                overlayItems.map((it, idx) => {
                  const levelColor = it.level === 'L1' ? '#B45309' : it.level === 'L2' ? 'rgba(16,185,129,.8)' : '#334155'
                  const parentInfo = it.level === 'L1' ? 'root' : it.level === 'L2' ? 'auto' : (it.parent_kode ?? '⚠ tanpa parent')
                  const isWarn = it.level === 'L2.1' && !it.parent_kode
                  return (
                    <div key={`${it.kode}-${idx}`} style={{
                      display:'flex', alignItems:'center', gap:10,
                      padding:'8px 12px',
                      borderBottom: idx < overlayItems.length - 1 ? '1px solid rgba(12,68,124,.4)' : 'none',
                      background: isWarn ? 'rgba(226,75,74,.06)' : 'transparent',
                    }}>
                      <span style={{
                        display:'inline-block', minWidth:38, padding:'2px 6px',
                        background: levelColor, color:'#FFFFFF',
                        fontSize:9.5, fontWeight:800, letterSpacing:'.4px',
                        borderRadius:4, textAlign:'center',
                      }}>{it.level}</span>
                      <span style={{ fontSize:12, color:'#FBBF24', fontWeight:700, minWidth:60, fontFamily:'var(--font-mono, monospace)' }}>{it.kode}</span>
                      <span style={{ fontSize:12, color:'#E6F1FB', flex:1 }}>{it.uraian}</span>
                      <span style={{ fontSize:10.5, color: isWarn ? '#FCA5A5' : '#85B7EB', fontStyle:'italic', minWidth:60, textAlign:'right' }}>
                        {parentInfo}
                      </span>
                      {/* Geser atas/bawah (local only, tidak sync ke Kode Besar) */}
                      <button onClick={() => moveInOverlay(idx, 'up')} disabled={idx === 0}
                        data-tooltip="Pindah ke atas"
                        style={{ background:'transparent', border:'none', color: idx === 0 ? 'rgba(133,183,235,.25)' : '#85B7EB', cursor: idx === 0 ? 'not-allowed' : 'pointer', padding:3, borderRadius:4, display:'inline-flex' }}>
                        <ChevronUp size={13} />
                      </button>
                      <button onClick={() => moveInOverlay(idx, 'down')} disabled={idx === overlayItems.length - 1}
                        data-tooltip="Pindah ke bawah"
                        style={{ background:'transparent', border:'none', color: idx === overlayItems.length - 1 ? 'rgba(133,183,235,.25)' : '#85B7EB', cursor: idx === overlayItems.length - 1 ? 'not-allowed' : 'pointer', padding:3, borderRadius:4, display:'inline-flex' }}>
                        <ChevronDown size={13} />
                      </button>
                      <DeleteButton onClick={() => removeFromOverlay(idx)} data-tooltip="Buang baris ini dari kerangka" iconSize={12} />
                    </div>
                  )
                })
              )}
            </div>

            <div style={{ display:'flex', gap:8, marginTop:14, justifyContent:'flex-end' }}>
              <PrimaButton variant="ghost" onClick={() => setOverlayItems(null)}>
                Batal
              </PrimaButton>
              <PrimaButton variant="purple" iconLeft={<FilePlus size={13} />}
                onClick={confirmBuildForm} disabled={overlayItems.length === 0} data-rima="dpa.overlay-buat-form">
                Buat Form ({overlayItems.length})
              </PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirm overwrite: form sekarang akan diganti ────────────────── */}
      {overwriteConfirm && (
        <div onClick={() => setOverwriteConfirm(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1010 }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#042C53', border:'1px solid rgba(239,68,68,.45)', borderRadius:12, padding:20, maxWidth:460, width:'90%', boxShadow:'0 20px 60px rgba(0,0,0,.6)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(239,68,68,.20)', color:'#FCA5A5', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <AlertTriangle size={18} />
              </div>
              <h2 style={{ fontWeight:800, color:'#E6F1FB', fontSize:15 }}>Ganti form sekarang?</h2>
            </div>
            <p style={{ fontSize:12.5, color:'#B5D4F4', lineHeight:1.7, marginBottom:6 }}>
              Form DPA saat ini berisi <strong style={{ color:'#FAC775' }}>{rows.length} baris</strong> dan akan diganti dengan
              <strong style={{ color:'#A78BFA' }}> {overwriteConfirm.length} baris</strong> baru dari Kode Besar.
            </p>
            <p style={{ fontSize:11, color:'#85B7EB', lineHeight:1.5, marginBottom:16, fontStyle:'italic' }}>
              Versi yang sudah pernah disimpan tetap aman — pilih tanggalnya lagi dari daftar versi kalau ingin kembali.
              Yang berganti cuma isi layar ini, dan belum tersimpan sampai Anda menekan Simpan.
            </p>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <PrimaButton variant="ghost" onClick={() => setOverwriteConfirm(null)}>
                Batal
              </PrimaButton>
              <PrimaButton variant="danger" onClick={() => executeBuildForm(overwriteConfirm)}>
                Ganti isi form
              </PrimaButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

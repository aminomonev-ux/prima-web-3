'use client'
// components/blud/ImportUsulanModal.tsx
// Modal workbench "Import dari Usulan" per-baris DPA.
// Ref: docs/session/blud/CONCEPT-import-usulan-dpa-v2.md — 2 mode:
//   - "Isi baris ini": 1 item menimpa konten baris anchor (leaf saja)
//   - "Sisip baris baru": multi item, susunan eksplisit di dock kanan
//     (indent/outdent + urutan), parent resolve dari urutan susunan.

import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Virtuoso } from 'react-virtuoso'
import { X, Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Pencil, Plus } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'
import { formatRupiah, genRowId, TIPE_LABEL } from '@/lib/blud/format'
import type { DpaImportCandidate } from '@/lib/blud/import-usulan-data'
import type { DpaBarisInput, TipeBaris } from '@/types'

const CHAIN: TipeBaris[] = [
  'GRANDMASTER', 'MASTER', 'CHILD', 'LEADER', 'MEMBER',
  'PLETON-LEADER', 'PLETON-MEMBER',
  'KETUA-KELOMPOK-A', 'ANGGOTA-KELOMPOK-A',
  'KETUA-KELOMPOK-B', 'ANGGOTA-KELOMPOK-B',
  'L7-HEAD', 'L7-SUB', 'L8-HEAD', 'L8-SUB',
]
const chainIdx = (t: TipeBaris) => CHAIN.indexOf(t)

export interface ImportPick {
  cand: DpaImportCandidate
  tipe: TipeBaris
}

export type ImportResult =
  | { mode: 'fill'; cand: DpaImportCandidate }
  | { mode: 'insert'; picks: ImportPick[] }

/**
 * Bangun baris DPA baru dari picks (urutan = Panel Susunan). Pure — dipanggil
 * dpa-client setelah user klik Import. Hasil dipartisi DFS-konsisten:
 * keturunan anchor dulu, lalu sibling — supaya urutan array tetap valid DFS.
 */
export function buildImportedRows(anchor: DpaBarisInput, picks: ImportPick[]): DpaBarisInput[] {
  const lastByTipe = new Map<TipeBaris, string>()
  const classOf    = new Map<string, 'desc' | 'sib'>()
  const built: Array<{ row: DpaBarisInput; cls: 'desc' | 'sib' }> = []

  for (const { cand, tipe } of picks) {
    const rowId = genRowId()
    let parentId: string | null
    let cls: 'desc' | 'sib'
    if (tipe === anchor.tipe_baris) {
      parentId = anchor.parent_id
      cls = 'sib'
    } else {
      const parentTipe = CHAIN[chainIdx(tipe) - 1]
      const prev = lastByTipe.get(parentTipe)
      if (prev) {
        parentId = prev
        cls = classOf.get(prev) ?? 'desc'
      } else {
        // Validasi susunan menjamin parentTipe === anchor.tipe_baris di titik ini
        parentId = anchor.row_id
        cls = 'desc'
      }
    }
    lastByTipe.set(tipe, rowId)
    classOf.set(rowId, cls)
    built.push({
      cls,
      row: {
        row_id: rowId, parent_id: parentId,
        kode_rekening: '', uraian: cand.uraian,
        vol: cand.vol || null, satuan: cand.satuan || null, harga: cand.harga || null,
        jumlah: cand.jumlah, penanggung_jawab: null, keterangan: null,
        tipe_baris: tipe, urutan: 0,
        origin: 'USULAN', usulan_item_id: cand.usulan_item_id, usulan_no: cand.usulan_no,
      },
    })
  }
  return [...built.filter(b => b.cls === 'desc'), ...built.filter(b => b.cls === 'sib')].map(b => b.row)
}

function highlight(text: string, term: string): ReactNode {
  if (!term) return text
  const i = text.toLowerCase().indexOf(term)
  if (i === -1) return text
  return (
    <>{text.slice(0, i)}<mark className="blud-imp-hl">{text.slice(i, i + term.length)}</mark>{text.slice(i + term.length)}</>
  )
}

interface Props {
  anchor:            DpaBarisInput
  /** Anchor punya anak → mode "Isi baris ini" tidak sah (jumlah = Σ anak). */
  anchorHasChildren: boolean
  /** usulan_item_id yang sudah ada di form saat ini — hard block (anti-dobel). */
  presentIds:        Set<number>
  onImport:          (result: ImportResult) => void
  onClose:           () => void
}

export default function ImportUsulanModal({ anchor, anchorHasChildren, presentIds, onImport, onClose }: Props) {
  const [items, setItems]         = useState<DpaImportCandidate[]>([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [mode, setMode] = useState<'fill' | 'insert'>(
    !anchorHasChildren && !anchor.uraian?.trim() ? 'fill' : 'insert',
  )
  const [q, setQ]                 = useState('')
  const [railJenis, setRailJenis] = useState('')
  const [railSub, setRailSub]     = useState('')
  const [fTahun, setFTahun]       = useState('')
  const [sortBy, setSortBy]       = useState<'usulan' | 'jumlah' | 'uraian'>('usulan')

  const [fillId, setFillId]   = useState<number | null>(null)
  const [susunan, setSusunan] = useState<ImportPick[]>([])

  const levelOptions = useMemo(() => CHAIN.slice(chainIdx(anchor.tipe_baris)), [anchor.tipe_baris])
  const defaultTipe  = levelOptions[1] ?? levelOptions[0]  // anak langsung; L8.1 → dirinya

  useEffect(() => {
    let aborted = false
    async function load() {
      try {
        const res = await fetch('/api/blud/dpa/import-usulan')
        const d = await res.json()
        if (aborted) return
        if (!d.ok) { setLoadError(d.error || 'Gagal memuat'); return }
        setItems(d.data as DpaImportCandidate[])
      } catch {
        if (!aborted) setLoadError('Gagal memuat data usulan')
      } finally {
        if (!aborted) setLoading(false)
      }
    }
    load()
    return () => { aborted = true }
  }, [])

  const term = q.trim().toLowerCase()

  const byTahun = useMemo(
    () => fTahun ? items.filter(i => i.tahun === fTahun) : items,
    [items, fTahun],
  )
  const tahunOptions = useMemo(
    () => [...new Set(items.map(i => i.tahun).filter(Boolean))].sort().reverse(),
    [items],
  )
  const jenisGroups = useMemo(() => {
    const m = new Map<string, { total: number; inForm: number }>()
    for (const it of byTahun) {
      const g = m.get(it.jenis_belanja) ?? { total: 0, inForm: 0 }
      g.total++
      if (presentIds.has(it.usulan_item_id)) g.inForm++
      m.set(it.jenis_belanja, g)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [byTahun, presentIds])
  const subGroups = useMemo(() => {
    if (!railJenis) return []
    const m = new Map<string, number>()
    for (const it of byTahun) {
      if (it.jenis_belanja !== railJenis) continue
      m.set(it.sub_bidang, (m.get(it.sub_bidang) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [byTahun, railJenis])

  const matchTerm = useMemo(() => (it: DpaImportCandidate) =>
    !term || it.uraian.toLowerCase().includes(term) || it.usulan_no.toLowerCase().includes(term),
  [term])

  const allMatchCount = useMemo(
    () => byTahun.filter(matchTerm).length,
    [byTahun, matchTerm],
  )

  const shown = useMemo(() => {
    const base = byTahun.filter(it =>
      (!railJenis || it.jenis_belanja === railJenis) &&
      (!railSub || it.sub_bidang === railSub) &&
      matchTerm(it),
    )
    if (sortBy === 'jumlah') return [...base].sort((a, b) => b.jumlah - a.jumlah)
    if (sortBy === 'uraian') return [...base].sort((a, b) => a.uraian.localeCompare(b.uraian))
    return base
  }, [byTahun, railJenis, railSub, matchTerm, sortBy])

  // Validasi tangga + deteksi induk — mirror semantik lastByTipe buildImportedRows
  const { errIdx, indukIdx } = useMemo(() => {
    const errs  = new Map<number, string>()
    const induk = new Set<number>()
    const lastByTipe = new Map<TipeBaris, number>()
    susunan.forEach((p, i) => {
      if (p.tipe !== anchor.tipe_baris) {
        const parentTipe = CHAIN[chainIdx(p.tipe) - 1]
        const j = lastByTipe.get(parentTipe)
        if (j != null) induk.add(j)
        else if (parentTipe !== anchor.tipe_baris) {
          errs.set(i, `Butuh ${TIPE_LABEL[parentTipe]} di atasnya`)
        }
      }
      lastByTipe.set(p.tipe, i)
    })
    return { errIdx: errs, indukIdx: induk }
  }, [susunan, anchor.tipe_baris])

  const subtotal = susunan.reduce((s, p, i) => indukIdx.has(i) ? s : s + p.cand.jumlah, 0)
  const fillCand = fillId != null ? items.find(i => i.usulan_item_id === fillId) ?? null : null
  const canSubmit = mode === 'fill'
    ? fillCand != null
    : susunan.length > 0 && errIdx.size === 0

  const inSusunan = (id: number) => susunan.some(p => p.cand.usulan_item_id === id)

  function pickRow(it: DpaImportCandidate) {
    if (presentIds.has(it.usulan_item_id)) return
    if (mode === 'fill') { setFillId(it.usulan_item_id); return }
    setSusunan(prev => prev.some(p => p.cand.usulan_item_id === it.usulan_item_id)
      ? prev.filter(p => p.cand.usulan_item_id !== it.usulan_item_id)
      : [...prev, { cand: it, tipe: defaultTipe }])
  }
  function shiftLevel(i: number, dir: 1 | -1) {
    setSusunan(prev => prev.map((p, j) => {
      if (j !== i) return p
      const next = CHAIN[chainIdx(p.tipe) + dir]
      return next && chainIdx(next) >= chainIdx(anchor.tipe_baris) ? { ...p, tipe: next } : p
    }))
  }
  function moveEntry(i: number, dir: 1 | -1) {
    setSusunan(prev => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function removeEntry(i: number) {
    setSusunan(prev => prev.filter((_, j) => j !== i))
  }
  function setTipeAll(t: TipeBaris) {
    setSusunan(prev => prev.map(p => ({ ...p, tipe: t })))
  }
  function doImport() {
    if (!canSubmit) return
    if (mode === 'fill' && fillCand) onImport({ mode: 'fill', cand: fillCand })
    else onImport({ mode: 'insert', picks: susunan })
    onClose()
  }

  function renderRow(it: DpaImportCandidate) {
    const already  = presentIds.has(it.usulan_item_id)
    const selected = mode === 'fill' ? fillId === it.usulan_item_id : inSusunan(it.usulan_item_id)
    const versi    = it.imported_in
    return (
      <div
        className={`blud-imp-row${selected ? ' sel' : ''}`}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px',
                 opacity: already ? .45 : 1, cursor: already ? 'default' : 'pointer' }}
        onClick={() => pickRow(it)}
      >
        {mode === 'fill' ? (
          <input type="radio" checked={selected} disabled={already} readOnly
            style={{ accentColor: '#EF9F27', flexShrink: 0 }} />
        ) : (
          <input type="checkbox" className="dpa-row-checkbox" checked={selected} disabled={already} readOnly />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="blud-imp-text"
               style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
               data-tooltip={`${it.usulan_no} · ${it.pengusul} · ${it.sub_bidang} · TA ${it.tahun}`}>
            {highlight(it.uraian, term)}
            {already && <em style={{ fontSize: 10, opacity: .8 }}> — sudah di form (anti-dobel)</em>}
          </div>
          <div className="blud-imp-muted" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono, monospace)' }}>
            {it.usulan_no} · {it.vol} {it.satuan} × {formatRupiah(it.harga)} = {formatRupiah(it.jumlah)}
            {!already && versi.length > 0 && (
              <span className="blud-imp-badge-warn"
                    style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 99, fontSize: 9.5 }}
                    data-tooltip={`Pernah diimport di versi: ${versi.join(', ')}`}>
                pernah diimport · {versi.slice(0, 2).join(' · ')}{versi.length > 2 ? ` +${versi.length - 2}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  const railBtn = (label: string, count: number | null, active: boolean, onClick: () => void, nested = false) => (
    <button type="button" key={`${nested ? 'sub:' : 'jenis:'}${label}`}
      className={`blud-imp-rail-item${active ? ' active' : ''}`}
      style={{ paddingLeft: nested ? 24 : 12, fontSize: nested ? 10.5 : 11 }}
      onClick={onClick}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{label}</span>
      {count != null && <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9.5, opacity: .7, flexShrink: 0 }}>{count}</span>}
    </button>
  )

  const body = (
    <div className="fixed inset-0 flex items-center justify-center"
         style={{ zIndex: 1000, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}>
      <div className="blud-modal-card rounded-xl flex flex-col"
           style={{ width: 'min(980px, 96vw)', height: '88vh' }}>

        <div className="blud-modal-header flex items-center justify-between px-5 py-3" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div>
            <span className="blud-modal-title font-semibold">Import dari Usulan Kebutuhan</span>
            <div className="blud-imp-muted" style={{ fontSize: 11, marginTop: 2 }}>
              Target: <strong className="blud-imp-text">{anchor.uraian || TIPE_LABEL[anchor.tipe_baris]}</strong> ({TIPE_LABEL[anchor.tipe_baris]}) · hanya item final disetujui Kabag
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button type="button"
              className={`blud-imp-pill${mode === 'fill' ? ' on-amber' : ''}`}
              disabled={anchorHasChildren}
              data-tooltip={anchorHasChildren ? 'Baris induk: jumlah dihitung dari anak — pakai Sisip baris baru' : 'Satu item menimpa isi baris yang diklik'}
              onClick={() => setMode('fill')} data-rima="dpa.import-mode-fill">
              <Pencil size={11} /> Isi baris ini
            </button>
            <button type="button"
              className={`blud-imp-pill${mode === 'insert' ? ' on-purple' : ''}`}
              data-tooltip="Item masuk sebagai baris baru di bawah / sejajar baris yang diklik"
              onClick={() => setMode('insert')} data-rima="dpa.import-mode-insert">
              <Plus size={11} /> Sisip baris baru
            </button>
            <button onClick={onClose} className="blud-modal-close" style={{ marginLeft: 6 }} aria-label="Tutup"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '152px minmax(0,1fr) 216px', flex: 1, minHeight: 0 }}>

          {/* ─ Rail kiri: jenis belanja → sub-bidang ─ */}
          <div className="blud-imp-rail" style={{ overflowY: 'auto', padding: '10px 0' }}>
            <div className="blud-imp-muted" style={{ padding: '0 12px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '.4px' }}>JENIS BELANJA</div>
            {railBtn('Semua', byTahun.length, !railJenis, () => { setRailJenis(''); setRailSub('') })}
            {jenisGroups.map(([jenis, g]) => (
              <div key={jenis}>
                {railBtn(
                  g.inForm > 0 ? `${jenis} · ${g.inForm} di form` : jenis,
                  g.total,
                  railJenis === jenis && !railSub,
                  () => { setRailJenis(prev => prev === jenis ? '' : jenis); setRailSub('') },
                )}
                {railJenis === jenis && subGroups.map(([sub, n]) =>
                  railBtn(sub, n, railSub === sub, () => setRailSub(prev => prev === sub ? '' : sub), true))}
              </div>
            ))}
          </div>

          {/* ─ Tengah: search-first + daftar virtual ─ */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, padding: '10px 12px 6px' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 140 }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: 9, opacity: .5 }} />
                <input className="blud-imp-input" autoFocus value={q} onChange={e => setQ(e.target.value)}
                  placeholder="Cari item / no. usulan…"
                  style={{ width: '100%', padding: '7px 10px 7px 30px' }} />
              </div>
              <select className="blud-imp-input" value={fTahun} onChange={e => setFTahun(e.target.value)} style={{ padding: '7px 8px' }}>
                <option value="">Semua TA</option>
                {tahunOptions.map(t => <option key={t} value={t}>TA {t}</option>)}
              </select>
              <select className="blud-imp-input" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ padding: '7px 8px' }}>
                <option value="usulan">Urutan usulan</option>
                <option value="jumlah">Jumlah terbesar</option>
                <option value="uraian">Uraian A–Z</option>
              </select>
            </div>
            <div className="blud-imp-muted" style={{ padding: '0 12px 6px', fontSize: 10.5 }}>
              {term
                ? <>{shown.length} hasil untuk &ldquo;{q.trim()}&rdquo;{railJenis ? <> di <strong>{railSub || railJenis}</strong></> : null}
                    {(railJenis || railSub) && allMatchCount > shown.length && (
                      <button type="button" className="blud-imp-link" onClick={() => { setRailJenis(''); setRailSub('') }}>
                        cari di semua grup ({allMatchCount})
                      </button>
                    )}</>
                : <>{shown.length} item{railJenis ? <> di <strong>{railSub || railJenis}</strong></> : null} · scroll memuat otomatis (virtual)</>}
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
              {loading && <div className="blud-imp-muted" style={{ padding: 24, fontSize: 12 }}>Memuat item usulan final…</div>}
              {loadError && <div style={{ padding: 24, fontSize: 12, color: '#E24B4A' }}>{loadError}</div>}
              {!loading && !loadError && shown.length === 0 && (
                <div className="blud-imp-muted" style={{ padding: 24, fontSize: 12, fontStyle: 'italic' }}>
                  Tidak ada item usulan final yang cocok dengan filter.
                </div>
              )}
              {!loading && !loadError && shown.length > 0 && (
                <Virtuoso style={{ height: '100%' }} data={shown} defaultItemHeight={46}
                  computeItemKey={(_, it) => it.usulan_item_id}
                  itemContent={(_, it) => renderRow(it)} />
              )}
            </div>
            <div className="blud-imp-muted" style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: 10, borderTop: '1px solid rgba(133,183,235,.15)' }}>
              <span>{term ? 'hapus kata kunci = jelajah grup di rail kiri' : 'klik grup di rail kiri untuk menjelajah'}</span>
              <span>{mode === 'fill' ? 'mode isi: pilih satu (radio)' : 'mode sisip: multi-pilih'}</span>
            </div>
          </div>

          {/* ─ Dock kanan: Susunan (insert) / Baris tujuan (fill) ─ */}
          <div className="blud-imp-dock" data-rima="dpa.import-susunan" style={{ overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column' }}>
            {mode === 'insert' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span className="blud-imp-dock-title" style={{ color: '#A78BFA' }}>SUSUNAN ({susunan.length})</span>
                  {susunan.length > 1 && (
                    <select className="blud-imp-input" value="" style={{ fontSize: 9.5, padding: '2px 4px' }}
                      onChange={e => { if (e.target.value) setTipeAll(e.target.value as TipeBaris) }}>
                      <option value="">Level semua…</option>
                      {levelOptions.map(t => <option key={t} value={t}>{TIPE_LABEL[t]}</option>)}
                    </select>
                  )}
                </div>
                {susunan.length === 0 && (
                  <div className="blud-imp-muted" style={{ fontSize: 10.5, lineHeight: 1.5 }}>
                    Centang item di daftar — susunan pohon dibangun di sini. Indentasi = posisi akhir di form.
                  </div>
                )}
                {susunan.map((p, i) => {
                  const depth = p.tipe === anchor.tipe_baris ? 0 : chainIdx(p.tipe) - chainIdx(anchor.tipe_baris)
                  const err   = errIdx.get(i)
                  return (
                    <div key={p.cand.usulan_item_id} style={{ marginLeft: Math.min(depth, 4) * 12, marginBottom: 5 }}>
                      <div className={`blud-imp-ent${err ? ' err' : ''}`} style={{ padding: '5px 7px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span className="blud-imp-lv">{TIPE_LABEL[p.tipe]}</span>
                          <span className="blud-imp-text" style={{ flex: 1, minWidth: 0, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                data-tooltip={p.cand.uraian}>{p.cand.uraian}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                          {indukIdx.has(i)
                            ? <span style={{ fontSize: 9.5, color: '#BA7517' }}>induk — jumlah = Σ anak</span>
                            : <span className="blud-imp-muted" style={{ fontSize: 9.5, fontFamily: 'var(--font-mono, monospace)' }}>{formatRupiah(p.cand.jumlah)}</span>}
                          <span style={{ display: 'flex', gap: 1 }}>
                            <button type="button" className="blud-imp-ctl" data-tooltip="Naik level"
                              disabled={p.tipe === anchor.tipe_baris} onClick={() => shiftLevel(i, -1)}><ChevronLeft size={12} /></button>
                            <button type="button" className="blud-imp-ctl" data-tooltip="Turun level"
                              disabled={chainIdx(p.tipe) >= CHAIN.length - 1} onClick={() => shiftLevel(i, 1)}><ChevronRight size={12} /></button>
                            <button type="button" className="blud-imp-ctl" data-tooltip="Pindah ke atas"
                              disabled={i === 0} onClick={() => moveEntry(i, -1)}><ArrowUp size={12} /></button>
                            <button type="button" className="blud-imp-ctl" data-tooltip="Pindah ke bawah"
                              disabled={i === susunan.length - 1} onClick={() => moveEntry(i, 1)}><ArrowDown size={12} /></button>
                            <button type="button" className="blud-imp-ctl" data-tooltip="Keluarkan dari susunan"
                              style={{ color: '#E24B4A' }} onClick={() => removeEntry(i)}><X size={12} /></button>
                          </span>
                        </div>
                        {err && <div style={{ fontSize: 9.5, color: '#E24B4A', marginTop: 2 }}>{err} — geser ◀ atau pindah ▲</div>}
                      </div>
                    </div>
                  )
                })}
                {susunan.length > 0 && (
                  <div className="blud-imp-muted" style={{ fontSize: 9.5, lineHeight: 1.5, marginTop: 'auto', paddingTop: 8 }}>
                    ◀ ▶ level · ↑ ↓ urutan. Indentasi = posisi akhir di form.
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="blud-imp-dock-title" style={{ color: '#EF9F27', marginBottom: 8 }}>BARIS TUJUAN</div>
                <div className="blud-imp-ent" style={{ padding: 8 }}>
                  <div className="blud-imp-muted" style={{ fontSize: 9.5 }}>Sebelum</div>
                  <div className="blud-imp-text" style={{ fontSize: 11, fontStyle: anchor.uraian ? 'normal' : 'italic' }}>
                    {anchor.uraian || '(uraian kosong)'}
                  </div>
                  <div className="blud-imp-muted" style={{ fontSize: 9.5, fontFamily: 'var(--font-mono, monospace)' }}>
                    {anchor.vol ?? '—'} {anchor.satuan ?? ''} × {anchor.harga != null ? formatRupiah(anchor.harga) : '—'} = {formatRupiah(anchor.jumlah ?? 0)}
                  </div>
                </div>
                <div style={{ textAlign: 'center', color: '#EF9F27', margin: '2px 0' }}><ArrowDown size={13} /></div>
                <div className={`blud-imp-ent${fillCand ? ' after' : ''}`} style={{ padding: 8 }}>
                  <div style={{ fontSize: 9.5, color: '#BA7517' }}>Sesudah</div>
                  {fillCand ? (
                    <>
                      <div className="blud-imp-text" style={{ fontSize: 11 }}>{fillCand.uraian}</div>
                      <div style={{ fontSize: 9.5, fontFamily: 'var(--font-mono, monospace)', color: '#BA7517' }}>
                        {fillCand.vol} {fillCand.satuan} × {formatRupiah(fillCand.harga)} = {formatRupiah(fillCand.jumlah)}
                      </div>
                      <div className="blud-imp-muted" style={{ fontSize: 9, marginTop: 3 }}>origin USULAN · {fillCand.usulan_no}</div>
                    </>
                  ) : (
                    <div className="blud-imp-muted" style={{ fontSize: 10.5, fontStyle: 'italic' }}>pilih satu item di daftar…</div>
                  )}
                </div>
                <div className="blud-imp-muted" style={{ fontSize: 9.5, lineHeight: 1.5, marginTop: 8 }}>
                  Kode rekening, PJ, dan posisi baris dipertahankan. Baris berisi akan minta konfirmasi timpa.
                </div>
              </>
            )}
          </div>
        </div>

        <div className="px-5 py-3 flex items-center justify-between" style={{ display: 'flex', borderTop: '1px solid rgba(133,183,235,.2)' }}>
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: mode === 'insert' ? '#BA7517' : undefined }}
                className={mode === 'fill' ? 'blud-imp-muted' : undefined}>
            {mode === 'insert'
              ? `${susunan.length} item · ${formatRupiah(subtotal)}`
              : fillCand ? '1 item → menimpa baris tujuan' : 'belum ada item dipilih'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <PrimaButton variant="ghost" onClick={onClose}>Batal</PrimaButton>
            {mode === 'insert' ? (
              <PrimaButton variant="purple" disabled={!canSubmit} onClick={doImport} data-rima="dpa.import-submit"
                data-tooltip={errIdx.size > 0 ? 'Perbaiki item bertanda merah di Susunan dulu' : undefined}>
                Import ({susunan.length})
              </PrimaButton>
            ) : (
              <PrimaButton variant="primary" disabled={!canSubmit} onClick={doImport} data-rima="dpa.import-submit">
                Isi Baris Ini
              </PrimaButton>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(body, document.body)
}

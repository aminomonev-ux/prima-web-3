// PERF-C2 Tahap 10d: BuatPanel — form editor usulan (create + edit draft mode).
// Lift form-only state (currentItem, editingIdx, refs internal, file upload, highlight).
// Cross-panel state (fTahun/fJenis/fSubBidang/fJenisBelanja/items/editingUsulan*/buatErr/buatOk)
// tetap di shell karena di-set oleh openEditDraft (dari MilikPanel) & doSubmit.

'use client';

import React, { useRef, useState } from 'react';
import {
  Edit3, X, AlertCircle, CheckCircle2, RefreshCw, Save, Send, Plus, Trash,
} from 'lucide-react';
import { InputNominal } from '@/components/ui/input-nominal';
import { isSafeHttpUrl, safeFileHref } from '@/lib/shared/url';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import Tip from '@/components/ui/Tip';
import type { ItemForm } from '../_types';
import { fmtRp } from '../_types';
import { ClockCard, JENIS_BELANJA_LIST, newItem } from '../_utils';
import SatuanCombobox from '@/components/shared/SatuanCombobox';

interface Props {
  // Identity
  username: string;
  todayDate: Date | null;

  // Cross-panel form state (controlled by shell)
  fTahun: string;          setFTahun: (v: string) => void;
  fJenis: 'MURNI' | 'PERUBAHAN' | 'PERGESERAN' | '';
  setFJenis: (v: 'MURNI' | 'PERUBAHAN' | 'PERGESERAN' | '') => void;
  fSubBidang: string;      setFSubBidang: (v: string) => void;
  fJenisBelanja: string;     setFJenisBelanja: (v: string) => void;
  items: ItemForm[];
  setItems: React.Dispatch<React.SetStateAction<ItemForm[]>>;
  editingUsulanId: number | null;
  setEditingUsulanId: (v: number | null) => void;
  editingUsulanNo: string;
  setEditingUsulanNo: (v: string) => void;
  setEditingUpdatedAt: (v: string | null) => void;
  buatErr: string;         setBuatErr: (v: string) => void;
  buatOk: string;          setBuatOk: (v: string) => void;
  buatLoading: boolean;
  noUsulanPreview: string;
  buatErrRef: React.RefObject<HTMLDivElement | null>;

  // Derived (read-only)
  tahunList: string[];
  subBidangOptions: string[];
  defaultSubBidang: string;

  // ClockCard config
  bwAktif: boolean; bwMulai: string; bwSelesai: string; bwPesan: string;

  // Submit callback (stays in shell — calls fetchKPI/fetchMilik/showToast/setPanel)
  doSubmit: (isDraft: boolean) => void | Promise<void>;
  isLight?: boolean;
}

export function BuatPanel({
  username, todayDate,
  fTahun, setFTahun, fJenis, setFJenis,
  fSubBidang, setFSubBidang, fJenisBelanja, setFJenisBelanja,
  items, setItems,
  editingUsulanId, setEditingUsulanId,
  editingUsulanNo, setEditingUsulanNo,
  setEditingUpdatedAt,
  buatErr, setBuatErr, buatOk, setBuatOk, buatLoading,
  noUsulanPreview, buatErrRef,
  tahunList, subBidangOptions, defaultSubBidang,
  bwAktif, bwMulai, bwSelesai, bwPesan,
  doSubmit,
  isLight,
}: Props) {
  // Form-only state (lifted from shell)
  const [currentItem, setCurrentItem] = useState<ItemForm>(newItem());
  const [editingIdx, setEditingIdx]   = useState(-1);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [highlightField, setHighlightField]   = useState('');
  const [uploadingFile, setUploadingFile]     = useState(false);
  const [uploadFileErr, setUploadFileErr]     = useState('');

  // Form-only refs
  const subBidangRef  = useRef<HTMLSelectElement>(null);
  const jenisBelanjaRef = useRef<HTMLSelectElement>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const namaBarangRef = useRef<HTMLInputElement>(null);
  const qtyRef        = useRef<HTMLInputElement>(null);
  const hargaRef      = useRef<HTMLInputElement>(null);
  const satuanRef     = useRef<HTMLDivElement>(null);

  function updateCurrent(field: keyof ItemForm, value: string | number) {
    setCurrentItem(prev => ({ ...prev, [field]: value }));
    if (field === 'nama_barang' || field === 'qty' || field === 'harga_est' || field === 'satuan') setHighlightField('');
  }

  function scrollFocus(field: string, ref: React.RefObject<HTMLElement | null>) {
    setHighlightField(field);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { (ref.current as HTMLElement | null)?.focus(); }, 300);
    setTimeout(() => setHighlightField(''), 3000);
  }

  const FIELD_ERR: Record<string, string> = {
    subBidang: 'Pilih sub bidang terlebih dahulu',
    jenis_belanja: 'Pilih jenis belanja terlebih dahulu',
    namaBarang: 'Nama barang wajib diisi',
    qty: 'Jumlah minimal 1',
    satuan: 'Satuan wajib dipilih',
    harga: 'Harga satuan wajib diisi (tidak boleh 0)',
  };
  const fieldErr = (k: string) => highlightField === k
    ? <div style={{ fontSize: 10, color: '#FCA5A5', marginTop: 3 }}>{FIELD_ERR[k]}</div>
    : null;

  function addToList() {
    setBuatErr(''); setHighlightField('');
    if (!fSubBidang) {
      setBuatErr('Pilih sub bidang terlebih dahulu');
      scrollFocus('subBidang', subBidangRef as React.RefObject<HTMLElement | null>); return;
    }
    if (!fJenisBelanja) {
      setBuatErr('Pilih jenis belanja terlebih dahulu');
      scrollFocus('jenis_belanja', jenisBelanjaRef as React.RefObject<HTMLElement | null>); return;
    }
    if (!currentItem.nama_barang.trim()) {
      setBuatErr('Nama barang wajib diisi');
      scrollFocus('namaBarang', namaBarangRef as React.RefObject<HTMLElement | null>); return;
    }
    if (!currentItem.qty || currentItem.qty < 1) {
      setBuatErr('Jumlah minimal 1');
      scrollFocus('qty', qtyRef as React.RefObject<HTMLElement | null>); return;
    }
    if (!currentItem.harga_est || currentItem.harga_est < 1) {
      setBuatErr('Harga satuan wajib diisi (tidak boleh 0)');
      scrollFocus('harga', hargaRef as React.RefObject<HTMLElement | null>); return;
    }
    if (!currentItem.satuan || !currentItem.satuan.trim()) {
      setBuatErr('Satuan wajib dipilih');
      scrollFocus('satuan', satuanRef as React.RefObject<HTMLElement | null>); return;
    }
    const badUrlField = (['url_merk1','url_merk2','url_merk3'] as const)
      .find(f => { const v = String(currentItem[f] || '').trim(); return v !== '' && !isSafeHttpUrl(v); });
    if (badUrlField) {
      setBuatErr(`URL Merk ${badUrlField.slice(-1)} harus diawali http:// atau https:// (atau kosongkan). Contoh: https://tokopedia.com/...`);
      return;
    }
    if (editingIdx >= 0) {
      setItems(prev => prev.map((it, i) => i === editingIdx ? { ...currentItem, sub_bidang: fSubBidang, jenis_belanja: fJenisBelanja } : it));
      setEditingIdx(-1);
    } else {
      setItems(prev => [...prev, { ...currentItem, id: crypto.randomUUID(), sub_bidang: fSubBidang, jenis_belanja: fJenisBelanja }]);
    }
    setCurrentItem(newItem());
  }

  function editItem(idx: number) {
    setCurrentItem({ ...items[idx] });
    setFSubBidang(items[idx].sub_bidang || fSubBidang);
    setFJenisBelanja(items[idx].jenis_belanja || fJenisBelanja);
    setEditingIdx(idx);
    setTimeout(() => {
      namaBarangRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      namaBarangRef.current?.focus();
    }, 50);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) { setCurrentItem(newItem()); setEditingIdx(-1); }
  }

  function cancelEdit() { setCurrentItem(newItem()); setEditingIdx(-1); setBuatErr(''); setUploadFileErr(''); }

  async function handleFileUpload(file: File) {
    if (file.size > 10 * 1024 * 1024) { setUploadFileErr('Ukuran file maks. 10MB'); return; }
    setUploadingFile(true); setUploadFileErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const { fetchJson } = await import('@/lib/shared/api');
      const d = await fetchJson<{ url: string }>('/api/upload', { method: 'POST', body: fd });
      if (d.ok) { updateCurrent('file_url', (d as { url?: string }).url || ''); }
      else setUploadFileErr(d.message || 'Gagal upload');
    } finally { setUploadingFile(false); }
  }

  const formDisabled = (!fTahun || !fJenis) && !editingUsulanId;

  return (
    <div>
      <ClockCard bwAktif={bwAktif} bwMulai={bwMulai} bwSelesai={bwSelesai} bwPesan={bwPesan} isLight={isLight}/>

      {editingUsulanId && (
        <div style={{background:'linear-gradient(90deg,#fef3c7,#fffbeb)',border:'1.5px solid #f59e0b',borderRadius:10,padding:'10px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
          <Edit3 size={15} color="#d97706"/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:'#92400e'}}>Mode Edit Draft: {editingUsulanNo}</div>
            <div style={{fontSize:11,color:'#b45309',marginTop:1}}>Perubahan akan menggantikan semua item draft lama. Sub Bidang tidak bisa diubah.</div>
          </div>
          <PrimaButton variant="ghost" size="sm" iconLeft={<X size={12}/>}
            onClick={()=>{setEditingUsulanId(null);setEditingUsulanNo('');setEditingUpdatedAt(null);setItems([]);setCurrentItem(newItem());setFSubBidang(defaultSubBidang);setFJenisBelanja('');setFTahun('');setBuatErr('');setBuatOk('');setEditingIdx(-1);}}>
            Batal Edit
          </PrimaButton>
        </div>
      )}

      {buatErr && <div ref={buatErrRef} className="msg-err" role="alert"><AlertCircle size={16}/><span>{buatErr}</span></div>}
      {buatOk  && <div className="msg-ok"><CheckCircle2 size={16}/><span>{buatOk}</span></div>}

      {/* ── Tahun Anggaran + Jenis Usulan ── */}
      <div className="form-card" style={{marginBottom:12,padding:'10px 16px',display:'flex',alignItems:'center',gap:16,flexWrap:'wrap',background:(!fTahun||!fJenis)?'rgba(186,117,23,.08)':(isLight?'rgba(249,250,251,0.9)':'rgba(4,44,83,.3)'),borderColor:(!fTahun||!fJenis)?'rgba(239,159,39,.5)':undefined}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontWeight:700,fontSize:13,color:isLight?'#374151':'#B5D4F4',whiteSpace:'nowrap'}}>
            📅 Tahun Anggaran <span style={{color:'#FCA5A5'}}>*</span>
          </span>
          <select className="filter-select" value={fTahun} onChange={e=>setFTahun(e.target.value)} style={{minWidth:110,fontWeight:700,borderColor:!fTahun?'rgba(239,159,39,.6)':undefined}}>
            <option value="">-- Pilih --</option>
            {tahunList.map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{width:1,height:24,background:'rgba(181,212,244,.15)'}}/>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontWeight:700,fontSize:13,color:isLight?'#374151':'#B5D4F4',whiteSpace:'nowrap'}}>
            📋 Jenis Usulan <span style={{color:'#FCA5A5'}}>*</span>
          </span>
          <select className="filter-select" value={fJenis} onChange={e=>setFJenis(e.target.value as 'MURNI'|'PERUBAHAN'|'PERGESERAN'|'')} style={{minWidth:130,fontWeight:700,borderColor:!fJenis?'rgba(239,159,39,.6)':undefined}}>
            <option value="">-- Pilih --</option>
            <option value="MURNI">MURNI</option>
            <option value="PERUBAHAN">PERUBAHAN</option>
            <option value="PERGESERAN">PERGESERAN</option>
          </select>
          {fJenis && (
            <span style={{fontSize:11,padding:'2px 8px',borderRadius:99,fontWeight:700,
              background:fJenis==='PERUBAHAN'?'rgba(186,117,23,.15)':fJenis==='PERGESERAN'?'rgba(124,92,252,.15)':'rgba(55,138,221,.15)',
              color:fJenis==='PERUBAHAN'?'#FAC775':fJenis==='PERGESERAN'?'#C4B5FD':'#7DD3FC'}}>
              {fJenis}
            </span>
          )}
        </div>
        {(!fTahun||!fJenis) && <span style={{fontSize:11,color:isLight?'#B45309':'#FAC775',fontWeight:600}}>⚠️ Pilih tahun &amp; jenis terlebih dahulu</span>}
      </div>

      {/* ── Informasi Pengajuan ── */}
      <div className="form-card" style={{opacity:formDisabled?0.45:1,pointerEvents:formDisabled?'none':undefined}}>
        <div className="form-card-title">📋 Informasi Pengajuan</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
          <div className="form-group" style={{margin:0}} data-rima="usulan.preview-no">
            <label className="form-label">No. Usulan</label>
            {(() => {
              const grpCount = (() => {
                const seen = new Set<string>();
                items.forEach(i => seen.add(`${i.sub_bidang}|||${i.jenis_belanja}`));
                return seen.size;
              })();
              const previewVal = editingUsulanId
                ? editingUsulanNo
                : noUsulanPreview
                  ? (grpCount > 1 ? `${noUsulanPreview}-1 s.d. -${grpCount}` : noUsulanPreview)
                  : '';
              return (
                <input className="form-control" readOnly
                  value={previewVal}
                  placeholder="—"
                  style={previewVal ? {color:'#EF9F27',fontWeight:700,fontFamily:'monospace'} : undefined}/>
              );
            })()}
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Tanggal</label>
            <input className="form-control" readOnly value={todayDate ? todayDate.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}) : ''}/>
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Pengusul</label>
            <input className="form-control" readOnly value={username}/>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Sub Bidang / Bagian <span style={{color:'#ef4444'}}>*</span></label>
            <select ref={subBidangRef} className="form-control" value={fSubBidang} disabled={!!editingUsulanId}
              style={highlightField==='subBidang'?{borderColor:'#ef4444',boxShadow:'0 0 0 3px rgba(239,68,68,.15)'}:undefined}
              onChange={e=>{setFSubBidang(e.target.value);setBuatErr('');setBuatOk('');setHighlightField('');}}>
              {subBidangOptions.length !== 1 && <option value="">-- Pilih Sub Bidang --</option>}
              {subBidangOptions.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            {fieldErr('subBidang')}
          </div>
          <div className="form-group">
            <label className="form-label">Jenis Belanja <span style={{color:'#ef4444'}}>*</span></label>
            <select ref={jenisBelanjaRef} className="form-control" value={fJenisBelanja}
              style={highlightField==='jenis_belanja'?{borderColor:'#ef4444',boxShadow:'0 0 0 3px rgba(239,68,68,.15)'}:undefined}
              onChange={e=>{setFJenisBelanja(e.target.value);setBuatErr('');setHighlightField('');}}>
              <option value="">-- Pilih Jenis Belanja --</option>
              {JENIS_BELANJA_LIST.map(k=><option key={k} value={k}>{k}</option>)}
            </select>
            {fieldErr('jenis_belanja')}
          </div>
        </div>
      </div>

      {/* ── Input Item Barang ── */}
      <div className="form-card input-item-card" style={{opacity:formDisabled?0.45:1,pointerEvents:formDisabled?'none':undefined}}>
        <div className="form-card-title">
          ✏️ {editingIdx>=0 ? `Edit Item #${editingIdx+1}` : 'Input Item Barang'}
        </div>

        {editingIdx>=0 && (
          <div style={{background:'rgba(186,117,23,.1)',border:'1.5px solid rgba(239,159,39,.3)',borderRadius:8,padding:'8px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}>
            <Edit3 size={14} color="#EF9F27"/>
            <span style={{fontSize:12,fontWeight:700,color:'#FAC775'}}>Sedang mengedit item #{editingIdx+1}</span>
            <button className="btn btn-secondary btn-sm" style={{marginLeft:'auto'}} onClick={cancelEdit}><X size={12}/> Batal Edit</button>
          </div>
        )}

        <div className="form-row" style={{marginBottom:10}}>
          <div className="form-group" style={{margin:0}} data-rima="usulan.field-nama">
            <label className="form-label">Nama Barang <span style={{color:'#ef4444'}}>*</span></label>
            <input ref={namaBarangRef} className="form-control" placeholder="Nama barang yang diusulkan" value={currentItem.nama_barang}
              style={highlightField==='namaBarang'?{borderColor:'#ef4444',boxShadow:'0 0 0 3px rgba(239,68,68,.15)'}:undefined}
              onChange={e=>updateCurrent('nama_barang',e.target.value)}/>
            {fieldErr('namaBarang')}
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Spesifikasi</label>
            <input className="form-control" placeholder="Tipe, ukuran, kapasitas, dll." value={currentItem.spesifikasi} onChange={e=>updateCurrent('spesifikasi',e.target.value)}/>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10,marginBottom:10}}>
          <div className="form-group" style={{margin:0}} data-rima="usulan.field-qty">
            <label className="form-label">Jumlah (Qty) <span style={{color:'#ef4444'}}>*</span></label>
            <PrimaNumberField ref={qtyRef} min={1} placeholder="0" value={currentItem.qty||''}
              style={highlightField==='qty'?{borderColor:'#ef4444',boxShadow:'0 0 0 3px rgba(239,68,68,.15)'}:undefined}
              onFocus={e=>e.target.select()}
              onChange={e=>updateCurrent('qty',parseInt(e.target.value)||0)}
              onBlur={()=>{ if(!currentItem.qty||currentItem.qty<1) updateCurrent('qty',1); }}/>
            {fieldErr('qty')}
          </div>
          <div ref={satuanRef} className="form-group" style={{margin:0}}>
            <label className="form-label">Satuan <span style={{color:'#ef4444'}}>*</span></label>
            <SatuanCombobox
              value={currentItem.satuan || ''}
              onChange={v => updateCurrent('satuan', v)}
              placeholder="Silahkan pilih…"
              inputClassName="form-control"
              style={highlightField==='satuan'?{borderColor:'#ef4444',boxShadow:'0 0 0 3px rgba(239,68,68,.15)'}:undefined}
            />
            {fieldErr('satuan')}
          </div>
          <div className="form-group" style={{margin:0}} data-rima="usulan.field-harga">
            <label className="form-label">Est. Harga Satuan (Rp) <span style={{color:'#ef4444'}}>*</span></label>
            <InputNominal inputRef={hargaRef} className="form-control" value={currentItem.harga_est||0}
              style={highlightField==='harga'?{borderColor:'#ef4444',boxShadow:'0 0 0 3px rgba(239,68,68,.15)'}:undefined}
              onChange={v=>updateCurrent('harga_est',v)}/>
            {fieldErr('harga')}
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Total Estimasi</label>
            <input className="form-control" readOnly value={fmtRp((currentItem.qty||0)*(currentItem.harga_est||0))}/>
          </div>
        </div>

        <div className="form-row" style={{marginBottom:10}}>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Prioritas</label>
            <select className="form-control" value={currentItem.prioritas} onChange={e=>updateCurrent('prioritas',e.target.value as 'TINGGI'|'SEDANG'|'RENDAH')}>
              <option value="TINGGI">TINGGI</option>
              <option value="SEDANG">SEDANG</option>
              <option value="RENDAH">RENDAH</option>
            </select>
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="form-label">Alasan / Justifikasi</label>
            <input className="form-control" placeholder="Mengapa barang ini dibutuhkan?" value={currentItem.alasan} onChange={e=>updateCurrent('alasan',e.target.value)}/>
          </div>
        </div>

        <div style={{background:isLight?'linear-gradient(135deg,rgba(139,92,246,.08),rgba(236,72,153,.05))':'rgba(12,68,124,.2)',border:isLight?'1px solid rgba(139,92,246,.25)':'1px solid rgba(239,159,39,.2)',borderRadius:8,padding:'10px 12px',marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:isLight?'#7C3AED':'#EF9F27',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
            🔗 Referensi Merk / Toko
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
            {(['url_merk1','url_merk2','url_merk3'] as const).map((f,i)=>{
              const raw = (currentItem[f] as string)||'';
              const badUrl = raw.trim() !== '' && !isSafeHttpUrl(raw);
              return (
              <div key={f} className="form-group" style={{margin:0}}>
                <label className="form-label" style={{fontSize:10}}>URL Merk {i+1}</label>
                <input className="form-control" style={{fontSize:11,borderColor:badUrl?'#E24B4A':undefined}} placeholder="https://..." value={raw} onChange={e=>updateCurrent(f,e.target.value)}/>
                {badUrl && <div style={{fontSize:10,color:'#FCA5A5',marginTop:3}}>Harus diawali http:// atau https://</div>}
              </div>
            );})}
          </div>
        </div>

        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:isLight?'#7C3AED':'#EF9F27',textTransform:'uppercase',letterSpacing:.4,marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
            📎 Lampiran Dokumen
          </div>
          <input ref={fileInputRef} type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
            style={{display:'none'}}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); if (fileInputRef.current) fileInputRef.current.value=''; }}
          />
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <PrimaButton variant="purple" size="sm"
              onClick={()=>fileInputRef.current?.click()}
              disabled={uploadingFile}>
              📎 {uploadingFile ? 'Mengupload...' : 'Pilih File'}
            </PrimaButton>
            <span style={{fontSize:11,color:isLight?'#6B7280':'#85B7EB'}}>PDF, Word, Excel, atau gambar · maks. 10MB</span>
          </div>
          {uploadFileErr && <div style={{fontSize:11,color:'#FCA5A5',marginTop:5,display:'flex',alignItems:'center',gap:4}}>⚠️ {uploadFileErr}</div>}
          {currentItem.file_url && !uploadingFile && (
            <div style={{marginTop:6,display:'inline-flex',alignItems:'center',gap:8,background:'rgba(12,68,124,.3)',border:'1px solid rgba(239,159,39,.2)',borderRadius:8,padding:'5px 12px'}}>
              <span style={{fontSize:11,color:'#1D9E75'}}>✅</span>
              <a href={safeFileHref(currentItem.file_url)} target="_blank" rel="noreferrer"
                style={{fontSize:11,color:'#B5D4F4',fontWeight:600,textDecoration:'underline',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {currentItem.file_url.includes('drive.google.com') ? '📄 Lihat di Google Drive' : currentItem.file_url.split('/').pop()}
              </a>
              <Tip label="Hapus lampiran"><button onClick={()=>{updateCurrent('file_url','');}}
                style={{background:'none',border:'none',cursor:'pointer',color:'#FCA5A5',fontSize:13,padding:'0 2px',lineHeight:1}}>✕</button></Tip>
            </div>
          )}
        </div>

        <div style={{display:'flex',justifyContent:'flex-end'}}>
          <PrimaButton variant="primary" iconLeft={<Plus size={14}/>} onClick={addToList} disabled={uploadingFile} data-rima="usulan.tambah-item">
            {editingIdx>=0 ? 'Update Item' : 'Tambah ke Daftar'}
          </PrimaButton>
        </div>

        {/* ── Daftar Item — Grouped Table ── */}
        {(() => {
          const thS: React.CSSProperties = {padding:'8px 10px',textAlign:'left',fontSize:10,fontWeight:700,color:isLight?'#B45309':'#EF9F27',textTransform:'uppercase',letterSpacing:.4,borderBottom:'2px solid rgba(239,159,39,.15)',whiteSpace:'nowrap',background:isLight?'rgba(239,159,39,.08)':'rgba(4,44,83,.8)'};
          const tdS: React.CSSProperties = {padding:'8px 10px',borderBottom:isLight?'1px solid rgba(0,0,0,.06)':'1px solid rgba(12,68,124,.4)',verticalAlign:'middle',fontSize:12,color:isLight?'#374151':'#B5D4F4'};
          const totalSemua = items.reduce((s,i)=>s+(i.qty||0)*(i.harga_est||0),0);

          const groups: {key:string;sub_bidang:string;jenis_belanja:string;items:ItemForm[]}[] = [];
          const groupMap: Record<string,number> = {};
          items.forEach(item => {
            const key = `${item.sub_bidang}|||${item.jenis_belanja}`;
            if (groupMap[key] === undefined) { groupMap[key] = groups.length; groups.push({key,sub_bidang:item.sub_bidang,jenis_belanja:item.jenis_belanja,items:[]}); }
            groups[groupMap[key]].items.push(item);
          });

          return (
            <div style={{marginTop:16}}>
              {items.length===0 ? (
                <div style={{textAlign:'center',padding:'28px 0',color:isLight?'#9CA3AF':'#85B7EB',fontSize:13,border:isLight?'1.5px dashed rgba(0,0,0,.12)':'1.5px dashed rgba(181,212,244,.15)',borderRadius:10}}>
                  <div style={{fontSize:28,marginBottom:6}}>📥</div>
                </div>
              ) : (
                <>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <span style={{fontSize:12,fontWeight:700,color:isLight?'#0F0F12':'#E6F1FB'}}>
                      {items.length} item · {groups.length} grup
                    </span>
                    <span style={{fontSize:12,fontWeight:800,background:isLight?'linear-gradient(135deg,rgba(139,92,246,.14),rgba(236,72,153,.10))':'rgba(239,159,39,.12)',color:isLight?'#7C3AED':'#EF9F27',padding:'3px 14px',borderRadius:99,border:isLight?'1px solid rgba(139,92,246,.3)':'1px solid rgba(239,159,39,.3)'}}>
                      Total: {fmtRp(totalSemua)}
                    </span>
                  </div>

                  {groups.map((group, gIdx) => {
                    const groupTotal = group.items.reduce((s,i)=>s+(i.qty||0)*(i.harga_est||0),0);
                    return (
                      <div key={group.key} style={{border:isLight?'1.5px solid rgba(139,92,246,.2)':'1.5px solid rgba(239,159,39,.15)',borderRadius:12,overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,.3)',marginBottom:gIdx<groups.length-1?12:0}}>
                        <div style={{background:isLight?'linear-gradient(135deg,rgba(139,92,246,.22),rgba(236,72,153,.15))':'linear-gradient(90deg,#020F1C,#042C53)',borderBottom:isLight?'1px solid rgba(139,92,246,.3)':'1px solid rgba(239,159,39,.2)',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{fontSize:16}}>🗂️</span>
                            <span style={{fontWeight:800,fontSize:12,color:isLight?'#5B21B6':'#fff',letterSpacing:.5,textTransform:'uppercase'}}>{group.sub_bidang||'—'}</span>
                            <span style={{color:isLight?'rgba(91,33,182,.3)':'rgba(255,255,255,.5)',fontSize:12}}>—</span>
                            <span style={{fontSize:11,color:isLight?'#7C3AED':'rgba(255,255,255,.85)'}}>{group.jenis_belanja||'—'}</span>
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{fontSize:11,color:isLight?'#6D28D9':'rgba(255,255,255,.65)'}}>{group.items.length} item</span>
                            <span style={{background:isLight?'rgba(124,92,252,.12)':'rgba(255,255,255,.18)',color:isLight?'#7C3AED':'#fff',padding:'3px 12px',borderRadius:99,fontSize:11,fontWeight:700}}>
                              {fmtRp(groupTotal)}
                            </span>
                          </div>
                        </div>
                        <div style={{overflowX:'auto'}}>
                          <table style={{width:'100%',borderCollapse:'collapse'}}>
                            <thead>
                              <tr>
                                <th style={{...thS,textAlign:'center',width:36}}>#</th>
                                <th style={thS}>NAMA BARANG</th>
                                <th style={thS}>SPESIFIKASI</th>
                                <th style={{...thS,textAlign:'center',width:50}}>QTY</th>
                                <th style={thS}>SATUAN</th>
                                <th style={{...thS,textAlign:'right'}}>HARGA SATUAN</th>
                                <th style={{...thS,textAlign:'right'}}>TOTAL EST.</th>
                                <th style={{...thS,textAlign:'center'}}>PRIORITAS</th>
                                <th style={{...thS,textAlign:'center'}}>MERK</th>
                                <th style={{...thS,textAlign:'center'}}>LAMPIRAN</th>
                                <th style={{...thS,textAlign:'center'}}>AKSI</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.items.map((item) => {
                                const idx = items.indexOf(item);
                                const merkUrls = [item.url_merk1,item.url_merk2,item.url_merk3].filter(isSafeHttpUrl);
                                const isEditing = editingIdx===idx;
                                return (
                                  <tr key={item.id} style={{background:isEditing?'rgba(186,117,23,.08)':idx%2===0?(isLight?'#FAFAFA':'rgba(4,44,83,.3)'):(isLight?'#F9FAFB':'rgba(12,68,124,.12)')}}>
                                    <td style={{...tdS,textAlign:'center'}}>
                                      <span style={{width:22,height:22,borderRadius:'50%',background:isEditing?'#EF9F27':'#1D9E75',color:'#fff',fontSize:10,fontWeight:800,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{idx+1}</span>
                                    </td>
                                    <td style={tdS}>
                                      <div style={{fontWeight:600,color:isLight?'#0F0F12':'#E6F1FB',fontSize:12}}>{item.nama_barang}</div>
                                      {item.alasan && <div style={{fontSize:10,color:isLight?'#6B7280':'#85B7EB',marginTop:1}}>💬 {item.alasan}</div>}
                                    </td>
                                    <td style={{...tdS,color:isLight?'#6B7280':'#85B7EB'}}>{item.spesifikasi||<span style={{color:isLight?'rgba(0,0,0,.2)':'rgba(181,212,244,.3)'}}>-</span>}</td>
                                    <td style={{...tdS,textAlign:'center',fontWeight:700}}>{item.qty}</td>
                                    <td style={tdS}>{item.satuan}</td>
                                    <td style={{...tdS,textAlign:'right'}}>{fmtRp(item.harga_est)}</td>
                                    <td style={{...tdS,textAlign:'right',fontWeight:700,color:'#0d7a3a'}}>{fmtRp(item.qty*item.harga_est)}</td>
                                    <td style={{...tdS,textAlign:'center'}}>
                                      <span style={{background:item.prioritas==='TINGGI'?'rgba(226,75,74,.12)':item.prioritas==='SEDANG'?'rgba(186,117,23,.12)':'rgba(29,158,117,.12)',color:item.prioritas==='TINGGI'?(isLight?'#B91C1C':'#FCA5A5'):item.prioritas==='SEDANG'?(isLight?'#B45309':'#FAC775'):(isLight?'#047857':'#6EE7B7'),padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:700}}>{item.prioritas}</span>
                                    </td>
                                    <td style={{...tdS,textAlign:'center'}}>
                                      {merkUrls.length ? (
                                        <div style={{display:'flex',gap:3,justifyContent:'center'}}>
                                          {merkUrls.map((url,i)=>(
                                            <Tip key={i} label={url}><a href={url} target="_blank" rel="noreferrer"
                                              style={{width:22,height:22,borderRadius:'50%',background:'rgba(55,138,221,.15)',color:'#7DD3FC',fontSize:10,fontWeight:800,display:'inline-flex',alignItems:'center',justifyContent:'center',textDecoration:'none',border:'1px solid rgba(55,138,221,.3)'}}>
                                              {i+1}
                                            </a></Tip>
                                          ))}
                                        </div>
                                      ) : <span style={{color:'#d1d5db',fontSize:11}}>-</span>}
                                    </td>
                                    <td style={{...tdS,textAlign:'center'}}>
                                      {item.file_url
                                        ? <Tip label="Lihat lampiran"><a href={safeFileHref(item.file_url)} target="_blank" rel="noreferrer"
                                            style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:24,height:24,borderRadius:'50%',background:'rgba(29,158,117,.15)',color:'#6EE7B7',fontSize:12,border:'1px solid rgba(29,158,117,.3)',textDecoration:'none'}}>
                                            📎
                                          </a></Tip>
                                        : <span style={{color:'rgba(181,212,244,.3)',fontSize:11}}>-</span>
                                      }
                                    </td>
                                    <td style={{...tdS,textAlign:'center'}}>
                                      <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                                        <Tip label="Edit"><button onClick={()=>editItem(idx)}
                                          style={{width:28,height:28,borderRadius:'50%',background:'#378ADD',border:'none',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}>
                                          <Edit3 size={12}/>
                                        </button></Tip>
                                        <Tip label="Hapus"><button onClick={()=>removeItem(idx)}
                                          style={{width:28,height:28,borderRadius:'50%',background:'#ef4444',border:'none',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff',flexShrink:0}}>
                                          <Trash size={12}/>
                                        </button></Tip>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Action buttons ── */}
      {resetConfirmOpen && (
        <div style={{background:'rgba(226,75,74,.08)',border:'1.5px solid rgba(226,75,74,.3)',borderRadius:9,padding:'10px 14px',marginBottom:10,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <AlertCircle size={15} color="#FCA5A5"/>
          <span style={{fontSize:12,color:'#FCA5A5',flex:1}}>
            <strong>{items.length} item</strong> akan dihapus. Aksi ini tidak dapat dibatalkan.
          </span>
          <PrimaButton variant="danger" size="sm" onClick={()=>{
            setItems([]); setCurrentItem(newItem()); setFSubBidang(defaultSubBidang); setFJenisBelanja(''); setFTahun('');
            setBuatErr(''); setBuatOk('Reset berhasil. Semua item dihapus.'); setEditingIdx(-1);
            setEditingUsulanId(null); setEditingUsulanNo(''); setEditingUpdatedAt(null); setResetConfirmOpen(false);
          }}>Ya, Reset</PrimaButton>
          <PrimaButton variant="ghost" size="sm" onClick={()=>setResetConfirmOpen(false)}>Batal</PrimaButton>
        </div>
      )}
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        <PrimaButton variant="ghost" iconLeft={<RefreshCw size={14}/>} onClick={()=>{
          if (items.length > 0) { setResetConfirmOpen(true); } else {
            setCurrentItem(newItem()); setFSubBidang(defaultSubBidang); setFJenisBelanja(''); setFTahun('');
            setBuatErr(''); setBuatOk(''); setEditingIdx(-1); setEditingUsulanId(null); setEditingUsulanNo('');
          }
        }}>
          Reset Semua
        </PrimaButton>
        <PrimaButton variant="warning" iconLeft={<Save size={14}/>} data-rima="usulan.btn-draft"
          onClick={()=>doSubmit(true)} disabled={buatLoading||!items.length||formDisabled}>
          {buatLoading?'Menyimpan...':'Draft'}
        </PrimaButton>
        <PrimaButton variant="primary" iconLeft={<Send size={14}/>} data-rima="usulan.btn-ajukan"
          onClick={()=>doSubmit(false)} disabled={buatLoading||!items.length||formDisabled}>
          {buatLoading?'Mengirim...':'Kirim Usulan'}
        </PrimaButton>
      </div>
    </div>
  );
}

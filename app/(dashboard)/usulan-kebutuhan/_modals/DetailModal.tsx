'use client';

import React from 'react';
import { X, Send } from 'lucide-react';
import { InputNominal } from '@/components/ui/input-nominal';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import type { Role } from '@/types';
import { UsulanHeader, UsulanItem, STATUS_BADGE, fmtRp, fmtTgl, fmtNum } from '../_types';
import { isSafeHttpUrl, safeFileHref } from '@/lib/shared/url';

// ── Types ────────────────────────────────────────────────────────

type RevisiEdit = { spesifikasi?: string; qty?: number; harga_est?: number };

export interface DetailModalProps {
  open: boolean;
  onClose: () => void;
  data: { header: UsulanHeader; items: UsulanItem[] } | null;
  loading: boolean;
  revisiEdits: Record<number, RevisiEdit>;
  setRevisiEdits: React.Dispatch<React.SetStateAction<Record<number, RevisiEdit>>>;
  role: Role;
  currentUserId: number;
  detailCacheRef: React.MutableRefObject<Map<number, { header: UsulanHeader; items: UsulanItem[] }>>;
  onResubmitSuccess: () => void;
  showToast: (text: string, isErr?: boolean) => void;
  setConfirmDlg: (dlg: { msg: string; onOk: () => void } | null) => void;
  isLight?: boolean;
}

// ── Local sub-components (hanya dipakai di modal ini) ───────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? { label: status, bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

function StatusBadgesFromItems({ items }: { items: UsulanItem[] }) {
  const counts: Record<string, number> = {};
  items.forEach(it => { counts[it.status] = (counts[it.status] || 0) + 1; });
  if (Object.keys(counts).length <= 1) return <StatusBadge status={items[0]?.status ?? ''} />;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {Object.entries(counts).map(([s, cnt]) => {
        const b = STATUS_BADGE[s] ?? { label: s, bg: '#f3f4f6', color: '#6b7280' };
        return (
          <span key={s} style={{ background: b.bg, color: b.color, padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {b.label} ({cnt})
          </span>
        );
      })}
    </div>
  );
}

// ── DetailModal ──────────────────────────────────────────────────

export function DetailModal({
  open, onClose, data, loading, revisiEdits, setRevisiEdits,
  role, currentUserId, detailCacheRef, onResubmitSuccess, showToast, setConfirmDlg, isLight,
}: DetailModalProps) {
  if (!open) return null;

  // SEC-C4 IDOR: revisi-bidang hanya boleh diedit & dikirim ulang oleh pengusul
  // (created_by) atau SUPER_ADMIN — mirror guard server resubmit_revisi_bidang.
  // Tanpa ini, rekan satu-bidang (fitur "Satu Bidang") melihat form edit untuk
  // usulan milik orang lain meski server menolak saat submit.
  const isOwner = !!data && (role === 'SUPER_ADMIN' || Number(data.header.created_by) === currentUserId);
  // Admin-tier: tidak melihat coret revisi-langsung Bidang (hanya hasil verif Bidang).
  const isPlainAdmin = role === 'ADMIN' || role === 'ADMIN_KASUBAG' || role === 'ADMIN_KABAG';
  // Warna verif "awal" (hijau). Hanya item yang STATUS-nya direvisi (DIREVISI_ADMIN/
  // DIREVISI_KASUBAG) yang nominalnya diwarnai sesuai panah revisi (ungu/amber) — di cell.
  const colVerifAdm  = isLight ? '#047857' : '#6EE7B7';
  const colVerifKsb  = isLight ? '#059669' : '#34D399';

  const thD: React.CSSProperties = {
    padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700,
    color: isLight ? '#B45309' : '#B5D4F4', textTransform: 'uppercase', letterSpacing: .4,
    borderBottom: isLight ? '2px solid rgba(239,159,39,.3)' : '2px solid #185FA5',
    background: isLight ? 'rgba(239,159,39,.06)' : 'rgba(4,44,83,.95)', whiteSpace: 'nowrap',
  };
  const tdD: React.CSSProperties = {
    padding: '7px 10px', borderBottom: isLight ? '1px solid rgba(0,0,0,.06)' : '1px solid rgba(12,68,124,.4)',
    verticalAlign: 'middle', fontSize: 12, color: isLight ? '#374151' : '#B5D4F4',
  };
  // Warna panah revisi qty/harga = samakan dgn kolom Verif pelakunya (Admin/Kasubag)
  // biar mudah dikenali: panah revisi & nominal verif sewarna per tahap.
  const colAdminRev   = isLight ? '#7C5CFC' : '#A78BFA';  // ungu — panah revisi Admin & verif item DIREVISI_ADMIN
  const colKasubagRev = isLight ? '#B45309' : '#FAC775';  // amber — panah revisi Kasubag & verif item DIREVISI_KASUBAG

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">

        {/* ── Header ── */}
        <div className="modal-header">
          <div>
            <div className="modal-title">📋 Detail Usulan</div>
            {data && <div className="modal-sub">{data.header.no_usulan} · {data.header.sub_bidang}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="modal-body">
          {data ? (
            <>
              {/* Info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {([
                  ['No. Usulan', data.header.no_usulan],
                  ['Tanggal',    fmtTgl(data.header.tanggal)],
                  ['Pengusul',   data.header.pembuat || data.header.pengusul],
                  ['Sub Bidang', data.header.sub_bidang],
                  ['Jenis Belanja', data.header.jenis_belanja || '-'],
                  ['Status',     null],
                ] as [string, string | null][]).map(([k, v], i) => (
                  <div key={i} style={{ background: isLight ? 'rgba(0,0,0,.03)' : 'rgba(12,68,124,.3)', border: isLight ? '1px solid rgba(0,0,0,.08)' : '1px solid #0C447C', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: isLight ? '#9CA3AF' : '#85B7EB', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 3 }}>{k}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isLight ? '#0F0F12' : '#E6F1FB' }}>
                      {v === null ? <StatusBadgesFromItems items={data.items} /> : v}
                    </div>
                  </div>
                ))}
              </div>

              {/* Item list */}
              {loading ? (
                <div style={{ padding: '16px 0' }}>
                  <div style={{ fontSize: 11, color: isLight ? '#6B7280' : '#85B7EB', marginBottom: 10, textAlign: 'center', fontWeight: 600, letterSpacing: .4, textTransform: 'uppercase' }}>
                    Memuat daftar item…
                  </div>
                  {[80, 60, 90, 70].map((w, i) => (
                    <div key={i} className="animate-pulse" style={{ height: 14, borderRadius: 6, background: 'rgba(12,68,124,.4)', marginBottom: 8, width: `${w}%` }} />
                  ))}
                </div>
              ) : (() => {
                const dGroups: { key: string; sub_bidang: string; jenis_belanja: string; items: UsulanItem[] }[] = [];
                const dMap: Record<string, number> = {};
                data.items.forEach(it => {
                  const key = `${it.sub_bidang || ''}|||${it.jenis_belanja || ''}`;
                  if (dMap[key] === undefined) {
                    dMap[key] = dGroups.length;
                    dGroups.push({ key, sub_bidang: it.sub_bidang || '', jenis_belanja: it.jenis_belanja || '', items: [] });
                  }
                  dGroups[dMap[key]].items.push(it);
                });
                return (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: isLight ? '#374151' : '#B5D4F4', marginBottom: 8, paddingBottom: 6, borderBottom: isLight ? '1px solid rgba(0,0,0,.08)' : '1px solid rgba(12,68,124,.5)', textTransform: 'uppercase', letterSpacing: .4 }}>
                      Daftar Item ({data.items.length}) · {dGroups.length} Grup
                    </div>
                    {dGroups.map((g, gi) => {
                      const gTotal = g.items.reduce((s, i) => s + (Number(i.total_est) || 0), 0);
                      return (
                        <div key={g.key} style={{ border: isLight ? '1.5px solid rgba(139,92,246,.2)' : '1.5px solid rgba(13,122,58,.2)', borderRadius: 10, overflow: 'hidden', marginBottom: gi < dGroups.length - 1 ? 10 : 0 }}>
                          {/* Group header */}
                          <div style={{ background: isLight ? 'linear-gradient(135deg,rgba(139,92,246,.22),rgba(236,72,153,.15))' : 'linear-gradient(90deg,#0a2e18,#0d7a3a)', borderBottom: isLight ? '1px solid rgba(139,92,246,.3)' : 'none', padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 14 }}>🗂️</span>
                              <span style={{ fontWeight: 800, fontSize: 11, color: isLight ? '#5B21B6' : '#fff', textTransform: 'uppercase' }}>{g.sub_bidang || '—'}</span>
                              <span style={{ color: isLight ? 'rgba(91,33,182,.3)' : 'rgba(255,255,255,.5)' }}>—</span>
                              <span style={{ fontSize: 11, color: isLight ? '#7C3AED' : 'rgba(255,255,255,.85)' }}>{g.jenis_belanja || '—'}</span>
                            </div>
                            <span style={{ background: isLight ? 'rgba(124,92,252,.12)' : 'rgba(255,255,255,.18)', color: isLight ? '#7C3AED' : '#fff', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
                              {fmtRp(gTotal)}
                            </span>
                          </div>

                          {/* Item table */}
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr>
                                  <th style={{ ...thD, textAlign: 'center', width: 32 }}>#</th>
                                  <th style={thD}>Nama Barang</th>
                                  <th style={thD}>Spesifikasi</th>
                                  <th style={{ ...thD, textAlign: 'center' }}>Qty</th>
                                  <th style={thD}>Satuan</th>
                                  <th style={{ ...thD, textAlign: 'right' }}>Harga Est.</th>
                                  <th style={{ ...thD, textAlign: 'right' }}>Total Est.</th>
                                  <th style={{ ...thD, textAlign: 'center' }}>Prioritas</th>
                                  <th style={{ ...thD, textAlign: 'center' }}>Status</th>
                                  <th style={{ ...thD, textAlign: 'right' }}>Verif Admin</th>
                                  <th style={{ ...thD, textAlign: 'right' }}>Verif Kasubag</th>
                                  <th style={{ ...thD, textAlign: 'right' }}>Nominal Acc</th>
                                  <th style={thD}>Catatan</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.items.map((it, ii) => {
                                  const isRevBidang   = it.status === 'REVISI_BIDANG';
                                  const isRevLangsung = it.bidang_keputusan === 'REVISI_LANGSUNG';
                                  const adminQtyVal   = Number(it.admin_qty);
                                  const adminHargaVal = Number(it.admin_harga);
                                  const isRevAdmin    = adminQtyVal > 0 || adminHargaVal > 0;
                                  const effQty        = adminQtyVal || Number(it.qty);
                                  const effHarga      = adminHargaVal || Number(it.harga_est);
                                  const ksQtyVal      = Number(it.kasubag_qty);
                                  const ksHargaVal    = Number(it.kasubag_harga);
                                  const isRevKasubag  = it.kasubag_putusan === 'DIREVISI_KASUBAG' && (ksQtyVal > 0 || ksHargaVal > 0);
                                  const edit          = revisiEdits[it.id] ?? {};
                                  return (
                                    <React.Fragment key={it.id}>
                                      <tr style={{ background: ii % 2 === 0 ? (isLight ? '#FAFAFA' : 'rgba(4,44,83,.4)') : (isLight ? '#F9FAFB' : 'rgba(12,68,124,.18)') }}>
                                        <td style={{ ...tdD, textAlign: 'center', fontWeight: 600, color: isLight ? '#6B7280' : '#85B7EB' }}>{it.no_item}</td>
                                        <td style={tdD}>
                                          <div style={{ fontWeight: 600 }}>{it.nama_barang}</div>
                                          {it.alasan && <div style={{ fontSize: 10, color: isLight ? '#6B7280' : '#85B7EB', marginTop: 2 }}>💬 {it.alasan}</div>}
                                          {(it.url_merk1 || it.url_merk2 || it.url_merk3) && (
                                            <div style={{ fontSize: 10, marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                              {[it.url_merk1, it.url_merk2, it.url_merk3].filter(isSafeHttpUrl).map((u, i) => (
                                                <a key={i} href={u} target="_blank" rel="noreferrer"
                                                  style={{ color: '#60A5FA', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                                  🔗 Referensi {i + 1}
                                                </a>
                                              ))}
                                            </div>
                                          )}
                                          {it.file_url && (
                                            <div style={{ marginTop: 3 }}>
                                              <a href={safeFileHref(it.file_url)} target="_blank" rel="noreferrer"
                                                style={{ fontSize: 10, color: '#60A5FA', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                                📎 {it.file_url.includes('drive.google.com') ? 'Lihat Lampiran (Google Drive)' : 'Lihat Lampiran'}
                                              </a>
                                            </div>
                                          )}
                                          {!isPlainAdmin && isRevLangsung && it.nama_asal && it.nama_asal !== it.nama_barang && (
                                            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2, textDecoration: 'line-through' }}>Was: {it.nama_asal}</div>
                                          )}
                                        </td>
                                        <td style={{ ...tdD, color: isLight ? '#6B7280' : '#85B7EB' }}>
                                          {!isPlainAdmin && isRevLangsung && it.spesifikasi_asal && it.spesifikasi_asal !== it.spesifikasi && (
                                            <div style={{ textDecoration: 'line-through', fontSize: 10 }}>{it.spesifikasi_asal}</div>
                                          )}
                                          {it.spesifikasi || '-'}
                                        </td>
                                        <td style={{ ...tdD, textAlign: 'center' }}>
                                          {(() => {
                                            const strike = { textDecoration: 'line-through' as const, fontSize: 10, color: '#9ca3af' };
                                            const admCh = isRevAdmin && adminQtyVal !== Number(it.qty);
                                            const ksCh  = isRevKasubag && ksQtyVal !== effQty;
                                            return (
                                              <>
                                                {!isPlainAdmin && isRevLangsung && it.qty_asal != null && Number(it.qty_asal) !== Number(it.qty) && <div style={strike}>{it.qty_asal}</div>}
                                                {(admCh || ksCh) && <div style={strike}>{it.qty}</div>}
                                                {admCh && (ksCh ? <div style={strike}>{adminQtyVal}</div> : <div style={{ fontSize: 10, color: colAdminRev, fontWeight: 700 }}>→{adminQtyVal}</div>)}
                                                {ksCh && <div style={{ fontSize: 10, color: colKasubagRev, fontWeight: 700 }}>→{ksQtyVal}</div>}
                                                {!admCh && !ksCh && <span>{it.qty}</span>}
                                              </>
                                            );
                                          })()}
                                        </td>
                                        <td style={tdD}>{it.satuan}</td>
                                        <td style={{ ...tdD, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                          {(() => {
                                            const strike = { textDecoration: 'line-through' as const, fontSize: 10, color: '#9ca3af' };
                                            const admCh = isRevAdmin && adminHargaVal !== Number(it.harga_est);
                                            const ksCh  = isRevKasubag && ksHargaVal !== effHarga;
                                            return (
                                              <>
                                                {!isPlainAdmin && isRevLangsung && it.harga_asal != null && Number(it.harga_asal) !== Number(it.harga_est) && <div style={strike}>{fmtRp(Number(it.harga_asal))}</div>}
                                                {(admCh || ksCh) && <div style={strike}>{fmtRp(Number(it.harga_est))}</div>}
                                                {admCh && (ksCh ? <div style={strike}>{fmtRp(adminHargaVal)}</div> : <div style={{ fontSize: 10, color: colAdminRev, fontWeight: 700 }}>→{fmtRp(adminHargaVal)}</div>)}
                                                {ksCh && <div style={{ fontSize: 10, color: colKasubagRev, fontWeight: 700 }}>→{fmtRp(ksHargaVal)}</div>}
                                                {!admCh && !ksCh && <span>{fmtRp(Number(it.harga_est))}</span>}
                                              </>
                                            );
                                          })()}
                                        </td>
                                        <td style={{ ...tdD, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                          {fmtRp(Number(it.qty) * Number(it.harga_est))}
                                        </td>
                                        <td style={{ ...tdD, textAlign: 'center' }}>
                                          <span style={{ fontSize: 10, fontWeight: 700, color: it.prioritas === 'TINGGI' ? '#dc2626' : it.prioritas === 'SEDANG' ? '#d97706' : '#16a34a' }}>
                                            {it.prioritas}
                                          </span>
                                        </td>
                                        <td style={{ ...tdD, textAlign: 'center' }}><StatusBadge status={it.status} /></td>
                                        <td style={{ ...tdD, textAlign: 'right', whiteSpace: 'nowrap', color: it.status === 'DIREVISI_ADMIN' ? colAdminRev : colVerifAdm, fontWeight: 600 }}>
                                          {Number(it.admin_nominal) > 0 ? fmtRp(Number(it.admin_nominal)) : '-'}
                                        </td>
                                        <td style={{ ...tdD, textAlign: 'right', whiteSpace: 'nowrap', color: it.status === 'DIREVISI_KASUBAG' ? colKasubagRev : colVerifKsb, fontWeight: 600 }}>
                                          {Number(it.kasubag_nominal) > 0 ? fmtRp(Number(it.kasubag_nominal)) : '-'}
                                        </td>
                                        <td style={{ ...tdD, textAlign: 'right', whiteSpace: 'nowrap', color: isLight ? '#15803D' : '#4ADE80', fontWeight: 600 }}>
                                          {it.status === 'DISETUJUI' && Number(it.nominal_disetujui) > 0 ? fmtRp(Number(it.nominal_disetujui)) : '-'}
                                        </td>
                                        <td style={{ ...tdD, fontSize: 11, color: isLight ? '#6B7280' : '#85B7EB', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {it.bidang_catatan && <div style={{ color: '#d97706', fontWeight: 600 }}>📋 Bidang: {it.bidang_catatan}</div>}
                                          {it.admin_catatan && <div style={{ color: '#7c3aed', fontWeight: 600 }}>🔧 Admin: {it.admin_catatan}</div>}
                                          {it.kasubag_catatan && <div style={{ color: '#0d7a3a', fontWeight: 600 }}>✅ Kasubag: {it.kasubag_catatan}</div>}
                                          {it.kabag_catatan && <div style={{ color: '#1d4ed8', fontWeight: 600 }}>🏛 Kabag: {it.kabag_catatan}</div>}
                                          {!it.bidang_catatan && !it.admin_catatan && !it.kasubag_catatan && !it.kabag_catatan && '-'}
                                        </td>
                                      </tr>

                                      {/* Revisi Bidang inline-edit row */}
                                      {isRevBidang && isOwner && (
                                        <tr style={{ background: 'rgba(239,159,39,.07)' }}>
                                          <td colSpan={13} style={{ padding: '8px 12px', borderBottom: '1px solid rgba(12,68,124,.4)' }}>
                                            <div style={{ fontSize: 11, color: '#d97706', fontWeight: 700, marginBottom: it.bidang_catatan ? 2 : 6 }}>
                                              ⚠️ Dikembalikan Bidang — Edit lalu kirim ulang:
                                            </div>
                                            {it.bidang_catatan && (
                                              <div style={{ fontSize: 10, color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '3px 7px', marginBottom: 6, display: 'inline-block' }}>
                                                📋 Catatan Bidang: {it.bidang_catatan}
                                              </div>
                                            )}
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                              <div>
                                                <div style={{ fontSize: 10, color: isLight ? '#6B7280' : '#85B7EB', marginBottom: 2 }}>Spesifikasi</div>
                                                <input
                                                  style={{ fontSize: 11, padding: '3px 6px', border: isLight ? '1px solid rgba(0,0,0,.15)' : '1px solid #185FA5', borderRadius: 4, width: 160, background: isLight ? '#FFFFFF' : 'rgba(12,68,124,.4)', color: isLight ? '#0F0F12' : '#E6F1FB' }}
                                                  placeholder={it.spesifikasi || 'Kosongkan jika sama'}
                                                  value={edit.spesifikasi ?? ''}
                                                  onChange={e => setRevisiEdits(p => ({ ...p, [it.id]: { ...p[it.id], spesifikasi: e.target.value } }))}
                                                />
                                              </div>
                                              <div>
                                                <div style={{ fontSize: 10, color: isLight ? '#6B7280' : '#85B7EB', marginBottom: 2 }}>Qty</div>
                                                <PrimaNumberField
                                                  size="sm" min={1}
                                                  style={{ width: 84 }}
                                                  placeholder={String(it.qty)}
                                                  value={edit.qty ?? ''}
                                                  onChange={e => setRevisiEdits(p => ({ ...p, [it.id]: { ...p[it.id], qty: parseFloat(e.target.value) || undefined } }))}
                                                />
                                              </div>
                                              <div>
                                                <div style={{ fontSize: 10, color: isLight ? '#6B7280' : '#85B7EB', marginBottom: 2 }}>Harga (Rp)</div>
                                                <InputNominal
                                                  style={{ fontSize: 11, padding: '3px 6px', border: isLight ? '1px solid rgba(0,0,0,.15)' : '1px solid #185FA5', borderRadius: 4, width: 110, background: isLight ? '#FFFFFF' : 'rgba(12,68,124,.4)', color: isLight ? '#0F0F12' : '#E6F1FB' }}
                                                  placeholder={fmtNum(Number(it.harga_est))}
                                                  value={edit.harga_est ?? 0}
                                                  onChange={v => setRevisiEdits(p => ({ ...p, [it.id]: { ...p[it.id], harga_est: v || undefined } }))}
                                                />
                                              </div>
                                              <div>
                                                <div style={{ fontSize: 10, color: isLight ? '#6B7280' : '#85B7EB', marginBottom: 2 }}>Total Est.</div>
                                                <div style={{ fontSize: 11, padding: '3px 8px', background: isLight ? 'rgba(16,185,129,.08)' : 'rgba(12,68,124,.4)', border: isLight ? '1px solid rgba(16,185,129,.3)' : '1px solid #185FA5', borderRadius: 4, fontWeight: 700, color: isLight ? '#15803D' : '#4ADE80', minWidth: 100, whiteSpace: 'nowrap' }}>
                                                  {fmtRp((edit.qty ?? Number(it.qty)) * (edit.harga_est ?? Number(it.harga_est)))}
                                                </div>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Total footer */}
              {(() => {
                const liveTotal = data.items.reduce((s: number, it: UsulanItem) => {
                  const qty   = (it.status === 'REVISI_BIDANG' && revisiEdits[it.id]?.qty)      ? revisiEdits[it.id].qty!      : Number(it.qty);
                  const harga = (it.status === 'REVISI_BIDANG' && revisiEdits[it.id]?.harga_est) ? revisiEdits[it.id].harga_est! : Number(it.harga_est);
                  return s + qty * harga;
                }, 0);
                const hasEdit = Object.keys(revisiEdits).length > 0;

                // Rincian penolakan. DITOLAK_BIDANG hanya tampil ke non-admin (server
                // exclude untuk admin-tier di GET), jadi baris "Ditolak Bidang"
                // disembunyikan untuk ADMIN/ADMIN_KASUBAG/ADMIN_KABAG (selalu 0).
                const sumBy   = (st: string[]) => data.items.filter(it => st.includes(it.status)).reduce((s, it) => s + Number(it.qty) * Number(it.harga_est), 0);
                const countBy = (st: string[]) => data.items.filter(it => st.includes(it.status)).length;
                // Verif per tahap = snapshot nominal tahap itu (kolom tersendiri, tak saling timpa).
                const sumNominal   = (key: 'admin_nominal' | 'kasubag_nominal') => data.items.reduce((s, it) => s + Number(it[key] || 0), 0);
                const countNominal = (key: 'admin_nominal' | 'kasubag_nominal') => data.items.filter(it => Number(it[key] || 0) > 0).length;

                const tolakBidang  = sumBy(['DITOLAK_BIDANG']);
                const tolakFinal   = sumBy(['DITOLAK_ADMIN', 'DITOLAK']);
                const verifAdmin   = sumNominal('admin_nominal');
                const verifKasubag = sumNominal('kasubag_nominal');
                // Disetujui final = hanya item DISETUJUI (Kabag). nominal_disetujui keisi sejak
                // telaah Admin, jadi tak boleh pakai header.total_nominal mentah / tanpa filter.
                const setujuTotal  = data.items.filter(it => it.status === 'DISETUJUI').reduce((s, it) => s + Number(it.nominal_disetujui || 0), 0);
                // Gradasi merah (tolak): bidang lembut → final pekat.
                const colBidang    = isLight ? '#DC2626' : '#FCA5A5';
                const colFinal     = isLight ? '#991B1B' : '#E24B4A';
                const colSetuju    = '#1D9E75';
                const lblStyle: React.CSSProperties = { fontSize: 12, color: isLight ? '#374151' : '#85B7EB' };
                const rowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 16 };

                return (
                  <div style={{ marginTop: 14, padding: '10px 14px', background: isLight ? 'rgba(0,0,0,.03)' : 'rgba(12,68,124,.3)', border: isLight ? '1px solid rgba(0,0,0,.08)' : '1px solid #0C447C', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Baris 1 — estimasi + penolakan */}
                    <div style={rowStyle}>
                      <span style={lblStyle}>
                        Total Estimasi: <strong style={{ color: colSetuju }}>{fmtRp(liveTotal)}</strong> ({data.items.length})
                        {hasEdit && <span style={{ fontSize: 10, color: '#EF9F27', marginLeft: 6 }}>● live</span>}
                      </span>
                      {!isPlainAdmin && (
                        <span style={lblStyle}>
                          Total Ditolak Bidang: <strong style={{ color: colBidang }}>{fmtRp(tolakBidang)}</strong> ({countBy(['DITOLAK_BIDANG'])})
                        </span>
                      )}
                      <span style={lblStyle}>
                        Total Ditolak Final: <strong style={{ color: colFinal }}>{fmtRp(tolakFinal)}</strong> ({countBy(['DITOLAK_ADMIN', 'DITOLAK'])})
                      </span>
                    </div>
                    {/* Baris 2 — verif per tahap + final (tampil semua role) */}
                    <div style={rowStyle}>
                      <span style={lblStyle}>
                        Total Verif Admin: <strong style={{ color: colAdminRev }}>{fmtRp(verifAdmin)}</strong> ({countNominal('admin_nominal')})
                      </span>
                      <span style={lblStyle}>
                        Total Verif Kasubag: <strong style={{ color: colKasubagRev }}>{fmtRp(verifKasubag)}</strong> ({countNominal('kasubag_nominal')})
                      </span>
                      <span style={lblStyle}>
                        Total Disetujui: <strong style={{ color: colSetuju }}>{fmtRp(setujuTotal)}</strong> ({countBy(['DISETUJUI'])})
                      </span>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : null}
        </div>

        {/* ── Footer ── */}
        <div className="modal-footer">
          {data && isOwner && data.items.some((i: UsulanItem) => i.status === 'REVISI_BIDANG') && (
            <div style={{ marginRight: 'auto' }}>
              <PrimaButton
                variant="warning"
                iconLeft={<Send size={13} />}
                onClick={() => {
                  setConfirmDlg({
                    msg: 'Kirim ulang item yang dikembalikan bidang ke review ulang?',
                    onOk: async () => {
                      try {
                        const itemEdits = data.items.filter(i => i.status === 'REVISI_BIDANG').map(i => ({
                          item_id:     i.id,
                          spesifikasi: revisiEdits[i.id]?.spesifikasi || undefined,
                          qty:         revisiEdits[i.id]?.qty         || undefined,
                          harga_est:   revisiEdits[i.id]?.harga_est   || undefined,
                        }));
                        const res = await fetch(`/api/usulan/${data.header.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'resubmit_revisi_bidang', items: itemEdits }),
                        });
                        const d = await res.json();
                        if (d.ok) {
                          detailCacheRef.current.delete(data.header.id);
                          onClose();
                          onResubmitSuccess();
                          showToast(d.message || 'Berhasil.', false);
                        } else {
                          showToast(d.message || 'Gagal.');
                        }
                      } catch {
                        showToast('Gagal terhubung.');
                      }
                    },
                  });
                }}
              >
                Kirim Ulang Revisi ke Bidang
              </PrimaButton>
            </div>
          )}
          <PrimaButton variant="ghost" onClick={onClose}>Tutup</PrimaButton>
        </div>

      </div>
    </div>
  );
}

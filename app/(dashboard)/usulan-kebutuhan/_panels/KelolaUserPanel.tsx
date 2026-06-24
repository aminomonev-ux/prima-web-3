// PERF-C2 Tahap 9e: KelolaUserPanel — admin lite untuk ubah ROLE saja.
// O3: aksi lain (nonaktif/reset-pw/delete/access) di-route ke /admin
// (TabUserMgmt = canonical). Panel ini cuma role-only changer.

'use client';

import { RefreshCw } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { ROLE_LABELS, ROLE_GROUPS_OPTIONS } from '@/lib/constants';
import type { UserRow } from '../_types';
import { Pagination } from '../_utils';

interface Props {
  searchQ: string;
  onSearchChange: (v: string) => void;
  data: UserRow[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  setPage: (p: number) => void;
  doChangeRole: (id: number, role: string) => void;
  isLight?: boolean;
}

export function KelolaUserPanel({
  searchQ, onSearchChange, data, loading,
  page, totalPages, total, setPage, doChangeRole,
  isLight = false,
}: Props) {
  return (
    <div>
      <div className="filter-bar">
        <input className="filter-input" placeholder="Cari username / nama / email..."
          value={searchQ} onChange={e => onSearchChange(e.target.value)}
          style={{flex:1,minWidth:180}}/>
        <PrimaButton variant="ghost" size="sm" iconLeft={<RefreshCw size={13}/>} onClick={() => setPage(1)}>Refresh</PrimaButton>
      </div>
      <div style={{padding:'10px 14px',marginBottom:10,background:'rgba(167,139,250,.06)',border:'1px solid rgba(167,139,250,.18)',borderRadius:8,fontSize:11,color:'#A78BFA'}}>
        ℹ Panel ini hanya untuk <b>ubah role</b>. Aksi lain (nonaktif, reset password, hapus, atur akses aplikasi) tersedia di halaman <b>Admin Panel</b>.
      </div>
      <div className="ua-table-wrap">
        {loading ? <div style={{padding:'32px',textAlign:'center',color:'#9ca3af'}}>Memuat...</div>
        : data.length === 0 ? <div style={{padding:'32px',textAlign:'center',color:'#9ca3af',fontSize:13}}>Tidak ada user</div>
        : (
          <table className="ua-table">
            <thead><tr>
              <th>#</th><th>Username</th><th>Nama Lengkap</th><th>Email</th>
              <th>Role</th><th>Status</th>
            </tr></thead>
            <tbody>{data.map((u, i) => (
              <tr key={u.id}>
                <td style={{color:'#9ca3af',fontSize:11}}>{(page - 1) * 20 + i + 1}</td>
                <td>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div className="user-avatar-sm" style={{width:26,height:26,fontSize:10,flexShrink:0}}>{u.username.charAt(0).toUpperCase()}</div>
                    <span style={{fontWeight:700,fontSize:12,color:isLight?'#0F0F12':'#E6F1FB'}}>{u.username}</span>
                  </div>
                </td>
                <td style={{fontSize:12,color:isLight?'#374151':'#B5D4F4'}}>{u.nama_lengkap || '-'}</td>
                <td style={{fontSize:11,color:isLight?'#6B7280':'#85B7EB'}}>{u.email}</td>
                <td>
                  {u.role === 'SUPER_ADMIN' ? (
                    <span style={{fontSize:11,fontWeight:700,color:isLight?'#6D28D9':'#A78BFA',background:isLight?'rgba(124,92,252,.10)':'rgba(124,92,252,.15)',padding:'3px 10px',borderRadius:99}}>Super Admin</span>
                  ) : (
                    <select
                      style={{border:isLight?'1px solid rgba(0,0,0,.15)':'1px solid #0C447C',borderRadius:6,padding:'3px 6px',fontSize:11,color:isLight?'#0F0F12':'#E6F1FB',background:isLight?'#FFFFFF':'#042C53',cursor:'pointer',outline:'none',maxWidth:180}}
                      value={u.role}
                      onChange={e => doChangeRole(u.id, e.target.value)}>
                      <option value="">-- Pilih Role --</option>
                      {/* O3: data-driven dari ROLE_GROUPS_OPTIONS (constants).
                          Sebelumnya 20+ baris hardcoded — sekarang map dari constants
                          supaya role baru auto-muncul tanpa edit dropdown. */}
                      {ROLE_GROUPS_OPTIONS.map(g => (
                        <optgroup key={g.label} label={`── ${g.label} ──`}>
                          {g.roles.map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  )}
                </td>
                <td>
                  <span style={{fontWeight:700,fontSize:11,color: u.status === 'AKTIF' ? (isLight?'#047857':'#6EE7B7') : u.status === 'NONAKTIF' ? (isLight?'#B91C1C':'#FCA5A5') : (isLight?'#6B7280':'#85B7EB')}}>
                    {u.status === 'AKTIF' ? '✓ AKTIF' : u.status === 'NONAKTIF' ? '⊘ NONAKTIF' : u.status}
                  </span>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pages={totalPages} total={total} onPage={setPage}/>
    </div>
  );
}

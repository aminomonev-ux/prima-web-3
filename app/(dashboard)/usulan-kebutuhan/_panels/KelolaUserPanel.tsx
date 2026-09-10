// PERF-C2 Tahap 9e: KelolaUserPanel — admin lite untuk ubah ROLE saja.
// Aksi lain (nonaktif/reset kata sandi/hapus/atur akses) hidup di /admin -> Pusat Akses.
//
// D1 (T-8, Tahap 6): dropdown perannya sekarang komponen yang SAMA dengan yang dipakai
// Pusat Akses — penanda kuota `(n/max)`, opsi penuh dimatikan, dan `confirmDialog`
// sebelum menyimpan. Sebelum ini `doChangeRole` menembak endpoint yang sama persis
// dengan Admin Panel langsung dari `onChange`: satu aksi berdampak sama, dua tingkat
// kehati-hatian, dan yang lebih longgar justru yang lebih sering dipakai sehari-hari.
//
// Satu komponen, bukan dua salinan kalimat: dua salinan pasti berbeda bunyi begitu
// salah satu disunting (L78, sudah tiga kali terjadi di modul BLUD).

'use client';

import { RefreshCw, ExternalLink } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import PilihPeran, { konfirmasiUbahPeran, masihProbation, useStatKuota } from '@/components/admin/PilihPeran';
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
  doChangeRole: (id: number, role: string, alasan: string) => void;
  /**
   * Panel ini terbuka untuk ADMIN **dan** SUPER_ADMIN, sementara `/admin` sesudah T-16
   * hanya untuk SUPER_ADMIN. Spanduk yang menyuruh ADMIN "buka Admin Panel" mengarahkan
   * orang ke pintu yang akan melemparnya balik — persis L79d. Jadi kalimatnya berbeda
   * per peran, dan tautannya hanya muncul bagi yang memang bisa membukanya.
   */
  isSA?: boolean;
  isLight?: boolean;
}

export function KelolaUserPanel({
  searchQ, onSearchChange, data, loading,
  page, totalPages, total, setPage, doChangeRole,
  isSA = false, isLight = false,
}: Props) {
  const statKuota = useStatKuota();

  async function gantiPeran(u: UserRow, peranBaru: string) {
    if (!peranBaru || peranBaru === u.role) return;
    // P9 — dialognya memulangkan ALASANNYA, bukan cuma ya/tidak. `null` = dibatalkan.
    const alasan = await konfirmasiUbahPeran({
      username: u.username,
      dari: u.role, ke: peranBaru,
      jumlahPerkecualian: u.menu_exceptions ?? 0,
      probationAktif: masihProbation(u.probationary_until),
      stat: statKuota.find(s => s.role === peranBaru),
    });
    if (alasan === null) return;
    doChangeRole(u.id, peranBaru, alasan);
  }

  return (
    <div>
      <div className="filter-bar">
        <input className="filter-input" placeholder="Cari username / nama / email..."
          value={searchQ} onChange={e => onSearchChange(e.target.value)}
          style={{flex:1,minWidth:180}}/>
        <PrimaButton variant="ghost" size="sm" iconLeft={<RefreshCw size={13}/>} onClick={() => setPage(1)}>Refresh</PrimaButton>
      </div>
      {/* D2 — spanduk penjelas. Kalimatnya menyebut nama tombol yang MEMANG ADA di layar
          tujuan (L79d): di Pusat Akses tombolnya berbunyi "Nonaktifkan", "Reset sandi",
          dan "Arsipkan", bukan "hapus" atau "atur akses aplikasi" seperti dulu. */}
      <div style={{padding:'10px 14px',marginBottom:10,background:'rgba(167,139,250,.06)',border:'1px solid rgba(167,139,250,.18)',borderRadius:8,fontSize:11,color:'#A78BFA',lineHeight:1.65}}>
        ℹ Panel ini hanya untuk <b>ubah peran</b>. Tombol <b>Nonaktifkan</b>, <b>Reset sandi</b>,{' '}
        <b>Putuskan</b> (sesi), <b>Arsipkan</b>, dan pengaturan pintu modul ada di <b>Pusat Akses</b>{' '}
        {isSA ? (
          <>— Admin Panel → <b>Pusat Akses</b>.{' '}
            <a href="/admin" style={{color:'#A78BFA',fontWeight:700,textDecoration:'underline',display:'inline-flex',alignItems:'center',gap:3}}>
              Buka <ExternalLink size={11}/>
            </a>
          </>
        ) : (
          <>— dan layar itu hanya bisa dibuka <b>Super Admin</b>. Kalau butuh salah satunya,
            mintakan ke Super Admin; dari sini memang tidak bisa.</>
        )}
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
                    <PilihPeran
                      style={{border:isLight?'1px solid rgba(0,0,0,.15)':'1px solid #0C447C',borderRadius:6,padding:'3px 6px',fontSize:11,color:isLight?'#0F0F12':'#E6F1FB',background:isLight?'#FFFFFF':'#042C53',cursor:'pointer',outline:'none',maxWidth:200}}
                      nilai={u.role} peranSekarang={u.role} stat={statKuota}
                      onGanti={r => { void gantiPeran(u, r); }}
                    />
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

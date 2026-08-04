'use client';
// app/(dashboard)/admin/_panels/MenuAccessPanel.tsx
// Pengaturan akses menu — dua lapis, satu daftar. Konsep: docs/CONCEPT-menu-access-control.md §6
//
// Kotak centang, bukan tiga tombol setara: yang TIDAK dicentang tetap bisa dibuka &
// diunduh, hanya tidak bisa diubah. Bentuk itu mengikuti sistem yang sudah berjalan —
// seluruh peran di `TABEL` berbentuk "LIHAT semua, kecuali beberapa yang EDIT", dan
// `TIDAK` tidak dipakai satu peran pun. Menyembunyikan menu tetap bisa, tapi di balik
// "opsi lanjutan" supaya tidak membebani pemakaian sehari-hari.
//
// Yang disimpan hanya SELISIH terhadap bawaan. Sama dengan bawaan = tidak ada baris =
// ikut mengikuti kalau bawaannya suatu saat berubah.
import { useCallback, useEffect, useState } from 'react';
import { X, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import { ROLE_LABELS } from '@/lib/constants';
import { MENU_APPS } from '@/lib/registry/menu-apps';

type Izin = 'EDIT' | 'LIHAT' | 'TIDAK';
type MenuInfo = {
  key: string;
  label: string;
  bacaSaja: boolean;
  /** Menu berlantai peran — EDIT di luar daftar ini tidak akan pernah berlaku. */
  editHanyaPeran?: string[];
};
type Terkunci = { label: string; peran: string[] };

interface DataUmum {
  menus: MenuInfo[];
  efektif: Record<string, Izin>;
  terkunci: Terkunci[];
  /** Sidik jari keadaan tersimpan saat layar dimuat — dikirim balik saat menyimpan. */
  versi: string;
}
interface DataUser extends DataUmum {
  scope: 'user';
  user: { id: number; username: string; role: string };
  bawaanPeran: Record<string, Izin>;
}
interface DataRole extends DataUmum {
  scope: 'role';
  role: string;
  bawaanKode: Record<string, Izin>;
  jumlahUser: number;
}
type Data = DataUser | DataRole;

function bawaanDari(d: Data): Record<string, Izin> {
  return d.scope === 'user' ? d.bawaanPeran : d.bawaanKode;
}

/** Peran yang jadi SASARAN pengaturan — bukan peran admin yang sedang membukanya. */
function peranSasaran(d: Data): string {
  return d.scope === 'user' ? d.user.role : d.role;
}

/**
 * Sel EDIT yang tidak akan berlaku: menu berlantai peran, dan peran sasarannya di luar
 * lantai itu. Route menolaknya lewat cek peran langsung, jadi menawarkan saklarnya sama
 * saja dengan menjanjikan sesuatu yang tidak akan terjadi (L69).
 */
function editTakBerlaku(m: MenuInfo, d: Data): boolean {
  return !!m.editHanyaPeran && !m.editHanyaPeran.includes(peranSasaran(d));
}

/**
 * Peran yang bisa diatur untuk sebuah modul: SEMUA peran, dikelompokkan.
 *
 * Dulu daftarnya dipotong sebatas `peranUtama` supaya yang penting tidak tenggelam.
 * Ternyata itu memotong terlalu banyak: peran yang tidak biasa memakai sebuah modul
 * tetap kadang perlu diatur, dan menutup pilihannya berarti kembali meminta developer.
 * Sekarang semuanya muncul — yang biasa dipakai di grup atas, sisanya di bawah.
 *
 * Menampilkannya aman: baris peran tidak memberi akses apa pun. Pintu modul tetap
 * `app_access` (tombol ATUR), dan peran tanpa grant tetap ditolak walau barisnya
 * dicentang penuh. Bawaan peran di luar tabel juga `LIHAT` di semua modul — muncul
 * dengan kotak kosong, bukan tercentang.
 *
 * SUPER_ADMIN sengaja tidak ada di daftar mana pun (§4.5.4 nomor 5) — kalau barisnya
 * bisa diedit, cepat atau lambat ada yang mengunci dirinya sendiri di luar.
 */
function grupPeran(peranUtama: readonly string[]) {
  const utama = peranUtama.filter(r => r !== 'SUPER_ADMIN');
  const lain = Object.keys(ROLE_LABELS).filter(r => r !== 'SUPER_ADMIN' && !utama.includes(r));
  return [
    { label: 'Biasa dipakai di modul ini', peran: utama },
    { label: 'Peran lain', peran: lain },
  ];
}

/** Pemilih modul. Isinya dari registry — modul baru muncul sendiri di sini. */
function PilihModul({ nilai, ubah }: { nilai: string; ubah: (v: string) => void }) {
  if (MENU_APPS.length < 2) return null;
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      {MENU_APPS.map(a => (
        <button
          key={a.key}
          onClick={() => ubah(a.key)}
          style={{
            padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700,
            border: `1px solid ${nilai === a.key ? 'var(--ma-line-on)' : 'var(--ma-line)'}`,
            background: nilai === a.key ? 'var(--ma-bg-on)' : 'transparent',
            color: nilai === a.key ? 'var(--ma-fg)' : 'var(--ma-dim)',
          }}
        >{a.label}</button>
      ))}
    </div>
  );
}

/** Daftar menu + opsi lanjutan + pratinjau hasil. Dipakai modal per-orang & tab matriks. */
function DaftarMenu({
  data, nilai, setNilai,
}: {
  data: Data;
  nilai: Record<string, Izin>;
  setNilai: (v: Record<string, Izin>) => void;
}) {
  const [lanjutanBuka, setLanjutanBuka] = useState(false);
  const bawaan = bawaanDari(data);

  function ubah(key: string, izin: Izin) {
    setNilai({ ...nilai, [key]: izin });
  }

  // Menu berlantai tidak ikut dihitung "bisa ubah" walau nilainya EDIT — pratinjau ini
  // dibaca sebagai janji, dan janji itu tidak akan ditepati route-nya.
  const bisaUbah = data.menus
    .filter(m => nilai[m.key] === 'EDIT' && !editTakBerlaku(m, data))
    .map(m => m.label);
  const disembunyikan = data.menus.filter(m => nilai[m.key] === 'TIDAK').map(m => m.label);
  const jumlahLihat = data.menus.length - bisaUbah.length - disembunyikan.length;

  return (
    <>
      <div style={{ fontSize: 10, color: 'var(--ma-dim)', marginBottom: 8 }}>
        {data.scope === 'user'
          ? 'Centang menu yang boleh dia ubah. Yang tidak dicentang tetap bisa dia buka dan unduh, cuma tidak bisa diubah isinya.'
          : 'Centang menu yang boleh diubah. Yang tidak dicentang tetap bisa dibuka dan diunduh, cuma tidak bisa diubah isinya.'}
      </div>

      <div style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
        {data.menus.map(m => {
          const izin = nilai[m.key] ?? 'LIHAT';
          const tersembunyi = izin === 'TIDAK';
          const dicentang = izin === 'EDIT';
          const berlantai = editTakBerlaku(m, data);
          const mati = m.bacaSaja || tersembunyi || berlantai;
          return (
            <label key={m.key} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6,
              cursor: mati ? 'default' : 'pointer',
              opacity: tersembunyi ? .45 : 1,
              background: dicentang ? 'var(--ma-bg-on)' : 'var(--ma-bg)',
              border: `1px solid ${dicentang ? 'var(--ma-line-on)' : 'var(--ma-line)'}`,
              fontSize: 12, color: dicentang ? 'var(--ma-fg)' : 'var(--ma-dim)',
            }}>
              <input
                type="checkbox"
                checked={dicentang && !berlantai}
                disabled={mati}
                onChange={() => ubah(m.key, dicentang ? 'LIHAT' : 'EDIT')}
                style={{ width: 13, height: 13, accentColor: 'var(--ma-aksen)', flexShrink: 0 }}
              />
              <span style={{ flex: 1 }}>{m.label}</span>
              {m.bacaSaja && (
                <span style={{ fontSize: 9, color: 'var(--ma-dim)' }}>memang tidak ada yang bisa diubah</span>
              )}
              {berlantai && (
                <span style={{ fontSize: 9, color: 'var(--ma-dim)' }}>
                  hanya {(m.editHanyaPeran ?? []).map(r => ROLE_LABELS[r] ?? r).join(' & ')} yang boleh mengubah
                </span>
              )}
              {tersembunyi && <span style={{ fontSize: 9, color: 'var(--ma-warn)' }}>disembunyikan</span>}
              {!m.bacaSaja && !berlantai && !tersembunyi && bawaan[m.key] !== izin && (
                <span style={{ fontSize: 9, color: 'var(--ma-beda)' }}>
                  {data.scope === 'user' ? 'beda dari perannya' : 'diubah dari asalnya'}
                </span>
              )}
            </label>
          );
        })}
      </div>

      <button
        onClick={() => setLanjutanBuka(v => !v)}
        style={{ background: 'none', border: 'none', color: 'var(--ma-dim)', cursor: 'pointer',
          fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: 0, marginBottom: 8 }}
      >
        {lanjutanBuka ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Pengaturan lanjutan — sembunyikan menu tertentu
      </button>

      {lanjutanBuka && (
        <div style={{ padding: '8px 10px', marginBottom: 12, borderRadius: 6,
          background: 'var(--ma-warn-bg)', border: '1px solid var(--ma-warn-line)' }}>
          <div style={{ fontSize: 10, color: 'var(--ma-warn)', marginBottom: 6 }}>
            Menu yang disembunyikan tidak akan muncul sama sekali
            {data.scope === 'user' ? ' buat orang ini' : ' buat orang dengan peran ini'}. Pakai
            seperlunya: orang yang tampilan menunya beda sendiri biasanya malah mengira akunnya
            bermasalah.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {data.menus.map(m => (
              <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: 'var(--ma-dim)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={nilai[m.key] === 'TIDAK'}
                  onChange={() => ubah(m.key, nilai[m.key] === 'TIDAK' ? 'LIHAT' : 'TIDAK')}
                  style={{ width: 12, height: 12, accentColor: 'var(--ma-warn)' }}
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Pratinjau: admin melihat AKIBAT kliknya, bukan menebaknya. */}
      <div style={{ padding: '10px 12px', borderRadius: 6, marginBottom: 14,
        background: 'var(--ma-bg)', border: '1px solid var(--ma-line)' }}>
        <div style={{ fontSize: 10, color: 'var(--ma-dim)', letterSpacing: 1, marginBottom: 6 }}>JADINYA BEGINI</div>
        <div style={{ fontSize: 11, color: 'var(--ma-fg)', lineHeight: 1.7 }}>
          <div><span style={{ color: 'var(--ma-ok)' }}>Bisa ubah:</span> {bisaUbah.length ? bisaUbah.join(' · ') : '—'}</div>
          <div><span style={{ color: 'var(--ma-dim)' }}>Lihat saja:</span> {jumlahLihat} menu</div>
          {disembunyikan.length > 0 && (
            <div><span style={{ color: 'var(--ma-warn)' }}>Disembunyikan:</span> {disembunyikan.join(' · ')}</div>
          )}
        </div>
        {data.terkunci.map(t => (
          <div key={t.label} style={{ fontSize: 10, color: 'var(--ma-dim)', marginTop: 6,
            display: 'flex', alignItems: 'center', gap: 5 }}>
            <ShieldCheck size={11} style={{ flexShrink: 0 }} />
            {t.label}: {t.peran.join(' · ')} — sudah ditetapkan dari awal, tidak bisa diubah di sini
          </div>
        ))}
      </div>
    </>
  );
}

function useMenuAccess(appKey: string, query: string) {
  const [data, setData]   = useState<Data | null>(null);
  const [nilai, setNilai] = useState<Record<string, Izin>>({});
  const [muat, setMuat]   = useState(true);

  const load = useCallback(async () => {
    setMuat(true);
    try {
      const res = await fetch(`/api/admin/menu-access?appKey=${appKey}&${query}`);
      const j = await res.json() as { ok: boolean; message?: string } & Partial<Data>;
      if (!j.ok) { toast.error(j.message ?? 'Gagal memuat akses menu'); return; }
      const d = j as unknown as Data;
      setData(d);
      setNilai({ ...d.efektif });
    } catch {
      toast.error('Gagal memuat akses menu');
    } finally {
      setMuat(false);
    }
  }, [appKey, query]);

  // Lewat microtask: `load()` menyetel state di baris pertamanya, dan memanggilnya
  // langsung di dalam effect memicu render berantai (react-hooks/set-state-in-effect).
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  return { data, nilai, setNilai, muat, reload: load };
}

/** Hanya selisih terhadap bawaan yang disimpan — sisanya dibiarkan ikut. */
function selisih(nilai: Record<string, Izin>, bawaan: Record<string, Izin>) {
  const keluar: Record<string, Izin> = {};
  for (const [k, v] of Object.entries(nilai)) if (bawaan[k] !== v) keluar[k] = v;
  return keluar;
}

export function MenuAccessModal({ userId, username, onClose }: {
  userId: number; username: string; onClose: () => void;
}) {
  const [appKey, setAppKey] = useState(MENU_APPS[0].key);
  const { data, nilai, setNilai, muat, reload } = useMenuAccess(appKey, `userId=${userId}`);
  const [simpan, setSimpan] = useState(false);

  async function kirim(kosongkan = false) {
    if (!data) return;
    setSimpan(true);
    try {
      const izin = kosongkan ? {} : selisih(nilai, bawaanDari(data));
      const res = await fetch('/api/admin/menu-access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'user', appKey, userId, izin, versi: data.versi }),
      });
      const j = await res.json() as { ok: boolean; message?: string; code?: string };
      if (!j.ok) {
        // 409: orang lain menyimpan lebih dulu. Layar dimuat ulang supaya admin
        // melihat keadaan terbaru — perubahan orang pertama tidak ditimpa diam-diam.
        if (j.code === 'BERUBAH') { toast.error(`${j.message} Ini yang terbaru — cek dulu sebelum menyimpan lagi.`); await reload(); return; }
        toast.error(j.message ?? 'Gagal menyimpan'); return;
      }
      toast.success(kosongkan ? 'Sekarang ikut aturan perannya lagi' : 'Akses menu tersimpan');
      onClose();
    } catch {
      toast.error('Gagal menyimpan');
    } finally {
      setSimpan(false);
    }
  }

  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div className="modal-title">AKSES MENU</div>
          <button style={{ background: 'none', border: 'none', color: 'var(--ma-dim)', cursor: 'pointer' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ma-dim)', marginBottom: 14 }}>
          {username}
          {data?.scope === 'user' && <> · <span style={{ color: 'var(--ma-aksen)' }}>{ROLE_LABELS[data.user.role] ?? data.user.role}</span></>}
        </div>

        {/* Pengaturan disimpan per modul: pindah tab lalu Simpan hanya menyentuh modul
            yang sedang dibuka, tidak menghapus setelan modul lain. */}
        <PilihModul nilai={appKey} ubah={setAppKey} />

        {muat || !data ? (
          <div style={{ fontSize: 12, color: 'var(--ma-dim)', padding: '20px 0' }}>Memuat…</div>
        ) : (
          <>
            <DaftarMenu data={data} nilai={nilai} setNilai={setNilai} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <PrimaButton variant="ghost" size="sm" onClick={() => { void kirim(true); }} disabled={simpan}>
                Samakan dengan perannya
              </PrimaButton>
              <PrimaButton variant="ghost" size="sm" onClick={onClose} disabled={simpan}>Batal</PrimaButton>
              <PrimaButton variant="primary" size="sm" onClick={() => { void kirim(); }} disabled={simpan}>
                Simpan
              </PrimaButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Tab matriks per peran. SUPER_ADMIN tidak muncul di pilihan — barisnya dikunci supaya
 * tidak ada yang bisa mencabut akses dirinya sendiri lalu terkurung di luar.
 */
export function MenuAccessRoleTab({ isSA }: { isSA: boolean }) {
  const [appKey, setAppKey] = useState(MENU_APPS[0].key);
  const aplikasi = MENU_APPS.find(a => a.key === appKey) ?? MENU_APPS[0];
  const GRUP = grupPeran(aplikasi.peranUtama);
  const [role, setRole] = useState<string>(aplikasi.peranUtama[0]);
  // Semua peran sah untuk semua modul, jadi pilihan lama tidak perlu direset saat
  // modul diganti — cukup dipastikan masih dikenal. Yang berubah cuma grupnya:
  // PERBENDAHARAAN pindah dari "biasa dipakai" ke "peran lain" saat berpindah ke PK.
  const roleAktif = GRUP.some(g => g.peran.includes(role)) ? role : aplikasi.peranUtama[0];
  const { data, nilai, setNilai, muat, reload } = useMenuAccess(appKey, `role=${roleAktif}`);
  const [simpan, setSimpan] = useState(false);

  async function kirim(kosongkan = false) {
    if (!data) return;
    setSimpan(true);
    try {
      const izin = kosongkan ? {} : selisih(nilai, bawaanDari(data));
      const res = await fetch('/api/admin/menu-access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'role', appKey, role: roleAktif, izin, versi: data.versi }),
      });
      const j = await res.json() as { ok: boolean; message?: string; code?: string };
      if (!j.ok) {
        if (j.code === 'BERUBAH') { toast.error(`${j.message} Ini yang terbaru — cek dulu sebelum menyimpan lagi.`); await reload(); return; }
        toast.error(j.message ?? 'Gagal menyimpan'); return;
      }
      toast.success(kosongkan ? `Aturan ${roleAktif} kembali seperti semula` : `Aturan ${roleAktif} tersimpan`);
      await reload();
    } catch {
      toast.error('Gagal menyimpan');
    } finally {
      setSimpan(false);
    }
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ fontSize: 11, color: 'var(--ma-dim)', marginBottom: 12, lineHeight: 1.7 }}>
        Aturan yang berlaku untuk semua orang dengan peran ini di modul {aplikasi.label}. Kalau
        cuma satu orang yang perlu beda, atur lewat tombol <b style={{ color: 'var(--ma-aksen)' }}>MENU</b> di
        tab User Management.
      </div>

      <PilihModul nilai={appKey} ubah={setAppKey} />

      <div className="ap-row" style={{ marginBottom: 14 }}>
        <select className="ap-select" value={roleAktif} onChange={e => setRole(e.target.value)}>
          {GRUP.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.peran.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
            </optgroup>
          ))}
        </select>
        {data?.scope === 'role' && (
          <span style={{ fontSize: 11, color: 'var(--ma-dim)', alignSelf: 'center' }}>
Berlaku untuk {data.jumlahUser} orang yang aktif dengan peran ini
          </span>
        )}
      </div>

      <div style={{ padding: '8px 12px', marginBottom: 14, borderRadius: 6, fontSize: 11, color: 'var(--ma-dim)',
        background: 'var(--ma-bg)', border: '1px solid var(--ma-line)' }}>
        <b>SUPER_ADMIN</b> sengaja tidak bisa diatur dari sini. Kalau bisa, suatu saat ada yang
        tanpa sengaja mencabut aksesnya sendiri, dan tidak ada lagi yang bisa membetulkannya.
      </div>

      {muat || !data ? (
        <div style={{ fontSize: 12, color: 'var(--ma-dim)' }}>Memuat…</div>
      ) : (
        <>
          <DaftarMenu data={data} nilai={nilai} setNilai={setNilai} />
          {!isSA ? (
            <div style={{ fontSize: 11, color: 'var(--ma-warn)' }}>
              Yang boleh mengubah aturan peran hanya SUPER_ADMIN, karena perubahannya kena ke
              semua orang dengan peran ini sekaligus.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <PrimaButton variant="ghost" size="sm" onClick={() => { void kirim(true); }} disabled={simpan}>
                Kembalikan seperti semula
              </PrimaButton>
              <PrimaButton variant="primary" size="sm" onClick={() => { void kirim(); }} disabled={simpan}>
                Simpan aturan {role}
              </PrimaButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';
// app/(dashboard)/admin/_panels/TabPusatAkses.tsx — satu orang, satu halaman.
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §4.5 & §16.4 (Tahap 5 / Fase C).
//
// Menggantikan alur "cari orang → tombol ATUR → modal → tutup → tombol MENU → modal
// lain → tombol ROLE → modal ketiga". Tiga penyimpanan terpisah yang bisa berhenti di
// tengah, dan tidak satu layar pun yang bisa menjawab "apa yang sebenarnya bisa
// dilakukan orang ini".
//
// TIGA hal yang menentukan bentuknya:
//
//   1. **Kolom sebab.** Tiap baris modul menyebut KENAPA pintunya terbuka, bukan cuma
//      bahwa ia terbuka. Modal lama menampilkan sepuluh centang tanpa membedakan
//      "terbuka karena peran" dari "terbuka karena diberi akses" — jadi mencabut
//      centang pada seorang ADMIN terlihat seperti menutup pintu, padahal tidak
//      menutup apa-apa (T-6). Kotak yang tidak berarti DIMATIKAN, dan kalimatnya yang
//      menjelaskan. Kotak mati tanpa sebab adalah keluhan UX yang sudah tercatat (L79c).
//   2. **Menu bersarang di bawah modulnya**, bukan modal terpisah — menu yang diatur
//      untuk orang yang pintunya tertutup tidak berarti apa-apa, dan susunan bersarang
//      membuat urutan itu terlihat.
//   3. **Satu Simpan untuk seluruh halaman**, satu transaksi. Pengingat belum-tersimpan
//      memakai `lib/shared/belum-tersimpan.ts` yang sudah ada.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Search, Save, RotateCcw, ChevronDown, ChevronRight, KeyRound, Power, LogOut,
  Archive, Trash2, UserPlus, PackageOpen, PackagePlus, ShieldAlert, Info, Unlock, X,
  History,
} from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { confirmDialog, promptDialog } from '@/components/ui/ConfirmDialog';
import { useIngatkanBelumTersimpan } from '@/lib/shared/belum-tersimpan';
import { fetchJson } from '@/lib/shared/api';
import { ROLE_LABELS } from '@/lib/constants';
// Dari berkas DAUN, bukan dari `pusat-akses.ts` yang membaca DB — lihat kepala
// `pintu-akses.ts` untuk sebabnya (halaman /admin sempat balas 500 karenanya).
import { barisPintu, type BerkasOrang } from '@/lib/admin/pintu-akses';
// D1 (T-8) — dropdown peran yang SAMA dengan yang dipakai panel Kelola User di Usulan.
// Penanda kuota, opsi penuh dimatikan, dan kalimat konfirmasinya lahir dari satu tempat.
import PilihPeran, { konfirmasiUbahPeran, segarkanStatKuota, useStatKuota } from '@/components/admin/PilihPeran';
import { ALL_ROLES } from './_shared';

type Izin = 'EDIT' | 'LIHAT' | 'TIDAK';
type Orang = {
  id: number; username: string; nama_lengkap: string | null; email: string;
  role: string; status: string; last_login: string | null;
  deleted_at: string | null; sesi_aktif: number;
};
type Paket = { nama: string; keterangan: string; app_access: string[]; menu: Record<string, Record<string, Izin>> };
type Peristiwa = { id: number; jenis: string; detail: string | null; pelaku: string | null; waktu: string };
type Jejak = {
  kehilanganPemilik: { tabel: string; kolom: string; jumlah: number }[];
  ikutTerhapus: { tabel: string; kolom: string; jumlah: number }[];
  totalKehilangan: number; totalTerhapus: number;
};

const PILIHAN_IZIN: { nilai: '' | Izin; label: string }[] = [
  { nilai: '',      label: 'Ikut bawaan peran' },
  { nilai: 'EDIT',  label: 'Boleh ubah' },
  { nilai: 'LIHAT', label: 'Hanya lihat' },
  { nilai: 'TIDAK', label: 'Sembunyikan' },
];

const tgl = (v: string | null) => v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const waktuLengkap = (v: string) => new Date(v).toLocaleString('id-ID', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

/**
 * Warna per jenis peristiwa. Dipisah menurut ARAHNYA, bukan menurut seberapa serius:
 * memberi akses hijau, mencabut & menghapus merah, ganti peran kuning. Yang dicari orang
 * di garis waktu hampir selalu "kapan sesuatu DIAMBIL", dan itu harus terbaca sekilas.
 */
const JENIS_BADGE: Record<string, string> = {
  ACCESS_GRANT:  'badge-green',
  ACCESS_REVOKE: 'badge-red',
  ROLE_CHANGE:   'badge-yellow',
  USER_ARCHIVE:  'badge-yellow',
  USER_DELETE:   'badge-red',
  USER_CREATE:   'badge-cyan',
};

export function TabPusatAkses() {
  const [daftar, setDaftar]   = useState<Orang[]>([]);
  const [cari, setCari]       = useState('');
  const [arsip, setArsip]     = useState(false);
  const [pilih, setPilih]     = useState<number | null>(null);
  const [berkas, setBerkas]   = useState<BerkasOrang | null>(null);
  const [sibuk, setSibuk]     = useState(false);
  const [paket, setPaket]     = useState<Paket[]>([]);
  const [buka, setBuka]       = useState<Record<string, boolean>>({});

  // ── Draf: apa yang ada di layar, belum tentu apa yang tersimpan ──────────
  const [draRole, setDraRole]   = useState('');
  const [draGrant, setDraGrant] = useState<string[]>([]);
  const [draMenu, setDraMenu]   = useState<Record<string, Record<string, Izin>>>({});
  const [asalPaket, setAsalPaket] = useState<string | null>(null);
  const [buatBuka, setBuatBuka]   = useState(false);
  const [paketBuka, setPaketBuka] = useState(false);
  const [garis, setGaris]         = useState<Peristiwa[] | null>(null);
  const [garisBulan, setGarisBulan] = useState(12);
  const statKuota = useStatKuota();

  const muatDaftar = useCallback(async () => {
    const p = new URLSearchParams();
    if (cari.trim()) p.set('cari', cari.trim());
    if (arsip) p.set('arsip', '1');
    const j = await fetchJson(`/api/admin/pusat-akses?${p}`) as { ok: boolean; data?: Orang[] };
    if (j.ok && j.data) setDaftar(j.data);
  }, [cari, arsip]);

  const muatBerkas = useCallback(async (id: number) => {
    setSibuk(true);
    const j = await fetchJson(`/api/admin/pusat-akses?userId=${id}`) as { ok: boolean; data?: BerkasOrang; message?: string };
    setSibuk(false);
    if (!j.ok || !j.data) { toast.error(j.message ?? 'Gagal memuat berkas orang ini.'); return; }
    setBerkas(j.data);
    setDraRole(j.data.user.role);
    setDraGrant([...j.data.appAccess]);
    setDraMenu(Object.fromEntries(j.data.menu.map(m => [m.appKey, { ...m.orang }])));
    setAsalPaket(null);
    setGaris(null);
  }, []);

  // P8 — garis waktu dimuat SAAT DIMINTA, bukan bersama berkasnya. Ia menyapu tabel
  // audit yang paling besar di basis data ini, dan pertanyaan "apa yang pernah terjadi
  // pada orang ini" tidak ditanyakan tiap kali sebuah nama diklik.
  const muatGaris = useCallback(async (id: number) => {
    setSibuk(true);
    const j = await fetchJson(`/api/admin/pusat-akses?userId=${id}&garisWaktu=1`) as
      { ok: boolean; data?: Peristiwa[]; bulan?: number; message?: string };
    setSibuk(false);
    if (!j.ok || !j.data) { toast.error(j.message ?? 'Gagal memuat garis waktu.'); return; }
    setGaris(j.data);
    if (j.bulan) setGarisBulan(j.bulan);
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- pemuatan awal & saat penyaring berubah; pola muat-awal yang dipakai seluruh panel di folder ini. */
  useEffect(() => { void muatDaftar(); }, [muatDaftar]);
  /* eslint-disable-next-line react-hooks/set-state-in-effect -- ganti orang = ganti konteks, muat berkasnya. */
  useEffect(() => { if (pilih) void muatBerkas(pilih); }, [pilih, muatBerkas]);
  const muatPaket = useCallback(async () => {
    const j = await fetchJson('/api/admin/pusat-akses?paket=1') as { ok: boolean; data?: Paket[] };
    if (j.ok && j.data) setPaket(j.data);
  }, []);
  /* eslint-disable-next-line react-hooks/set-state-in-effect -- pemuatan awal daftar paket. */
  useEffect(() => { void muatPaket(); }, [muatPaket]);

  // Ganti peran MEMBUANG perkecualian menu — aturan yang sudah berlaku di jalur lama
  // (perkecualian diberikan dalam konteks jabatan). Layarnya wajib ikut berganti
  // konteks, bukan cuma memindahkan sasaran simpan (L78b): bagian menunya dikunci dan
  // draf-nya dikosongkan, supaya tidak ada yang menyunting sesuatu yang akan dibuang.
  const peranBerubah = Boolean(berkas) && draRole !== berkas!.user.role;

  const pintuDraf = useMemo(
    () => berkas ? barisPintu(draRole, draGrant) : [],
    [berkas, draRole, draGrant],
  );

  const berubah = useMemo(() => {
    if (!berkas) return false;
    if (draRole !== berkas.user.role) return true;
    const a = [...draGrant].sort().join(','), b = [...berkas.appAccess].sort().join(',');
    if (a !== b) return true;
    return berkas.menu.some(m => JSON.stringify(m.orang) !== JSON.stringify(draMenu[m.appKey] ?? {}));
  }, [berkas, draRole, draGrant, draMenu]);

  useIngatkanBelumTersimpan(
    berubah ? 'Pengaturan akses orang ini belum disimpan. Kalau Anda pergi sekarang, perubahannya hilang.' : null,
  );

  function geserGrant(kunci: string, nyala: boolean) {
    setDraGrant(prev => nyala ? [...new Set([...prev, kunci])] : prev.filter(k => k !== kunci));
  }

  function geserMenu(appKey: string, menuKey: string, nilai: '' | Izin) {
    setDraMenu(prev => {
      const blok = { ...(prev[appKey] ?? {}) };
      if (nilai === '') delete blok[menuKey]; else blok[menuKey] = nilai;
      return { ...prev, [appKey]: blok };
    });
  }

  async function terapkanPaket(p: Paket) {
    if (!berkas) return;
    // Paket MENGISI FORM, bukan menulis. Ia bukan ikatan hidup: menyunting satu paket
    // tidak boleh diam-diam mengubah wewenang belasan orang (§12 P1).
    const sebelum = JSON.stringify([[...draGrant].sort(), draMenu]);
    const grantBaru = [...new Set([...draGrant, ...p.app_access])];
    const menuBaru = { ...draMenu };
    for (const [app, peta] of Object.entries(p.menu)) menuBaru[app] = { ...(menuBaru[app] ?? {}), ...peta };
    setDraGrant(grantBaru);
    setDraMenu(menuBaru);
    setAsalPaket(sebelum === JSON.stringify([[...grantBaru].sort(), menuBaru]) ? null : p.nama);
    toast.success(`Paket "${p.nama}" dimasukkan ke form. Periksa dulu, baru Simpan.`);
  }

  async function simpan() {
    if (!berkas) return;
    const grantKirim = pintuDraf.filter(b => b.bisaDicentang && draGrant.includes(b.kunci)).map(b => b.kunci);

    // P9 — alasan diminta HANYA kalau wewenangnya benar-benar bergeser. Menyimpan
    // sesudah menggeser satu izin menu saja tidak ditanya: pertanyaan yang muncul pada
    // aksi harian melatih orang mengetik "-" lalu terbawa ke aksi yang penting.
    //
    // Server memeriksanya lagi di dalam transaksi, dari baris yang sudah dikunci —
    // pemeriksaan di sini untuk MEMINTA, bukan untuk menjamin.
    const grantLama = [...berkas.appAccess].sort().join(',');
    const grantBaru = [...grantKirim].sort().join(',');
    const grantBergeser = grantLama !== grantBaru;

    let alasan: string | null = null;
    if (peranBerubah) {
      // Ditanyakan di sini, bukan saat dropdown-nya digeser: selama belum Simpan,
      // pilihannya masih bisa dibatalkan. Inilah titik yang tidak bisa ditarik balik.
      const jumlahPerkecualian = berkas.menu.reduce((a, m) => a + Object.keys(m.orang).length, 0);
      alasan = await konfirmasiUbahPeran({
        username: berkas.user.username,
        dari: berkas.user.role, ke: draRole,
        jumlahPerkecualian,
        probationAktif: berkas.masaPercobaan,
        stat: statKuota.find(s => s.role === draRole),
      });
      if (alasan === null) return;
    } else if (grantBergeser) {
      const dibuka = grantKirim.filter(k => !berkas.appAccess.includes(k));
      const ditutup = berkas.appAccess.filter(k => !grantKirim.includes(k));
      const nama = (k: string) => pintuDraf.find(b => b.kunci === k)?.label ?? k;
      alasan = await promptDialog({
        title: 'Simpan perubahan akses?',
        message: [
          dibuka.length ? `Dibuka: ${dibuka.map(nama).join(', ')}.` : '',
          ditutup.length ? `Ditutup: ${ditutup.map(nama).join(', ')} — perkecualian menunya ikut dibuang.` : '',
        ].filter(Boolean).join('\n\n'),
        label: 'Alasan',
        placeholder: 'Mis. ditugaskan membantu Bendahara sampai akhir tahun',
        confirmLabel: 'Simpan',
        variant: 'primary',
      });
      if (alasan === null) return;
    }

    setSibuk(true);
    const j = await fetchJson('/api/admin/pusat-akses', {
      method: 'PUT',
      body: JSON.stringify({
        user_id: berkas.user.id,
        role: draRole,
        role_awal: berkas.user.role,
        app_access: grantKirim,
        menu: peranBerubah ? {} : draMenu,
        versi: Object.fromEntries(berkas.menu.map(m => [m.appKey, m.versi])),
        asal_paket: asalPaket ? { nama: asalPaket, diubah: 1 } : null,
        ...(alasan ? { alasan } : {}),
      }),
    }) as { ok: boolean; message?: string; code?: string; data?: { izinDihapus: number } };
    setSibuk(false);
    if (!j.ok) {
      toast.error(j.message ?? 'Gagal menyimpan.');
      if (j.code === 'BERUBAH' || j.code === 'PERAN_BERUBAH') void muatBerkas(berkas.user.id);
      return;
    }
    toast.success('Tersimpan.' + (j.data?.izinDihapus ? ` ${j.data.izinDihapus} perkecualian menu ikut dibuang.` : ''));
    // Angka kuota di dropdown ikut bergeser begitu perannya benar-benar berubah.
    if (peranBerubah) segarkanStatKuota();
    const garisTerbuka = garis !== null;
    await muatBerkas(berkas.user.id);
    // Garis waktu yang sedang terbuka ikut disegarkan — kalau tidak, ia menampilkan
    // keadaan sebelum perubahan yang barusan disimpan, tepat di sebelah hasilnya.
    if (garisTerbuka) await muatGaris(berkas.user.id);
    await muatDaftar();
  }

  async function aksiAkun(action: string, extra: Record<string, unknown> = {}) {
    if (!berkas) return;
    setSibuk(true);
    const j = await fetchJson('/api/admin/users', {
      method: 'PATCH', body: JSON.stringify({ id: berkas.user.id, action, ...extra }),
    }) as { ok: boolean; message?: string };
    setSibuk(false);
    if (!j.ok) { toast.error(j.message ?? 'Gagal.'); return; }
    toast.success(j.message ?? 'Berhasil.');
    await muatBerkas(berkas.user.id);
    await muatDaftar();
  }

  async function hapus(mode: 'arsip' | 'permanen') {
    if (!berkas) return;
    const u = berkas.user;
    let alasanHapus = '';
    if (mode === 'permanen') {
      // Angkanya DIHITUNG, bukan diperingatkan secara umum (§5.5). Nol adalah jawaban
      // yang paling sering, dan justru itu yang membuatnya berguna: ketika ia bukan
      // nol, orangnya berhenti.
      setSibuk(true);
      const j = await fetchJson(`/api/admin/pusat-akses?userId=${u.id}&jejak=1`) as { ok: boolean; data?: Jejak };
      setSibuk(false);
      const jj = j.data;
      const rincian = jj && jj.totalKehilangan > 0
        ? `\n\n${jj.totalKehilangan} baris akan kehilangan pemiliknya:\n`
          + jj.kehilanganPemilik.map(r => `  · ${r.tabel}.${r.kolom} — ${r.jumlah}`).join('\n')
        : '\n\nTidak ada satu pun baris yang kehilangan pemiliknya.';
      const ikut = jj && jj.totalTerhapus > 0
        ? `\n\n${jj.totalTerhapus} baris IKUT TERHAPUS bersama akunnya:\n`
          + jj.ikutTerhapus.map(r => `  · ${r.tabel}.${r.kolom} — ${r.jumlah}`).join('\n')
        : '';
      const ya = await confirmDialog({
        title: `Hapus permanen ${u.username}?`,
        message: `Barisnya dibuang dari tabel users dan tidak bisa dikembalikan.${rincian}${ikut}`
          + '\n\nKalau orangnya cuma pindah atau berhenti, pilih Arsipkan — jejaknya tetap utuh.',
        confirmLabel: 'Hapus permanen',
        variant: 'danger',
      });
      if (!ya) return;
      // P9 — hapus permanen satu-satunya aksi di layar ini yang tidak bisa ditarik
      // balik. Ditanyakan SESUDAH angka jejaknya terlihat, bukan sebelum: alasan yang
      // diketik tanpa tahu 247 baris akan kehilangan pemiliknya bukan alasan.
      const sebab = await promptDialog({
        title: `Alasan menghapus ${u.username}`,
        message: 'Tercatat di jejak audit, dan itu satu-satunya yang tersisa sesudah akunnya hilang.',
        label: 'Alasan',
        placeholder: 'Mis. akun uji yang dibuat 2 Sep, belum pernah dipakai',
        confirmLabel: 'Hapus permanen',
        variant: 'danger',
      });
      if (sebab === null) return;
      alasanHapus = sebab;
    } else {
      const ya = await confirmDialog({
        title: `Arsipkan ${u.username}?`,
        message: 'Akunnya dinonaktifkan permanen dan sesinya dihentikan sekarang juga. '
          + 'Jejak "siapa menyimpan apa" tetap utuh; data pribadinya dianonimisasi cron retensi setelah 5 tahun.',
        confirmLabel: 'Arsipkan',
        variant: 'warning',
      });
      if (!ya) return;
    }
    setSibuk(true);
    // Alasannya lewat BADAN, bukan query string: teks bebas di URL berakhir di log
    // akses Nginx dan riwayat peramban, dan yang ditulis di sini kadang menyebut nama
    // orang atau sebab pemberhentiannya.
    const j = await fetchJson(`/api/admin/pusat-akses?id=${u.id}&mode=${mode}`, {
      method: 'DELETE', body: JSON.stringify({ alasan: alasanHapus || 'diarsipkan dari Pusat Akses' }),
    }) as { ok: boolean; message?: string };
    setSibuk(false);
    if (!j.ok) { toast.error(j.message ?? 'Gagal.'); return; }
    toast.success(j.message ?? 'Berhasil.');
    if (mode === 'permanen') { setPilih(null); setBerkas(null); }
    else await muatBerkas(u.id);
    await muatDaftar();
  }

  const u = berkas?.user;

  return (
    <div className="ap-pa">
      <aside className="ap-pa-kiri">
        <div className="ap-pa-cari">
          <Search size={13}/>
          <input
            className="ap-input" placeholder="Cari nama, username, email…"
            value={cari} onChange={e => setCari(e.target.value)}
          />
          {/* Registrasi publik dimatikan (INTRANET EDITION D9), jadi tombol ini
              satu-satunya jalur pembuatan akun. Ia ikut pindah ke sini bersama tab
              lama — kalau tertinggal, mematikan tab itu memutus satu-satunya pintunya. */}
          <button className="ap-pa-tambah" type="button" data-tooltip="Buat akun baru"
            aria-label="Buat akun baru" onClick={() => setBuatBuka(true)}>
            <UserPlus size={14}/>
          </button>
        </div>
        <label className="ap-pa-arsip">
          <input type="checkbox" checked={arsip} onChange={e => setArsip(e.target.checked)}/>
          Termasuk yang diarsipkan
        </label>
        <div className="ap-pa-daftar">
          {daftar.map(o => (
            <button
              key={o.id} type="button"
              className={`ap-pa-orang${pilih === o.id ? ' aktif' : ''}${o.deleted_at ? ' arsip' : ''}`}
              onClick={() => setPilih(o.id)}
            >
              <div className="ap-pa-nama">{o.username}</div>
              <div className="ap-pa-meta">
                {ROLE_LABELS[o.role] ?? o.role}
                <span className={`ap-pa-titik ${o.status === 'AKTIF' ? 'ok' : 'diam'}`}/>
                {o.deleted_at ? 'DIARSIPKAN' : o.status}
              </div>
            </button>
          ))}
          {daftar.length === 0 && <div className="ap-pa-kosong">Tidak ada yang cocok.</div>}
        </div>
        <div className="ap-pa-jumlah">{daftar.length} orang</div>
      </aside>

      <section className="ap-pa-kanan">
        {!u && (
          <div className="ap-pa-kosong-besar">
            <UserPlus size={22}/>
            <div>Pilih satu orang di sebelah kiri untuk melihat dan mengatur wewenangnya.</div>
          </div>
        )}

        {u && berkas && (
          <>
            <div className="ap-pa-kepala">
              <div>
                <div className="ap-pa-judul">{u.nama_lengkap || u.username}</div>
                <div className="ap-pa-sub">{u.username} · {u.email}</div>
              </div>
              {u.deleted_at && <span className="ap-badge badge-gray">DIARSIPKAN {tgl(u.deleted_at)}</span>}
            </div>

            <div className="ap-pa-kartu">
              <div className="ap-card ap-pa-k">
                <div className="ap-pa-k-lbl">Peran</div>
                <PilihPeran
                  className="ap-select" nilai={draRole} onGanti={setDraRole}
                  stat={statKuota} peranSekarang={u.role} disabled={sibuk}
                />
                <div className="ap-pa-k-sub">
                  {berkas.kuota.kuota === null
                    ? 'Peran ini tanpa kuota'
                    : `${berkas.kuota.terpakai}/${berkas.kuota.kuota} terpakai di peran sekarang`}
                </div>
              </div>

              <div className="ap-card ap-pa-k">
                <div className="ap-pa-k-lbl">Status</div>
                <div className="ap-pa-k-nilai">{u.status}</div>
                <PrimaButton
                  size="sm" variant={u.status === 'AKTIF' ? 'warning' : 'success'} disabled={sibuk}
                  iconLeft={<Power size={13}/>}
                  onClick={() => void aksiAkun(u.status === 'AKTIF' ? 'nonaktif' : 'aktifkan')}
                >
                  {u.status === 'AKTIF' ? 'Nonaktifkan' : 'Aktifkan'}
                </PrimaButton>
              </div>

              <div className="ap-card ap-pa-k">
                <div className="ap-pa-k-lbl">Sesi</div>
                <div className="ap-pa-k-nilai">{berkas.sesiAktif} aktif</div>
                <PrimaButton
                  size="sm" variant="ghost" disabled={sibuk || berkas.sesiAktif === 0}
                  iconLeft={<LogOut size={13}/>} onClick={() => void aksiAkun('putus-sesi')}
                >
                  Putuskan
                </PrimaButton>
              </div>

              <div className="ap-card ap-pa-k">
                <div className="ap-pa-k-lbl">Login terakhir</div>
                <div className="ap-pa-k-nilai">{tgl(u.last_login)}</div>
                <PrimaButton size="sm" variant="ghost" disabled={sibuk} iconLeft={<KeyRound size={13}/>}
                  onClick={() => void resetSandi(berkas.user.id, berkas.user.username, setSibuk)}>
                  Reset sandi
                </PrimaButton>
              </div>
            </div>

            <PromosiBaris
              user={u} terkunci={berkas.promosiTerkunci} percobaan={berkas.masaPercobaan}
              sibuk={sibuk} onSelesai={() => void muatBerkas(u.id)}
            />

            {peranBerubah && (
              <div className="ap-sk-ingat">
                <ShieldAlert size={14}/>
                <span>
                  Peran akan diubah {ROLE_LABELS[u.role] ?? u.role} → {ROLE_LABELS[draRole] ?? draRole}.
                  Seluruh perkecualian menu miliknya ikut dibuang — perkecualian diberikan
                  untuk jabatan tertentu, bukan untuk orangnya. Atur ulang setelah tersimpan.
                </span>
              </div>
            )}

            <div className="ap-pa-baris-judul">
              <div className="ap-section-title" style={{ margin: 0, border: 'none', padding: 0 }}>PINTU MODUL</div>
              <div className="ap-row" style={{ gap: 8 }}>
                {paket.length > 0 && (
                  <select
                    className="ap-select" value="" disabled={sibuk}
                    onChange={e => { const p = paket.find(x => x.nama === e.target.value); if (p) void terapkanPaket(p); }}
                  >
                    <option value="">Terapkan paket…</option>
                    {paket.map(p => <option key={p.nama} value={p.nama}>{p.nama}</option>)}
                  </select>
                )}
                {/* Paket disusun DARI orang yang sudah benar, bukan dari formulir
                    kosong: yang tahu isi paket "Bendahara Pengeluaran" adalah orang
                    yang baru saja menyiapkan bendahara pengeluaran, dan ia sedang
                    melihat jawabannya di layar. */}
                <PrimaButton size="sm" variant="ghost" disabled={sibuk}
                  iconLeft={<PackagePlus size={13}/>} onClick={() => setPaketBuka(true)}>
                  Kelola paket
                </PrimaButton>
              </div>
            </div>

            {asalPaket && (
              <div className="ap-pa-catatan"><PackageOpen size={13}/> Form diisi dari paket <b>{asalPaket}</b>. Belum tersimpan.</div>
            )}

            <div className="ap-pa-pintu">
              {pintuDraf.map(b => {
                const blok = berkas.menu.find(m => m.appKey === b.kunci);
                const terbuka = buka[b.kunci];
                return (
                  <div key={b.kunci} className={`ap-pa-row${b.terbuka ? ' buka' : ''}`}>
                    <label className="ap-pa-cek">
                      <input
                        type="checkbox" disabled={!b.bisaDicentang || sibuk}
                        checked={b.bisaDicentang ? draGrant.includes(b.kunci) : b.terbuka}
                        onChange={e => geserGrant(b.kunci, e.target.checked)}
                      />
                    </label>
                    <div className="ap-pa-row-isi">
                      <div className="ap-pa-row-nama">{b.label}</div>
                      <div className="ap-pa-row-sebab">{b.sebab}</div>
                    </div>
                    {b.punyaMenu && b.terbuka && blok && (
                      <button className="ap-btn ap-btn-cyan" type="button" onClick={() => setBuka(p => ({ ...p, [b.kunci]: !p[b.kunci] }))}>
                        {terbuka ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                        {blok.menus.length} MENU
                        {Object.keys(draMenu[b.kunci] ?? {}).length > 0 && ` · ${Object.keys(draMenu[b.kunci] ?? {}).length} KHUSUS`}
                      </button>
                    )}
                    {b.punyaMenu && b.terbuka && blok && terbuka && (
                      <div className="ap-pa-menu">
                        {peranBerubah && (
                          <div className="ap-pa-catatan"><Info size={13}/> Dikunci sampai perubahan peran tersimpan.</div>
                        )}
                        {blok.menus.map(m => {
                          const nilai = (draMenu[b.kunci] ?? {})[m.key] ?? '';
                          const bawaan = blok.bawaanPeran[m.key] ?? 'LIHAT';
                          const editMati = Boolean(m.editHanyaPeran && !m.editHanyaPeran.includes(draRole));
                          return (
                            <div key={m.key} className="ap-pa-menu-row">
                              <div className="ap-pa-menu-nama">
                                {m.label}
                                {m.bacaSaja && <span className="ap-badge badge-gray">BACA SAJA</span>}
                              </div>
                              <select
                                className="ap-select" value={nilai} disabled={peranBerubah || sibuk}
                                onChange={e => geserMenu(b.kunci, m.key, e.target.value as '' | Izin)}
                              >
                                {PILIHAN_IZIN.map(o => (
                                  <option
                                    key={o.nilai} value={o.nilai}
                                    disabled={o.nilai === 'EDIT' && (m.bacaSaja || editMati)}
                                  >
                                    {o.nilai === '' ? `${o.label} (${bawaan})` : o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="ap-pa-garis">
              <div className="ap-pa-baris-judul">
                <div className="ap-section-title" style={{ margin: 0, border: 'none', padding: 0 }}>GARIS WAKTU</div>
                <PrimaButton size="sm" variant="ghost" disabled={sibuk}
                  iconLeft={<History size={13}/>} onClick={() => void muatGaris(u.id)}>
                  {garis === null ? 'Tampilkan' : 'Muat ulang'}
                </PrimaButton>
              </div>

              {garis !== null && (
                <>
                  {/* WAJIB tertulis, bukan disimpulkan sendiri: `audit_log` dipangkas
                      cron retensi, jadi garis waktunya PUNYA UJUNG. Layar yang diam
                      soal itu membiarkan orang membaca "tidak ada catatan" dari
                      "catatannya sudah dibuang" — dan itu kesimpulan yang salah tepat
                      pada pertanyaan yang paling penting. */}
                  <div className="ap-pa-catatan">
                    <Info size={13}/>
                    Jejak audit dipangkas otomatis setiap {garisBulan} bulan. Yang lebih
                    lama dari itu memang sudah tidak ada — bukan berarti tidak pernah terjadi.
                  </div>

                  {garis.length === 0 ? (
                    <div className="ap-sk-kosong" style={{ padding: '10px 2px' }}>
                      Belum ada perubahan wewenang yang tercatat untuk orang ini.
                    </div>
                  ) : (
                    <ol className="ap-pa-peristiwa">
                      {garis.map(g2 => (
                        <li key={g2.id}>
                          <span className={`ap-badge ${JENIS_BADGE[g2.jenis] ?? 'badge-gray'}`}>{g2.jenis}</span>
                          <div className="ap-pa-peristiwa-isi">
                            <div className="ap-pa-peristiwa-teks">{g2.detail ?? '—'}</div>
                            <div className="ap-pa-peristiwa-kaki">
                              {waktuLengkap(g2.waktu)} · oleh {g2.pelaku ?? 'sistem'}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </div>

            <div className="ap-pa-kaki">
              <div className="ap-row" style={{ gap: 8 }}>
                <PrimaButton variant="warning" size="sm" disabled={sibuk || Boolean(u.deleted_at)}
                  iconLeft={<Archive size={13}/>} onClick={() => void hapus('arsip')}>
                  Arsipkan
                </PrimaButton>
                <PrimaButton variant="danger" size="sm" disabled={sibuk}
                  iconLeft={<Trash2 size={13}/>} onClick={() => void hapus('permanen')}>
                  Hapus permanen
                </PrimaButton>
              </div>
              <div className="ap-row" style={{ gap: 8 }}>
                {berubah && <span className="ap-pa-belum">Belum tersimpan</span>}
                <PrimaButton variant="ghost" size="sm" disabled={sibuk || !berubah}
                  iconLeft={<RotateCcw size={13}/>} onClick={() => void muatBerkas(u.id)}>
                  Batalkan
                </PrimaButton>
                <PrimaButton variant="primary" disabled={sibuk || !berubah}
                  iconLeft={<Save size={14}/>} onClick={() => void simpan()}>
                  Simpan
                </PrimaButton>
              </div>
            </div>
          </>
        )}
      </section>

      {paketBuka && berkas && (
        <KelolaPaket
          paket={paket}
          calon={{
            app_access: pintuDraf.filter(b => b.bisaDicentang && draGrant.includes(b.kunci)).map(b => b.kunci),
            menu: Object.fromEntries(Object.entries(draMenu).filter(([, v]) => Object.keys(v).length > 0)),
          }}
          onTutup={() => setPaketBuka(false)}
          onBerubah={async () => { await muatPaket(); }}
        />
      )}

      {buatBuka && (
        <BuatAkun
          onTutup={() => setBuatBuka(false)}
          onJadi={async (id) => { setBuatBuka(false); await muatDaftar(); if (id) setPilih(id); }}
        />
      )}
    </div>
  );
}

/**
 * Kunci promosi & masa percobaan — dua keadaan yang cuma berlaku pada segelintir orang,
 * jadi barisnya SEMBUNYI selama tidak berlaku. Tombolnya ikut pindah dari tab lama;
 * meninggalkannya di sana berarti mematikan tab itu ikut membuang satu-satunya tombol
 * Buka Kunci yang ada.
 */
function PromosiBaris(
  { user, terkunci, percobaan, sibuk, onSelesai }:
  {
    user: BerkasOrang['user']; terkunci: boolean; percobaan: boolean;
    sibuk: boolean; onSelesai: () => void;
  },
) {
  const [kerja, setKerja] = useState(false);
  // "Masih berlaku atau tidak" DIJAWAB SERVER (`berkasOrang`). Membandingkan stempel DB
  // dengan jam peramban salah begitu jamnya meleset, dan menghitungnya saat render
  // adalah fungsi tak murni yang hasilnya bisa berganti sendiri di antara dua render.
  if (!terkunci && !percobaan) return null;

  async function tembak(jalur: 'unlock-promotion' | 'revoke-probation', kabar: string) {
    setKerja(true);
    const j = await fetchJson(`/api/admin/users/${user.id}/${jalur}`, { method: 'POST' }) as { ok: boolean; message?: string };
    setKerja(false);
    if (!j.ok) { toast.error(j.message ?? 'Gagal.'); return; }
    toast.success(j.message ?? kabar);
    onSelesai();
  }

  return (
    <div className="ap-sk-ingat">
      <Unlock size={14}/>
      <div className="ap-row" style={{ gap: 10 }}>
        {terkunci && (
          <>
            <span>Permintaan naik peran dikunci sampai {tgl(user.promotion_locked_until)}.</span>
            <PrimaButton size="sm" variant="ghost" disabled={sibuk || kerja}
              onClick={() => void tembak('unlock-promotion', 'Kunci dibuka.')}>Buka kunci</PrimaButton>
          </>
        )}
        {percobaan && (
          <>
            <span>Masa percobaan berjalan sampai {tgl(user.probationary_until)} (naik dari {ROLE_LABELS[user.probationary_from_role ?? ''] ?? user.probationary_from_role}).</span>
            <PrimaButton size="sm" variant="warning" disabled={sibuk || kerja}
              onClick={() => void tembak('revoke-probation', 'Masa percobaan dicabut.')}>Cabut, kembalikan peran lama</PrimaButton>
          </>
        )}
      </div>
    </div>
  );
}


/**
 * Menyusun & membuang paket. Sengaja SEDERHANA: paket bukan ikatan hidup, jadi ia tidak
 * butuh riwayat, versi, atau layar tersendiri — menyunting satu paket TIDAK mengubah
 * wewenang siapa pun yang sudah terlanjur memakainya (§12 P1). Ia titik awal, dan
 * seluruh nilainya ada pada 90% pekerjaan yang tidak perlu diketik ulang tiap orang.
 */
function KelolaPaket(
  { paket, calon, onTutup, onBerubah }:
  {
    paket: Paket[];
    calon: { app_access: string[]; menu: Record<string, Record<string, Izin>> };
    onTutup: () => void;
    onBerubah: () => Promise<void>;
  },
) {
  const [nama, setNama] = useState('');
  const [ket, setKet]   = useState('');
  const [kerja, setKerja] = useState(false);
  const jumlahMenu = Object.values(calon.menu).reduce((a, v) => a + Object.keys(v).length, 0);

  async function kirim(body: Record<string, unknown>, kabar: string) {
    setKerja(true);
    const j = await fetchJson('/api/admin/pusat-akses', { method: 'POST', body: JSON.stringify(body) }) as { ok: boolean; message?: string };
    setKerja(false);
    if (!j.ok) { toast.error(j.message ?? 'Gagal.'); return; }
    toast.success(kabar);
    await onBerubah();
  }

  return (
    <div className="ap-modal-bg" onClick={onTutup}>
      <div className="ap-modal-box" onClick={e => e.stopPropagation()}>
        <div className="ap-modal-title">
          <PackageOpen size={14}/> PAKET AKSES
          <button className="ap-pa-tutup" type="button" aria-label="Tutup" onClick={onTutup}><X size={14}/></button>
        </div>

        <div className="ap-pa-catatan" style={{ marginBottom: 12 }}>
          <Info size={13}/>
          Paket adalah titik awal, bukan ikatan. Menyuntingnya tidak mengubah wewenang
          orang yang sudah terlanjur memakainya.
        </div>

        <div className="ap-pa-form">
          <label className="ap-sk-lbl">Simpan pengaturan di layar sebagai paket</label>
          <input className="ap-input" value={nama} onChange={e => setNama(e.target.value)}
            placeholder="Mis. Bendahara Pengeluaran"/>
          <input className="ap-input" value={ket} onChange={e => setKet(e.target.value)}
            placeholder="Keterangan singkat (opsional)"/>
          <div className="ap-pa-k-sub">
            Akan menyimpan {calon.app_access.length} pintu modul dan {jumlahMenu} pengaturan menu.
            Peran TIDAK ikut — memberinya punya kuota dan mencabut sesi, jadi ia aksi tersendiri.
          </div>
          <PrimaButton size="sm" variant="primary" disabled={kerja || !nama.trim()}
            onClick={() => void kirim(
              { aksi: 'simpan-paket', paket: { nama: nama.trim(), keterangan: ket.trim(), app_access: calon.app_access, menu: calon.menu } },
              `Paket "${nama.trim()}" disimpan.`,
            )}>
            Simpan sebagai paket
          </PrimaButton>
        </div>

        {paket.length > 0 && (
          <>
            <div className="ap-sk-lbl" style={{ marginTop: 16 }}>Paket yang ada</div>
            <div className="ap-pa-pintu" style={{ marginTop: 8 }}>
              {paket.map(p => (
                <div key={p.nama} className="ap-pa-row">
                  <div className="ap-pa-row-isi" style={{ gridColumn: '1 / 3' }}>
                    <div className="ap-pa-row-nama">{p.nama}</div>
                    <div className="ap-pa-row-sebab">
                      {p.keterangan || `${p.app_access.length} modul`}
                    </div>
                  </div>
                  <PrimaButton size="sm" variant="danger" disabled={kerja}
                    onClick={async () => {
                      if (!(await confirmDialog({
                        title: `Hapus paket "${p.nama}"?`,
                        message: 'Wewenang orang yang sudah memakainya TIDAK berubah — paket cuma titik awal.',
                        confirmLabel: 'Hapus paket',
                      }))) return;
                      await kirim({ aksi: 'hapus-paket', nama: p.nama }, `Paket "${p.nama}" dihapus.`);
                    }}>
                    Hapus
                  </PrimaButton>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BuatAkun({ onTutup, onJadi }: { onTutup: () => void; onJadi: (id: number) => void | Promise<void> }) {
  const [username, setU] = useState('');
  const [email, setE]    = useState('');
  const [nama, setN]     = useState('');
  const [role, setR]     = useState('UMUM');
  const [sandi, setS]    = useState(() => sandiAcak());
  const [kerja, setKerja] = useState(false);

  async function kirim() {
    setKerja(true);
    const j = await fetchJson('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username: username.trim(), email: email.trim(), password: sandi, role, nama_lengkap: nama.trim() || undefined }),
    }) as { ok: boolean; message?: string; data?: { id: number } };
    setKerja(false);
    if (!j.ok) { toast.error(j.message ?? 'Gagal membuat akun.'); return; }
    await confirmDialog({
      title: `Akun ${username} dibuat`,
      message: `Kata sandi sementara:\n\n${sandi}\n\nSalin sekarang — kalimat ini tidak bisa ditampilkan lagi.`,
      confirmLabel: 'Sudah saya salin', cancelLabel: 'Tutup', variant: 'primary',
    });
    await onJadi(j.data?.id ?? 0);
  }

  return (
    <div className="ap-modal-bg" onClick={onTutup}>
      <div className="ap-modal-box" onClick={e => e.stopPropagation()}>
        <div className="ap-modal-title">
          <UserPlus size={14}/> BUAT AKUN BARU
          <button className="ap-pa-tutup" type="button" aria-label="Tutup" onClick={onTutup}><X size={14}/></button>
        </div>
        <div className="ap-pa-form">
          <label className="ap-sk-lbl">Username</label>
          <input className="ap-input" value={username} onChange={e => setU(e.target.value)} placeholder="budi.s"/>
          <label className="ap-sk-lbl">Email</label>
          <input className="ap-input" type="email" value={email} onChange={e => setE(e.target.value)} placeholder="budi@rsjd.go.id"/>
          <label className="ap-sk-lbl">Nama lengkap</label>
          <input className="ap-input" value={nama} onChange={e => setN(e.target.value)} placeholder="Budi Santoso"/>
          <label className="ap-sk-lbl">Peran</label>
          <select className="ap-select" value={role} onChange={e => setR(e.target.value)}>
            {ALL_ROLES.filter(r => r !== 'SUPER_ADMIN').map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
          </select>
          {/* Kata sandi DIBUATKAN, tidak diketik admin: kata sandi yang diketik orang
              lain untuk seseorang hampir selalu jadi kata sandi yang dipakai terus. */}
          <label className="ap-sk-lbl">Kata sandi sementara</label>
          <div className="ap-row" style={{ gap: 6 }}>
            <input className="ap-input" readOnly value={sandi}/>
            <PrimaButton size="sm" variant="ghost" onClick={() => setS(sandiAcak())}>Acak ulang</PrimaButton>
          </div>
        </div>
        <div className="ap-row" style={{ marginTop: 14, justifyContent: 'flex-end', gap: 8 }}>
          <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
          <PrimaButton variant="primary" disabled={kerja || !username.trim() || !email.trim()} onClick={() => void kirim()}>
            Buat akun
          </PrimaButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Kata sandi baru diminta lewat `prompt` peramban? Tidak — DESIGN-SYSTEM melarang kotak
 * bawaan peramban, dan kata sandi tidak boleh melewati `confirmDialog` yang teksnya
 * tampil terbaca. Jadi ia tetap di modal sendiri: fungsi ini cuma pembungkus supaya
 * tombolnya tidak menyimpan state modal di komponen utama yang sudah panjang.
 */
async function resetSandi(id: number, username: string, setSibuk: (v: boolean) => void) {
  const ya = await confirmDialog({
    title: `Reset kata sandi ${username}?`,
    message: 'Kata sandi sementara akan dibuat acak dan ditampilkan SATU KALI. '
      + 'Semua sesi orang ini ikut dihentikan, dan ia harus menggantinya sendiri setelah masuk.',
    confirmLabel: 'Buat kata sandi sementara',
    variant: 'warning',
  });
  if (!ya) return;
  // Dibuat di peramban dengan `crypto.getRandomValues`, bukan diketik admin: kata sandi
  // yang diketik manusia untuk orang lain hampir selalu jadi kata sandi yang dipakai
  // terus. Ia ditampilkan sekali dan tidak disimpan di mana pun selain hash-nya.
  const sandi = sandiAcak();
  setSibuk(true);
  const j = await fetchJson('/api/admin/users', {
    method: 'PATCH', body: JSON.stringify({ id, action: 'reset-password', password: sandi }),
  }) as { ok: boolean; message?: string };
  setSibuk(false);
  if (!j.ok) { toast.error(j.message ?? 'Gagal reset kata sandi.'); return; }
  await confirmDialog({
    title: 'Kata sandi sementara',
    message: `${sandi}\n\nSalin sekarang — kalimat ini tidak bisa ditampilkan lagi. `
      + 'Semua sesi lama sudah dihentikan.',
    confirmLabel: 'Sudah saya salin',
    cancelLabel: 'Tutup',
    variant: 'primary',
  });
}

function sandiAcak(): string {
  const huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const kecil = 'abcdefghijkmnopqrstuvwxyz';
  const angka = '23456789';
  const simbol = '!@#$%&*';
  const semua = huruf + kecil + angka + simbol;
  const n = new Uint32Array(16);
  crypto.getRandomValues(n);
  // Empat huruf pertama menjamin tiap golongan terwakili — `StrongPasswordSchema`
  // menuntut huruf besar, kecil, dan angka, dan kata sandi acak yang kebetulan tidak
  // memenuhinya akan ditolak 400 sesudah admin menekan tombol.
  const wajib = [huruf, kecil, angka, simbol].map((s, i) => s[n[i] % s.length]);
  const sisa = Array.from({ length: 12 }, (_, i) => semua[n[i + 4] % semua.length]);
  return [...wajib, ...sisa].join('');
}

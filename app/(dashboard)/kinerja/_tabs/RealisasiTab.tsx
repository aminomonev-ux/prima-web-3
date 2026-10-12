'use client';
// ─── PRIMA E-Anggaran — Realisasi Tab ──────────────────────────────────────────
// O2: extract dari kinerja-client.tsx renderRealisasiPanel + 5 handler.
// State realisasi (sumber, bulan, rows) TIDAK lokal — di-share dengan CetakTab
// (rekap mode konsumsi realisasiAllRows). Tetap di shell, di-pass via props.

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fetchJson } from '@/lib/shared/api';
import { fmtNumDisplay as fmtNum } from '@/lib/shared/utils';
import { InputNominal } from '@/components/ui/input-nominal';
import type { SumberSSK, RealRow, SskRow, RealInputField } from '../_types';
import { SUMBER_LIST, SSK_THEME, MONTH_SHORT, MONTH_LABELS, recalcAllRealisasi } from '../_utils';
import { exportRealisasiExcel, exportRealisasiPdf } from '../_exports';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import PrimaButton from '@/components/ui/PrimaButton';
import DownloadButton from '@/components/ui/DownloadButton';
import Tip from '@/components/ui/Tip';
import { Wand2, Save, Upload, Equal, History, BarChart3, Lock, LockOpen, Coins, LineChart } from 'lucide-react';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { laporanYatim } from '@/lib/kinerja/rekap';
import { hidrasiDariSsk, hidrasiUlang, petaHidrasi } from '@/lib/kinerja/hidrasi-ssk';
import { bisaSamakan, ringkasSamakan, samakanSatu, samakanSebulan } from '@/lib/kinerja/samakan-target';
import { konfirmasiPenurunan, type JawabanPagar } from '@/lib/kinerja/konfirmasi-simpan';
import {
  gabungBentrok, terapkanPilihanBentrok, kalimatRingkasan, kalimatBelumTersimpan, NAMA_BULAN,
  type HasilBanding, type RingkasBulan, type PelanggaranTertutup,
} from '@/lib/kinerja/banding-realisasi';
import { alasanTolakTutup, alasanTolakBuka, type BulanTertutup } from '@/lib/kinerja/tutup-bulan';
import ImportRealisasiModal from '@/components/kinerja/ImportRealisasiModal';
import RiwayatSimpanModal from '@/components/kinerja/RiwayatSimpanModal';
import VersiPickerKinerja, { type VersiKinerja, type VersiValue } from '@/components/kinerja/VersiPickerKinerja';
import { useLampir, type LampirRealisasiData } from '@/lib/sentinel/lampir-store';
import { uiTheme } from '@/lib/theme';

/** 'YYYY-MM-DD HH:MM:SS' → '12 Okt 2026 10:42'. */
function fmtStempel(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(s);
  return m ? `${Number(m[3])} ${MONTH_SHORT[Number(m[2]) - 1]} ${m[1]} ${m[4]}:${m[5]}` : s;
}

interface Props {
  realisasiSumber: SumberSSK;
  setRealisasiSumber: (s: SumberSSK) => void;
  realisasiBulan: number;
  setRealisasiBulan: (n: number) => void;
  realisasiRows: RealRow[];
  setRealisasiRows: React.Dispatch<React.SetStateAction<RealRow[]>>;
  sskRows: SskRow[];   // untuk initRealisasiFromSSK
  tahun: string;
  canEdit: boolean;
  loadingData: boolean;
  saving: boolean;
  setSaving: React.Dispatch<React.SetStateAction<boolean>>;
  isLight?: boolean;
  // Refactor Versi (Checkpoint C):
  sskVersi: VersiValue;
  /** Ganti versi acuan — lewat penjaga belum-tersimpan shell, karena memuat ulang layar. */
  pilihVersi: (v: VersiValue) => void;
  realVersion: number;       // V3-6 optimistic lock baseline
  setRealVersion: React.Dispatch<React.SetStateAction<number>>;
  refetchReal: () => void;
  /** Isi tersimpan terakhir — pembanding "belum tersimpan" & gabung bentrok. */
  realDasar: RealRow[];
  setRealDasar: React.Dispatch<React.SetStateAction<RealRow[]>>;
  bandingReal: HasilBanding;
  realTertutup: BulanTertutup[];
  setRealTertutup: React.Dispatch<React.SetStateAction<BulanTertutup[]>>;
  ambilRealisasi: (sumber: SumberSSK) => Promise<
    { ok: true; rows: RealRow[]; version: number; tertutup: BulanTertutup[] } | { ok: false; message?: string }>;
  // IK-4 #5: dipicu Rima lewat /kinerja?import=realisasi → buka modal Import sekali.
  autoOpenImport?: boolean;
  onImportConsumed?: () => void;
}

export default function RealisasiTab({
  realisasiSumber, setRealisasiSumber, realisasiBulan, setRealisasiBulan,
  realisasiRows, setRealisasiRows, sskRows, tahun, canEdit, loadingData, saving, setSaving,
  isLight = false, sskVersi, pilihVersi, realVersion, setRealVersion, refetchReal,
  realDasar, setRealDasar, bandingReal, realTertutup, setRealTertutup, ambilRealisasi,
  autoOpenImport = false, onImportConsumed,
}: Props) {
  // ─── Tutup Bulan & belum tersimpan (docs/CONCEPT-kinerja-simpan-realisasi.md) ──
  const tertutupSet = useMemo(() => new Set(realTertutup.map(b => b.bulan)), [realTertutup]);
  const bulanBelum  = useMemo(() => new Set(bandingReal.perBulan.map(x => x.bulan)), [bandingReal]);
  const bulanIniTertutup = tertutupSet.has(realisasiBulan);
  const infoTutupIni = realTertutup.find(b => b.bulan === realisasiBulan) ?? null;
  const namaBulanIni = MONTH_LABELS[realisasiBulan - 1];
  const alasanTutup = alasanTolakTutup([...tertutupSet], realisasiBulan)
    ?? (bulanBelum.has(realisasiBulan) ? `Simpan dulu ketikan ${namaBulanIni} — yang dikunci angka yang TERSIMPAN.` : null);
  const alasanBuka = alasanTolakBuka([...tertutupSet], realisasiBulan);
  // Bulan tertutup hanya-baca di layar juga — pagarnya tetap di server (L82).
  const bisaSunting = canEdit && !bulanIniTertutup;
  // Refactor Versi: list versi yang ada (untuk pill chip)
  const [versiItems,   setVersiItems]   = useState<VersiKinerja[]>([]);
  const [versiLoading, setVersiLoading] = useState(false);
  const [showImport,   setShowImport]   = useState(false);
  const [showRiwayat,  setShowRiwayat]  = useState(false);
  // §23 Lampirkan: hasil parse dari chat Rima (RAM store) → preload modal tanpa unggah ulang.
  const lampir = useLampir();
  const [preload, setPreload] = useState<{ data: LampirRealisasiData; name: string } | null>(null);

  /**
   * Snapshot yang jadi asal isi layar — ikut body Simpan, berhenti di detail
   * audit. WAJIB dilepas di SETIAP jalur lain yang mengganti isi tabel, dan
   * sesudah Simpan berhasil: kalau tertinggal, simpan berikutnya mengaku
   * pulihan padahal bukan.
   */
  const asalPulihkanRef = useRef<{ id: number; disimpan_pada: string } | null>(null);

  // IK-4: terapkan hasil Import (sumber yang sedang dibuka) ke DRAFT realisasi —
  // isi real_keuangan baris SSK pada bulan yang sesuai, lalu recalc turunan.
  // TIDAK menyimpan: user klik "Simpan Semua" (Model A′).
  function applyImport(semua: { ssk_canonical_id: string; bulan_ke: number; realisasi: number; real_fisik?: number }[]) {
    asalPulihkanRef.current = null;
    // Bulan tertutup dilewati DI SINI juga, bukan cuma ditolak server saat Simpan:
    // ditolak belakangan berarti seluruh simpanan gagal karena satu bulan yang
    // memang tidak boleh berubah.
    const items = semua.filter(it => !tertutupSet.has(it.bulan_ke));
    const dilewati = semua.length - items.length;
    if (dilewati > 0) {
      const bulan = [...new Set(semua.filter(it => tertutupSet.has(it.bulan_ke)).map(it => it.bulan_ke))]
        .sort((a, b) => a - b).map(b => MONTH_LABELS[b - 1]);
      toast.info(`${dilewati} baris di bulan yang sudah ditutup (${bulan.join(', ')}) dilewati.`, { duration: 8000 });
    }
    setRealisasiRows(p => recalcAllRealisasi(p.map(r => {
      const hit = items.find(it => it.ssk_canonical_id === r.ssk_canonical_id && it.bulan_ke === r.bulan);
      if (!hit) return r;
      // `real_fisik` hanya ikut pada berkas bentuk 'laporan'. Untuk laporan belanja
      // ia undefined, dan sel yang sudah diisi tangan sengaja tidak disentuh.
      return hit.real_fisik === undefined
        ? { ...r, real_keuangan: hit.realisasi }
        : { ...r, real_keuangan: hit.realisasi, real_fisik: hit.real_fisik };
    })));
  }

  // IK-4 #5: buka modal Import sekali saat datang via ?import=realisasi. Bila ada
  // lampiran dari chat Rima (§23), konsumsi (take) → modal langsung terisi previewnya.
  useEffect(() => {
    if (!autoOpenImport) return;
    if (canEdit) {
      // queueMicrotask: hindari setState sync di effect body (react-hooks/set-state-in-effect)
      queueMicrotask(() => {
        const st = lampir.take();
        if (st?.kind === 'realisasi') setPreload({ data: st.data, name: st.fileName });
        setShowImport(true);
      });
    }
    onImportConsumed?.();
  }, [autoOpenImport, canEdit, onImportConsumed, lampir]);
  useEffect(() => {
    let alive = true;
    queueMicrotask(() => { if (alive) setVersiLoading(true); });
    fetchJson<unknown>(`/api/kinerja/ssk/versi-list?tahun=${tahun}&sumber=${realisasiSumber}`)
      .then(d => { if (alive && d.ok) setVersiItems(((d as unknown as { items: VersiKinerja[] }).items) ?? []); })
      .finally(() => alive && setVersiLoading(false));
    return () => { alive = false; };
  }, [tahun, realisasiSumber]);

  // Versi locked → realisasi yang mengacu ke versi itu jadi read-only (snapshot historis).
  // Input realisasi baru hanya boleh saat acuan = versi aktif terbaru (yg belum locked).
  const activeVersiItem = versiItems.find(i => i.versi_tipe === sskVersi.tipe && i.versi_seq === sskVersi.seq);
  const versiLocked     = !!activeVersiItem?.locked_at;
  const versiLabel      = sskVersi.tipe === 'MURNI' ? 'MURNI' : `PERUBAHAN-${sskVersi.seq}`;
  // Surface/teks dari lib/theme; aksen ungu/pink Kinerja tetap lokal.
  const t = uiTheme(isLight);
  const cSurface     = t.card;
  const cSurfaceForm = isLight ? 'rgba(139,92,246,.06)' : 'rgba(4,44,83,.8)';
  const cBorder      = isLight ? 'rgba(139,92,246,.18)' : '#0C447C';
  const cTextPrimary = t.text;
  const cTextSub     = t.textSub;
  const cTextSubAlt  = t.textSubAlt;
  const cInputBorder = isLight ? 'rgba(139,92,246,.25)' : '#0C447C';
  const cTableHeadBg = isLight ? 'linear-gradient(135deg,rgba(139,92,246,.14),rgba(236,72,153,.10))' : 'rgba(4,44,83,.9)';
  const cRowEven     = t.rowEven;
  const cRowOdd      = t.rowOdd;
  const cBoxShadow   = t.shadow;
  const cBorderHair  = isLight ? '1px solid rgba(139,92,246,.06)' : '1px solid rgba(51,65,85,.06)';
  const cAutoBg      = isLight ? 'rgba(139,92,246,.05)' : 'rgba(12,68,124,.2)';
  const cMonthBarBg  = isLight ? '#F4F5F8' : 'rgba(4,44,83,.6)';
  const theme = SSK_THEME[realisasiSumber];

  // ─── Handlers ────────────────────────────────────────────────────────────
  function updateRealInput(idx: number, field: RealInputField, val: string | number) {
    setRealisasiRows(p => recalcAllRealisasi(p.map((r,i) => i === idx ? { ...r, [field]: val } : r)));
  }

  // ─── Samakan realisasi fisik dengan target bulan ini ──────────────────────
  // Aturannya di lib/kinerja/samakan-target.ts (PURE, diuji perilakunya).
  // Di sini tinggal dialog + toast; bulan yang sedang dibuka saja, bukan
  // akumulasi — kolom akumulasi menyesuaikan sendiri lewat recalcAllRealisasi.

  function samakanBaris(idx: number) {
    setRealisasiRows(p => recalcAllRealisasi(samakanSatu(p, idx)));
  }

  async function samakanBulanIni() {
    if (bulanIniTertutup) return;
    const { kosong, berisi } = ringkasSamakan(realisasiRows, realisasiBulan);
    const namaBulan = MONTH_LABELS[realisasiBulan-1];
    if (kosong === 0) {
      toast.info(berisi > 0
        ? `Semua ${berisi} baris ${namaBulan} yang punya target sudah ada isinya.`
        : `Tidak ada baris ${namaBulan} yang punya target untuk disalin.`);
      return;
    }
    const ok = await confirmDialog({
      title: `Samakan dengan target ${namaBulan}`,
      message: `${kosong} baris akan diisi realisasi fisiknya sama dengan target bulan ini.`
        + (berisi > 0 ? ` ${berisi} baris sudah ada isinya dan tidak akan disentuh.` : '')
        + ' Belum tersimpan sampai Anda menekan Simpan Semua.',
      variant: 'primary',
      confirmLabel: 'Isi sekarang',
    });
    if (!ok) return;
    setRealisasiRows(p => recalcAllRealisasi(samakanSebulan(p, realisasiBulan)));
    toast.success(`${kosong} baris diisi dari target ${namaBulan}.`);
  }

  /** Init 12 bulan dari SSK — bulan Des dibulatkan supaya total 100% tepat. */
  function initRealisasiFromSSK() {
    asalPulihkanRef.current = null;
    if (!sskRows.length) { toast.error('Data SSK kosong. Isi SSK terlebih dahulu.'); return; }
    // Saringan baris acuan (nol-kan, canonical kosong) hidup di petaHidrasi —
    // sama dengan yang dipakai server, jadi bendera `yatim` tidak berbeda
    // pendapat antara layar dan hasil muat ulang.
    const petaSsk = petaHidrasi(sskRows);
    const toAdd: RealRow[] = [];
    // Hitung berapa SSK row yang di-skip karena uraian kosong → kasih warning informatif
    const skippedNoUraian = sskRows.filter(s => !s.uraian.trim()).length;
    // Duplikat diperiksa lewat canonical_id — identitas yang SAMA dengan yang
    // dipakai recalcAllRealisasi untuk mengelompokkan. Dulu diperiksa lewat nama,
    // jadi memperbaiki uraian di SSK lalu Init ulang menambahkan 12 baris baru di
    // samping 12 baris lama yang canonical_id-nya sama → akumulasinya dobel tanpa
    // satu pun peringatan. Nama tinggal cadangan untuk baris lama tanpa canonical.
    const namaBerubah: string[] = [];
    for (let b = 1; b <= 12; b++) {
      for (const s of sskRows) {
        if (!s.uraian.trim()) continue;
        const cid = s.canonical_id || '';
        const exists = cid
          ? realisasiRows.some(r => r.bulan === b && r.ssk_canonical_id === cid)
          : realisasiRows.some(r => r.bulan === b && r.keterangan === s.uraian && r.uraian_ssk === s.uraian_ssk);
        if (exists && cid && b === 1) {
          const lama = realisasiRows.find(r => r.bulan === b && r.ssk_canonical_id === cid);
          if (lama && lama.keterangan !== s.uraian) namaBerubah.push(s.uraian);
        }
        if (!exists) {
          toAdd.push({
            bulan: b,
            // Refactor Versi: link ke SSK canonical_id supaya hydrate work
            ssk_canonical_id: s.canonical_id || '',
            ssk_versi_tipe:   sskVersi.tipe,
            ssk_versi_seq:    sskVersi.seq,
            keterangan:   s.uraian,
            program:      s.program      || '',
            kegiatan:     s.kegiatan     || '',
            subkegiatan:  s.subkegiatan  || '',
            uraian_ssk:   s.uraian_ssk   || '',
            // pagu_awal / target_rp / target_fisik / yatim — rumus yang SAMA dengan
            // server saat hydrate reload (lib/kinerja/hidrasi-ssk.ts), jadi
            // angkanya tidak bergeser sebelum vs sesudah simpan.
            ...hidrasiDariSsk(petaSsk.get(cid), b),
            real_fisik: 0, pct_fisik: 0,
            akum_target_fisik: 0, akum_target_rp: 0, akum_real_fisik: 0, akum_pct_fisik: 0,
            real_keuangan: 0, pct_keuangan: 0, akum_keuangan: 0, akum_pct_keuangan: 0,
            deviasi_fisik: 0, deviasi_keuangan: 0,
          });
        }
      }
    }
    if (toAdd.length === 0) {
      if (skippedNoUraian > 0) {
        toast.error(`${skippedNoUraian} baris SSK belum punya uraian/rekening belanja — isi dulu di SSK ${sskVersi.tipe === 'MURNI' ? 'MURNI' : `PERUBAHAN-${sskVersi.seq}`} baru klik Init ulang.`, { duration: 6000 });
      } else {
        toast.info('Semua data SSK sudah ada di realisasi');
      }
      return;
    }
    setRealisasiRows(p => recalcAllRealisasi([...p, ...toAdd]));
    const itemCount = sskRows.length - skippedNoUraian;
    const msg = `${toAdd.length} baris ditambahkan dari SSK (12 bulan × ${itemCount} item)`;
    toast.success(skippedNoUraian > 0 ? `${msg}. ${skippedNoUraian} item di-skip (uraian kosong).` : msg);
    if (namaBerubah.length > 0) {
      toast.info(
        `${namaBerubah.length} rekening namanya berbeda dengan yang tersimpan di realisasi — barisnya TIDAK digandakan, ` +
        `tapi nama lama masih terpakai: ${namaBerubah.slice(0, 3).join(' · ')}`,
        { duration: 8000 },
      );
    }
  }

  /**
   * Muat snapshot ke layar. TIDAK menulis apa pun — Simpan tetap tombol biasa.
   *
   * Kolom turunan di snapshot (`pagu_awal`, `target_rp`, `yatim`, `akum_*`)
   * dihitung terhadap SSK versi SAAT ITU; kalau sejak itu ada Perubahan, angkanya
   * sudah tidak berlaku. `recalcAllRealisasi` TIDAK menutup itu — ia MEMBACA
   * `pagu_awal` & `target_rp` lalu menghitung persen dan akumulasi dari situ,
   * jadi hidrasi harus jalan lebih dulu (A4).
   *
   * Yang dipertahankan dari foto cuma yang diketik manusia: `real_fisik`,
   * `real_keuangan`, dan jangkarnya `ssk_canonical_id` (L88).
   */
  function pulihkanRealisasi(isi: unknown[], version: number | null, item: { id: number; disimpan_pada: string }) {
    // Dibatalkan, bukan diteruskan dengan 0: angka gembok yang salah membuat
    // Simpan berikutnya ditolak "diubah orang lain" — konflik yang tidak pernah
    // terjadi, dengan sebab yang menyesatkan.
    if (typeof version !== 'number') {
      toast.error('Angka kunci versi tidak terbaca, jadi pemulihan dibatalkan. Coba lagi sebentar lagi.');
      return;
    }
    const pulih = hidrasiUlang(isi as RealRow[], sskRows, sskVersi);
    // Bulan yang sudah ditutup TIDAK ikut dipulihkan — angkanya dikunci, dan memuatnya
    // hanya membuat Simpan berikutnya ditolak seluruhnya.
    const isiBaru = tertutupSet.size === 0 ? pulih : [
      ...realisasiRows.filter(r => tertutupSet.has(r.bulan)),
      ...pulih.filter(r => !tertutupSet.has(r.bulan)),
    ].sort((a, b) => a.bulan - b.bulan);
    setRealisasiRows(recalcAllRealisasi(isiBaru));
    setRealVersion(version);
    asalPulihkanRef.current = { id: item.id, disimpan_pada: item.disimpan_pada };
    const lewat = tertutupSet.size > 0
      ? ` Bulan yang sudah ditutup (${[...tertutupSet].sort((a, b) => a - b).map(b => MONTH_LABELS[b - 1]).join(', ')}) tidak ikut dipulihkan.`
      : '';
    toast.success(`${isi.length} baris dimuat ke layar — belum tersimpan, periksa lalu tekan Simpan.${lewat}`, { duration: lewat ? 9000 : 4000 });
  }

  /**
   * 409 VERSION_CONFLICT: orang lain menyimpan sumber yang sama sementara layar ini
   * diketik. Dulu layar langsung dimuat ulang dan ketikannya terbuang. Kini ketikan
   * (layar vs dasar) dipasang di atas isi terbaru; sel yang diubah dua orang dengan
   * angka berbeda ditanyakan. Tetap BERHENTI DI FORM — tidak menyimpan otomatis (L78);
   * angka kuncinya dari muatan terbaru, bukan yang lama (L77).
   */
  async function gabungSesudahBentrok(d409: { oleh?: string | null; pada?: string | null }) {
    const h = await ambilRealisasi(realisasiSumber);
    if (!h.ok) {
      toast.error('Data realisasi sudah diubah pengguna lain, dan isi terbarunya gagal dimuat. '
        + 'Ketikan Anda masih di layar — coba Simpan lagi sebentar lagi.', { duration: 9000 });
      return;
    }
    const g = gabungBentrok(realDasar, realisasiRows, h.rows, new Set(h.tertutup.map(x => x.bulan)));
    const siapa = d409.oleh ? `${d409.oleh}${d409.pada ? ` (pukul ${d409.pada})` : ''}` : 'Pengguna lain';
    const bagian = [`${siapa} menyimpan realisasi ${realisasiSumber} sementara Anda mengetik`
      + (g.orangLain.length > 0 ? ` — ${kalimatRingkasan(g.orangLain)}.` : '.')];
    if (g.dipasang > 0) bagian.push(`Ketikan Anda (${g.dipasang} baris) sudah dipasang di atas data terbaru dan BELUM tersimpan. Periksa, lalu tekan Simpan lagi.`);
    if (g.tidakBisa.length > 0) {
      const sebab = { hilang: 'barisnya sudah tidak ada', tertutup: 'bulannya baru saja ditutup', 'diubah-orang-lain': 'diubah orang lain' } as const;
      bagian.push(`Tidak bisa dipasang: ${g.tidakBisa.slice(0, 5).map(x => `${x.label} (${NAMA_BULAN[x.bulan - 1]}, ${sebab[x.alasan]})`).join('; ')}`
        + (g.tidakBisa.length > 5 ? `; dan ${g.tidakBisa.length - 5} lainnya.` : '.'));
    }
    let rows = g.rows;
    if (g.bentrok.length > 0) {
      const daftar = g.bentrok.slice(0, 8).map(b =>
        `• ${b.label} — ${NAMA_BULAN[b.bulan - 1]}, ${b.kolom === 'real_keuangan' ? 'real keuangan' : 'real fisik'}: `
        + `Anda ${fmtNum(b.milikSaya)} · tersimpan ${fmtNum(b.tersimpan)}`).join('\n');
      const pakaiSaya = await confirmDialog({
        title:   'Angka yang sama diubah dua orang',
        message: `${bagian.join('\n\n')}\n\n${g.bentrok.length} sel diubah Anda DAN orang lain dengan angka berbeda:\n${daftar}`
          + (g.bentrok.length > 8 ? `\n• dan ${g.bentrok.length - 8} lainnya` : ''),
        confirmLabel: 'Pakai angka saya',
        cancelLabel:  'Pakai angka tersimpan',
        variant:      'warning',
      });
      rows = terapkanPilihanBentrok(rows, g.bentrok, pakaiSaya ? 'saya' : 'tersimpan');
      // Dialognya tidak menyebut ini kalau satu-satunya ketikan justru sel yang bentrok.
      if (pakaiSaya || g.dipasang > 0) {
        toast.info(`${pakaiSaya ? 'Angka Anda dipasang' : 'Angka tersimpan dipertahankan; ketikan Anda yang lain tetap di layar'} — `
          + 'belum tersimpan, tekan Simpan lagi.', { duration: 7000 });
      }
    } else {
      toast.warning(bagian.join(' '), { duration: 12000 });
    }
    setRealisasiRows(recalcAllRealisasi(rows));
    setRealDasar(h.rows);
    setRealVersion(h.version);
    setRealTertutup(h.tertutup);
  }

  /** 409 BULAN_TERTUTUP: tawarkan membuang perubahan di bulan tertutup saja. */
  async function tanganiBulanTertutup(d: { message?: string; pelanggaran?: PelanggaranTertutup[] }) {
    const bulan = [...new Set((d.pelanggaran ?? []).map(p => p.bulan))].sort((a, b) => a - b);
    const nama = bulan.map(b => MONTH_LABELS[b - 1]).join(', ');
    const h = await ambilRealisasi(realisasiSumber);
    if (h.ok) setRealTertutup(h.tertutup);
    const buang = await confirmDialog({
      title:   'Bulan sudah ditutup',
      message: `${d.message ?? ''}\n\nBuang perubahan di ${nama} dan kembalikan ke angka tersimpan? Perubahan di bulan lain tetap di layar.`,
      confirmLabel: `Buang perubahan ${nama}`,
      cancelLabel:  'Biarkan dulu',
      variant:      'warning',
    });
    if (!buang) return;
    const kena = new Set(bulan);
    setRealisasiRows(p => recalcAllRealisasi([
      ...p.filter(r => !kena.has(r.bulan)),
      ...realDasar.filter(r => kena.has(r.bulan)),
    ].sort((a, b) => a.bulan - b.bulan)));
    toast.info(`Perubahan di ${nama} dibuang. Tekan Simpan lagi untuk bulan lainnya.`);
  }

  async function tutupAtauBuka(aksi: 'TUTUP' | 'BUKA') {
    const ok = await confirmDialog(aksi === 'TUTUP' ? {
      title:   `Tutup realisasi ${namaBulanIni}?`,
      message: `Angka realisasi ${namaBulanIni} ${realisasiSumber} ${tahun} dikunci: Simpan tidak bisa lagi mengubahnya `
        + `sampai bulan ini dibuka kembali.\n\nBulan ditutup berurutan, dan yang bisa dibuka hanya bulan tertutup terakhir.`,
      confirmLabel: `Tutup ${namaBulanIni}`,
      variant:      'success',
    } : {
      title:   `Buka kembali ${namaBulanIni}?`,
      message: `Angka realisasi ${namaBulanIni} ${realisasiSumber} ${tahun} bisa diubah lagi lewat Simpan. `
        + `Kalau ${namaBulanIni} sudah dilaporkan, koreksi sesudah ini tidak akan sama dengan laporannya.`,
      confirmLabel: `Buka ${namaBulanIni}`,
      variant:      'warning',
    });
    if (!ok) return;
    const d = await fetchJson<unknown>('/api/kinerja/realisasi/tutup-bulan', {
      method: 'POST',
      body: JSON.stringify({ tahun, sumber: realisasiSumber, bulan: realisasiBulan, aksi }),
    });
    if (d.ok) {
      setRealTertutup((d as unknown as { tertutup: BulanTertutup[] }).tertutup ?? []);
      toast.success(aksi === 'TUTUP' ? `${namaBulanIni} ditutup.` : `${namaBulanIni} dibuka kembali.`);
    } else toast.error(d.message || 'Gagal');
  }

  async function saveRealisasi(force = false) {
    setSaving(true);
    try {
      const rows = recalcAllRealisasi(realisasiRows);
      const d = await fetchJson<unknown>('/api/kinerja/realisasi', {
        method: 'PUT',
        body: JSON.stringify({ tahun, sumber: realisasiSumber, rows, expected_version: realVersion, force,
          asal_pulihkan: asalPulihkanRef.current ?? undefined }),
      });
      const kode = (d as unknown as { code?: string }).code;
      if (d.ok) {
        // Yang benar-benar berubah, bukan "180 baris": Simpan selalu mengirim setahun.
        const j = d as unknown as { tidak_berubah?: boolean; ringkasan?: RingkasBulan[] };
        if (j.tidak_berubah) toast.info('Tidak ada angka yang berubah — tidak ada yang ditulis.');
        else toast.success(`Tersimpan — ${kalimatRingkasan(j.ringkasan ?? [])}`, { duration: 6000 });
        setRealisasiRows(rows); setRealDasar(rows); refetchReal();
        // Sudah tercatat di audit simpan ini; simpan berikutnya bukan lagi pulihan.
        asalPulihkanRef.current = null;
      }
      else if (kode === 'VERSION_CONFLICT') {
        await gabungSesudahBentrok(d as unknown as { oleh?: string | null; pada?: string | null });
      }
      else if (kode === 'BULAN_TERTUTUP') {
        await tanganiBulanTertutup(d as unknown as { message?: string; pelanggaran?: PelanggaranTertutup[] });
      }
      // Pagar simpan: barisnya turun drastis / kosong. Ditanyakan, bukan ditolak
      // buntu — mengosongkan satu sumber dengan sengaja itu pekerjaan yang sah.
      else if ((d as unknown as { code?: string }).code === 'PENURUNAN_DRASTIS') {
        const ok = await konfirmasiPenurunan(`realisasi ${realisasiSumber}`, d as unknown as JawabanPagar);
        if (ok) { setSaving(false); await saveRealisasi(true); return; }
      }
      else toast.error(d.message || 'Gagal menyimpan');
    } finally { setSaving(false); }
  }

  // Layar ini menyunting SATU bulan, jadi unduhannya bulan itu juga — dulu ia
  // mengekspor setahun sementara tabel di bawahnya cuma memperlihatkan sebulan,
  // dan tidak ada apa pun di berkasnya yang menyebutkan bedanya.
  const doExportRealisasiExcel = () => exportRealisasiExcel({ rows: realisasiRows, sumber: realisasiSumber, tahun, bulan: [realisasiBulan] });
  const doExportRealisasiPdf   = () => exportRealisasiPdf  ({ rows: realisasiRows, sumber: realisasiSumber, tahun, bulan: [realisasiBulan] });

  // ─── Render ──────────────────────────────────────────────────────────────
  const bulanRowsWithIdx = realisasiRows
    .map((r, i) => ({ row: r, idx: i }))
    .filter(({ row }) => row.bulan === realisasiBulan);

  // Rekening yatim dilaporkan, bukan didiamkan: uangnya nyata tapi tidak punya
  // pagu sebagai pembagi, jadi rekap Cetak mengeluarkannya dari hitungan.
  //
  // A8: `laporanYatim`, bukan `kumpulkanItem(...).yatim` — spanduk ini cuma
  // butuh bagian yatimnya, dan `kumpulkanItem` sekarang menuntut daftar item SSK
  // yang tidak dipakainya sama sekali. Daftar canonical-nya dari `sskRows`
  // dengan saringan yang SAMA (`petaHidrasi`: nol-kan & canonical kosong
  // dikecualikan), jadi baris yang baru saja dinol-kan di layar sudah terhitung
  // yatim sebelum Simpan — itu memang kabar yang berguna, bukan kejutan.
  const cidAktif = new Set(petaHidrasi(sskRows).keys());
  const yatim = laporanYatim(realisasiRows, cidAktif, 12);

  const inpBase: React.CSSProperties = {
    border:`1px solid ${cInputBorder}`, borderRadius:'5px', padding:'3px 6px',
    fontSize:'12px', color:cTextPrimary, background:cSurface,
  };
  const roCell: React.CSSProperties = {
    padding:'5px 10px', borderBottom:cBorderHair,
    textAlign:'right', color:cTextSub, background:cAutoBg, fontSize:'11px',
  };

  return (
    <div style={{ padding:'20px' }}>
      {/* Sumber selector */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'14px' }}>
        {SUMBER_LIST.map(s => {
          const active = realisasiSumber === s;
          return (
            <button key={s} onClick={() => setRealisasiSumber(s)}
              style={{ padding:'6px 16px', borderRadius:'50px', border:`1.5px solid ${active ? SSK_THEME[s].color : (isLight?'rgba(139,92,246,.25)':'rgba(12,68,124,.5)')}`, fontSize:'11px', fontWeight:700, cursor:'pointer', background: active ? SSK_THEME[s].grad : (isLight?'#FFFFFF':'rgba(4,44,83,.5)'), color: active ? 'white' : SSK_THEME[s].color, boxShadow: active ? `0 3px 10px ${SSK_THEME[s].color}44`:undefined, transition:'all .18s' }}>
              {SSK_THEME[s].label.replace('SSK ','')}
            </button>
          );
        })}
      </div>

      {/* Header bar */}
      <div style={{ background:cSurfaceForm, border:`1px solid ${cBorder}`, borderRadius:'12px', padding:'20px 22px', marginBottom:'18px', display:'flex', flexWrap:'wrap', gap:'10px', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:'13px', fontWeight:700, color:cTextPrimary, display:'flex', flexWrap:'wrap', alignItems:'center', gap:'12px' }}>
            <span>
              <BarChart3 size="1em" style={{ marginRight:'6px', color:theme.color, display:'inline', verticalAlign:'-0.125em' }} />
              Realisasi {realisasiSumber} — {tahun}
            </span>
            <VersiPickerKinerja
              value={sskVersi}
              items={versiItems}
              loading={versiLoading}
              onChange={v => pilihVersi(v)}
              /* onCreatePerubahan disengaja undefined — versi baru dibuat dari SSK, bukan Realisasi */
            />
          </div>
          <div style={{ fontSize:'11px', color:cTextSub, marginTop:'12px' }}>
            {realisasiRows.length} baris total &nbsp;·&nbsp;
            <span style={{ color:theme.color, fontWeight:600 }}>{bulanRowsWithIdx.length} baris bulan ini</span>
            &nbsp;·&nbsp; Acuan: <strong style={{ color:cTextPrimary }}>{versiLabel}</strong>
            {versiLocked && (
              <span style={{ marginLeft:'10px', fontSize:'10px', fontWeight:700, color:'#B45309', background:'rgba(245,158,11,.15)', padding:'2px 8px', borderRadius:'6px', border:'1px solid rgba(245,158,11,.4)' }}>
                <Lock size="1em" style={{ marginRight:'4px', display:'inline', verticalAlign:'-0.125em' }} /> ARSIP (read-only)
              </span>
            )}
          </div>
          {/* Layar menampilkan SATU bulan tapi Simpan mengirim setahun — ketikan di bulan
              lain yang terlupa harus tetap terlihat dari sini. */}
          {bandingReal.adaPerubahan && (
            <div style={{ fontSize:'11px', fontWeight:700, marginTop:'6px', color: isLight?'#854F0B':'#FAC775' }}>
              Belum tersimpan: {kalimatBelumTersimpan(bandingReal.perBulan)}
            </div>
          )}
        </div>
        {canEdit && (
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
            <Tip label={versiLocked ? `Acuan ${versiLabel} sudah diarsipkan, switch ke versi terbaru untuk input baru.` : 'Buat baris untuk semua bulan dari data SSK'}><PrimaButton variant="primary" iconLeft={<Wand2 size={14} />}
              onClick={initRealisasiFromSSK} disabled={versiLocked}>
              Init dari SSK
            </PrimaButton></Tip>
            <Tip label="Tarik realisasi dari file Excel — cocokkan ke keterangan SSK per sumber"><PrimaButton variant="purple" iconLeft={<Upload size={14} />}
              onClick={() => setShowImport(true)} disabled={versiLocked}>
              Import Excel
            </PrimaButton></Tip>
            <Tip label={versiLocked
              ? `Acuan ${versiLabel} sudah diarsipkan, tidak bisa input baru.`
              : bulanIniTertutup
                ? `${namaBulanIni} sudah ditutup — angkanya tidak bisa diubah.`
                : `Isi Real Fisik ${MONTH_LABELS[realisasiBulan-1]} sama dengan targetnya, hanya baris yang masih kosong`}>
              <PrimaButton variant="warning" iconLeft={<Equal size={14} />}
                onClick={samakanBulanIni} disabled={versiLocked || bulanIniTertutup}>
                Samakan Target
              </PrimaButton>
            </Tip>
            <Tip label="Foto tiap klik Simpan — muat salah satunya kembali ke layar"><PrimaButton variant="ghost" iconLeft={<History size={14} />}
              onClick={() => setShowRiwayat(true)}>
              Riwayat Simpan
            </PrimaButton></Tip>
            <Tip label={versiLocked ? `Acuan ${versiLabel} sudah diarsipkan, tidak bisa simpan input baru.` : ''}><PrimaButton menulis variant="success" iconLeft={<Save size={14} />}
              onClick={() => saveRealisasi()} disabled={saving || versiLocked}>
              {saving ? 'Menyimpan...' : 'Simpan Semua'}
            </PrimaButton></Tip>
            <DownloadButton variant="excel" label="Excel" onClick={doExportRealisasiExcel} disabled={bulanRowsWithIdx.length === 0} />
            <DownloadButton variant="pdf" label="PDF" onClick={doExportRealisasiPdf} disabled={bulanRowsWithIdx.length === 0} />
          </div>
        )}
      </div>

      {yatim.jumlahBaris > 0 && (
        <div style={{ marginBottom:'14px', padding:'10px 14px', borderRadius:'10px', fontSize:'11px', lineHeight:1.6,
          background: isLight?'#FEF3C7':'rgba(245,158,11,.14)', border:'1px solid #FAC775', color: isLight?'#854F0B':'#FAC775' }}>
          <strong>{yatim.jumlahItem} rekening tidak ada di SSK {versiLabel}</strong> ({yatim.jumlahBaris} baris,
          realisasi keuangan {fmtNum(yatim.nominal)}). Pagu &amp; targetnya 0 sehingga persennya tidak bisa dihitung, dan
          baris ini <strong>tidak ikut</strong> dijumlah di rekap Cetak. {yatim.contoh.join(' · ')}
        </div>
      )}

      {showImport && (
        <ImportRealisasiModal tahun={tahun} currentSumber={realisasiSumber} isLight={isLight}
          preload={preload?.data} preloadName={preload?.name}
          onApply={applyImport} onClose={() => { setShowImport(false); setPreload(null); }} />
      )}

      {showRiwayat && (
        <RiwayatSimpanModal jenis="REALISASI" tahun={tahun} sumber={realisasiSumber}
          barisSekarang={realisasiRows.length} isLight={isLight}
          onPulihkan={pulihkanRealisasi} onClose={() => setShowRiwayat(false)} />
      )}

      {/* Month tabs */}
      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', marginTop:'6px', marginBottom:'16px', background:cMonthBarBg, borderRadius:'10px', padding:'10px 8px' }}>
        {MONTH_SHORT.map((label, i) => {
          const b = i + 1;
          const active = realisasiBulan === b;
          const count = realisasiRows.filter(r => r.bulan === b).length;
          const tutup = tertutupSet.has(b);
          const belum = bulanBelum.has(b);
          return (
            <button key={b} onClick={() => setRealisasiBulan(b)}
              data-tooltip={[tutup ? 'Sudah ditutup' : '', belum ? 'Ada ketikan belum tersimpan' : ''].filter(Boolean).join(' · ') || undefined}
              style={{
              flex:'1 0 auto', minWidth:'52px', padding:'5px 6px', borderRadius:'7px', border:'none',
              cursor:'pointer', fontSize:'11px', fontWeight: active ? 800 : 600,
              background: active ? theme.color : (isLight?'#FFFFFF':'rgba(4,44,83,.5)'),
              color: active ? 'white' : cTextSubAlt,
              boxShadow: active ? `0 2px 8px ${theme.color}44` : '0 1px 3px rgba(0,0,0,.06)',
              transition:'all .15s', position:'relative',
            }}>
              {tutup && <Lock size={10} style={{ display:'inline', verticalAlign:'-0.05em', marginRight:'3px' }} />}
              {label}
              {belum && (
                <span aria-label="belum tersimpan" style={{
                  position:'absolute', top:'-3px', left:'-3px', width:'9px', height:'9px', borderRadius:'50%',
                  background:'#EF9F27', border:`2px solid ${isLight?'#FFFFFF':'#020F1C'}`,
                }} />
              )}
              {count > 0 && (
                <span style={{
                  position:'absolute', top:'-4px', right:'-3px',
                  background: active ? 'white' : theme.color,
                  color: active ? theme.color : 'white',
                  borderRadius:'8px', fontSize:'9px', fontWeight:800,
                  padding:'0 4px', lineHeight:'14px', minWidth:'14px', textAlign:'center',
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tutup Bulan — per sumber, berurutan (lib/kinerja/tutup-bulan.ts) */}
      {bulanIniTertutup ? (
        <div className="kn-tutup kn-tutup-terkunci">
          <Lock size={14} style={{ flexShrink:0 }} />
          <span>
            <strong>{namaBulanIni} {tahun} sudah ditutup</strong>
            {infoTutupIni && <> oleh {infoTutupIni.ditutup_oleh ?? 'pengguna yang sudah dihapus'}, {fmtStempel(infoTutupIni.ditutup_pada)}</>}.
            {' '}Angkanya tidak bisa diubah — buka dulu bulan ini kalau memang perlu dikoreksi.
          </span>
          {canEdit && (
            <Tip label={alasanBuka ?? `Angka ${namaBulanIni} bisa diubah lagi lewat Simpan`}>
              <PrimaButton menulis variant="warning" iconLeft={<LockOpen size={14} />}
                onClick={() => tutupAtauBuka('BUKA')} disabled={!!alasanBuka}>
                Buka {namaBulanIni}
              </PrimaButton>
            </Tip>
          )}
        </div>
      ) : canEdit && (
        <div className="kn-tutup">
          <span>
            {tertutupSet.size > 0
              ? <>Tertutup s/d <strong>{MONTH_LABELS[Math.max(...tertutupSet) - 1]}</strong>. </>
              : <>Belum ada bulan yang ditutup. </>}
            Menutup bulan mengunci angka realisasinya supaya tidak berubah sesudah dilaporkan.
          </span>
          <Tip label={alasanTutup ?? `Kunci angka realisasi ${namaBulanIni} ${realisasiSumber}`}>
            <PrimaButton menulis variant="success" iconLeft={<Lock size={14} />}
              onClick={() => tutupAtauBuka('TUTUP')} disabled={!!alasanTutup}>
              Tutup {namaBulanIni}
            </PrimaButton>
          </Tip>
        </div>
      )}

      {/* Info: editable vs auto columns */}
      <div style={{ display:'flex', gap:'12px', marginBottom:'10px', fontSize:'11px' }}>
        <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
          <span style={{ width:'10px', height:'10px', background:cSurface, border:`1.5px solid ${cInputBorder}`, borderRadius:'3px', display:'inline-block' }} />
          <span style={{ color:cTextSubAlt, fontWeight:600 }}>Input manual (5 kolom)</span>
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:'4px' }}>
          <span style={{ width:'10px', height:'10px', background:cAutoBg, border:`1px solid ${cBorder}`, borderRadius:'3px', display:'inline-block' }} />
          <span style={{ color:cTextSub }}>Otomatis dihitung (9 kolom)</span>
        </span>
      </div>

      {loadingData ? (
        <TableSkeleton rows={5} cols={canEdit ? 16 : 15} />
      ) : (
        <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', overflowX:'auto', boxShadow:cBoxShadow }}>
          <table style={{ minWidth:'max-content', borderCollapse:'collapse', fontSize:'11px', width:'100%' }}>
            <thead>
              <tr>
                {['No','Keterangan','Pagu','Target Fisik','Real Fisik','Real Keuangan'].map(h => (
                  <th key={h} style={{ padding:'8px 10px', borderBottom:`2px solid ${cBorder}`, fontWeight:700, fontSize:'10px', textTransform:'uppercase', letterSpacing:'.03em', color: isLight?'#5B21B6':'#E6F1FB', whiteSpace:'nowrap', background:cTableHeadBg, textAlign: h==='No'?'center':'left' }}>{h}</th>
                ))}
                {['% Fisik','Akum Tgt Fisik','Akum Real Fisik','Akum % Fisik','% Real Keu','Akum Keu','Akum % Keu','Dev Fisik %','Dev Keuangan %'].map(h => (
                  <th key={h} style={{ padding:'8px 10px', borderBottom:`2px solid ${cBorder}`, fontWeight:700, fontSize:'10px', textTransform:'uppercase', letterSpacing:'.03em', color:cTextSub, whiteSpace:'nowrap', background:cAutoBg, textAlign:'right' }}>
                    {h}<span style={{ display:'block', fontSize:'8px', fontWeight:500, color:cTextSub, letterSpacing:0 }}>otomatis</span>
                  </th>
                ))}
                {canEdit && <th style={{ padding:'8px 10px', borderBottom:`2px solid ${cBorder}`, background: isLight?'rgba(255,255,255,.95)':'rgba(4,44,83,.95)', textAlign:'center', fontWeight:700, fontSize:'10px', textTransform:'uppercase', color: isLight?'#5B21B6':'#E6F1FB', position:'sticky', right:0, zIndex:2 }}>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {bulanRowsWithIdx.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 16 : 15} style={{ padding:'32px', textAlign:'center', color:cTextSub }}>
                    Belum ada data untuk {MONTH_LABELS[realisasiBulan-1]}.
                    {canEdit && (
                      <span> Klik <strong>&quot;Init dari SSK&quot;</strong> untuk tarik semua item × 12 bulan.</span>
                    )}
                  </td>
                </tr>
              )}
              {bulanRowsWithIdx.map(({ row, idx }, ri) => (
                <tr key={idx} style={{ background: ri%2===0 ? cRowEven : cRowOdd }}>
                  <td style={{ padding:'5px 8px', borderBottom:cBorderHair, textAlign:'center', color:cTextSub, fontWeight:600 }}>{ri+1}</td>
                  <td style={{ padding:'5px 6px', borderBottom:cBorderHair }}>
                    <span style={{ fontWeight:500, color:cTextPrimary, fontSize:'12px' }}>{row.keterangan || '-'}</span>
                  </td>
                  <td style={{ padding:'5px 6px', borderBottom:cBorderHair, textAlign:'right' }}>
                    <span style={{ color:cTextPrimary, fontSize:'12px' }}>{fmtNum(row.pagu_awal)}</span>
                  </td>
                  <td style={{ padding:'5px 6px', borderBottom:cBorderHair, textAlign:'right' }}>
                    <span style={{ color:cTextSub, fontSize:'12px' }}>{(row.target_fisik||0).toFixed(2)}%</span>
                  </td>
                  <td style={{ padding:'3px 6px', borderBottom:cBorderHair }}>
                    {bisaSunting
                      ? (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:'4px' }}>
                          <InputNominal value={row.real_fisik||0} onChange={v => updateRealInput(idx,'real_fisik',v)}
                            style={{ ...inpBase, width:'110px', textAlign:'right', borderColor: isLight?'#10b981':'#86efac' }} />
                          {bisaSamakan(row) && (
                            <button
                              type="button"
                              onClick={() => samakanBaris(idx)}
                              data-tooltip={`Isi dengan target ${MONTH_LABELS[realisasiBulan-1]}: Rp ${fmtNum(row.target_rp)}`}
                              className="rl-samakan"
                              aria-label={`Samakan realisasi fisik dengan target ${MONTH_LABELS[realisasiBulan-1]}`}
                              style={{
                                display:'inline-flex', alignItems:'center', justifyContent:'center',
                                width:'24px', height:'24px', flex:'0 0 auto', cursor:'pointer',
                                borderRadius:'6px', border:`1px solid ${isLight?'rgba(139,92,246,.35)':'#0C447C'}`,
                                background: isLight?'#FFFFFF':'rgba(4,44,83,.6)', color: isLight?'#6D28D9':'#85B7EB',
                              }}>
                              <Equal size={12} />
                            </button>
                          )}
                        </span>
                      )
                      : <span style={{ color: isLight?'#15803D':'#16a34a', fontWeight:700 }}>{fmtNum(row.real_fisik)}</span>}
                  </td>
                  <td style={{ padding:'3px 6px', borderBottom:cBorderHair }}>
                    {bisaSunting
                      ? <InputNominal value={row.real_keuangan||0} onChange={v => updateRealInput(idx,'real_keuangan',v)}
                          style={{ ...inpBase, width:'120px', textAlign:'right', borderColor: isLight?'#10b981':'#86efac' }} />
                      : <span style={{ color: isLight?'#15803D':'#16a34a', fontWeight:700 }}>{fmtNum(row.real_keuangan)}</span>}
                  </td>
                  <td style={{ ...roCell, color: row.pct_fisik>=100?'#16a34a':row.pct_fisik>=50?'#f59e0b':'#dc2626', fontWeight:700 }}>{row.pct_fisik.toFixed(2)}%</td>
                  <td style={{ ...roCell, fontWeight:700 }}>{row.akum_target_fisik.toFixed(2)}%</td>
                  <td style={{ ...roCell }}>{fmtNum(row.akum_real_fisik)}</td>
                  <td style={{ ...roCell, color: row.akum_pct_fisik>=100?'#16a34a':row.akum_pct_fisik>=50?'#f59e0b':'#dc2626', fontWeight:700 }}>{row.akum_pct_fisik.toFixed(2)}%</td>
                  <td style={{ ...roCell, color: row.pct_keuangan>=100?'#16a34a':row.pct_keuangan>=50?'#f59e0b':'#dc2626', fontWeight:700 }}>{row.pct_keuangan.toFixed(2)}%</td>
                  <td style={{ ...roCell }}>{fmtNum(row.akum_keuangan)}</td>
                  <td style={{ ...roCell, color: row.akum_pct_keuangan>=100?'#16a34a':row.akum_pct_keuangan>=50?'#f59e0b':'#dc2626', fontWeight:700 }}>{row.akum_pct_keuangan.toFixed(2)}%</td>
                  <td style={{ ...roCell, color: row.deviasi_fisik>=0?'#16a34a':'#dc2626', fontWeight:600 }}>{row.deviasi_fisik.toFixed(2)}%</td>
                  <td style={{ ...roCell, color: row.deviasi_keuangan>=0?'#16a34a':'#dc2626', fontWeight:600 }}>{row.deviasi_keuangan.toFixed(2)}%</td>
                  {canEdit && (
                    <td style={{ padding:'5px 8px', borderBottom:cBorderHair, textAlign:'center', position:'sticky', right:0, zIndex:1, background: ri%2===0 ? cRowEven : cRowOdd }}>
                      <Tip label="Hapus realisasi dimatikan untuk menjaga integritas histori. Untuk menonaktifkan item, Nol-kan target di SSK Perubahan."><button
                        disabled
                        onClick={() => toast.info('Hapus dimatikan. Nol-kan target SSK Perubahan kalau ingin menonaktifkan item.')}
                        style={{ padding:'3px 10px', borderRadius:'6px', border:'1.5px solid rgba(226,75,74,.35)', background:'rgba(226,75,74,.06)', cursor:'not-allowed', fontSize:'12px', fontWeight:700, color: isLight?'#B91C1C':'#FCA5A5', opacity:.4 }}>
                        🗑
                      </button></Tip>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Summary cards: Total Realisasi bulan ini + S/D ─────────────── */}
      {!loadingData && bulanRowsWithIdx.length > 0 && (() => {
        const totalBulan = bulanRowsWithIdx.reduce((s, { row }) => s + (row.real_keuangan || 0), 0);
        const totalSd    = bulanRowsWithIdx.reduce((s, { row }) => s + (row.akum_keuangan  || 0), 0);
        const cardBase: React.CSSProperties = {
          background: cSurface, border: `1px solid ${cBorder}`,
          borderRadius: '8px', padding: '8px 12px', boxShadow: cBoxShadow,
          display:'flex', alignItems:'center', gap:'10px',
        };
        return (
          <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginTop:'10px', justifyContent:'center' }}>
            <div style={{ ...cardBase, borderLeft:`3px solid ${theme.color}` }}>
              <Coins size={12} style={{ color:theme.color, flexShrink:0 }} />
              <div style={{ display:'flex', flexDirection:'column', lineHeight:1.2 }}>
                <span style={{ fontSize:'9px', fontWeight:700, color:cTextSub, textTransform:'uppercase', letterSpacing:'.04em' }}>
                  Total Real. Keuangan — {MONTH_LABELS[realisasiBulan-1]}
                </span>
                <span style={{ fontSize:'13px', fontWeight:800, color:cTextPrimary, fontFamily:'JetBrains Mono, monospace', marginTop:'2px' }}>
                  Rp {new Intl.NumberFormat('id-ID').format(Math.round(totalBulan))}
                </span>
              </div>
            </div>
            <div style={{ ...cardBase, borderLeft:'3px solid #10B981' }}>
              <LineChart size={12} style={{ color:'#10B981', flexShrink:0 }} />
              <div style={{ display:'flex', flexDirection:'column', lineHeight:1.2 }}>
                <span style={{ fontSize:'9px', fontWeight:700, color:cTextSub, textTransform:'uppercase', letterSpacing:'.04em' }}>
                  Total Real. Keuangan S/D {MONTH_LABELS[realisasiBulan-1]}
                </span>
                <span style={{ fontSize:'13px', fontWeight:800, color: isLight?'#047857':'#34D399', fontFamily:'JetBrains Mono, monospace', marginTop:'2px' }}>
                  Rp {new Intl.NumberFormat('id-ID').format(Math.round(totalSd))}
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

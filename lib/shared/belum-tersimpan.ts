'use client'
// lib/shared/belum-tersimpan.ts — pengingat "belum tersimpan" sebelum halaman ditinggalkan.
//
// Ada TIGA pintu keluar dan ketiganya bekerja dengan mekanisme yang berbeda,
// jadi satu jaring saja tidak cukup:
//
//   1. Muat ulang / tutup tab / tombol Keluar  → `beforeunload`. Tombol Keluar
//      ikut tertangkap karena shell memakai `window.location.href`, yang memang
//      membongkar dokumen.
//   2. Pindah menu lewat <Link>                → klik dicegat di fase CAPTURE.
//      `beforeunload` tidak berbunyi untuk navigasi App Router — tidak ada
//      dokumen yang dibongkar, jadi peramban tidak punya alasan bertanya.
//   3. Tombol shell yang memanggil router.push → `bolehTinggalkanHalaman()`.
//      Tombol bukan <a href>, jadi jaring nomor 2 tidak melihatnya.
//
// Dipakai layar DPA & Pergeseran BLUD, yang sejak L78 menahan hasil impor /
// Form Baru / Salin Tahun / Pulihkan di FORM sampai Simpan ditekan. Sebelum ini
// pekerjaan sebesar 558 baris bisa lenyap hanya karena satu klik menu.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { confirmDialog } from '@/components/ui/ConfirmDialog'

// Modul-scope, SENGAJA bukan React context: yang bertanya (`blud-shell`) berada
// di ATAS layar yang memegang isian, jadi tidak ada provider yang bisa
// membungkus keduanya tanpa mengangkat state form ke shell.
let pesanAktif: string | null = null

/** Pesan kalau ada isian yang belum tersimpan di layar aktif, `null` kalau aman. */
export function alasanBelumTersimpan(): string | null {
  return pesanAktif
}

/**
 * Dipanggil tombol navigasi yang BUKAN `<a href>` — di BLUD: "Menu", "Ganti
 * Password", dan "Keluar" di `blud-shell`. Memulangkan true kalau boleh lanjut.
 *
 * Khusus Keluar, ini WAJIB dipanggil sebelum sesi dimatikan: kalau urutannya
 * terbalik, menjawab "tetap di sini" meninggalkan orang di halaman yang
 * sesinya sudah mati — Simpan berikutnya ditolak 401 dan isiannya tetap hilang.
 */
export async function bolehTinggalkanHalaman(): Promise<boolean> {
  if (!pesanAktif) return true
  return confirmDialog({
    title:        'Tinggalkan halaman ini?',
    message:      pesanAktif,
    confirmLabel: 'Tinggalkan, buang isian',
    cancelLabel:  'Tetap di sini',
    variant:      'danger',
  })
}

/**
 * @param alasan kalimat yang dibacakan saat orang mau pergi, atau `null` kalau
 *               tidak ada yang perlu dijaga (sudah tersimpan / layar kosong).
 */
export function useIngatkanBelumTersimpan(alasan: string | null) {
  const router = useRouter()

  useEffect(() => {
    pesanAktif = alasan
    if (!alasan) return () => { pesanAktif = null }

    // Teksnya diabaikan peramban modern — yang penting dialognya muncul.
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }

    const onClick = (e: MouseEvent) => {
      // Klik yang memang bukan navigasi biasa dibiarkan lewat: tombol tengah,
      // Ctrl/Cmd-klik (tab baru — halaman ini tidak ditinggalkan), dan klik yang
      // sudah dibatalkan penangan lain.
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      let tujuan: URL
      try { tujuan = new URL(a.href, window.location.href) } catch { return }
      if (tujuan.origin !== window.location.origin) return
      // Tautan ke halaman ini sendiri (jangkar, ?query) tidak membuang apa pun.
      if (tujuan.pathname === window.location.pathname) return

      // Fase capture pada `document` mendahului penangan React di akar aplikasi,
      // jadi Next.js belum sempat memulai transisinya saat kita membatalkannya.
      // `confirmDialog` itu async dan klik tidak bisa ditahan, jadi navigasinya
      // SELALU dibatalkan dulu lalu diulang sendiri kalau jawabannya "ya".
      e.preventDefault()
      e.stopPropagation()
      void (async () => {
        if (!(await bolehTinggalkanHalaman())) return
        pesanAktif = null   // jangan ditanya dua kali di tengah transisi
        router.push(tujuan.pathname + tujuan.search)
      })()
    }

    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      pesanAktif = null
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [alasan, router])
}

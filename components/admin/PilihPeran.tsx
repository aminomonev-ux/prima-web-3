'use client'
// components/admin/PilihPeran.tsx — dropdown ubah peran, SATU untuk semua layar.
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §5.4 (T-8, Tahap 6 / D1).
//
// T-8: `doChangeRole` di Usulan memanggil endpoint yang SAMA PERSIS dengan Admin Panel
// (`PATCH /api/admin/users`, `action='ubah-role'`) — langsung pada `onChange` dropdown.
// Tanpa konfirmasi, tanpa penanda kuota, dan tanpa peringatan bahwa perkecualian akses
// menu orang itu akan ikut terhapus dan probation promosinya dibatalkan. Ketiganya ADA
// di Admin Panel. Satu aksi berdampak sama, dua tingkat kehati-hatian — dan yang lebih
// longgar justru yang lebih sering dipakai sehari-hari.
//
// Yang menutupnya bukan "menyalin kalimatnya ke Usulan", melainkan satu komponen dipakai
// dua layar. Dua salinan kalimat pasti berbeda bunyi begitu salah satu disunting — L78,
// dan itu sudah tiga kali terjadi di modul BLUD.
//
// Berkas ini DAUN: nol impor server. Ia dibaca dua komponen `'use client'` di dua modul
// berbeda, dan satu impor yang menyeret mysql2 akan merobohkan keduanya (preseden Tahap 5,
// lihat kepala `lib/admin/pintu-akses.ts`).

import { useEffect, useState } from 'react'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { ROLE_LABELS, ROLE_GROUPS_OPTIONS } from '@/lib/constants'

export type StatKuota = { role: string; count: number; quota: number; full: boolean }

// ─── Kuota: satu pemuatan, dipakai bersama ───────────────────────────────────
// Endpointnya ber-rate-limit (60/menit per orang) dan jawabannya sama untuk semua
// dropdown di layar. Yang disimpan JANJI-nya, bukan hasilnya — kalau yang disimpan
// hasilnya, sepuluh dropdown yang lahir bersamaan menembak sepuluh kali sebelum yang
// pertama sempat mengisi cache (pola `lewatCache` di `lib/data/menu-access.ts`).
const TTL_MS = 30_000
let kotak: { isi: Promise<StatKuota[]>; kedaluwarsa: number } | null = null

function ambilStat(): Promise<StatKuota[]> {
  if (kotak && kotak.kedaluwarsa > Date.now()) return kotak.isi
  const janji = fetch('/api/admin/role-quota-stats')
    .then((r) => r.json())
    .then((j: { ok?: boolean; data?: StatKuota[] }) => (j.ok && j.data ? j.data : []))
  kotak = { isi: janji, kedaluwarsa: Date.now() + TTL_MS }
  // Kegagalan jangan mengendap: jaringan putus sedetik akan membuat seluruh dropdown
  // kehilangan penanda kuotanya selama setengah menit.
  janji.catch(() => { kotak = null })
  return janji
}

/** Buang cache — dipanggil sesudah peran benar-benar berubah, supaya angkanya ikut. */
export function segarkanStatKuota(): void {
  kotak = null
}

export function useStatKuota(): StatKuota[] {
  const [stat, setStat] = useState<StatKuota[]>([])
  useEffect(() => {
    let hidup = true
    void ambilStat().then((s) => { if (hidup) setStat(s) })
    return () => { hidup = false }
  }, [])
  return stat
}

/** `Renbang (1/3)` · `Admin Staff (6/6 — penuh)` · peran tanpa kuota tanpa penanda. */
export function labelPeran(role: string, stat?: StatKuota): string {
  const nama = ROLE_LABELS[role] ?? role
  if (!stat || stat.quota <= 0) return nama
  return `${nama} (${stat.count}/${stat.quota}${stat.full ? ' — penuh' : ''})`
}

// ─── Konfirmasi ──────────────────────────────────────────────────────────────

/**
 * `users.probationary_until` masih berlaku?
 *
 * Tinggal di sini, bukan di layar pemanggilnya, karena kalimat yang memakainya juga di
 * sini — dan dua layar yang menghitungnya sendiri akan berbeda pendapat pada hari salah
 * satunya lupa membandingkan dengan jam sekarang (L88).
 *
 * Pusat Akses TIDAK memakainya: di sana jawabannya sudah datang dari server lewat SQL
 * (`berkasOrang`), yang lebih benar karena tidak bergantung pada jam peramban. Fungsi
 * ini untuk pemanggil yang cuma memegang stempel mentahnya.
 */
export function masihProbation(sampai: string | null | undefined): boolean {
  return sampai != null && new Date(sampai).getTime() > Date.now()
}

export type FaktaUbahPeran = {
  username: string
  dari: string
  ke: string
  /** Perkecualian akses menu yang akan ikut dibuang. 0 = tidak disebut sama sekali. */
  jumlahPerkecualian?: number
  /** Masa percobaan promosi yang sedang berjalan akan dibatalkan. */
  probationAktif?: boolean
  stat?: StatKuota
}

/**
 * Satu kalimat untuk dua layar. Yang disebut cuma yang BENAR-BENAR terjadi pada orang
 * ini — peringatan yang selalu muncul, termasuk saat tidak ada perkecualian dan tidak
 * ada probation, melatih orang menekan "Ya" tanpa membaca. Itu yang membuat dialog
 * berikutnya, yang memang penting, ikut tidak terbaca.
 */
export async function konfirmasiUbahPeran(f: FaktaUbahPeran): Promise<boolean> {
  const baris: string[] = [
    `${f.username}: ${ROLE_LABELS[f.dari] ?? f.dari} → ${ROLE_LABELS[f.ke] ?? f.ke}.`,
  ]
  if (f.jumlahPerkecualian) {
    baris.push(
      `${f.jumlahPerkecualian} pengaturan menu khusus miliknya ikut dibuang — `
      + 'perkecualian diberikan untuk jabatan tertentu, bukan untuk orangnya.',
    )
  }
  if (f.probationAktif) {
    baris.push('Masa percobaan promosi yang sedang berjalan dibatalkan; peran baru ini yang berlaku.')
  }
  if (f.stat && f.stat.quota > 0) {
    baris.push(`Kuota ${ROLE_LABELS[f.ke] ?? f.ke} sesudahnya: ${f.stat.count + 1}/${f.stat.quota}.`)
  }
  baris.push('Sesi orang ini TIDAK diputus — peran barunya berlaku dalam satu menit tanpa ia perlu keluar.')

  return confirmDialog({
    title: 'Ubah peran?',
    message: baris.join('\n\n'),
    confirmLabel: 'Ubah peran',
    cancelLabel: 'Batal',
    variant: 'warning',
  })
}

// ─── Dropdown ────────────────────────────────────────────────────────────────

type Props = {
  nilai: string
  onGanti: (role: string) => void
  stat: StatKuota[]
  /** Peran yang sedang dipegang — opsinya tidak pernah dimatikan walau kuotanya penuh. */
  peranSekarang?: string
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

export default function PilihPeran({
  nilai, onGanti, stat, peranSekarang, disabled, className, style,
}: Props) {
  const peta = new Map(stat.map((s) => [s.role, s]))
  return (
    <select
      className={className} style={style} value={nilai} disabled={disabled}
      onChange={(e) => onGanti(e.target.value)}
    >
      {ROLE_GROUPS_OPTIONS.map((g) => (
        <optgroup key={g.label} label={`── ${g.label} ──`}>
          {g.roles.filter((r) => r !== 'SUPER_ADMIN').map((r) => {
            const s = peta.get(r)
            // Opsi penuh dimatikan, KECUALI peran yang sedang dipegang: kuota dihitung
            // `COUNT(*) WHERE role = ? AND status = 'AKTIF'`, jadi angka itu SUDAH
            // memuat orang ini. Mematikan opsinya sendiri membuat dropdown-nya tidak
            // bisa menampilkan keadaan sekarang (bentuk yang sama dengan T-7).
            const mati = Boolean(s?.full) && r !== peranSekarang
            return (
              <option key={r} value={r} disabled={mati}>
                {labelPeran(r, s)}
              </option>
            )
          })}
        </optgroup>
      ))}
    </select>
  )
}

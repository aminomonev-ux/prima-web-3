'use client'

// components/sentinel/RimaChat.tsx — Mode Chat RIMA F2 (CONCEPT §5 + §9b).
// Otak 100% lokal-deterministik: engine + KB + model.json di-dynamic-import saat
// tab Chat pertama dibuka (§9c lazy-load) — nol network, nol endpoint (G9/G16).
// G4: input plain-text ≤300 char (render via text node, tanpa innerHTML).
// G13: riwayat hanya di memori komponen — hilang saat sesi/tab browser ditutup.
// A5 kandidat + M3 alsoAsked + B1 memori topik pendek + B5 efek mengetik +
// D2 fail-log localStorage (FIFO 30, §9c). F3: chip tur (start/resume §6b-6) +
// intent locate "di mana X" → micro-tour (§6b-4); navigasi lintas halaman
// SELALU lewat link yang diklik user (G1).

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { findAnchorByLabel } from '@/lib/sentinel/anchors'
import { tryCalc } from '@/lib/sentinel/calc.mjs'
import { resolveNav, navAccessOf, listOpenable, NAV_MODULES, type NavModule, type NavSnapshot } from '@/lib/sentinel/nav'
import { moduleMenusFor } from '@/lib/sentinel/module-menus'
import { ROLE_LABELS } from '@/lib/constants'
import { getProfile, patchProfile } from '@/lib/sentinel/profile'
import { useLampir, type LampirStash } from '@/lib/sentinel/lampir-store'
import { redactPii } from '@/lib/sentinel/redact'
import { detectRimaDataQuery, fetchRimaData, formatRimaAnswer, hasDataSignalNoModule, mergeWithContext, type RimaQuery } from '@/lib/sentinel/data-query'
import type { RimaTourApi } from './SentinelBot'
import type { RimaReaction } from './RimaAvatar'
import type { RimaModel } from '@/lib/sentinel/nlu/engine.mjs'
import type { RimaAnswerSet, RimaChip } from '@/lib/sentinel/knowledge.mjs'

const INPUT_MAX = 300
const HISTORY_CAP = 50
const FAIL_LOG_KEY = 'rima:fail-log'
const FAIL_LOG_CAP = 30

interface ChatChip extends RimaChip {
  /** Diisi = jawab intent ini langsung (chip kandidat A5 / alsoAsked M3) */
  intent?: string
  /** Mulai tur dari langkah ini (alur resume §6b-6). */
  tourFrom?: number
  /** Link halaman — dirender <Link>, user yang klik (G1). */
  href?: string
  /** B4 onboarding — aksi lokal (lewati tutorial / tampilkan apa yang baru). */
  action?: 'skip-tutorial' | 'whats-new'
  /** F5c — tunjuk anchor (id) di layar lewat micro-tour locate. */
  locate?: string
  /** RAL-2 — telemetri CANDIDATE_PICK saat chip diklik (label implisit training). */
  pick?: { q: string; intent: string }
}

interface ChatMsg {
  id: number
  who: 'rima' | 'user'
  text: string
  chips?: ChatChip[]
  /** RAL-2 — jawaban yang bisa dinilai 👍/👎 (pertanyaan asal + intent terjawab). */
  fb?: { q: string; intent: string }
}

interface Nlu {
  classify: typeof import('@/lib/sentinel/nlu/engine.mjs').classify
  kb: typeof import('@/lib/sentinel/knowledge.mjs')
  model: RimaModel
  keywords: Record<string, string[]>
}

// Singleton — model & KB dimuat sekali per sesi browser, dipakai semua render
let nluPromise: Promise<Nlu> | null = null
function loadNlu(): Promise<Nlu> {
  if (!nluPromise) {
    nluPromise = Promise.all([
      import('@/lib/sentinel/nlu/engine.mjs'),
      import('@/lib/sentinel/knowledge.mjs'),
      import('@/lib/sentinel/model.json'),
    ]).then(([engine, kb, modelMod]) => ({
      classify: engine.classify,
      kb,
      model: (modelMod as { default?: unknown }).default as unknown as RimaModel,
      keywords: kb.kbKeywords(),
    }))
    nluPromise.catch(() => { nluPromise = null }) // gagal load → boleh coba lagi
  }
  return nluPromise
}

// F4 Rima Hidup: token dinamis dari jam browser — deterministik, nol server
function fillTokens(text: string): string {
  if (!text.includes('{{')) return text
  const now = new Date()
  const h = now.getHours()
  const salam = h < 11 ? 'pagi' : h < 15 ? 'siang' : h < 18 ? 'sore' : 'malam'
  const jam = `${String(h).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`
  const hari = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })
  return text
    .replaceAll('{{jam}}', jam)
    .replaceAll('{{hari}}', hari)
    .replaceAll('{{salam-waktu}}', salam)
}

// "Siapa aku / akun & akses-ku" — dijawab dinamis dari sesi (nama+role+modul),
// BUKAN dari classifier (yang sebelumnya nyasar ke Telaah). Sengaja tak mencakup
// "password"/"id"/"sandi" → biarkan deny.kredensial yang menanganinya (rahasia).
const WHOAMI_RE = /\b(siapa\s*(aku|saya)|aku\s*(ini\s*)?siapa|nama\s*(ku|saya)|akun\s*(ku|saya)|(role|peran|jabatan|hak\s*akses|akses)\s*(ku|saya)|aku\s*bisa\s*(buka\s*)?apa\s*(saja)?|modul(ku|\s*(apa|yang)).*)\b/i
const CRED_RE   = /\b(password|pass|sandi|kata\s*sandi|\bid\b|user\s*id|userid)\b/i
const firstName = (n: string | null | undefined) => (n ? n.trim().split(/\s+/)[0] : '')

// "Menu apa saja di <modul>" → minat menu DALAM modul (bukan navigasi/whoami umum)
const MENU_INTENT_RE = /\b(menu|fitur|sub\s?menu|bagian|halaman)\b|\bapa\s*saja\b|\bbisa\s*(di)?buka\b/i
// Modul mana yang disebut user (alias longest-match, batas kata — meniru resolveNav)
function matchModuleMention(text: string): NavModule | null {
  const t = text.toLowerCase()
  let best: NavModule | null = null, bestLen = 0
  for (const m of NAV_MODULES) for (const a of m.aliases) {
    const re = new RegExp(`(^|[^a-z])${a.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}([^a-z]|$)`, 'i')
    if (re.test(t) && a.length > bestLen) { best = m; bestLen = a.length }
  }
  return best
}

function logFailedQuestion(q: string): void {
  try {
    const raw = window.localStorage.getItem(FAIL_LOG_KEY)
    const list: { q: string; t: number }[] = raw ? JSON.parse(raw) : []
    list.push({ q: redactPii(q).slice(0, 140), t: Date.now() }) // R4/G27/G13: scrub PII sebelum persist
    window.localStorage.setItem(FAIL_LOG_KEY, JSON.stringify(list.slice(-FAIL_LOG_CAP)))
  } catch { /* G12: telemetri lokal best-effort, jangan ganggu chat */ }
}

// #2 fail-log mining — lapor pertanyaan tak terjawab ke server (bahan tumbuh KB,
// agregat untuk admin). PII di-redaksi DULU (R4/G27), server redaksi lagi
// (defense-in-depth). Best-effort & non-blocking — kegagalan tak mengganggu chat.
function reportUnanswered(q: string, page: string): void {
  try {
    // #2 telemetri: POST menulis tabel rima_unanswered (telemetri), BUKAN data modul;
    // PII diredaksi klien+server; best-effort. G1/G16 utuh.
    void fetch('/api/rima/feedback', { // rima-readonly-allow: telemetri fail-log, bukan mutasi data modul
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: redactPii(q).slice(0, 200), page }),
    }).catch(() => { /* G12 */ })
  } catch { /* G12: telemetri best-effort */ }
}

// RAL-2 active learning — klik kandidat A5 & 👍/👎 = label implisit (bahan
// retrain RAL-4). Sama seperti reportUnanswered: telemetri best-effort,
// PII di-redaksi klien+server, read-only terhadap data modul (G16).
function reportFeedback(q: string, kind: 'CANDIDATE_PICK' | 'THUMBS_UP' | 'THUMBS_DOWN', intent: string): void {
  try {
    void fetch('/api/rima/feedback', { // rima-readonly-allow: telemetri belajar (RAL-2), bukan mutasi data modul
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: redactPii(q).slice(0, 200), kind, chosen_intent: intent }),
    }).catch(() => { /* G12 */ })
  } catch { /* G12: telemetri best-effort */ }
}

export default function RimaChat({ onThinking, onReact, tourApi, navSnapshot, userName }: {
  onThinking?: (thinking: boolean) => void
  /** A1: pasca-jawaban → angguk (yakin) / geleng (fallback). Dipakai SentinelBot. */
  onReact?: (reaction: RimaReaction) => void
  tourApi?: RimaTourApi
  /** F5b: peran + akses modul (read-only) untuk navigasi sadar-akses. */
  navSnapshot?: NavSnapshot
  /** Nama tampilan user dari sesi server (sapaan + jawaban "siapa aku"); G20. */
  userName?: string | null
}) {
  const pathname = usePathname()
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [typedLen, setTypedLen] = useState<number | null>(null)
  const idRef = useRef(0)
  const lastIntentRef = useRef<string | null>(null)
  const variantRef = useRef<Map<string, number>>(new Map())
  // B3 — deteksi kebingungan: hitung pertanyaan gagal beruntun, tawarkan tur 1×/sesi
  const fallbackStreakRef = useRef(0)
  const confusionOfferedRef = useRef(false)
  // RAL-6 — konteks pertanyaan-data terakhir (multi-turn); TTL 5 menit, murni klien (G13)
  const lastDataQRef = useRef<{ q: RimaQuery; at: number } | null>(null)
  // RAL-2 — pesan yang sudah dinilai 👍/👎 (sekali per jawaban)
  const [voted, setVoted] = useState<Set<number>>(new Set())
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const attachRef = useRef<HTMLInputElement>(null)
  const lampir = useLampir()

  const pushMsg = useCallback((msg: Omit<ChatMsg, 'id'>): void => {
    idRef.current += 1
    const withId = { ...msg, id: idRef.current }
    setMsgs(prev => [...prev, withId].slice(-HISTORY_CAP))
  }, [])

  // Variasi jawaban bergilir per intent — deterministik, tidak monoton (§4)
  const pickAnswer = useCallback((key: string, set: RimaAnswerSet): string => {
    const n = variantRef.current.get(key) ?? 0
    variantRef.current.set(key, n + 1)
    return fillTokens(set.answers[n % set.answers.length])
  }, [])

  // Sapaan awal — sekali saat chat pertama dibuka. B4: first-timer ditawari
  // "lewati tutorial"; user lama yang belum lihat fitur baru → "apa yang baru".
  useEffect(() => {
    let cancelled = false
    loadNlu().then(({ kb }) => {
      if (cancelled) return
      const prof = getProfile()
      const onboard: ChatChip[] = !prof.onboarded
        ? [{ l: 'Sudah pernah pakai PRIMA — lewati tutorial', q: '', action: 'skip-tutorial' }]
        : prof.seenVersion !== kb.RIMA_WHATS_NEW.version
          ? [{ l: '✨ Apa yang baru', q: '', action: 'whats-new' }]
          : []
      // Sapaan personal: "Hai!" → "Hai, <Nama>!" bila nama user diketahui (G20)
      const nm = firstName(userName)
      const greet = nm
        ? kb.RIMA_GREETING.answers[0].replace(/^Hai!?/i, `Hai, ${nm}!`)
        : kb.RIMA_GREETING.answers[0]
      setMsgs(prev => {
        if (prev.length > 0) return prev
        idRef.current += 1
        return [{ id: idRef.current, who: 'rima', text: greet, chips: [...onboard, ...kb.RIMA_GREETING.chips].slice(0, 4) }]
      })
    }).catch(() => {
      if (cancelled) return
      pushMsg({ who: 'rima', text: 'Aduh, otakku belum termuat 🙏 Coba tutup-buka panel ini lagi ya.' })
    })
    return () => { cancelled = true }
  }, [pushMsg, userName])

  // B5 efek mengetik pada bubble Rima terakhir; reduced-motion → instan (K4)
  // queueMicrotask: hindari setState sync di effect body — pola use-sentinel-swap.ts B-2
  useEffect(() => {
    const last = msgs[msgs.length - 1]
    if (!last || last.who !== 'rima' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      queueMicrotask(() => setTypedLen(null))
      return
    }
    queueMicrotask(() => setTypedLen(0))
    const timer = window.setInterval(() => {
      setTypedLen(prev => {
        if (prev === null || prev >= last.text.length) { window.clearInterval(timer); return null }
        return prev + 3
      })
    }, 16)
    return () => window.clearInterval(timer)
  }, [msgs])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [msgs, typedLen])

  const answerIntent = useCallback((nlu: Nlu, intent: string, alsoAsked: string | null, askedText?: string): void => {
    // Penolakan/de-eskalasi bukan "topik" — jangan jadi konteks B1
    if (!intent.startsWith('deny.') && !intent.startsWith('sopan.')) lastIntentRef.current = intent
    const set = nlu.kb.resolveAnswer(intent)
    if (!set) {
      onReact?.('shake')
      pushMsg({ who: 'rima', text: pickAnswer('fallback', nlu.kb.RIMA_FALLBACK), chips: nlu.kb.RIMA_FALLBACK.chips })
      return
    }
    fallbackStreakRef.current = 0 // B3: jawaban ketemu → reset hitungan bingung
    // deny.* = klasifikasi yakin TAPI menolak → geleng halus, bukan angguk
    onReact?.(intent.startsWith('deny.') ? 'shake' : 'nod')
    const chips: ChatChip[] = [...set.chips]
    if (alsoAsked && alsoAsked !== intent) {
      chips.unshift({ l: `Lanjut: ${nlu.kb.intentTitle(alsoAsked)}`, q: '', intent: alsoAsked })
    }
    // RAL-2 — jawaban KB yang diketik user bisa dinilai 👍/👎 (deny/sopan tidak dinilai)
    const canRate = !!askedText && !intent.startsWith('deny.') && !intent.startsWith('sopan.')
    pushMsg({
      who: 'rima',
      text: pickAnswer(intent, set),
      chips: chips.slice(0, 4),
      fb: canRate ? { q: askedText, intent } : undefined,
    })
  }, [onReact, pickAnswer, pushMsg])

  // F3 — chip tur: tawarkan resume bila ada progres tersimpan; halaman beda →
  // bot kasih link (user yang klik, G1)
  const handleTourChip = useCallback((tourId: string, from?: number): void => {
    if (!tourApi) return
    if (tourId === 'kenal-prima') patchProfile({ onboarded: true }) // B4: mulai tur kenalan = sudah onboarding
    if (from === undefined) {
      const saved = tourApi.saved(tourId)
      if (saved !== null && saved > 0) {
        pushMsg({
          who: 'rima',
          text: `Tur ini pernah berhenti di tengah jalan — lanjutkan dari langkah ${saved + 1}, atau mulai dari awal?`,
          chips: [
            { l: '▶ Lanjutkan', q: '', tour: tourId, tourFrom: saved },
            { l: '↻ Dari awal', q: '', tour: tourId, tourFrom: 0 },
          ],
        })
        return
      }
    }
    const res = tourApi.start(tourId, from)
    if (!res.ok && res.page) {
      pushMsg({
        who: 'rima',
        text: `Tur "${res.title}" adanya di halaman ${res.page} — buka dulu ya, lalu mulai turnya dari sana 😊`,
        chips: [{ l: `Buka ${res.page}`, q: '', href: res.page }],
      })
    }
  }, [pushMsg, tourApi])

  // B4 — chip onboarding: lewati tutorial / tampilkan apa yang baru (lokal, G1/G16)
  const handleAction = useCallback(async (action: NonNullable<ChatChip['action']>): Promise<void> => {
    try {
      const { kb } = await loadNlu()
      const ver = kb.RIMA_WHATS_NEW.version
      patchProfile({ onboarded: true, seenVersion: ver })
      if (action === 'skip-tutorial') {
        pushMsg({
          who: 'rima',
          text: 'Siap, tutorialnya kulewati 😊 Kalau nanti butuh, panggil saja aku ya. Ada yang bisa kubantu?',
          chips: [{ l: 'Daftar topik', q: 'menu apa saja yang ada di prima' }, { l: 'Kemampuan Rima', q: 'kamu bisa apa saja' }],
        })
        return
      }
      pushMsg({ who: 'rima', text: kb.RIMA_WHATS_NEW.answers[0], chips: kb.RIMA_WHATS_NEW.chips })
    } catch {
      pushMsg({ who: 'rima', text: 'Maaf, ada gangguan kecil di otakku 🙏 Coba lagi ya.' })
    }
  }, [pushMsg])

  const ask = useCallback(async (rawText: string, directIntent?: string): Promise<void> => {
    const text = rawText.trim().slice(0, INPUT_MAX)
    if ((!text && !directIntent) || busy) return
    setBusy(true)
    onThinking?.(true)
    if (text) pushMsg({ who: 'user', text })
    try {
      // F3 locate (§6b-4): "di mana tombol X" → tunjuk langsung, tanpa classifier
      if (text && tourApi && /\b(di\s?mana|dimana|letak|lokasi)\b/i.test(text)) {
        const found = findAnchorByLabel(text, pathname)
        if (found && pathname.startsWith(found.anchor.page)) {
          pushMsg({ who: 'rima', text: `Kutunjukkan ya 👉 ${found.anchor.label}.` })
          tourApi.locate(found.id)
          return
        }
        if (found) {
          pushMsg({
            who: 'rima',
            text: `Itu adanya di halaman ${found.anchor.page} (${found.anchor.label}). Buka dulu ya, nanti kutunjukkan di sana 😊`,
            chips: [{ l: `Buka ${found.anchor.page}`, q: '', href: found.anchor.page }],
          })
          return
        }
        // tidak ketemu di registry → biar classifier yang jawab (KB locate.*)
      }
      // Guard HAPUS (G1/G16): perintah langsung menghapus / klik tombol hapus → tolak
      // tegas. Dikecualikan pertanyaan CARA & lokasi ("cara hapus", "di mana tombol
      // hapus") yang sah dijelaskan/ditunjuk — Rima menjelaskan, USER yang klik.
      if (text
        && /\b(hapus|hapuskan|hapusin|delete|buang)\b/i.test(text)
        && !/\b(cara|gimana|bagaimana|gmn|kenapa|knp|apa|kah|di ?mana|dimana|letak|lokasi|tunjuk|mana|tidak bisa|gak bisa|ga bisa|nggak bisa|bisa ?(ga|gak|nggak|tidak))\b/i.test(text)) {
        onReact?.('shake')
        pushMsg({
          who: 'rima',
          text: 'Maaf, aku tidak bisa dan tidak akan menghapus apa pun 🙏 Aku dirancang read-only — hanya menunjukkan & menjelaskan. Tombol hapusnya kamu sendiri yang klik supaya keputusannya tetap di tanganmu. Kalau mau tahu caranya, tanya "cara hapus …" ya 😊',
          chips: [{ l: 'Daftar topik', q: 'menu apa saja yang ada di prima' }],
        })
        return
      }
      // F5a kalkulator: hitung sebelum classifier (lokal, no eval, tidak baca data PRIMA)
      if (text) {
        const calc = tryCalc(text)
        if (calc) {
          onReact?.('nod')
          pushMsg({ who: 'rima', text: calc.reply, chips: [
            { l: 'Rumus di PRIMA', q: 'kolom jumlah di dpa dihitung gimana' },
            { l: 'Kemampuan Rima', q: 'kamu bisa apa saja' },
          ] })
          return
        }
      }
      // F5b navigasi sadar-akses: "buka X" → link chip yang DIKLIK user (G1/G18)
      if (text) {
        const nav = resolveNav(text)
        if (nav) {
          onReact?.('nod')
          const snap: NavSnapshot = navSnapshot ?? { role: null, access: null, status: {} }
          const TOPIK_CHIP = { l: 'Daftar topik', q: 'menu apa saja yang ada di prima' }
          if ('list' in nav) {
            const open = listOpenable(snap)
            pushMsg({
              who: 'rima',
              text: open.length
                ? 'Ini modul yang bisa kamu buka 😊 klik salah satu ya:'
                : 'Sepertinya belum ada modul yang bisa kubukakan untukmu sekarang. Kalau butuh akses, ajukan ke admin lewat atasanmu ya.',
              chips: open.length ? open.slice(0, 4).map(m => ({ l: `Buka ${m.label}`, q: '', href: m.href })) : [TOPIK_CHIP],
            })
            return
          }
          const acc = navAccessOf(nav, snap)
          if (acc === 'admin-only') pushMsg({ who: 'rima', text: 'Admin Panel khusus untuk admin ya 😊 Kalau kamu memang admin, kartunya ada di menu utama.', chips: [TOPIK_CHIP] })
          else if (acc === 'no-access') pushMsg({ who: 'rima', text: `Modul ${nav.label} sepertinya di luar aksesmu sekarang 🙏 Kalau memang perlu, ajukan ke admin lewat atasanmu ya.`, chips: [TOPIK_CHIP] })
          else if (acc === 'maintenance') pushMsg({ who: 'rima', text: `Modul ${nav.label} lagi dipelihara admin 🛠️ Coba lagi nanti ya.`, chips: [TOPIK_CHIP] })
          else pushMsg({ who: 'rima', text: `Siap! Klik untuk membuka ${nav.label} 👉`, chips: [{ l: `Buka ${nav.label}`, q: '', href: nav.href }] })
          return
        }
      }
      // F5c "tombol X buat apa?" → jelaskan fungsi (anchor.desc) + tawarkan tunjuk.
      // Buang kata pemicu/filler dulu supaya "buat apa" tak salah cocok ke label "Buat Form".
      if (text && tourApi && /\b(fungsi|fungsinya|kegunaan|gunanya|buat apa|untuk apa|apa guna|apa fungsi)\b/i.test(text)) {
        const cleaned = text.replace(/\b(fungsi(?:nya)?|kegunaan|gunanya|buat apa|untuk apa|apa guna|apa fungsi|apa|tombol|menu|ikon|kolom|ini|itu|sih|dong|ya)\b/gi, ' ')
        const found = findAnchorByLabel(cleaned, pathname)
        if (found) {
          onReact?.('nod')
          const body = found.anchor.desc ?? `Itu ${found.anchor.label}.`
          const sameHal = pathname.startsWith(found.anchor.page)
          pushMsg({
            who: 'rima',
            text: sameHal ? `${body} Mau kutunjukkan di layar?` : `${body} Letaknya di halaman ${found.anchor.page}.`,
            chips: sameHal
              ? [{ l: '👉 Tunjukkan', q: '', locate: found.id }, { l: 'Topik lain', q: 'kamu bisa apa saja' }]
              : [{ l: `Buka ${found.anchor.page}`, q: '', href: found.anchor.page }],
          })
          return
        }
      }
      // "Menu apa saja di <modul>?" → daftar menu DALAM modul, sesuai akses role
      // (G18: cermin gating sidebar; tak menyebut menu di luar akses). Sebelum whoami
      // supaya "role ku di usulan kebutuhan apa saja yang bisa dibuka" tak nyasar ke
      // whoami umum. Read-only, data dari sesi (G16/G20).
      if (text && !directIntent && MENU_INTENT_RE.test(text)) {
        const mod = matchModuleMention(text)
        if (mod) {
          const snap: NavSnapshot = navSnapshot ?? { role: null, access: null, status: {} }
          const acc = navAccessOf(mod, snap)
          if (acc !== 'ok') {
            onReact?.('shake')
            pushMsg({
              who: 'rima',
              text: acc === 'admin-only'
                ? `${mod.label} khusus admin ya 😊 jadi menunya belum bisa kubukakan untukmu.`
                : acc === 'maintenance'
                  ? `${mod.label} lagi dipelihara admin 🛠️ coba lagi nanti ya.`
                  : `Modul ${mod.label} sepertinya di luar aksesmu sekarang 🙏 kalau memang perlu, ajukan ke admin lewat atasanmu ya.`,
              chips: [{ l: 'Modul yang bisa kubuka', q: 'buka aplikasi' }],
            })
            return
          }
          const menus = moduleMenusFor(mod.id, snap.role)
          onReact?.('nod')
          pushMsg({
            who: 'rima',
            text: menus.length
              ? `Di ${mod.label}, menu yang bisa kamu buka: ${menus.join(', ')}. Itu yang sesuai aksesmu ya 😊`
              : `Untuk ${mod.label}, langsung buka modulnya saja — isinya menyesuaikan aksesmu 😊`,
            chips: [
              { l: `Buka ${mod.label}`, q: '', href: mod.href },
              { l: 'Modul lain yang bisa kubuka', q: 'buka aplikasi' },
            ],
          })
          return
        }
      }
      // F6a Q&A data (CONCEPT v3 §11): pertanyaan data Usulan terpola → endpoint
      // read-only ber-guard (akses ditentukan server dari role — L60/G20). Angka
      // dari server, bukan klien/LLM. Rima tetap read-only (GET, tak menulis — G16).
      if (text && !directIntent) {
        let q = detectRimaDataQuery(text)
        // RAL-6 — lanjutan anaforis ("kalau 2025?", "yang ditolak?") mewarisi slot
        // pertanyaan-data terakhir; kedaluwarsa 5 menit (reset agresif anti salah sambung).
        const ctx = lastDataQRef.current
        if (!q && ctx && Date.now() - ctx.at < 5 * 60_000) q = mergeWithContext(text, ctx.q)
        if (q) {
          const r = await fetchRimaData(q)
          const ok = !!(r.ok && !r.denied && r.data)
          onReact?.(ok ? 'nod' : 'shake')
          if (ok) lastDataQRef.current = { q, at: Date.now() }
          pushMsg({
            who: 'rima',
            text: formatRimaAnswer(q.app, r, q.status),
            // RAL-2 — jawaban data bisa dinilai 👍/👎 (👎 = sinyal salah-paham G-F).
            // Prefiks "data." membedakannya dari intent KB senama (usulan.rekap KB
            // vs data usulan.rekap) — export training otomatis mengecualikannya.
            fb: ok ? { q: text, intent: `data.${q.app}.${q.intent}` } : undefined,
            chips: [
              { l: 'Tugasku', q: 'apa tugasku' },
              { l: 'Usulan termahal', q: '5 usulan termahal' },
              { l: 'Rekap aset', q: 'rekap bba tahun ini' },
              { l: 'Kemampuan Rima', q: 'kamu bisa apa saja' },
            ],
          })
          return
        }
        // RAL-5 — sinyal data kuat tapi modul tak disebut → tanya balik modulnya.
        // Jawaban chip terekam sebagai CANDIDATE_PICK (label implisit, RAL-2).
        if (hasDataSignalNoModule(text)) {
          onReact?.('nod')
          pushMsg({
            who: 'rima',
            text: 'Datanya dari modul mana nih? 😊 Pilih salah satu ya:',
            chips: ([
              ['Usulan', 'usulan', 'usulan'],
              ['Aset (BBA)', 'bba', 'bba'],
              ['Perjanjian Kinerja', 'pk', 'pk'],
              ['Rencana Aksi', 'rencana aksi', 'rencana_aksi'],
            ] as const).map(([l, kw, app]) => ({ l, q: `${text} ${kw}`, pick: { q: text, intent: `data.${app}` } })),
          })
          return
        }
      }
      // "Siapa aku / akun & akses-ku" → jawab dinamis dari sesi (nama+role+modul).
      // Read-only (G16), data dari prop sesi server (G20). Pertanyaan kredensial
      // (password/id) sengaja TIDAK dijawab di sini — biar deny.kredensial menolak.
      if (text && !directIntent && WHOAMI_RE.test(text) && !CRED_RE.test(text)) {
        const snap: NavSnapshot = navSnapshot ?? { role: null, access: null, status: {} }
        const nm = userName?.trim() || null
        const roleLabel = snap.role ? (ROLE_LABELS[snap.role] ?? snap.role) : null
        const open = listOpenable(snap)
        const modulesLine = open.length ? open.map(m => m.label).join(', ') : 'belum ada modul yang terbuka untukmu'
        onReact?.('nod')
        pushMsg({
          who: 'rima',
          text: `Kamu ${nm ?? 'pengguna PRIMA'}${roleLabel ? `, dengan peran ${roleLabel}` : ''} 😊 Modul yang bisa kamu buka: ${modulesLine}. Demi keamanan, password & ID akunmu tidak kusimpan atau kusebut ya 🔒`,
          chips: [
            { l: 'Modul yang bisa kubuka', q: 'buka aplikasi' },
            { l: 'Kemampuan Rima', q: 'kamu bisa apa saja' },
          ],
        })
        return
      }
      const nlu = await loadNlu()
      if (directIntent) {
        answerIntent(nlu, directIntent, null)
        return
      }
      const result = nlu.classify(text, nlu.model, nlu.keywords)
      if (result.intent) {
        answerIntent(nlu, result.intent, result.alsoAsked, text)
        return
      }
      logFailedQuestion(text)
      reportUnanswered(text, pathname) // #2: kumpulkan ke server utk tumbuh KB
      onReact?.('shake') // A1: kandidat A5 maupun fallback = belum yakin → geleng
      // B3 — bingung beruntun: ≥2 gagal & belum ditawarkan → ajak tur (1×/sesi)
      fallbackStreakRef.current += 1
      if (fallbackStreakRef.current >= 2 && !confusionOfferedRef.current) {
        confusionOfferedRef.current = true
        fallbackStreakRef.current = 0
        pushMsg({ who: 'rima', text: pickAnswer('confused', nlu.kb.RIMA_CONFUSED), chips: nlu.kb.RIMA_CONFUSED.chips })
        return
      }
      // B1 — topik terakhir DITAWARKAN via chip, bukan dipaksakan jadi jawaban
      // (retry prepend-judul terbukti menjawab ngawur untuk gibberish/typo berat)
      const ctxChip: ChatChip[] = lastIntentRef.current
        ? [{ l: `Masih soal ${nlu.kb.intentTitle(lastIntentRef.current)}?`, q: '', intent: lastIntentRef.current }]
        : []
      if (result.candidates.length > 0) {
        // A5 — confidence rendah: tawarkan kandidat, jangan langsung nyerah
        pushMsg({
          who: 'rima',
          text: 'Aku belum yakin maksudmu 🙏 Mungkin salah satu ini?',
          chips: [
            // RAL-2 — pick: klik kandidat = label implisit utk training (CANDIDATE_PICK)
            ...result.candidates.map(c => ({ l: nlu.kb.intentTitle(c.intent), q: '', intent: c.intent, pick: { q: text, intent: c.intent } })),
            ...ctxChip,
          ].slice(0, 4),
        })
        return
      }
      pushMsg({
        who: 'rima',
        text: pickAnswer('fallback', nlu.kb.RIMA_FALLBACK),
        chips: [...ctxChip, ...nlu.kb.RIMA_FALLBACK.chips].slice(0, 4),
      })
    } catch {
      // G12: tanpa err mentah — kalimat ramah + saran langkah
      pushMsg({ who: 'rima', text: 'Maaf, ada gangguan kecil di otakku 🙏 Coba tanya sekali lagi ya.' })
    } finally {
      setBusy(false)
      onThinking?.(false)
    }
  }, [answerIntent, busy, navSnapshot, onReact, onThinking, pathname, pickAnswer, pushMsg, tourApi, userName])

  const submit = useCallback((): void => {
    const text = input
    setInput('')
    void ask(text)
    inputRef.current?.focus()
  }, [ask, input])

  // §23 Lampirkan-di-chat (Opsi A): unggah Excel → server deteksi+parse (file dibuang),
  // hasil disimpan di RAM store, lalu Rima tawarkan link ke modal Import tujuan. Rima
  // tetap read-only (G16): cuma BACA + ANTAR; modal native + Simpan user yang menulis.
  const handleAttach = useCallback(async (file: File): Promise<void> => {
    if (busy) return
    if (!/\.(xlsx|xls)$/i.test(file.name)) { pushMsg({ who: 'rima', text: 'File-nya harus Excel (.xlsx/.xls) ya 🙏' }); return }
    if (file.size > 10 * 1024 * 1024) { pushMsg({ who: 'rima', text: 'Ukuran file melebihi 10MB 🙏 Coba file yang lebih ringkas ya.' }); return }
    // Nama file = input user → buang kontrol/zero-width/bidi (anti Trojan-Source),
    // normalkan spasi, cap 120. React tetap escape HTML saat render (text node).
    const fileName = (Array.from(file.name).filter(ch => {
      const c = ch.codePointAt(0) ?? 0
      return !(c < 32 || (c >= 127 && c <= 159) || (c >= 0x200B && c <= 0x200F) || (c >= 0x202A && c <= 0x202E) || (c >= 0x2066 && c <= 0x2069) || c === 0x2028 || c === 0x2029 || c === 0xFEFF)
    }).join('').replace(/\s+/g, ' ').trim().slice(0, 120)) || 'file.xlsx'
    setBusy(true); onThinking?.(true)
    pushMsg({ who: 'user', text: `📎 ${fileName}` })
    try {
      const fd = new FormData(); fd.append('file', file)
      // rima-readonly-allow: POST ke endpoint PARSE read-only (file dibuang, nol mutasi DB) — G16, CONCEPT §23.1
      const res = await fetch('/api/rima/lampir', { method: 'POST', body: fd })
      const j = await res.json().catch(() => null)
      if (!res.ok || !j?.ok) {
        onReact?.('shake')
        pushMsg({ who: 'rima', text: j?.message || 'Aku gagal membaca file itu 🙏 Coba file lain ya.' })
        return
      }
      onReact?.('nod')
      if (j.kind === 'realisasi') {
        lampir.set({ kind: 'realisasi', fileName, tahun: j.tahun, ts: Date.now(), data: j.data } as LampirStash)
        const cocok = Object.values(j.data.bySumber as Record<string, { ssk_canonical_id: string | null; status: string }[]>)
          .flat().filter(r => r.ssk_canonical_id && r.status !== 'none').length
        pushMsg({
          who: 'rima',
          text: `Sudah kubaca 📎 ${fileName} — ketemu ${j.data.total} baris belanja (${cocok} cocok ke SSK ${j.tahun}). Mau kuantar ke Import Realisasi? Klik di bawah, nanti tinggal periksa per sumber lalu Simpan 😊`,
          chips: [{ l: 'Buka Import Realisasi →', q: '', href: '/kinerja?import=realisasi' }],
        })
      } else {
        lampir.set({ kind: 'pendapatan', fileName, tahun: j.tahun, ts: Date.now(), data: j.data } as LampirStash)
        pushMsg({
          who: 'rima',
          text: `Sudah kubaca 📎 ${fileName} — ketemu realisasi pendapatan ${j.data.months.length} bulan. Mau kuantar ke Import Pendapatan? Klik di bawah, periksa lalu Simpan 😊`,
          chips: [{ l: 'Buka Import Pendapatan →', q: '', href: '/kinerja?import=pendapatan' }],
        })
      }
    } catch {
      onReact?.('shake')
      pushMsg({ who: 'rima', text: 'Maaf, ada gangguan saat membaca file 🙏 Coba lagi ya.' })
    } finally {
      setBusy(false); onThinking?.(false)
    }
  }, [busy, lampir, onReact, onThinking, pushMsg])

  const lastMsg = msgs[msgs.length - 1]

  return (
    <div className="rima-chat">
      <div className="rima-chat-list" ref={listRef} aria-live="polite" aria-label="Percakapan dengan Rima">
        {msgs.map(m => {
          const isLast = m === lastMsg
          const stillTyping = isLast && m.who === 'rima' && typedLen !== null
          return (
            <div key={m.id} className={`rima-msg ${m.who}`}>
              <div className="rima-msg-text">
                {stillTyping ? m.text.slice(0, typedLen) : m.text}
              </div>
              {/* RAL-2 — nilai jawaban 👍/👎 (sekali per jawaban; 👎 = bahan belajar) */}
              {isLast && m.who === 'rima' && !stillTyping && m.fb && (
                <div className="rima-chat-chips" aria-label="Nilai jawaban Rima">
                  {voted.has(m.id) ? (
                    <span style={{ fontSize: 11, opacity: 0.7 }}>Makasih atas masukannya 🙏</span>
                  ) : (
                    <>
                      <button type="button" className="rima-chip" disabled={busy} aria-label="Jawaban membantu"
                        onClick={() => { reportFeedback(m.fb!.q, 'THUMBS_UP', m.fb!.intent); setVoted(v => new Set(v).add(m.id)) }}
                      >👍</button>
                      <button type="button" className="rima-chip" disabled={busy} aria-label="Jawaban kurang tepat"
                        onClick={() => { reportFeedback(m.fb!.q, 'THUMBS_DOWN', m.fb!.intent); setVoted(v => new Set(v).add(m.id)) }}
                      >👎</button>
                    </>
                  )}
                </div>
              )}
              {isLast && m.who === 'rima' && !stillTyping && m.chips && m.chips.length > 0 && (
                <div className="rima-chat-chips">
                  {m.chips.map((c, i) => (
                    c.href ? (
                      <Link key={`${m.id}-${i}`} className="rima-chip" href={c.href}>{c.l}</Link>
                    ) : (
                      <button
                        key={`${m.id}-${i}`}
                        type="button"
                        className="rima-chip"
                        disabled={busy}
                        onClick={() => {
                          // RAL-2 — telemetri label implisit; tidak mengubah perilaku chip
                          if (c.pick) reportFeedback(c.pick.q, 'CANDIDATE_PICK', c.pick.intent)
                          if (c.action) void handleAction(c.action)
                          else if (c.locate) tourApi?.locate(c.locate)
                          else if (c.tour) handleTourChip(c.tour, c.tourFrom)
                          else void ask(c.q, c.intent)
                        }}
                      >{c.l}</button>
                    )
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {busy && (
          <div className="rima-msg rima">
            <div className="rima-msg-text rima-typing" aria-label="Rima sedang mengetik">
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>
      <form
        className="rima-chat-inputrow"
        onSubmit={e => { e.preventDefault(); submit() }}
      >
        <input ref={attachRef} type="file" accept=".xlsx,.xls" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleAttach(f); e.target.value = '' }} />
        <button
          type="button"
          className="rima-chip rima-attach"
          disabled={busy}
          aria-label="Lampirkan file Excel (realisasi / pendapatan)"
          data-tooltip="Lampirkan Excel — Rima baca isinya"
          onClick={() => { /* rima-readonly-allow: buka dialog pilih file (input file), bukan klik tombol aksi aplikasi — G16 */ attachRef.current?.click() }}
        >📎</button>
        <input
          ref={inputRef}
          type="text"
          className="rima-chat-input"
          value={input}
          maxLength={INPUT_MAX}
          placeholder="Tanya cara pakai PRIMA…"
          aria-label="Tulis pertanyaan untuk Rima"
          onChange={e => setInput(e.target.value)}
        />
        <button type="submit" className="rima-chip" disabled={busy || input.trim().length === 0}>
          Kirim
        </button>
      </form>
    </div>
  )
}

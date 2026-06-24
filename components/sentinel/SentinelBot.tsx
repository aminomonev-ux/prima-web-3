'use client'

// components/sentinel/SentinelBot.tsx — orkestrator RIMA F1+F2 (Pengawas + Chat):
// bubble bicara (anti-spam diff-by-key, auto-collapse 10 dtk), panel temuan
// [Lihat] jumpToRow+flash bergiliran / [Abaikan] persist §9c, tab "Diabaikan"
// bisa dibatalkan, tab Chat (RimaChat lazy §9c — tetap ter-mount setelah pertama
// dibuka supaya riwayat awet lintas halaman, G13: mati saat tab browser ditutup).
// Tur = F3. G16: komponen ini read-only struktural — tanpa props setter form,
// tanpa fetch. Di-mount SEKALI oleh SentinelProvider.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { findingKey } from '@/lib/sentinel/registry'
import { RIMA_ANCHORS } from '@/lib/sentinel/anchors'
import { TOUR_REGISTRY, savedTourStep, type TourScript } from '@/lib/sentinel/tours'
import type { NavSnapshot } from '@/lib/sentinel/nav'
import type { SentinelFinding } from '@/lib/sentinel/types'
import RimaAvatar, { type RimaGesture, type RimaReaction, type RimaState } from './RimaAvatar'
import { useSentinelState } from './SentinelProvider'
import Tip from '@/components/ui/Tip'

const RimaChat = dynamic(() => import('./RimaChat'), {
  ssr: false,
  loading: () => <div className="rima-empty">Memuat otak Rima…</div>,
})
const RimaTour = dynamic(() => import('./RimaTour'), { ssr: false })

export interface RimaTourApi {
  start:  (id: string, from?: number) => { ok: boolean; page?: string; title?: string }
  saved:  (id: string) => number | null
  locate: (anchorId: string) => boolean
}

const OPENERS = ['Psst —', 'Hei,', 'Sebentar —', 'Coba cek —']

const SEVERITY_LABEL = { critical: 'Kritis', warning: 'Peringatan', info: 'Info' } as const

// Drag "Roket lepas landas" (HANDOFF-rima-drag.md): seret maskot ke segala arah →
// kaki & tangan jadi nozzle ber-api, badan berputar menghadap arah gerak, boost saat
// cepat, lepas → mendarat tegak di posisi baru (persist localStorage). Rotasi & posisi
// di-set imperatif (DOM/ref) saat drag → nol re-render React per-frame.
const RIMA_POS_KEY = 'rima_pos'
const DRAG_THRESHOLD = 6   // px sebelum klik dianggap drag (jaga buka panel)
const BOOST_SPEED    = 6   // ambang kecepatan → boost (api membesar + trail)
function normAngle(a: number) { while (a > 180) a -= 360; while (a < -180) a += 360; return a }

// Celetukan saat drag (di-set sekali per transisi, bukan per-frame). Random OK —
// dipanggil di event handler, bukan jalur render (tak bikin flip re-render).
const RIMA_FLY_LAUNCH = ['Wuuush! 🚀', 'Daah, aku terbang!', 'Wiiii~ 🚀', 'Lepas landas! 🚀', 'Yuhuuu, melayang!']
const RIMA_FLY_BOOST  = ['NGEBUUUT! 💨', 'WUSHHH! 🔥', 'Kecepatan penuh! 🔥', 'Turbo, minggir~ 💨']
const RIMA_FLY_LAND   = ['Hap, mendarat! 🛬', 'Fyuuh~ aman 😎', 'Sampai juga! 🛬', 'Mendarat mulus 😎']
const pickPhrase = (a: readonly string[]) => a[Math.floor(Math.random() * a.length)]

// F4d gesture ekspresif (A): tiap celetukan ambient memicu gerakan singkat acak
// sesuai niat. Random OK — dipanggil di timer ambient, bukan jalur render.
type GestureIntent = 'greet' | 'work' | 'idle'
const GESTURE_BY_INTENT: Record<GestureIntent, RimaGesture[]> = {
  greet: ['wave', 'wave-l', 'cheer'],
  work:  ['cheer', 'hop'],
  idle:  ['wave', 'hop', 'point-up'],
}
const pickGesture = (intent: GestureIntent): RimaGesture =>
  pickPhrase(GESTURE_BY_INTENT[intent]) as RimaGesture

// F4d — DUA jam paralel (model 2026-06-15, dikonfirmasi user):
//  • Jam A "kebosanan" (CHAT-idle): JALAN walau user aktif bekerja, asal tak ngajak
//    Rima ngobrol. Loop: diam 60 dtk → ngobrol (tiap 60 dtk, maks 3×) → terbang
//    bebas 10 dtk → ngantuk (Zzz berdiri) → ULANG. Reset HANYA saat user interaksi
//    dgn Rima (chat / buka panel). Mouse/keyboard TIDAK me-reset jam A.
//  • Jam B "tidur" (PAGE-idle): tak ada aktivitas apa pun (mouse/key/scroll/touch)
//    selama SLEEP_AFTER → rebah di kasur (override jam A). Aktivitas → bangun +
//    menggeliat → lanjut jam A. SATU-SATUNYA jalan ke kasur.
const IDLE_FIRST_MS    = 60_000        // diam 60 dtk → ngobrol pertama (tiap loop)
const IDLE_CHAT_GAP_MS = 60_000        // jeda antar-ngobrol sendiri
const IDLE_CHAT_MAX    = 3             // maksimal 3× ngobrol sebelum terbang
const IDLE_FLY_GAP_MS  = 20_000        // jeda ngobrol ke-3 → terbang bebas
const IDLE_DOZE_MS     = 45_000        // ngantuk (Zzz berdiri) lalu loop balik ke ngobrol
const IDLE_RETRY_MS    = 10_000        // tunda langkah bila panel/tur/bubble lagi aktif
const SLEEP_AFTER_MS   = 10 * 60_000   // jam B: page-idle 10 mnt → tidur di kasur
const AUTO_FLY_DURATION_MS = 10_000    // durasi terbang bebas (orbit pojok)
const AUTO_FLY_RADIUS      = 60        // radius orbit kecil (zona aman pojok)
const GESTURE_RESET_MS  = 2_600
const WORK_LONG_MS      = 90 * 60_000
const WORK_REPEAT_MS    = 60 * 60_000
const AMBIENT_SHOW_MS   = 9_000
const AMBIENT_TICK_MS   = 30_000

const firstName = (n: string | null | undefined) => (n ? n.trim().split(/\s+/)[0] : '')
// `{nama}` → nama (atau dibuang rapi bersama koma/spasi di depannya bila kosong)
const personalize = (t: string, name: string) =>
  name ? t.replace(/\{nama\}/g, name) : t.replace(/,?\s*\{nama\}/g, '')
// jam dalam jendela [from,to]; from>to = wrap tengah malam (mis. 22→4)
const inHourWindow = (h: number, from: number, to: number) =>
  from <= to ? h >= from && h <= to : h >= from || h <= to

function bubbleText(fresh: SentinelFinding[]): string {
  const first  = fresh[0]
  // Deterministik (bukan Math.random) — variasi stabil per temuan, tidak ganti-ganti tiap render
  const opener = OPENERS[Math.abs(findingKey(first).length + first.message.length) % OPENERS.length]
  const extra  = fresh.length > 1 ? ` (+${fresh.length - 1} temuan lain — cek panelku.)` : ''
  return `${opener} ${first.message}${extra}`
}

export default function SentinelBot({ navSnapshot, userName }: { navSnapshot?: NavSnapshot; userName?: string | null }) {
  const st = useSentinelState()
  const pathname = usePathname()
  const [open, setOpen]       = useState(false)
  const [tab, setTab]         = useState<'chat' | 'temuan' | 'diabaikan'>('temuan')
  const [chatReady, setChatReady] = useState(false)
  const [bubble, setBubble]   = useState<{ text: string; finding: SentinelFinding } | null>(null)
  const [tour, setTour]       = useState<{ script: TourScript; from: number } | null>(null)
  const [gesture, setGesture] = useState<RimaGesture>('idle')
  const [reaction, setReaction] = useState<RimaReaction | null>(null)
  const [sleeping, setSleeping] = useState(false)
  const [dozing, setDozing]     = useState(false)
  const [ambient, setAmbient]   = useState<string | null>(null)
  const prevKeysRef   = useRef<Set<string>>(new Set())
  const jumpIdxRef    = useRef<Map<string, number>>(new Map())
  const wavedRef      = useRef(false)
  const gestureTimer  = useRef<number | null>(null)
  const reactTimer    = useRef<number | null>(null)
  const sleepingRef   = useRef(false)
  const dozingRef     = useRef(false)
  // Tangga idle linear: 1 timer untuk langkah berikutnya + jembatan reset dari luar
  // effect (saat user chat / buka panel / bangun) — semua aktivitas me-restart tangga.
  const ladderTimer  = useRef<number | null>(null)
  const resetDozeRef = useRef<(() => void) | null>(null)
  // Auto-fly (rung 2): rAF + snapshot posisi home (restore saat mendarat — tak ubah rima_pos)
  const flyRafRef      = useRef<number | null>(null)
  const flyHomeRef     = useRef<{ left: string; top: string; right: string; bottom: string } | null>(null)
  const lastActiveRef = useRef(0) // diisi Date.now() di effect ambient (purity)
  const openRef       = useRef(false)
  const tourRef       = useRef(false)
  // Drag roket: posisi tersimpan (left/top px; null = sudut default CSS) + ref imperatif
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const rootRef       = useRef<HTMLDivElement>(null)
  const poseRef       = useRef<HTMLSpanElement>(null)
  const dragRef       = useRef({ active: false, moved: false, sx: 0, sy: 0, lx: 0, ly: 0, lt: 0, rot: 0, ox: 0, oy: 0, boostTalked: false })
  // Celetukan saat terbang (lepas landas / boost / mendarat) — bubble standar existing
  const [flyTalk, setFlyTalk] = useState<string | null>(null)
  const flyTalkTimer  = useRef<number | null>(null)
  // Obrolan otomatis proaktif (F4c): timer + jejak waktu (interval deps [] → baca ref)
  const ambientTimer      = useRef<number | null>(null)
  const mountTimeRef      = useRef(0)
  const lastWorkRemindRef = useRef(0)
  const pathnameRef       = useRef(pathname)
  const userNameRef       = useRef(userName)
  const ambientRef        = useRef<string | null>(ambient)
  const bubbleRef         = useRef(bubble)
  const flyTalkRef        = useRef<string | null>(flyTalk)
  useEffect(() => { sleepingRef.current = sleeping }, [sleeping])
  useEffect(() => { dozingRef.current = dozing }, [dozing])
  useEffect(() => { openRef.current = open }, [open])
  useEffect(() => { tourRef.current = !!tour }, [tour])
  // Sinkron ref untuk dibaca di interval ambient (deps []) — bukan mutasi saat render (react-hooks/refs)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])
  useEffect(() => { userNameRef.current = userName }, [userName])
  useEffect(() => { ambientRef.current = ambient }, [ambient])
  useEffect(() => { bubbleRef.current = bubble }, [bubble])
  useEffect(() => { flyTalkRef.current = flyTalk }, [flyTalk])

  // useMemo: identity stabil saat st null — effect diff-by-key tidak jalan tiap render
  const active = useMemo(() => st?.active ?? [], [st?.active])
  const suppressed = st?.suppressed ?? []
  const hasCritical = active.some(f => f.severity === 'critical')
  const hasWarn     = active.some(f => f.severity !== 'critical')
  const avatarState: RimaState = hasCritical ? 'critical' : active.length > 0 ? 'warning' : 'ok'

  // Tutup panel + bubble + tur saat pindah halaman (route-aware; resume via localStorage).
  // queueMicrotask: hindari setState sync di effect body — pola use-sentinel-swap.ts B-2
  useEffect(() => {
    queueMicrotask(() => { setOpen(false); setBubble(null); setTour(null); setFlyTalk(null) })
  }, [pathname])

  // Bubble anti-spam: hanya saat set temuan BERUBAH (diff by key) — CONCEPT §4
  useEffect(() => {
    const keys  = new Set(active.map(findingKey))
    const fresh = active.filter(f => !prevKeysRef.current.has(findingKey(f)))
    prevKeysRef.current = keys
    if (fresh.length === 0) {
      if (active.length === 0) queueMicrotask(() => setBubble(null))
      return
    }
    queueMicrotask(() => { setBubble({ text: bubbleText(fresh), finding: fresh[0] }); setSleeping(false); resetDozeRef.current?.() })
    const t = window.setTimeout(() => setBubble(null), 10000)
    return () => window.clearTimeout(t)
  }, [active])

  // Sapa sekali saat pertama kali ada yang diawasi
  useEffect(() => {
    if (!st?.feed || wavedRef.current) return
    wavedRef.current = true
    queueMicrotask(() => setGesture('wave'))
    const t = window.setTimeout(() => setGesture('idle'), 2600)
    return () => window.clearTimeout(t)
  }, [st?.feed])

  // ESC menutup panel (G7)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Jaga maskot tetap di dalam viewport (clamp tepi) — dipakai drop/resize/auto-fly
  const clampPos = useCallback((x: number, y: number) => {
    const el = rootRef.current
    const w = el?.offsetWidth ?? 70
    const h = el?.offsetHeight ?? 90
    const pad = 8
    const maxX = Math.max(pad, window.innerWidth - w - pad)
    const maxY = Math.max(pad, window.innerHeight - h - pad)
    return { x: Math.min(Math.max(pad, x), maxX), y: Math.min(Math.max(pad, y), maxY) }
  }, [])

  // F4d ambient — DUA jam paralel + obrolan proaktif:
  //  • Jam A (CHAT-idle): loop ngobrol (tiap 60 dtk, maks 3×) → terbang → ngantuk →
  //    ULANG. Jalan walau user kerja; reset HANYA saat interaksi Rima (chat/panel).
  //  • Jam B (PAGE-idle ≥ SLEEP_AFTER): tak ada aktivitas apa pun → tidur di kasur
  //    (override jam A). Aktivitas → bangun + menggeliat → lanjut jam A.
  //  • Interval 30 dtk: cek jam B + sapaan waktu (1×/sesi) + pengingat istirahat.
  //    Daftar statis knowledge.mjs (G14) dynamic-import (§9c). `{nama}` dari sesi (G20).
  useEffect(() => {
    const now0 = Date.now()
    lastActiveRef.current = now0
    mountTimeRef.current  = now0

    const fireGesture = (intent: GestureIntent) => {
      setGesture(pickGesture(intent))
      if (gestureTimer.current) window.clearTimeout(gestureTimer.current)
      gestureTimer.current = window.setTimeout(() => setGesture('idle'), GESTURE_RESET_MS)
    }
    const say = (text: string, intent: GestureIntent) => {
      if (!text) return
      setAmbient(text)
      fireGesture(intent)
      if (ambientTimer.current) window.clearTimeout(ambientTimer.current)
      ambientTimer.current = window.setTimeout(() => setAmbient(null), AMBIENT_SHOW_MS)
    }
    const blocked = () =>
      openRef.current || tourRef.current || sleepingRef.current || dozingRef.current ||
      !!ambientRef.current || !!bubbleRef.current || !!flyTalkRef.current
    const restBlocked = () =>
      openRef.current || tourRef.current || sleepingRef.current || dragRef.current.active || document.hidden
    const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Ngobrol sendiri = celetukan idle acak (tips modul halaman + umum)
    const sayIdle = () => {
      if (blocked()) return
      void import('@/lib/sentinel/knowledge.mjs').then((K) => {
        const name = firstName(userNameRef.current)
        const path = pathnameRef.current
        const tipsKey = Object.keys(K.MODULE_TIPS).find(k => path.startsWith(k))
        const pool = [...(tipsKey ? K.MODULE_TIPS[tipsKey] : []), ...K.IDLE_CHATTER]
        say(personalize(pickPhrase(pool), name), 'idle')
      }).catch(() => { /* best-effort — celetukan boleh gagal diam-diam */ })
    }

    const clearLadder = () => {
      if (ladderTimer.current) window.clearTimeout(ladderTimer.current)
      ladderTimer.current = null
    }

    // Terbang bebas 10 dtk: orbit kecil di pojok home (reuse drag: .rima-flying +
    // --rima-rot + nozzle/api). Lintasan menyinggung home → tak masuk tengah layar.
    // Tak ubah rima_pos. onDone dipanggil saat mendarat → lanjut tangga (ngantuk).
    const cancelFly = () => {
      if (flyRafRef.current == null && flyHomeRef.current == null) return
      if (flyRafRef.current != null) { cancelAnimationFrame(flyRafRef.current); flyRafRef.current = null }
      const pose = poseRef.current, el = rootRef.current
      if (pose) { pose.classList.remove('rima-flying', 'rima-boosting'); pose.style.setProperty('--rima-rot', '0deg') }
      if (el && flyHomeRef.current) {
        el.style.left = flyHomeRef.current.left;   el.style.top = flyHomeRef.current.top
        el.style.right = flyHomeRef.current.right; el.style.bottom = flyHomeRef.current.bottom
      }
      flyHomeRef.current = null
    }
    const startAutoFly = (onDone: () => void) => {
      const el = rootRef.current, pose = poseRef.current
      if (!el || !pose || restBlocked()) { onDone(); return }
      const r = el.getBoundingClientRect()
      const cx = r.left, cy = r.top
      flyHomeRef.current = { left: el.style.left, top: el.style.top, right: el.style.right, bottom: el.style.bottom }
      pose.classList.add('rima-flying')
      setBubble(null); setFlyTalk(pickPhrase(RIMA_FLY_LAUNCH))
      if (flyTalkTimer.current) window.clearTimeout(flyTalkTimer.current)
      const t0 = performance.now()
      let prevX = cx, prevY = cy, rot = 0, done = false
      const finish = () => {
        if (done) return
        done = true
        cancelFly()
        setFlyTalk(pickPhrase(RIMA_FLY_LAND))
        if (flyTalkTimer.current) window.clearTimeout(flyTalkTimer.current)
        flyTalkTimer.current = window.setTimeout(() => setFlyTalk(null), 1800)
        onDone()
      }
      const tick = (now: number) => {
        const t = (now - t0) / AUTO_FLY_DURATION_MS
        if (t >= 1 || dragRef.current.active || openRef.current || sleepingRef.current) { finish(); return }
        const ang = t * Math.PI * 2                          // satu putaran penuh
        const dx = Math.sin(ang) * AUTO_FLY_RADIUS           // menyinggung home di t=0 & t=1
        const dy = -(1 - Math.cos(ang)) * AUTO_FLY_RADIUS    // melayang ke ATAS pojok (aman)
        const c = clampPos(cx + dx, cy + dy)
        el.style.left = c.x + 'px'; el.style.top = c.y + 'px'
        el.style.right = 'auto'; el.style.bottom = 'auto'
        if (Math.hypot(c.x - prevX, c.y - prevY) > 0.5) {
          const target = Math.atan2(c.y - prevY, c.x - prevX) * 180 / Math.PI + 90
          rot += normAngle(target - rot) * 0.35
          pose.style.setProperty('--rima-rot', rot.toFixed(1) + 'deg')
        }
        prevX = c.x; prevY = c.y
        flyRafRef.current = requestAnimationFrame(tick)
      }
      flyRafRef.current = requestAnimationFrame(tick)
    }

    // ── Langkah loop jam A (dirantai timer) — urut dependensi backward-ref ──
    const runDoze = () => {
      if (restBlocked()) { ladderTimer.current = window.setTimeout(runDoze, IDLE_RETRY_MS); return }
      setDozing(true); dozingRef.current = true                // ngantuk: Zzz berdiri
      // loop balik ke ngobrol (lewat ref → hindari forward-ref ke restartLadder).
      // NB: ngantuk TIDAK ke kasur — kasur hanya via jam B (page-idle) di interval.
      ladderTimer.current = window.setTimeout(() => resetDozeRef.current?.(), IDLE_DOZE_MS)
    }
    const runFly = () => {
      if (reducedMotion()) { runDoze(); return }              // reduced-motion → lewati terbang
      if (restBlocked()) { ladderTimer.current = window.setTimeout(runFly, IDLE_RETRY_MS); return }
      startAutoFly(runDoze)                                    // 10 dtk → ngantuk
    }
    const runChat = (n: number) => {
      if (blocked()) { ladderTimer.current = window.setTimeout(() => runChat(n), IDLE_RETRY_MS); return }
      sayIdle()                                               // ngobrol sendiri ke-n
      ladderTimer.current = window.setTimeout(
        () => (n < IDLE_CHAT_MAX ? runChat(n + 1) : runFly()),
        n < IDLE_CHAT_MAX ? IDLE_CHAT_GAP_MS : IDLE_FLY_GAP_MS,
      )
    }

    const restartLadder = () => {   // mulai/ulang loop jam A (dipakai juga utk loop-balik & reset interaksi)
      clearLadder(); cancelFly()
      if (dozingRef.current) { dozingRef.current = false; setDozing(false) }
      ladderTimer.current = window.setTimeout(() => runChat(1), IDLE_FIRST_MS)
    }
    resetDozeRef.current = restartLadder

    const onActivity = () => {
      lastActiveRef.current = Date.now()   // jam B: catat aktivitas (cegah/akhiri tidur)
      // Jam A TIDAK di-reset oleh mouse/keyboard — loop kebosanan jalan walau user kerja.
      if (sleepingRef.current) {
        sleepingRef.current = false  // self-guard: cegah re-fire stretch dari event beruntun
        setSleeping(false)
        setGesture('stretch')        // bangun dari kasur → menggeliat (D) lalu idle
        if (gestureTimer.current) window.clearTimeout(gestureTimer.current)
        gestureTimer.current = window.setTimeout(() => setGesture('idle'), GESTURE_RESET_MS)
        restartLadder()              // bangun → lanjut loop jam A
      }
    }
    const evs = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'] as const
    for (const ev of evs) window.addEventListener(ev, onActivity, { passive: true })

    restartLadder()  // mulai tangga idle

    // Interval terpisah: sapaan waktu (1×/sesi/jenis) + pengingat istirahat (kerja lama)
    const iv = window.setInterval(() => {
      const now = Date.now()
      // Jam B — page-idle total ≥ SLEEP_AFTER → tidur di kasur (override jam A)
      if (now - lastActiveRef.current >= SLEEP_AFTER_MS) {
        if (!sleepingRef.current) {
          sleepingRef.current = true; setSleeping(true)
          clearLadder(); cancelFly()
          if (dozingRef.current) { dozingRef.current = false; setDozing(false) }
        }
        return
      }
      if (blocked()) return
      void import('@/lib/sentinel/knowledge.mjs').then((K) => {
        const name = firstName(userNameRef.current)
        const hour = new Date().getHours()
        const g = K.AMBIENT_GREETINGS.find(x =>
          inHourWindow(hour, x.fromHour, x.toHour) && !window.sessionStorage.getItem(`rima:greet:${x.id}`))
        if (g) { window.sessionStorage.setItem(`rima:greet:${g.id}`, '1'); say(personalize(g.text, name), 'greet'); return }
        if (now - mountTimeRef.current >= WORK_LONG_MS && now - lastWorkRemindRef.current >= WORK_REPEAT_MS) {
          lastWorkRemindRef.current = now
          say(personalize(pickPhrase(K.WORK_BREAK_REMINDERS), name), 'work')
        }
      }).catch(() => { /* best-effort — celetukan boleh gagal diam-diam */ })
    }, AMBIENT_TICK_MS)

    return () => {
      for (const ev of evs) window.removeEventListener(ev, onActivity)
      window.clearInterval(iv)
      if (ambientTimer.current) window.clearTimeout(ambientTimer.current)
      clearLadder(); cancelFly()
    }
  }, [clampPos])

  // Lazy §9c: otak chat baru dimuat saat tab Chat pertama kali dibuka
  const openChatTab = useCallback(() => {
    setTab('chat')
    setChatReady(true)
  }, [])

  const handleThinking = useCallback((thinking: boolean) => {
    setGesture(thinking ? 'think' : 'idle')
    if (thinking) resetDozeRef.current?.()  // user ngajak ngobrol → reset loop ngantuk
  }, [])

  // A1: reaksi singkat pasca-jawaban chat — channel terpisah dari gesture (think),
  // auto-reset ~1.1s supaya tidak menetap.
  const handleReact = useCallback((r: RimaReaction) => {
    setReaction(r)
    if (reactTimer.current) window.clearTimeout(reactTimer.current)
    reactTimer.current = window.setTimeout(() => setReaction(null), 1100)
  }, [])

  // Tur F3 — start/resume/locate. G1: bot hanya menunjuk; navigasi lintas
  // halaman dilakukan user lewat link yang dirender chat.
  const tourApi = useMemo<RimaTourApi>(() => ({
    start: (id, from) => {
      const script = TOUR_REGISTRY[id]
      if (!script) return { ok: false }
      if (!pathname.startsWith(script.page)) return { ok: false, page: script.page, title: script.title }
      setOpen(false)
      setTour({ script, from: from ?? savedTourStep(id) ?? 0 })
      return { ok: true }
    },
    saved: savedTourStep,
    locate: (anchorId) => {
      const anchor = RIMA_ANCHORS[anchorId]
      if (!anchor || !pathname.startsWith(anchor.page)) return false
      setOpen(false)
      // Kontrol hapus → menunjuk dgn caution (bot berhenti menunjuk); Rima TAK pernah klik (G1/G16)
      setTour({
        script: {
          id: `locate:${anchorId}`,
          title: 'Penunjuk arah',
          page: anchor.page,
          steps: [anchor.destructive
            ? { anchor: anchorId, caution: true, text: `Ini ${anchor.label} 👉 Aku cuma menunjukkan ya — penghapusan kamu sendiri yang klik & putuskan.` }
            : { anchor: anchorId, text: `Ini dia — ${anchor.label} 👉` }],
          closing: 'Ketemu ya 😊 Ada lagi yang dicari?',
        },
        from: 0,
      })
      return true
    },
  }), [pathname])

  const pointBriefly = useCallback(() => {
    setGesture('point-left')
    if (gestureTimer.current) window.clearTimeout(gestureTimer.current)
    gestureTimer.current = window.setTimeout(() => setGesture('idle'), 1400)
  }, [])

  // [Lihat] — >1 target = lompat bergiliran tiap klik
  const lihat = useCallback((f: SentinelFinding) => {
    if (!st || f.targets.length === 0) return
    const k = findingKey(f)
    const i = jumpIdxRef.current.get(k) ?? 0
    jumpIdxRef.current.set(k, i + 1)
    st.jumpToRow(f.targets[i % f.targets.length].rowId)
    pointBriefly()
  }, [st, pointBriefly])

  const abaikan = useCallback((f: SentinelFinding) => {
    st?.dismiss(f)
    setBubble(prev => (prev && findingKey(prev.finding) === findingKey(f) ? null : prev))
  }, [st])

  // Pulihkan posisi terakhir saat mount (clamp jika viewport mengecil)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RIMA_POS_KEY)
      if (!raw) return
      const p = JSON.parse(raw)
      if (typeof p?.x === 'number' && typeof p?.y === 'number') {
        queueMicrotask(() => setPos(clampPos(p.x, p.y)))
      }
    } catch { /* posisi best-effort */ }
  }, [clampPos])

  // Re-clamp saat ukuran layar berubah supaya tak terjebak di luar layar
  useEffect(() => {
    const onResize = () => setPos(p => (p ? clampPos(p.x, p.y) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampPos])

  const onDragDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    dragRef.current = {
      active: true, moved: false, sx: e.clientX, sy: e.clientY,
      lx: e.clientX, ly: e.clientY, lt: performance.now(), rot: 0,
      ox: e.clientX - r.left, oy: e.clientY - r.top, boostTalked: false,
    }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no-op */ }
  }, [])

  const onDragMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d.active) return
    const el = rootRef.current, pose = poseRef.current
    if (!el || !pose) return
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < DRAG_THRESHOLD) return
      d.moved = true
      e.currentTarget.classList.add('rima-dragging')
      pose.classList.add('rima-flying')
      setBubble(null); setOpen(false); setSleeping(false)
      if (flyTalkTimer.current) window.clearTimeout(flyTalkTimer.current)
      setFlyTalk(pickPhrase(RIMA_FLY_LAUNCH))   // 🚀 lepas landas
      // Reset baseline kecepatan di frame pertama → dt mungil pasca-pointerdown tak
      // dibaca sbg "ngebut" (kalau tidak, boost langsung menimpa frasa lepas landas)
      d.lx = e.clientX; d.ly = e.clientY; d.lt = performance.now()
    }
    const c = clampPos(e.clientX - d.ox, e.clientY - d.oy)
    el.style.left = c.x + 'px'; el.style.top = c.y + 'px'
    el.style.right = 'auto'; el.style.bottom = 'auto'
    const now = performance.now(), dt = Math.max(8, now - d.lt)
    const vx = (e.clientX - d.lx) / dt * 16, vy = (e.clientY - d.ly) / dt * 16
    const sp = Math.hypot(vx, vy)
    if (sp >= 0.04) {
      const target = Math.atan2(vy, vx) * 180 / Math.PI + 90
      d.rot += normAngle(target - d.rot) * 0.4
      pose.style.setProperty('--rima-rot', d.rot.toFixed(1) + 'deg')
    }
    const boosting = sp >= BOOST_SPEED
    pose.classList.toggle('rima-boosting', boosting)
    if (boosting && !d.boostTalked) { d.boostTalked = true; setFlyTalk(pickPhrase(RIMA_FLY_BOOST)) }  // 💨 boost sekali
    d.lx = e.clientX; d.ly = e.clientY; d.lt = now
  }, [clampPos])

  const onDragUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d.active) return
    d.active = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* no-op */ }
    e.currentTarget.classList.remove('rima-dragging')
    const pose = poseRef.current
    if (d.moved && pose) {
      // Mendarat tegak: matikan api/boost + rotasi balik 0, lalu persist posisi baru
      pose.classList.remove('rima-flying', 'rima-boosting')
      d.rot = 0; pose.style.setProperty('--rima-rot', '0deg')
      setFlyTalk(pickPhrase(RIMA_FLY_LAND))   // 🛬 mendarat, lalu hilang
      if (flyTalkTimer.current) window.clearTimeout(flyTalkTimer.current)
      flyTalkTimer.current = window.setTimeout(() => setFlyTalk(null), 1800)
      const el = rootRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        const c = clampPos(r.left, r.top)
        setPos(c)
        try { window.localStorage.setItem(RIMA_POS_KEY, JSON.stringify(c)) } catch { /* best-effort */ }
      }
    }
  }, [clampPos])

  if (!st) return null

  return (
    <div
      className="rima-root"
      data-rima="rima.bot"
      ref={rootRef}
      style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
    >
      {/* Celetukan saat terbang (drag) — 🚀 lepas landas / 💨 boost / 🛬 mendarat */}
      {flyTalk && !open && !tour && (
        <div className="rima-bubble" role="status" aria-live="polite">{flyTalk}</div>
      )}
      {/* F4b: sapaan waktu proaktif — teks statis ter-lint, tanpa aksi */}
      {ambient && !flyTalk && !bubble && !open && !tour && (
        <div className="rima-bubble" role="status" aria-live="polite">{ambient}</div>
      )}
      {bubble && !open && (
        <div className="rima-bubble" role="status" aria-live="polite">
          {bubble.text}
          <div className="rima-bubble-actions">
            {bubble.finding.targets.length > 0 && (
              <button type="button" className="rima-chip" onClick={() => lihat(bubble.finding)}>Lihat</button>
            )}
            {bubble.finding.dismissKey && (
              <button type="button" className="rima-chip ghost" onClick={() => abaikan(bubble.finding)}>Abaikan</button>
            )}
            <button type="button" className="rima-chip ghost" onClick={() => { setOpen(true); setBubble(null) }}>
              Detail{active.length > 1 ? ` (${active.length})` : ''}
            </button>
          </div>
        </div>
      )}

      {(open || chatReady) && (
        <div
          className="rima-panel"
          role="dialog"
          aria-label="Panel RIMA — Asisten & Pengawas Form"
          style={open ? undefined : { display: 'none' }}
        >
          <div className="rima-panel-head">
            <span className="rima-panel-title">RIMA · Asisten PRIMA</span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                type="button"
                className="rima-panel-hide"
                onClick={() => { setOpen(false); st.hide() }}
                data-tooltip="Bisa ditampilkan lagi dari ikon 🤖 di pojok"
                data-tooltip-pos="left"
                aria-label="Sembunyikan Rima"
              >Sembunyikan</button>
              <button
                type="button"
                className="rima-panel-close"
                onClick={() => setOpen(false)}
                aria-label="Tutup panel RIMA"
              >✕</button>
            </div>
          </div>
          <div className="rima-tabs">
            <button type="button" className={`rima-tab${tab === 'chat' ? ' on' : ''}`} onClick={openChatTab}>
              Chat
            </button>
            <button type="button" className={`rima-tab${tab === 'temuan' ? ' on' : ''}`} onClick={() => setTab('temuan')}>
              Temuan ({active.length})
            </button>
            <button type="button" className={`rima-tab${tab === 'diabaikan' ? ' on' : ''}`} onClick={() => setTab('diabaikan')}>
              Diabaikan ({suppressed.length})
            </button>
          </div>

          {/* Chat tetap ter-mount saat pindah tab/panel ditutup — riwayat awet (B1) */}
          <div className="rima-chat-host" style={tab === 'chat' ? undefined : { display: 'none' }}>
            {chatReady && <RimaChat onThinking={handleThinking} onReact={handleReact} tourApi={tourApi} navSnapshot={navSnapshot} userName={userName} />}
          </div>

          {tab === 'temuan' && (
            <div className="rima-list">
              {active.length === 0 && (
                <div className="rima-empty">
                  {st.feed
                    ? 'Semua beres — tidak ada temuan di form ini. Aku terus mengawasi.'
                    : 'Aku bertugas mengawasi form DPA dan Pergeseran BLUD: entri ganda, konflik Penanggung Jawab, dan struktur blok. Di halaman ini belum ada yang kuawasi. Mau tanya-tanya? Buka tab Chat ya — tur menyusul.'}
                </div>
              )}
              {active.map(f => {
                const k = findingKey(f)
                return (
                  <div key={k} className={`rima-item ${f.severity}`}>
                    <span className={`rima-sev ${f.severity}`}>{SEVERITY_LABEL[f.severity]}</span>
                    {f.message}
                    <div className="rima-item-actions">
                      {f.targets.length > 0 && (
                        <Tip label={f.targets.length > 1 ? `${f.targets.length} baris — klik lagi untuk berikutnya` : 'Lompat ke barisnya'}>
                          <button
                            type="button"
                            className="rima-chip"
                            onClick={() => lihat(f)}
                          >Lihat{f.targets.length > 1 ? ` (${f.targets.length})` : ''}</button>
                        </Tip>
                      )}
                      {f.dismissKey && (
                        <Tip label="Sembunyikan — batalkan di tab Diabaikan">
                          <button
                            type="button"
                            className="rima-chip ghost"
                            onClick={() => abaikan(f)}
                          >Abaikan</button>
                        </Tip>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'diabaikan' && (
            <div className="rima-list">
              {suppressed.length === 0 && (
                <div className="rima-empty">Tidak ada temuan yang diabaikan di form ini.</div>
              )}
              {suppressed.map(({ finding, entry }) => (
                <div key={entry.k} className="rima-item">
                  <span className="rima-sev info">Diabaikan</span>
                  {finding.message}
                  <div className="rima-item-actions">
                    <button type="button" className="rima-chip" onClick={() => st.undismiss(entry.k)}>Batalkan</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tour && (
        <RimaTour
          tour={tour.script}
          initialStep={tour.from}
          onClose={() => setTour(null)}
        />
      )}

      {!tour && <button
        type="button"
        className="rima-toggle"
        onPointerDown={onDragDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
        onPointerCancel={onDragUp}
        onClick={() => {
          // Drag baru saja terjadi → telan klik (jangan buka panel saat mendaratkan roket)
          if (dragRef.current.moved) { dragRef.current.moved = false; return }
          const next = !open
          setOpen(next)
          if (next) {
            if (active.length > 0) setTab('temuan')
            else openChatTab()
            resetDozeRef.current?.()  // buka panel = interaksi → reset loop ngantuk
            // sapa: lambaian tiap panel dibuka (pivot bahu — fix "tangan error")
            setGesture('wave')
            if (gestureTimer.current) window.clearTimeout(gestureTimer.current)
            gestureTimer.current = window.setTimeout(() => setGesture('idle'), 2600)
          }
          setBubble(null)
        }}
        aria-label={`Buka panel RIMA${active.length > 0 ? ` — ${active.length} temuan aktif` : ''}`}
        aria-expanded={open}
      >
        <span className="rima-pose" ref={poseRef}>
          <span className="rima-streaks" aria-hidden="true"><i /><i /><i /></span>
          <RimaAvatar state={avatarState} gesture={gesture} reaction={reaction} talking={!!bubble} sleeping={sleeping} dozing={dozing} size={62} />
        </span>
        {active.length > 0 && (
          <span className={`rima-badge${hasCritical ? '' : hasWarn ? ' warn' : ''}`}>{active.length}</span>
        )}
      </button>}
    </div>
  )
}

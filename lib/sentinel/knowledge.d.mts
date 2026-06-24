// Deklarasi tipe untuk knowledge.mjs (shared TS runtime + node scripts)
export interface RimaChip {
  l: string
  q: string
  /** Id tur F3 — chip memulai tur, bukan mengirim pertanyaan. */
  tour?: string
  /** IK-2: chip = link langsung ke route (Rima render <Link>, user yang klik) — Model A′/G1. */
  href?: string
}

export interface RimaKbEntry {
  title: string
  keywords: string[]
  answers: string[]
  chips: RimaChip[]
}

export interface RimaAnswerSet {
  title?: string
  answers: string[]
  chips: RimaChip[]
}

export declare const RIMA_KB: Record<string, RimaKbEntry>
export declare const MODULE_FALLBACK: Record<string, RimaAnswerSet>
export declare const RIMA_FALLBACK: RimaAnswerSet
export declare const RIMA_GREETING: RimaAnswerSet
/** B3 — ditawarkan saat ≥2 pertanyaan gagal beruntun (1×/sesi). */
export declare const RIMA_CONFUSED: RimaAnswerSet
/** B4 — ringkasan fitur baru; version = penanda seenVersion (sumber kebenaran). */
export declare const RIMA_WHATS_NEW: RimaAnswerSet & { version: string }
/** Sapaan proaktif ambient (F4b) — statis, throttle 1×/sesi/jenis di SentinelBot.
 *  `{nama}` di-substitusi nama user (atau dihapus jika tak ada) di SentinelBot. */
export declare const AMBIENT_GREETINGS: { id: string; fromHour: number; toHour: number; text: string }[]
/** Pengingat istirahat saat user bekerja terlalu lama (F4c) — token `{nama}`. */
export declare const WORK_BREAK_REMINDERS: string[]
/** Celetukan idle acak saat user diam (F4c) — token `{nama}` opsional. */
export declare const IDLE_CHATTER: string[]
/** Tips kontekstual per prefix path modul (F4c) — token `{nama}` opsional. */
export declare const MODULE_TIPS: Record<string, string[]>

export declare function intentTitle(intent: string): string
export declare function kbKeywords(): Record<string, string[]>
export declare function resolveAnswer(intent: string): RimaAnswerSet | null

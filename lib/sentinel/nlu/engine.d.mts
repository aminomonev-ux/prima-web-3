// Deklarasi tipe untuk engine.mjs (shared TS runtime + node scripts)
export interface RimaModel {
  v: number
  /** Hash konten GOLDEN-QUESTIONS.md sumber — dipakai cek drift di CI */
  srcHash: string
  nb: {
    classes: Record<string, { d: number; n: number; tf: Record<string, number> }>
    totalDocs: number
    vocabSize: number
  }
  idf: Record<string, number>
  /** [tokens-joined, intent, star 0|1] — dok TF-IDF dari pertanyaan asli */
  docs: [string, string, number][]
}

export interface RimaCandidate {
  intent: string
  score: number
}

export interface RimaClassification {
  intent: string | null
  score: number
  source: 'deny' | 'keyword' | 'nb' | 'tfidf' | 'clause' | 'fallback'
  candidates: RimaCandidate[]
  /** Klausa kedua yang juga terdeteksi kuat (M3) — tawarkan via chip */
  alsoAsked: string | null
}

export declare function checkDeny(rawText: string): string | null
export declare function classify(
  rawText: string,
  model: RimaModel,
  kbKeywords?: Record<string, string[]>,
): RimaClassification

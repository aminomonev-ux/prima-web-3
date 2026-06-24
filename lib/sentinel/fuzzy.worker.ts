// lib/sentinel/fuzzy.worker.ts — Web Worker scan fuzzy O(n²) off main-thread (Block C).
// Terima leaf rows (FuzzyRow), balikin pasangan near-duplicate. Logika scan = fuzzy.ts
// (sama persis dgn jalur sinkron). G2: data statis, tanpa eval/instruksi dinamis.
import { findFuzzyDupPairs, type FuzzyPair, type FuzzyRow } from './fuzzy'

export interface FuzzyReq { reqId: number; rows: FuzzyRow[] }
export interface FuzzyRes { reqId: number; pairs: FuzzyPair[] }

const ctx = self as unknown as Worker
ctx.onmessage = (e: MessageEvent<FuzzyReq>) => {
  const { reqId, rows } = e.data
  ctx.postMessage({ reqId, pairs: findFuzzyDupPairs(rows) } satisfies FuzzyRes)
}

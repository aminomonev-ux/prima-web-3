// Deklarasi tipe untuk normalize.mjs (shared TS runtime + node scripts)
export declare const SYNONYMS: Record<string, string>
export declare const STOPWORDS: Set<string>
export declare function stem(word: string): string
export declare function normalize(text: string): string
export declare function tokenize(text: string): string[]
export declare function levenshtein(a: string, b: string, maxDist?: number): number

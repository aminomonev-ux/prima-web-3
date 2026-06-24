// Deklarasi tipe untuk calc.mjs (kalkulator RIMA F5a — shared TS + node).
export declare function fmtNum(n: number): string
export declare function evalArith(input: string):
  | { ok: true; value: number }
  | { ok: false; reason: string }
export declare function terbilang(n: number): string
/** Router: kembalikan jawaban siap-tampil, atau null jika bukan hitungan. */
export declare function tryCalc(text: string):
  | { ok: true; kind: string; reply: string }
  | null

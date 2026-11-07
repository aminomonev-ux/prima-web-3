// Kata yang sedang dicari panel Cari & Ganti, untuk disorot tiap editor narasi yang terbuka.
// Di luar komponen: panel dan editornya tidak bertetangga, dan editor yang dibuka belakangan ikut menyorot.
import type { OpsiCari } from './cari-ganti';

let kini: OpsiCari | null = null;
const pendengar = new Set<() => void>();
export const sorotCariKini = () => kini;
export const aturSorotCari = (o: OpsiCari | null) => { kini = o; pendengar.forEach(f => f()); };
export const dengarSorotCari = (f: () => void) => { pendengar.add(f); return () => { pendengar.delete(f); }; };

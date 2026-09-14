// scripts/_prosa-layar.ts — kalimat yang BENAR-BENAR dibaca orang, dipungut lewat AST.
//
// Dipakai uji Tahap 18. Pencocokan teks mentah tidak bisa membedakan `isBeku` (nama
// variabel), `'beku'` (nama kelas CSS), dan "sedang dibekukan" (kalimat di layar). Tes bahasa
// yang memakainya akan menyalak pada kode yang benar, atau dilonggarkan sampai tidak
// menangkap apa pun. Yang dipungut di sini hanya literal string & teks JSX, dikurangi yang
// memang bukan untuk dibaca: nama kelas, kunci, SQL, log konsol, perbandingan, dan `detail`
// jejak audit (sengaja tidak diubah supaya riwayat lama dan baru tetap sebunyi).
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

export type Prosa = { berkas: string; baris: number; teks: string }

const ATRIBUT_BUKAN_PROSA = new Set(['className', 'key', 'style', 'href', 'src', 'type', 'name', 'id', 'role', 'value', 'variant', 'size', 'rel', 'target', 'inputMode', 'autoComplete', 'list', 'd', 'viewBox'])
const PROPERTI_BUKAN_PROSA = new Set(['detail', 'event', 'eventType', 'event_type', 'code', 'kunci', 'key', 'method', 'className', 'variant'])
const OPERATOR_BANDING = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
])

function lewati(n: ts.Node): boolean {
  if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return true
  if (ts.isTaggedTemplateExpression(n)) return true
  if (ts.isTypeNode(n)) return true
  if (ts.isJsxAttribute(n) && ATRIBUT_BUKAN_PROSA.has(n.name.getText())) return true
  if (ts.isPropertyAssignment(n) && PROPERTI_BUKAN_PROSA.has(n.name.getText().replace(/['"]/g, ''))) return true
  if (ts.isCallExpression(n)) {
    const f = n.expression.getText()
    if (/^console\./.test(f) || /\.(includes|startsWith|endsWith|indexOf|split|replace|test|has|get|set)$/.test(f)) return true
  }
  // `x === 'readonly'` membandingkan kunci, bukan menulis kalimat.
  if (ts.isBinaryExpression(n) && OPERATOR_BANDING.has(n.operatorToken.kind)) return true
  return false
}

export function prosaDariTeks(berkas: string, isi: string): Prosa[] {
  const jenis = berkas.endsWith('x') ? ts.ScriptKind.TSX : berkas.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const sf = ts.createSourceFile(berkas, isi, ts.ScriptTarget.Latest, true, jenis)
  const hasil: Prosa[] = []
  const catat = (n: ts.Node, teks: string) => {
    const t = teks.replace(/\s+/g, ' ').trim()
    if (t) hasil.push({ berkas: berkas.replace(/\\/g, '/'), baris: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, teks: t })
  }
  const jalan = (n: ts.Node): void => {
    if (lewati(n)) return
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) catat(n, n.text)
    else if (ts.isTemplateExpression(n)) catat(n, n.head.text + n.templateSpans.map((s) => ' … ' + s.literal.text).join(''))
    else if (ts.isJsxText(n)) catat(n, n.text)
    ts.forEachChild(n, jalan)
  }
  jalan(sf)
  return hasil
}

export const prosaDari = (berkas: string): Prosa[] => prosaDariTeks(berkas, fs.readFileSync(berkas, 'utf8'))

export function berkasDi(dir: string, akhiran: RegExp, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const j = path.join(dir, e.name)
    if (e.isDirectory()) berkasDi(j, akhiran, acc)
    else if (akhiran.test(e.name)) acc.push(j.replace(/\\/g, '/'))
  }
  return acc
}

/**
 * Kalimat = ada spasinya, bukan blok CSS, dan bukan alamat. Satu kata tanpa spasi hampir
 * selalu kunci, kelas, atau nilai enum — itu diperiksa terpisah lewat daftar kata tunggal.
 * Alamat perlu disaring sendiri: sisipan template ditulis ` … `, jadi `/api/${id}/x` ikut
 * berspasi.
 */
export const kalimat = (p: Prosa) =>
  /\s/.test(p.teks) && !/\{[^}]*:[^}]*\}/.test(p.teks) && !/^(\/|https?:\/\/|\?)/.test(p.teks)

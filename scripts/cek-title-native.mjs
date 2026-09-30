#!/usr/bin/env node
// ─── PRIMA — Gate J: tooltip bawaan browser (`title=`) ──────────────────────
//
// DESIGN-SYSTEM "Tooltips — STANDAR TUNGGAL": tooltip memakai `data-tooltip` (CSS) atau
// portal `.blud-tip-portal`, BUKAN atribut HTML `title` — kotak putih bawaan browser yang
// tidak ikut tema, muncul terlambat, dan tidak bisa dibaca di layar sentuh.
// Audit 2026-09-29 (K1) menemukan 21 sisa di 4 berkas; gate ini menjaga supaya nol.
//
// Yang diperiksa hanya elemen HTML bawaan (nama tag huruf kecil: div, button, td, …).
// `title` pada KOMPONEN (<PanelHeader title="…">, <Modal title="…">) adalah prop biasa.
// Dibaca lewat parser TypeScript, bukan regex: tag JSX bisa lintas baris dan memuat `=>`.
//
//   node scripts/cek-title-native.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const ROOT = process.cwd()
const DIR = ['app', 'components', 'lib']
const LEWATI = new Set(['node_modules', '.next', '_archive', '.claude'])
// Pada elemen ini `title` bukan tooltip: <iframe title> adalah nama aksesibel bingkai yang
// DIWAJIBKAN WCAG (4.1.2), <abbr title> kepanjangan singkatan.
const TAG_BOLEH = new Set(['iframe', 'abbr'])

function jelajah(dir, out = []) {
  let isi
  try { isi = readdirSync(dir) } catch { return out }
  for (const n of isi) {
    if (LEWATI.has(n)) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) jelajah(p, out)
    else if (n.endsWith('.tsx') || n.endsWith('.jsx')) out.push(p)
  }
  return out
}

/** `title=` pada elemen HTML bawaan di satu sumber TSX → [{ baris, tag }]. */
export function cariTitleNative(sumber, nama = 'x.tsx') {
  const sf = ts.createSourceFile(nama, sumber, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const temuan = []
  const kunjungi = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf)
      if (/^[a-z]/.test(tag) && !TAG_BOLEH.has(tag)) {
        for (const a of node.attributes.properties) {
          if (ts.isJsxAttribute(a) && a.name.getText(sf) === 'title') {
            temuan.push({ baris: sf.getLineAndCharacterOfPosition(a.getStart(sf)).line + 1, tag })
          }
        }
      }
    }
    ts.forEachChild(node, kunjungi)
  }
  kunjungi(sf)
  return temuan
}

function main() {
  const semua = []
  for (const d of DIR) {
    for (const p of jelajah(join(ROOT, d))) {
      for (const t of cariTitleNative(readFileSync(p, 'utf8'), p)) semua.push(`${relative(ROOT, p)}:${t.baris}  <${t.tag} title=…>`)
    }
  }
  if (semua.length) {
    console.error(`✗ Gate J — ${semua.length} tooltip bawaan browser (title=) pada elemen HTML:`)
    for (const s of semua) console.error('  ' + s)
    console.error('  Ganti dengan data-tooltip (lihat docs/design/DESIGN-SYSTEM.md "Tooltips — STANDAR TUNGGAL").')
    process.exit(1)
  }
  console.log('✓ Gate J lolos — tidak ada title= bawaan browser pada elemen HTML.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()

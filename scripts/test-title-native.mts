// scripts/test-title-native.mts — regresi Gate J (tooltip bawaan browser, audit K1)
//
//   npx tsx scripts/test-title-native.mts

import { spawnSync } from 'node:child_process'
import { cariTitleNative } from './cek-title-native.mjs'

let lulus = 0
const gagal: string[] = []
function sama(nama: string, dapat: unknown, harap: unknown) {
  if (dapat === harap) lulus++
  else gagal.push(`${nama} — dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`)
}
const jumlah = (tsx: string) => cariTitleNative(tsx).length

sama('A1 title pada elemen HTML tertangkap', jumlah('const x = <button title="Hapus">x</button>'), 1)
sama('A2 select juga (bungkus dengan data-tooltip)', jumlah('const x = <select className="a" title="b"><option/></select>'), 1)
sama('A3 tag lintas baris ber-arrow `=>` tetap terbaca',
  jumlah('const x = (\n  <div\n    onClick={() => a > b}\n    title={teks}\n  />\n)'), 1)
sama('A4 prop title milik KOMPONEN bukan tooltip', jumlah('const x = <PanelHeader title="ANGGARAN" badge="1" />'), 0)
sama('A5 komponen bertitik juga', jumlah('const x = <Dialog.Root title="x" />'), 0)
sama('A6 iframe title = nama aksesibel (WCAG), dibiarkan', jumlah('const x = <iframe title="Pratinjau PDF" src="a" />'), 0)
sama('A7 elemen <title> di SVG bukan atribut', jumlah('const x = <svg><title>Ikon</title></svg>'), 0)
sama('A8 properti objek bukan atribut JSX', jumlah("confirmDialog({ title: 'Hapus', message: 'x' })"), 0)
sama('A9 data-tooltip tidak dihitung', jumlah('const x = <button data-tooltip="Hapus">x</button>'), 0)
sama('A10 baris temuan dilaporkan', cariTitleNative('\n\nconst x = <td title="a" />')[0]?.baris, 3)

const r = spawnSync(process.execPath, ['scripts/cek-title-native.mjs'], { encoding: 'utf8' })
sama('B1 repo bersih dari title= bawaan browser', r.status, 0)

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
for (const g of gagal) console.log('  GAGAL ' + g)
if (r.status !== 0) console.log(r.stderr)
process.exit(gagal.length ? 1 : 0)

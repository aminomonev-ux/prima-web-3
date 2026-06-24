// Tur Import dari Usulan ke DPA — skrip dari WORKFLOW-blud-dpa.md (Tur 2).

import type { TourScript } from './index'

export const importUsulan: TourScript = {
  id: 'import-usulan',
  title: 'Tarik item Usulan ke DPA',
  page: '/blud/dpa',
  steps: [
    { anchor: 'dpa.kebab-aksi', waitFor: 'dpa.kebab-import', text: 'Klik kebab ⋮ di baris L2 ke bawah — kutunggu sampai menunya terbuka ya.' },
    { anchor: 'dpa.kebab-import', waitFor: 'dpa.import-mode-fill', text: 'Nah, pilih Import dari Usulan — hanya item final yang disetujui Kabag yang bisa ditarik.' },
    { anchor: 'dpa.import-mode-fill', text: 'Mode pertama: Isi Baris Ini — satu item menimpa uraian/vol/satuan/harga baris yang kamu klik.' },
    { anchor: 'dpa.import-mode-insert', text: 'Mode kedua: Sisip Baris Baru — multi item, masuk sebagai baris baru di bawah baris anchor.' },
    { anchor: 'dpa.import-susunan', text: 'Mode sisip: atur pohonnya di Panel Susunan — ◀▶ ganti level, ↑↓ ubah urutan.' },
    { anchor: 'dpa.import-submit', text: 'Item yang sudah ada di form otomatis tidak bisa dicentang — pengaman anti entri dobel.' },
  ],
  closing: 'Kalau masih ada kembaran lolos, banner peringatanku akan menunjukkannya — klik untuk lompat ke barisnya. Mau tur lain?',
}

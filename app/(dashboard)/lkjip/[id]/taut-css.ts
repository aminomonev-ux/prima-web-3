// Gaya bersama modal Tabel dari Modul & Angka dari Modul (kelas .lk-taut-*).

export const TAUT_CSS = `
  .lk-taut { width: min(1120px, 96vw); max-height: 92vh; display: flex; flex-direction: column; padding: 18px 20px; }
  .lk-taut-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .lk-taut-head h3 { margin: 0; }
  .lk-taut-x { background: none; border: none; color: #85B7EB; cursor: pointer; padding: 4px; border-radius: 6px; display: inline-flex; }
  .lk-taut-x:hover { color: #E6F1FB; background: rgba(255,255,255,0.06); }
  .lk-taut-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-right: 4px; margin: 10px 0; }
  .lk-taut-sec { border: 1px solid #0C447C; border-radius: 10px; padding: 12px; margin-bottom: 12px; }
  .lk-taut-judul { font-size: 12px; font-weight: 800; letter-spacing: .03em; color: #85B7EB; margin-bottom: 10px; }
  .lk-taut-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
  .lk-taut-grid > label, .lk-taut-cek { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; font-weight: 600; color: #B5D4F4; }
  .lk-taut-cek > span { display: flex; flex-wrap: wrap; gap: 8px; }
  .lk-taut select, .lk-taut .lk-taut-grid input, .lk-taut input.lk-taut-nama, .lk-taut input.lk-taut-rumus { background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; color: #E6F1FB; padding: 6px 8px; font-size: 12.5px; margin: 0; width: auto; }
  .lk-taut .lk-taut-grid input { width: 100%; }
  .lk-taut select:focus, .lk-taut input:focus { outline: none; border-color: #185FA5; }
  .lk-taut select:disabled { opacity: .5; cursor: not-allowed; }
  .lk-taut-aksi { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
  .lk-taut-ok { font-size: 11.5px; color: #7BE0BD; }
  .lk-taut-peringatan { font-size: 11.5px; color: #FBBF24; }
  .lk-taut-galat { margin-top: 10px; padding: 8px 10px; border-radius: 8px; font-size: 12px; background: rgba(226,75,74,0.14); border: 1px solid #E24B4A; color: #FCA5A5; }
  .lk-taut-galat.kecil { flex-basis: 100%; margin-top: 2px; padding: 4px 8px; }
  .lk-taut-catatan, .lk-taut-masalah { margin: 10px 0 0; padding: 8px 12px 8px 26px; border-radius: 8px; font-size: 11.5px; line-height: 1.5; background: rgba(239,159,39,0.12); border: 1px solid #EF9F27; color: #FBBF24; display: flex; flex-direction: column; gap: 3px; }
  .lk-taut-masalah { margin: 0 0 10px; }
  .lk-taut-kolom { display: flex; flex-direction: column; gap: 6px; }
  .lk-taut-baris { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 8px; border: 1px solid #0C447C; border-radius: 8px; background: #020F1C; }
  .lk-taut-baris.kurang { border-color: #EF9F27; }
  .lk-taut-huruf { font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 12px; color: #EF9F27; min-width: 16px; }
  .lk-taut input.lk-taut-nama { width: 170px; }
  .lk-taut-isi { max-width: 260px; }
  .lk-taut input.lk-taut-rumus { width: 150px; font-family: 'JetBrains Mono', monospace; }
  .lk-taut-inline { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: #B5D4F4; cursor: pointer; user-select: none; }
  .lk-taut .lk-taut-inline input { accent-color: #7C5CFC; margin: 0; width: auto; padding: 0; }
  .lk-taut-ctl { display: inline-flex; gap: 2px; margin-left: auto; }
  .lk-taut-ctl button { background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; border-radius: 6px; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; }
  .lk-taut-ctl button:disabled { opacity: .35; cursor: not-allowed; }
  .lk-taut-ctl button:hover:not(:disabled) { border-color: #185FA5; color: #E6F1FB; }
  .lk-taut-tambah { display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .lk-taut-tambah:disabled { opacity: .4; cursor: not-allowed; }
  .lk-taut-daftar { max-height: 230px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; margin-top: 8px; border: 1px solid #0C447C; border-radius: 8px; padding: 6px; background: #020F1C; }
  .lk-taut-inline.baris { padding-top: 2px; padding-bottom: 2px; }
  .lk-taut-inline .tebal { font-weight: 700; color: #E6F1FB; }
  .lk-taut-templat { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
  .lk-taut-templat button { display: flex; flex-direction: column; gap: 3px; text-align: left; background: #020F1C; border: 1px solid #0C447C; border-radius: 10px; padding: 9px 11px; color: #E6F1FB; cursor: pointer; font-size: 12.5px; }
  .lk-taut-templat button span { font-size: 11px; color: #85B7EB; line-height: 1.4; }
  .lk-taut-templat button:hover:not(:disabled) { border-color: #7C5CFC; }
  .lk-taut-templat button:disabled { opacity: .5; cursor: not-allowed; }
  .lk-taut-ket { font-size: 11px; color: #85B7EB; }
  .lk-taut-pratinjau { overflow-x: auto; }
  .lk-taut-pratinjau table { border-collapse: collapse; font-size: 11.5px; min-width: 100%; }
  .lk-taut-pratinjau th, .lk-taut-pratinjau td { border: 1px solid #0C447C; padding: 4px 6px; vertical-align: top; color: #E6F1FB; }
  .lk-taut-pratinjau th, .lk-taut-pratinjau tr.kepala td { background: rgba(133,183,235,0.13); font-weight: 700; text-align: center; }
  .lk-kisi { margin-bottom: 12px; }
  .lk-kisi-alat { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; }
  .lk-kisi-alat button { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .lk-kisi-alat button:hover:not(:disabled) { border-color: #185FA5; color: #E6F1FB; }
  .lk-kisi-alat button:disabled { opacity: .4; cursor: not-allowed; }
  .lk-kisi-tabel { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
  .lk-kisi-tabel th { color: #85B7EB; font-size: 10.5px; font-weight: 700; padding: 2px; text-align: center; }
  .lk-kisi-tabel td { position: relative; border: 1px solid #0C447C; background: rgba(133,183,235,0.13); padding: 0; vertical-align: middle; }
  .lk-kisi-tabel td.pilih { background: rgba(239,159,39,0.18); box-shadow: inset 0 0 0 1px #EF9F27; }
  .lk-taut .lk-kisi-tabel td input { width: 100%; background: transparent; border: none; color: #E6F1FB; padding: 14px 6px 6px; font-size: 12px; font-weight: 700; text-align: center; }
  .lk-taut .lk-kisi-tabel td input:focus { outline: 1px solid #185FA5; }
  .lk-kisi-tanda { position: absolute; top: 1px; left: 4px; font-size: 9.5px; font-weight: 700; color: #EF9F27; pointer-events: none; }
  @media (max-width: 520px) {
    .lk-taut { padding: 14px 12px; }
    .lk-taut input.lk-taut-nama, .lk-taut .lk-taut-isi, .lk-taut input.lk-taut-rumus { width: 100%; max-width: none; }
  }
  [data-theme="light"] .lk-taut-sec, [data-theme="light"] .lk-taut-baris, [data-theme="light"] .lk-taut-daftar { border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-taut-baris, [data-theme="light"] .lk-taut-daftar { background: #F9FAFB; }
  [data-theme="light"] .lk-taut-baris.kurang { border-color: #EF9F27; }
  [data-theme="light"] .lk-taut-judul, [data-theme="light"] .lk-taut-x { color: #6B7280; }
  [data-theme="light"] .lk-taut-grid > label, [data-theme="light"] .lk-taut-cek, [data-theme="light"] .lk-taut-inline { color: #374151; }
  [data-theme="light"] .lk-taut-inline .tebal { color: #0F0F12; }
  [data-theme="light"] .lk-taut select, [data-theme="light"] .lk-taut .lk-taut-grid input, [data-theme="light"] .lk-taut input.lk-taut-nama, [data-theme="light"] .lk-taut input.lk-taut-rumus { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #0F0F12; }
  [data-theme="light"] .lk-taut-ctl button, [data-theme="light"] .lk-taut-tambah { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #374151; }
  [data-theme="light"] .lk-taut-templat button { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #0F0F12; }
  [data-theme="light"] .lk-taut-templat button span, [data-theme="light"] .lk-taut-ket { color: #6B7280; }
  [data-theme="light"] .lk-taut-templat button:hover:not(:disabled) { border-color: #7C5CFC; }
  [data-theme="light"] .lk-taut-ok { color: #0E7A55; }
  [data-theme="light"] .lk-taut-peringatan, [data-theme="light"] .lk-taut-catatan, [data-theme="light"] .lk-taut-masalah { color: #B45309; }
  [data-theme="light"] .lk-taut-galat { color: #B91C1C; }
  [data-theme="light"] .lk-taut-pratinjau th, [data-theme="light"] .lk-taut-pratinjau td { border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .lk-taut-pratinjau th, [data-theme="light"] .lk-taut-pratinjau tr.kepala td { background: #EDEDED; }
  [data-theme="light"] .lk-kisi-alat button { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #374151; }
  [data-theme="light"] .lk-kisi-tabel th { color: #6B7280; }
  [data-theme="light"] .lk-kisi-tabel td { background: #EDEDED; border-color: rgba(0,0,0,.15); }
  [data-theme="light"] .lk-kisi-tabel td.pilih { background: rgba(124,92,252,0.14); box-shadow: inset 0 0 0 1px #7C5CFC; }
  [data-theme="light"] .lk-taut .lk-kisi-tabel td input { color: #0F0F12; }
  [data-theme="light"] .lk-kisi-tanda { color: #B45309; }
`;

// CSS editor tabel bersama (LKJIP & IKI CUSTOM) — dipindah UTUH dari ED_CSS LKJIP, urutan aturannya
// dipertahankan. LKJIP menyisipkannya di ED_CSS di tempat aturan tabel pertama dulu berada; halaman lain
// memasangnya sendiri di <style>. Termasuk menu `RowMenu` (dipakai pohon dokumen LKJIP juga).

export const TABEL_CSS = `
  /* 450 = lapisan modal: di atas FloatingDock (400) — menu klik-kanan tabel setinggi ± 540 px dulu
     tertutup dock di bagian bawahnya (Kosongkan, Hapus baris/kolom); di bawah confirmDialog (4000). */
  .lk-rowmenu-bg { position: fixed; inset: 0; z-index: 450; }
  .lk-rowmenu { position: fixed; background: #042C53; border: 1px solid #0C447C; border-radius: 10px; padding: 7px; box-shadow: 0 14px 34px rgba(0,0,0,.5); display: flex; flex-direction: column; gap: 1px; animation: lk-rowmenu-in .14s ease both; }
  @keyframes lk-rowmenu-in { from { opacity: 0; transform: translateY(-5px) scale(.97); } to { opacity: 1; transform: none; } }
  .lk-rowmenu-item { display: flex; align-items: center; gap: 9px; padding: 7px 10px; border: none; background: none; color: #D6E6F7; cursor: pointer; border-radius: 6px; font-size: 12.5px; text-align: left; width: 100%; }
  .lk-rowmenu-item:hover:not(.disabled) { background: rgba(124,92,252,0.20); color: #fff; }
  /* Yang diredupkan isinya, bukan tombolnya: opacity pada tombol ikut meredupkan tooltip alasannya (::after). */
  .lk-rowmenu-item.disabled { cursor: not-allowed; }
  .lk-rowmenu-item.disabled > span { opacity: .4; }
  .lk-rowmenu-item.danger { color: #FCA5A5; border-top: 1px solid #0C447C; margin-top: 3px; padding-top: 9px; border-radius: 0 0 6px 6px; }
  .lk-rowmenu-item.danger:hover:not(.disabled) { background: rgba(226,75,74,0.18); color: #fff; }
  .lk-rowmenu-ic { display: inline-flex; flex-shrink: 0; color: #85B7EB; }
  .lk-rowmenu-item:hover:not(.disabled) .lk-rowmenu-ic, .lk-rowmenu-item.danger .lk-rowmenu-ic { color: inherit; }
  .lk-rowmenu-lb { white-space: nowrap; flex: 1; }
  .lk-rowmenu-item.pisah { border-top: 1px solid #0C447C; margin-top: 3px; padding-top: 9px; border-radius: 0 0 6px 6px; }
  .lk-rowmenu-kb { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #85B7EB; opacity: .8; white-space: nowrap; }
  [data-theme="light"] .lk-rowmenu-item.pisah { border-top-color: rgba(0,0,0,.1); }
  [data-theme="light"] .lk-rowmenu-kb { color: #6B7280; }
  .lk-colresize { position: absolute; top: 0; right: -3px; width: 7px; height: 100%; cursor: col-resize; z-index: 3; }
  .lk-colresize:hover { background: rgba(239,159,39,0.5); }
  .lk-tabel-scroll { overflow-x: auto; }
  .lk-tabel { border-collapse: collapse; width: 100%; }
  .lk-tabel th, .lk-tabel td { border: 1px solid #0C447C; padding: 0; vertical-align: top; }
  .lk-tabel th { background: rgba(255,255,255,0.03); }
  .lk-tabel input { width: 100%; min-width: 90px; background: transparent; border: none; color: #E6F1FB; padding: 7px 8px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; }
  .lk-tabel input:focus { outline: 1px solid #185FA5; }
  .lk-tabel th input, .lk-tabel td input { min-width: 0; }
  .lk-tabel tr.lk-hrow td { background: rgba(133,183,235,0.13); }
  .lk-tabel tr.lk-hrow input { font-weight: 700; }
  [data-theme="light"] .lk-tabel tr.lk-hrow td { background: #EDEDED; }
  .lk-rownum { background: rgba(255,255,255,0.03); color: #85B7EB; font-size: 11px; text-align: center; padding: 4px 6px; white-space: nowrap; }
  .lk-tabel-ctl { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
  .lk-tabel-ctl > button { background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .lk-tabel-ctl > button:hover:not(:disabled) { border-color: #185FA5; color: #E6F1FB; }
  .lk-tabel-ctl > button:disabled { opacity: .4; cursor: not-allowed; }
  .lk-taut-bar { margin-top: 10px; padding: 8px 10px; border: 1px solid rgba(124,92,252,0.5); border-radius: 8px; background: rgba(124,92,252,0.10); display: flex; flex-direction: column; gap: 6px; font-size: 11.5px; color: #B5D4F4; }
  .lk-taut-bar-info { display: flex; align-items: flex-start; gap: 6px; line-height: 1.5; }
  .lk-taut-bar-info b { color: #E6F1FB; font-weight: 700; }
  .lk-taut-bar-catatan { margin: 0; padding-left: 20px; color: #FBBF24; line-height: 1.5; }
  .lk-taut-bar-aksi { display: flex; gap: 6px; flex-wrap: wrap; }
  .lk-taut-bar-aksi button { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .lk-taut-bar-aksi button:hover:not(:disabled) { border-color: #185FA5; color: #E6F1FB; }
  .lk-taut-bar-aksi button:disabled { opacity: .45; cursor: not-allowed; }
  [data-theme="light"] .lk-taut-bar { background: #EDE7FE; border-color: rgba(124,92,252,.45); color: #374151; }
  [data-theme="light"] .lk-taut-bar-info b { color: #111827; }
  [data-theme="light"] .lk-taut-bar-catatan { color: #B45309; }
  [data-theme="light"] .lk-taut-bar-aksi button { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #374151; }
  .lk-tabel-tools { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 8px; padding: 6px; background: rgba(255,255,255,0.03); border: 1px solid #0C447C; border-radius: 8px; }
  .lk-tabel-tools button { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 7px; background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; border-radius: 6px; cursor: pointer; font-size: 13px; line-height: 1; }
  .lk-tabel-tools button:hover:not(:disabled) { border-color: #185FA5; color: #E6F1FB; background: rgba(255,255,255,0.09); }
  .lk-tabel-tools button:disabled { opacity: .38; cursor: not-allowed; }
  .lk-tt-sep { width: 1px; height: 20px; background: #0C447C; margin: 0 3px; }
  .lk-tabel td.lk-cell-sel { background: rgba(239,159,39,0.12); }
  .lk-tabel td.lk-cell-aktif { outline: 2px solid #EF9F27; outline-offset: -2px; }
  .lk-tabel td.lk-cell-galat .lk-sel-isi { color: #FCA5A5; font-weight: 700; }
  .lk-tabel-scroll { position: relative; }
  .lk-tabel-scroll:focus-within .lk-cell-aktif { outline-width: 2px; }
  .lk-tangkap { position: absolute; left: 0; top: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; resize: none; border: 0; padding: 0; }
  .lk-tabel-kanvas { position: relative; display: inline-block; min-width: 100%; }
  /* Teks panjang terbungkus seperti di Word (§5.8) — dulu satu baris terpotong "…" padahal Word membungkusnya. */
  .lk-sel-isi { padding: 7px 8px; min-height: 31px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.35; color: #E6F1FB; white-space: pre-wrap; overflow-wrap: break-word; overflow: hidden; cursor: cell; user-select: none; }
  .lk-tabel tr.lk-hrow .lk-sel-isi { font-weight: 700; }
  .lk-tabel th.lk-colhead { position: relative; color: #85B7EB; font-size: 11px; font-weight: 700; text-align: center; padding: 4px 0; cursor: s-resize; user-select: none; }
  .lk-tabel th.lk-colhead.aktif, .lk-tabel td.lk-rownum.aktif { background: rgba(239,159,39,0.18); color: #EF9F27; }
  .lk-tabel .lk-rownum { cursor: e-resize; user-select: none; }
  .lk-tabel th.lk-sudut { cursor: pointer; }
  .lk-colresize { right: -4px; width: 8px; }
  .lk-lebar-tip { position: absolute; top: -26px; right: -4px; z-index: 5; background: #020F1C; border: 1px solid #EF9F27; color: #EF9F27; border-radius: 6px; padding: 2px 6px; font-size: 11px; white-space: nowrap; pointer-events: none; }
  .lk-batas-kertas { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px dashed #85B7EB; opacity: .45; pointer-events: none; }
  .lk-batas-kertas.lewat { border-left-color: #EF9F27; opacity: .9; }
  .lk-tabel-petunjuk { margin-top: 6px; font-size: 11px; color: #85B7EB; line-height: 1.5; }
  .lk-tabel-sumber { width: 100%; margin-top: 6px; background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; color: #B5D4F4; padding: 6px 10px; font-size: 12px; font-style: italic; }
  .lk-tabel-atur { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; margin-top: 8px; }
  .lk-tabel-atur-judul { font-size: 10px; font-weight: 800; letter-spacing: .1em; color: #85B7EB; text-transform: uppercase; }
  .lk-tabel-atur-cek { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: #B5D4F4; cursor: pointer; }
  .lk-sel-isi.tegak { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; min-height: 0; margin: 0 auto; text-overflow: clip; }
  .lk-tabel td.lk-cell-nomor .lk-sel-isi { color: #85B7EB; }
  .lk-tabel-lebar, .lk-tabel-galat { margin-top: 8px; padding: 7px 10px; border-radius: 8px; font-size: 11.5px; line-height: 1.5; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
  .lk-tabel-lebar { background: rgba(239,159,39,0.12); border: 1px solid #EF9F27; color: #FBBF24; }
  .lk-tabel-lebar button { background: rgba(255,255,255,0.05); border: 1px solid #EF9F27; color: #FBBF24; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .lk-tabel-galat { background: rgba(226,75,74,0.12); border: 1px solid #E24B4A; color: #FCA5A5; }
  /* Kolom isian tangan di tabel tertaut — satu-satunya sel badan yang bisa diketik. */
  .lk-tabel td.lk-cell-tangan { background: rgba(124,92,252,0.08); box-shadow: inset 2px 0 0 rgba(124,92,252,0.55); }
  [data-theme="light"] .lk-tabel td.lk-cell-tangan { background: rgba(124,92,252,0.07); }
  /* K1: select tak bisa menggambar ::after — tooltip-nya dipasang di pembungkus. */
  .lk-tt-tip { display: inline-flex; }
  .lk-tt-sel { height: 28px; background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; border-radius: 6px; font-size: 11px; padding: 0 4px; cursor: pointer; }
  .lk-tt-sel:disabled { opacity: .38; cursor: not-allowed; }
  .lk-tt-sel option { background: #020F1C; color: #E6F1FB; }
  .lk-fbar { display: flex; align-items: center; margin-bottom: 8px; border: 1px solid #0C447C; border-radius: 6px; overflow: hidden; background: #020F1C; }
  .lk-fbar-ref { min-width: 54px; text-align: center; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; color: #EF9F27; padding: 6px 8px; border-right: 1px solid #0C447C; }
  .lk-fbar-fx { font-style: italic; font-family: Georgia, 'Times New Roman', serif; color: #85B7EB; padding: 0 10px; border-right: 1px solid #0C447C; font-size: 13px; }
  .lk-fbar-in { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: #E6F1FB; padding: 7px 10px; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
  .lk-fbar-in:disabled { color: #5E8BBE; }
  textarea.lk-fbar-in { resize: none; line-height: 1.4; align-self: stretch; }
  /* ── Tahap B/C (konsep tabel-excel §5.6–5.11, §8) ── */
  /* Kepala & huruf kolom tetap terlihat (§5.11): wadah bergulir sendiri, sel kepala sticky dgn latar
     PEKAT (lapisan warna di atas warna blok) — latar tembus pandang memperlihatkan isi yang lewat di bawahnya. */
  .lk-tabel-scroll { max-height: 70vh; overflow: auto; }
  /* (0,2,2): harus mengalahkan ".lk-tabel th.lk-colhead { position: relative }" (0,2,1) — dengan
     kekhususan di bawahnya huruf kolom ikut tergulir pergi (terukur −500 px, 2026-10-20). */
  .lk-tabel-scroll .lk-tabel thead th { position: sticky; top: 0; z-index: 3; background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), #042C53; }
  .lk-tabel-scroll .lk-tabel thead th.lk-colhead.aktif { background: linear-gradient(rgba(239,159,39,0.18), rgba(239,159,39,0.18)), #042C53; }
  .lk-tabel-scroll tr.lk-hrow > td { position: sticky; top: var(--lk-atas, 0); z-index: 2; background: linear-gradient(rgba(133,183,235,0.13), rgba(133,183,235,0.13)), #042C53; }
  .lk-tabel-scroll tr.lk-hrow > td.lk-cell-sel { background: linear-gradient(rgba(239,159,39,0.12), rgba(239,159,39,0.12)), linear-gradient(rgba(133,183,235,0.13), rgba(133,183,235,0.13)), #042C53; }
  .lk-tabel-scroll tr.lk-hrow > td.lk-rownum.aktif { background: linear-gradient(rgba(239,159,39,0.18), rgba(239,159,39,0.18)), #042C53; }
  .lk-tabel textarea.lk-sel-edit { display: block; width: 100%; min-width: 0; background: transparent; border: none; color: #E6F1FB; padding: 7px 8px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.35; resize: none; overflow: hidden; outline: 1px solid #185FA5; }
  .lk-tabel td.lk-pojok { position: relative; }
  .lk-isi-pegangan { position: absolute; right: -4px; bottom: -4px; width: 8px; height: 8px; background: #EF9F27; border: 1px solid #020F1C; cursor: crosshair; z-index: 4; }
  .lk-tabel td.lk-cell-isi { outline: 1px dashed #EF9F27; outline-offset: -2px; }
  .lk-tabel-scroll.lk-kuas .lk-sel-isi { cursor: copy; }
  .lk-tabel-tools button.on { background: rgba(239,159,39,0.18); border-color: #EF9F27; color: #EF9F27; }
  .lk-menu-teks { display: inline-flex; justify-content: center; width: 14px; font-size: 13px; line-height: 1; }
  .lk-tabel-status { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 4px 16px; margin-top: 4px; font-size: 11.5px; color: #85B7EB; }
  .lk-tabel-status b { color: #E6F1FB; font-family: 'JetBrains Mono', monospace; font-weight: 700; }
  .lk-cari { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; padding: 6px 8px; border: 1px solid #0C447C; border-radius: 6px; background: #020F1C; }
  .lk-cari-ic { color: #85B7EB; flex-shrink: 0; }
  .lk-cari-in { flex: 1 1 140px; min-width: 0; background: rgba(255,255,255,0.04); border: 1px solid #0C447C; border-radius: 6px; color: #E6F1FB; padding: 5px 8px; font-size: 12.5px; }
  .lk-cari-in:focus { outline: none; border-color: #185FA5; }
  .lk-cari-n { font-size: 11px; color: #85B7EB; min-width: 64px; }
  .lk-cari button { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 6px; background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .lk-cari button:hover:not(:disabled) { border-color: #185FA5; color: #E6F1FB; }
  .lk-cari button:disabled { opacity: .38; cursor: not-allowed; }
  .lk-cari-teks { padding: 0 10px !important; }
  [data-theme="light"] .lk-tabel tr.lk-hrow td.lk-cell-sel { background: linear-gradient(rgba(124,92,252,0.12), rgba(124,92,252,0.12)), #EDEDED; }
  [data-theme="light"] .lk-tabel-scroll .lk-tabel thead th { background: #F3F4F6; }
  [data-theme="light"] .lk-tabel-scroll .lk-tabel thead th.lk-colhead.aktif, [data-theme="light"] .lk-tabel-scroll tr.lk-hrow > td.lk-rownum.aktif { background: linear-gradient(rgba(124,92,252,0.14), rgba(124,92,252,0.14)), #F3F4F6; }
  [data-theme="light"] .lk-tabel textarea.lk-sel-edit { color: #0F0F12; outline-color: #7C5CFC; }
  [data-theme="light"] .lk-isi-pegangan { background: #7C5CFC; border-color: #FFFFFF; }
  [data-theme="light"] .lk-tabel td.lk-cell-isi { outline-color: #7C5CFC; }
  [data-theme="light"] .lk-tabel-tools button.on { background: rgba(124,92,252,0.14); border-color: #7C5CFC; color: #7C5CFC; }
  [data-theme="light"] .lk-tabel-status { color: #6B7280; }
  [data-theme="light"] .lk-tabel-status b { color: #0F0F12; }
  [data-theme="light"] .lk-cari { background: #FFFFFF; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-cari-in { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .lk-cari-ic, [data-theme="light"] .lk-cari-n { color: #6B7280; }
  [data-theme="light"] .lk-cari button { background: #FFFFFF; border-color: rgba(0,0,0,.12); color: #374151; }
  [data-theme="light"] .lk-rowmenu { background: #FFFFFF; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-rowmenu-item { color: #374151; }
  [data-theme="light"] .lk-rowmenu-item:hover:not(.disabled) { background: rgba(124,92,252,0.12); color: #111827; }
  [data-theme="light"] .lk-rowmenu-item.danger { color: #DC2626; border-top-color: rgba(0,0,0,.1); }
  [data-theme="light"] .lk-rowmenu-item.danger:hover:not(.disabled) { background: rgba(226,75,74,0.12); color: #B91C1C; }
  [data-theme="light"] .lk-rowmenu-ic { color: #6B7280; }
  [data-theme="light"] .lk-tabel-sumber { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #374151; }
  [data-theme="light"] .lk-tabel-atur-judul { color: #6B7280; }
  [data-theme="light"] .lk-tabel-atur-cek { color: #374151; }
  [data-theme="light"] .lk-tabel td.lk-cell-nomor .lk-sel-isi { color: #6B7280; }
  [data-theme="light"] .lk-tabel th { background: #F3F4F6; }
  [data-theme="light"] .lk-tabel th, [data-theme="light"] .lk-tabel td { border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-tabel input { color: #0F0F12; }
  [data-theme="light"] .lk-rownum { background: #F3F4F6; color: #6B7280; }
  [data-theme="light"] .lk-tabel-ctl > button { background: #F3F4F6; border-color: rgba(0,0,0,.12); color: #374151; }
  [data-theme="light"] .lk-tabel-tools { background: #F3F4F6; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-tabel-tools button { background: #FFFFFF; border-color: rgba(0,0,0,.12); color: #374151; }
  [data-theme="light"] .lk-tabel-tools button:hover:not(:disabled) { border-color: #7C5CFC; color: #111827; background: #F9FAFB; }
  [data-theme="light"] .lk-tt-sep { background: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-tabel td.lk-cell-sel { background: rgba(124,92,252,0.12); }
  [data-theme="light"] .lk-tabel td.lk-cell-aktif { outline-color: #7C5CFC; }
  [data-theme="light"] .lk-sel-isi { color: #0F0F12; }
  [data-theme="light"] .lk-tabel td.lk-cell-galat .lk-sel-isi { color: #E24B4A; }
  [data-theme="light"] .lk-tabel th.lk-colhead { color: #6B7280; }
  [data-theme="light"] .lk-tabel th.lk-colhead.aktif, [data-theme="light"] .lk-tabel td.lk-rownum.aktif { background: rgba(124,92,252,0.14); color: #7C5CFC; }
  [data-theme="light"] .lk-lebar-tip { background: #FFFFFF; border-color: #7C5CFC; color: #7C5CFC; }
  [data-theme="light"] .lk-batas-kertas { border-left-color: #6B7280; }
  [data-theme="light"] .lk-tabel-petunjuk { color: #6B7280; }
  [data-theme="light"] .lk-tabel-lebar, [data-theme="light"] .lk-tabel-lebar button { color: #B45309; }
  [data-theme="light"] .lk-tabel-galat { color: #E24B4A; }
  [data-theme="light"] .lk-tt-sel { background: #FFFFFF; border-color: rgba(0,0,0,.12); color: #374151; }
  [data-theme="light"] .lk-tt-sel option { background: #FFFFFF; color: #374151; }
  [data-theme="light"] .lk-fbar { background: #FFFFFF; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-fbar-ref { color: #5B21B6; border-right-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-fbar-fx { color: #6B7280; border-right-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-fbar-in { color: #0F0F12; }
`;

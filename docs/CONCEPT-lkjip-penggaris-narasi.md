# Penggaris & Indent per Paragraf — Blok Narasi LKJIP

Status: **dikerjakan** (2026-11-06). Nol migrasi, nol endpoint: indent hidup di HTML narasi yang sudah ada.

Versi pertama (agent lain) hanya menampilkan satu setelan dokumen, dan menyeret penandanya mengubah **seluruh
dokumen**. Pemilik meminta seperti Word: **tiap paragraf bisa diatur**. Dokumen ini menggantikan versi itu;
bagian §6 mencatat cacat yang ditemukan saat mengauditnya.

## 1. Perilaku

Setiap blok NARASI punya penggaris selebar bidang tulis A4 (15,5 cm) yang menampilkan indent **paragraf tempat
kursor berada**. Empat penanda, sama dengan Word:

| Penanda | Letak | Akibat menyeret |
|---|---|---|
| ▽ Baris pertama | atas | hanya baris pertama |
| △ Gantung | bawah | baris berikutnya pindah, baris pertama **tetap** |
| ▭ Kiri | paling bawah | seluruh paragraf pindah bersama |
| △ Kanan | bawah, kanan | batas kanan |

- Selama diseret hanya garis panduan yang bergerak; teks berubah saat dilepas, jadi satu seret = satu Ctrl+Z.
- Beberapa paragraf terpilih: bidang yang digeser berlaku untuk semuanya; bila nilainya berbeda, penanda kelabu.
- Tombol **Angka** (Kiri, Kanan, Khusus, Sebesar) untuk ukuran persis, seperti dialog Paragraf Word.
- Tombol **Bawaan** membuang isian paragraf itu, kembali ke setelan dokumen.
- Bilah alat dapat **Kurangi/Tambah indent** (ke kelipatan 0,5 inci berikutnya).
- Enter mewarisi indent paragraf; tempelan dari Word membawa `margin-left`/`text-indent`-nya.
- Tersimpan lewat tombol Simpan blok seperti suntingan lain. Tidak tampil di dokumen FINAL (indentnya tetap
  digambar).

**Setelan dokumen tetap ada** di Pengaturan → "Indent baris pertama (bawaan)": berlaku bagi paragraf yang belum
diatur sendiri, seperti gaya paragraf di Word.

## 2. Model data

Tiga angka **dxa** per paragraf, bahasa yang sama dengan `<w:ind>`:

```
<p  data-ind-kiri="567" data-ind-kanan="284" data-ind-pertama="-283">   pertama < 0 = gantung
<h2 data-ind-kiri="360">
<li data-ind-kiri="1440" data-ind-pertama="-360">                       butir: di <li>, bukan <p> di dalamnya
```

Kunci yang tidak ada = ikut bawaan (`indenBawaan`): paragraf → setelan dokumen; judul → 0; butir → 1,27 cm per
tingkat, gantung 0,63 cm. Hanya yang **berbeda dari bawaan** yang disimpan (`keTersimpan`), jadi paragraf yang
kembali ke bawaan ikut setelan dokumen lagi.

Dxa, bukan cm: `<w:ind>` berkas sumber kembali utuh sesudah impor-ekspor (360 dxa = 0,635 cm tidak bulat).

## 3. Satu sumber aturan — `lib/lkjip/halaman.ts`

Murni, dipakai `PenggarisNarasi` · `TiptapNarasi` · `sanitizeNarasiHtml` · `docgen` · `impor-word`.

| Fungsi | Tugas |
|---|---|
| `bacaInden` / `atributInden` | HTML ⇄ angka. Atribut dibentuk ulang dari angka, tidak pernah digemakan |
| `jepitInden` | bentuk mustahil: teks ≥ 1 cm, baris pertama tidak keluar margin, butir hanya boleh gantung |
| `indenBerlaku` / `keTersimpan` | isian + bawaan ⇄ yang disimpan |
| `xmlInden` | `<w:ind>`; butir tanpa isian ikut tingkat daftarnya |
| `geserPenanda` / `posisiPenanda` | akibat menyeret, perilaku §1 |
| `snapDxa` | kisi 0,05 cm, tapi kelipatan 0,25 inci menang bila dekat — 720 (1,27 cm) tidak jatuh di kisi |

## 4. Layar

Tiptap menyimpan `indKiri/indKanan/indPertama` di `paragraph`, `heading`, `listItem` (`IndenParagraf`). `--i-*` di
atribut `style` hanya untuk digambar CSS, dibuang penyaring.

- `.ProseMirror` = `container-type: inline-size`, `--lk-dxa: calc(100cqw / 8788)` — satu satuan untuk paragraf dan
  butir bersarang, sebanding persis dengan bidang tulis berapa pun lebar kartunya. Penanda memakai persentase yang
  sama, jadi tidak ada ukuran JS yang bisa meleset (lencana skala saja yang mengukur).
- **Daftar digambar sendiri** (`counter(list-item)` di `li::before`): nomor native selalu menempel di teks, padahal
  di Word nomor rata kiri di `kiri + pertama`. `float`, bukan `absolute`: nomor yang lebih lebar dari gantungnya
  mendorong baris pertama seperti tab Word. `start` dekorasi "Lanjut daftar" tetap terbaca oleh `counter()`.
- Butir bersarang memakai angka mutlak lewat `--lk-abs`/`--lk-induk`, karena margin CSS-nya relatif terhadap induk.
- Huruf, ukuran, spasi, jarak paragraf (`--lk-after`, dulu 8 px dipatok), perataan ikut setelan.

## 5. Word & Impor

**`narasiToXml`** membaca `data-ind-*` lewat `xmlInden`, urutan `numPr → ind → jc`. Sekaligus dibetulkan:
- Butir berisi daftar bersarang dulu **kehilangan nomornya**, dan butir sesudahnya ikut nomor daftar dalam. Kini
  tumpukan daftar + `ilvl` naik: bersarang sejenis memakai numId induknya (Word memulai ulang sub-nomor sendiri),
  beda jenis dapat numId sendiri ber-`startOverride` di tingkatnya. `numbering.xml` kini 9 tingkat.
- `<p>` kedua dalam satu butir dulu menyatu ("ab"); kini paragraf sendiri, rata teks butir, tanpa nomor.
- Perataan butir daftar dulu hilang.

`lanjut-daftar.ts` mencerminkan semua itu: yang disambung selalu daftar **tingkat atas**.

**`impor-word.ts`** membaca `<w:ind>` dengan pewarisan Word: gaya berantai (`basedOn`) → tingkat daftar → paragraf
(daftar yang disebut lewat gaya kalah dari gaya itu). `firstLineIndentCm` dokumen = indent paling lazim, ditimbang
panjang teks; paragraf lain membawa angkanya. Berkas tanpa indent tidak lagi mendadak menjorok 1,27 cm.

Aturan nomor Word dibetulkan (`majukanNomor`, dicoba di Word sungguhan): **semua num sebabstrak berbagi satu
hitungan**, termasuk yang ber-`startOverride`; override hanya menyetelnya pada pemakaian pertama num itu
(1, 2 → override 5, 6 → num lain lanjut 7). Dulu dianggap hitungan terpisah, jadi num berikutnya salah nomor.

## 6. Temuan audit versi sebelumnya (semua dibereskan)

| # | Temuan | Akibat |
|---|---|---|
| 1 | `persen()` menjepit ke 3 cm, dipakai juga untuk garis skala | garis & angka 3,5–15 cm bertumpuk di titik 3 cm (terlihat di screenshot agent itu) |
| 2 | Menyeret mengubah setelan **seluruh dokumen** | bukan yang diminta; juga perlu tombol Simpan sendiri |
| 3 | `<style>` tidak ikut saat penggaris disembunyikan | tombol "Penggaris" tampil tanpa gaya |
| 4 | Pilihan sembunyi per blok | blok lain baru ikut sesudah muat ulang |
| 5 | Tooltip di dalam `overflow: hidden` | tidak pernah terlihat |
| 6 | Isian modal `type="number"` | mengetik "1,35" mengosongkan isinya (jebakan yang sudah dicatat di CLAUDE.md) |
| 7 | Kartu lebar: bilah alat 1.268 px, kotak teks 615 px | tepi tidak sejajar, tombol penggaris jauh dari kolomnya |
| 8 | Jarak paragraf dipatok 8 px | salah bila setelan 0 atau 12 pt |
| 9 | Daftar: teks di 24 px, Word 48 px | klaim "geometri identik" tidak berlaku di daftar |
| 10 | `skalaKolom`, `posisiPenandaPx`, `indentTwipsBlok`, `snapIndentCm` | kode mati yang diuji; suite lama hijau walau temuan 1 ada |
| 11 | Skrip e2e menulis sandi akun asli sebagai nilai cadangan | dibuang, kini wajib lewat env |
| 12 | Uji memakai akun superadmin & tahun **2026** | melanggar aturan kotak pasir; dokumen uji sudah terhapus, data asli tidak tersentuh |

## 7. Bukti

- **Word sungguhan** (COM, `ParagraphFormat` & `ListString`):
  - dokumen uji dari layar: tiap paragraf tepat (mis. `42,5 / -36`, butir `92,2 / -18 / kanan 46,8`, bersarang 1,2,1,2,3);
  - **berkas pemilik diimpor lalu diekspor: 0 beda indent dari 230 paragraf berpasangan**;
  - dokumen daftar acak: 101/101 nomor sama dengan model uji.
- **Peramban** (kotak pasir 2099, akun dummy, sudah dihapus): seret keempat penanda, Ctrl+Z/redo, pilih banyak,
  panel angka dengan koma, Simpan → muat ulang bertahan, Enter mewarisi, tempelan gaya Word, sembunyikan, 1680 px,
  375 px (tanpa gulir mendatar), tema terang. Jarak huruf ke penanda ≤ 3 dxa (± 0,2 px).
- **Regresi**: `npx tsx scripts/test-lkjip-penggaris.mts` (66, **33 uji mutasi**) + `test-lkjip-lanjut-daftar.mts`
  (32, **9 uji mutasi** bagian bersarang) + `node scripts/test-lkjip-lanjut-daftar-e2e.mjs` (6, butuh env akun dummy).

## 8. Batas jujur

- Pemenggalan kata & jumlah baris per halaman tidak dijamin sama: mesin teks Word dan peramban berbeda.
- Kata Pengantar masih `<textarea>`: indent hasil impornya bertahan selama isinya tidak diketik ulang di modal.
- Format nomor dari Word tidak dibawa: "1)" jadi "1.", "1.1." jadi "1.", "●" jadi "•". Angkanya tetap benar.
- Daftar hasil impor tetap rata (posisi tingkatnya dibawa lewat indent, bukan `ilvl`), jadi sub-nomor tingkat 2 di
  impor memakai `start` tersimpan, bukan mulai ulang otomatis.
- Penggaris vertikal, tab stop, indent di Tabel/Kata Pengantar, dan spasi per paragraf **belum** dikerjakan.

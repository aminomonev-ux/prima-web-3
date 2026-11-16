# CONCEPT — Salin DPA dari Tahun Lain (BLUD)

> Status: **terpasang** (2026-08-25). Sepadan dengan fitur salin-tahun di Renaksi
> & Kinerja, tapi berhenti satu langkah lebih awal dengan sengaja.

---

## 1. Masalahnya

Menyusun DPA tahun baru selalu dimulai dari tahun sebelumnya — 500-an baris yang
90% sama, cuma harganya yang bergerak. Sebelum ini satu-satunya titik awal adalah
**Form Baru**, yang membangun kerangka kosong dari Kode Besar: strukturnya ada,
isinya tidak. Sisanya diketik ulang.

Renaksi dan Kinerja sudah punya jawabannya (`duplicateYear`), tapi keduanya
menulis langsung ke database. Untuk DPA itu terlalu berani: 500 baris masuk
sekaligus tanpa seorang pun sempat melihatnya.

## 2. Keputusan pokok — berhenti di form, bukan di database

Salin **memuat baris ke form di layar**. Tidak ada satu baris pun masuk database
sampai Simpan ditekan manusia.

Konsekuensinya bukan sekadar "lebih aman":

| Akibat | Kenapa penting |
|---|---|
| Nol endpoint baru, nol migrasi | `GET /api/blud/dpa?tahun=` dan `GET /api/blud/pergeseran?tahun=` sudah mengembalikan persis yang dibutuhkan; `POST` yang sudah ada yang menulisnya |
| Sentinel memeriksa lebih dulu | Konflik PJ segaris & baris tak lengkap dari tahun sumber muncul sebagai spanduk **sebelum** Simpan — kalau salinnya server-side, cacat itu ikut tersalin diam-diam |
| Tidak ada lubang kunci ganda | Kalau ini fitur server-side, dua klik beruntun menghasilkan 1.140 baris: `assertBludVersion` melakukan `FOR UPDATE` pada baris `blud_locks` yang belum ada, dan itu tidak mengunci apa pun (**L69-a**). Karena tidak ada tulis saat Salin, lubang itu tidak pernah terbuka |

## 3. Dua sumber

```
Pilih Tahun ▾ → "Tahun Baru…" → 2027   (layar kosong)
   └─ [Salin dari Tahun Lain]
        └─ Salin dari tahun [2026 ▾]
             ( ) DPA murni        — 570 baris, versi 24 Agu 2026
             (•) Pasca-Pergeseran — 558 baris, versi 25 Agu 2026
        └─ [Salin ke form]  →  baris muncul, BELUM tersimpan
        └─ [Simpan]         →  tersimpan sebagai (2027, tanggal hari ini) v1
```

**DPA murni** = pagu awal tahun sumber. **Pasca-Pergeseran** = pagu yang
benar-benar berlaku di akhir tahun sumber — biasanya titik pijak yang lebih
masuk akal untuk menyusun tahun berikutnya.

### 3.1 Kenapa varian pasca-geser bisa satu lawan satu

Ini fakta yang menentukan seluruh kelayakan opsi kedua.

DPA memaksa `jumlah = vol × harga` untuk tiap baris ujung, dihitung ulang server
tiap Simpan (`recalcDpaJumlah`). Kalau `pergeseran` di tabel Pergeseran adalah
angka ketikan bebas, menyalinnya ke `jumlah` akan **ditimpa balik diam-diam**
jadi vol × harga lama — orang mengira dapat 3,9 juta, yang tersimpan 3 juta,
tanpa pesan apa pun.

Ternyata tidak begitu: `pergeseran_dpa` menyimpan **`vol_p` dan `harga_p`**, dan
pagunya dihitung dengan aturan yang sama — `pergeseran = vol_p × harga_p`
(`recalcPergeseranJumlah`). Dua tabel itu memakai invarian identik, jadi
pemetaannya satu lawan satu dan recalc server tidak menggeser angkanya.

Uji **C** di `scripts/test-blud-salin-tahun.mts` menjaga justru klaim ini: ia
menjalankan `recalcDpaJumlah` yang sama dengan yang dipakai server, lalu menuntut
angkanya tidak bergerak.

## 4. Pemetaan kolom

Dua mapper di `lib/blud/row-map.ts` — satu-satunya tempat baris DPA/Pergeseran
dipetakan.

| Kolom DPA tahun baru | dari `DpaBaris` | dari `PergeseranBaris` |
|---|---|---|
| `kode_rekening` `uraian` | apa adanya | apa adanya |
| `vol` | `vol` | **`vol_p`** |
| `harga` | `harga` | **`harga_p`** |
| `jumlah` | `jumlah` | **`pergeseran`** |
| `satuan` | `satuan` | `satuan` — Pergeseran tidak punya `satuan_p` |
| `penanggung_jawab` `keterangan` | apa adanya (`null` → `''`) | apa adanya |
| `tipe_baris` `parent_id` `row_id` | apa adanya | apa adanya |
| `urutan` | diindeks ulang 0..n−1 | diindeks ulang 0..n−1 |
| **`anggaran_key`** | **`null`** | **`null`** |
| `origin` `usulan_item_id` `usulan_no` | `'MANUAL'` `null` `null` | `'MANUAL'` `null` `null` |
| `bertambah_berkurang` | — | **tidak dibawa** |

Tiga baris tebal itu yang perlu dijaga:

- **`anggaran_key` dibuang.** Jangkar realisasi mengikat baris ke SPJ tahun
  sumber. Membawanya berarti belanja 2027 dilaporkan ke pos 2026. Ini kebalikan
  `dpaKePergeseranInput` yang tepat di atasnya di berkas yang sama — di sana
  jangkarnya **sengaja dibawa** karena itu baris yang sama, cuma beda tabel.
- **Jejak Usulan dilepas.** Baris tahun baru tidak pernah lewat putusan Usulan
  tahun lama; membawanya membuat baris 2027 mengaku sudah disetujui Kabag.
- **`row_id` apa adanya, tanpa nilai cadangan.** Mengarang id memutus `parent_id`
  anak-anaknya. Kalau ada yang kosong, `validateTreeIntegrity` menolaknya di
  server — gagal bersuara, bukan gagal diam-diam.

## 5. Pagar & peringatan

**Izin menu Pergeseran.** `GET /api/blud/pergeseran` dijaga
`bolehBukaMenu('pergeseran')`. Orang yang pegang menu DPA tapi tidak pegang
Pergeseran akan kena 403 kalau pilihan kedua ditawarkan padanya — jadi radio
"Pasca-Pergeseran" **disembunyikan** untuk mereka (`bolehBacaPergeseran` dari
`peta['pergeseran'] !== 'TIDAK'` di `page.tsx`). Cukup `LIHAT`, tidak perlu
`EDIT`: yang ditulis di sini DPA, bukan pergeserannya. Ini kelas kesalahan yang
diperingatkan **L69** — pagar dipasang di API tapi lupa di layar.

**Pergeseran draft.** Kalau versi pergeseran terakhir belum berimbang
(`hitungDeltaPergeseranRoot ≠ 0`), modal menampilkan selisihnya dan Salin minta
konfirmasi terpisah. Menyalin dari draft boleh, tapi orangnya harus tahu dia
menjadikan angka yang belum selesai sebagai dasar tahun depan.

**Jumlah baris berbeda.** 570 vs 558 bukan kesalahan — pergeseran bisa
mengosongkan pos yang tidak jadi dipakai. Modal menyebutkannya supaya dua pilihan
itu tidak terbaca sebagai dua nama untuk isi yang sama.

**Menimpa form yang sudah berisi.** `confirmDialog()` varian `danger`, bukan
`window.confirm`. Kedua konfirmasi WAJIB mengisi `confirmLabel` — bawaannya
berbunyi "Hapus", menyesatkan di sini karena tidak ada yang dihapus dan tidak
ada apa pun yang menyentuh basis data.

**Tahun sumber yang terlalu gemuk.** Jalur impor menampung
`BLUD_IMPOR_MAKS_BARIS` = 2.000 baris, jalur simpan biasa cuma
`BLUD_SIMPAN_MAKS_BARIS` = 700. Tahun yang diisi lewat Impor karena itu bisa
lebih besar daripada yang bisa disimpan balik — dan sebelum fitur ini, form
berisi >700 baris tidak pernah bisa lahir tanpa menyentuh jalur impor. Modal
menahannya di muka (tombol Salin mati + penjelasan), bukan membiarkannya jatuh
jadi 400 dari Zod sesudah orangnya menyalin lalu menyunting satu jam. Kedua
angka tinggal di `import-dpa-shared.ts` supaya Zod dan modal memakai angka yang
sama; uji E menjaga keduanya tetap sepakat.

**Balapan permintaan.** Mengganti tahun sumber dua kali beruntun bisa membuat
balasan yang lebih lama datang belakangan — layar menampilkan isi 2026 sementara
dropdown menunjuk 2025, lalu `asal_salin` mencatat tahun yang salah ke audit.
Dijaga nomor urut permintaan (`generasiRef`); balasan basi dibuang.

## 6. Jejak audit

`asal_salin: { tahun, versi, sumber }` ikut di body POST, divalidasi
`AsalSalinSchema`. Tujuannya **satu**: memperpanjang baris detail
`BLUD_SAVE_DPA` jadi `… · salinan dari Pergeseran 2026/2026-08-25`. Tidak
disimpan ke kolom mana pun dan tidak mengubah apa yang ditulis.

Tanpa ini tidak ada apa pun di basis data yang menyatakan DPA 2027 lahir dari
2026 — log-nya cuma berbunyi `0 → 570 baris`.

Di klien jejak itu dilepas (`asalSalinRef.current = null`) begitu barisnya
diganti muatan server, sesudah Form Baru, dan sesudah tersimpan — supaya simpan
berikutnya tidak ikut mengaku salinan.

## 7. Yang sengaja tidak ikut

Pergeseran, `rekap_pk`, realisasi/SPJ/GU/bukti setor, dan saldo awal kas. Untuk
Pergeseran alasannya struktural, bukan "belum sempat": `dpa_versi_tanggal`-nya
akan menunjuk tanggal DPA tahun sumber yang tidak ada di tahun baru — melanggar
coupling ketat §2.1. Saldo awal kas tetap lewat `setSaldoAwalTahun`.

Salin juga **tidak** menolak tahun tujuan yang sudah berisi, beda dengan Renaksi.
Tidak perlu: tidak ada yang dirusak sampai Simpan, dan `SAFETY_THRESHOLD` serta
`VERSION_CONFLICT` sudah menjaga langkah itu.

## 8. Catatan versi & kunci

`simpan()` selalu menulis ke **tanggal hari ini** (`tanggalHariIniWIB()`), jadi
Salin ke tahun 2027 pada 25 Agustus 2026 menghasilkan versi `(2027, 2026-08-25)`.
`terapkanSalinTahun` memanggil `setVersi('')` — sama seperti Form Baru: yang di
layar belum punya padanan tersimpan, jadi Simpan tidak akan menimpa versi tahun
sumber.

`expected_version` aman untuk tahun kosong: endpoint tidak mengirim field
`version` sama sekali, dan klien menanganinya dengan `setVersion(… : 0)`
(`dpa-client.tsx`). Salin → Simpan di tahun baru mendarat sebagai v1 tanpa 409
palsu.

## 9. Regresi

```bash
npx tsx scripts/test-blud-salin-tahun.mts
```

33 pemeriksaan. Terbukti menggigit lewat uji mutasi:

| Kode dirusak jadi | Pemeriksaan gagal |
|---|---|
| `anggaran_key: d.anggaran_key ?? null` + `origin: d.origin ?? 'MANUAL'` | 3 (A1, A2, A3) |
| varian pasca-geser ambil `vol`/`harga`/`jumlah` | 6 (B1–B3, C1, C3, C4) |
| `row_id: \`row_${urutan}\`` | 1 (A8) |

Diverifikasi di data asli (25 Agu 2026), bukan cuma di memori:

| Yang diperiksa | Hasil |
|---|---|
| Total DPA 2026 vs form 2027 pasca-geser | 68.383.000.000 → 67.883.000.000, selisih persis −500.000.000 = delta pergeseran |
| Jangkar 2027 vs 2026 | 558 jangkar baru, **irisan nol** dengan DPA maupun Pergeseran 2026 |
| `origin` / `usulan_item_id` / `usulan_no` | 0 baris membawa jejak Usulan |
| Pohon | 0 baris yatim, 0 `row_id` kembar |
| Baris audit | `Simpan DPA 2027/2026-08-25: 0 → 558 baris (v0→1) · salinan dari Pergeseran 2026/2026-08-25` |
| Sentinel | 385 peringatan warisan 2026 muncul **sebelum** Simpan, bukan tersalin diam-diam |

## 10. Berkas

`lib/blud/row-map.ts` (2 mapper) · `components/blud/SalinTahunModal.tsx` ·
`app/(dashboard)/blud/dpa/dpa-client.tsx` (2 tombol + `terapkanSalinTahun`) ·
`app/(dashboard)/blud/dpa/page.tsx` (`bolehBacaPergeseran`) ·
`lib/blud/schemas.ts` (`AsalSalinSchema`) · `app/api/blud/dpa/route.ts` (detail
audit) · `lib/sentinel/anchors.ts` (`dpa.salin-tahun`) ·
`scripts/test-blud-salin-tahun.mts`.

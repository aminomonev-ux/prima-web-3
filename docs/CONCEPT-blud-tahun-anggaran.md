# KONSEP — BLUD: Dimensi Tahun Anggaran (Opsi B)

> Status: **KONSEP** (belum eksekusi). Menambahkan **Tahun Anggaran** sebagai dimensi di atas versi DPA & Pergeseran.
> Alur baru: **pilih Tahun → pilih Versi → tabel muncul**. Buat baru = pilih Tahun dulu, lalu alur seperti sekarang.

---

## 1. Masalah & keputusan

Sekarang identitas versi = **`versi_tanggal` (DATE)** saja; tahun hanya "menempel" di dalam tanggal. Akibatnya tak bisa menyiapkan DPA tahun depan (Simpan selalu pakai tanggal hari ini → tahun berjalan), dan tak ada pengelompokan per tahun.

**Keputusan (disetujui): Opsi B** — jadikan `tahun_anggaran` **kolom nyata**. Identitas versi berubah:

```
(versi_tanggal)  →  (tahun_anggaran, versi_tanggal)
```

Sejalan dengan pola yang sudah ada: **BBA** (`tahun_anggaran` + UNIQUE per tahun) dan **PK/Kinerja** (`PkYearContext`).

### ⚠️ Titik paling rawan (alasan `tahun` wajib ikut di setiap kunci)
Bila menyiapkan DPA **2027** dan DPA **2026** sama-sama disimpan pada tanggal kalender yang sama (mis. `2026-07-24`), maka `versi_tanggal` bertabrakan. Dedupe & lock yang saat ini hanya `WHERE versi_tanggal = ?` akan **saling menimpa/menghapus versi tahun lain**. Karena itu **`tahun_anggaran` wajib masuk ke**:
- `DELETE ... WHERE tahun_anggaran = ? AND versi_tanggal = ?` (dedupe replace-all)
- `key_id` lock: `` `${tahun}:${versi_tanggal}` `` (bukan hanya `versi_tanggal`)
- Semua query `getDpaByDate` / history / delete / rekap_pk cascade

---

## 2. Alur baru (UI)

```
BUKA:  /blud/dpa → [Tahun Anggaran ▾] → [— Pilih Versi — ▾] → tabel
                    (2027 / 2026 / + Tahun Baru)   (hanya versi tahun terpilih, LATEST di atas)

BUAT:  Pilih Tahun (mis. 2027) → Form Baru → susun (alur sama seperti flowchart sekarang) → Simpan
       → tersimpan: tahun_anggaran = 2027, versi_tanggal = tanggal simpan
       (kapan pun disimpan, tetap milik anggaran 2027)
```
Dropdown menjadi **2 tingkat** (Tahun → Versi). Selebihnya identik dengan alur di `docs/TUTORIAL-blud.md`.

### 2.1 Pergeseran — pilih tahun dulu (identik pola DPA)

Pergeseran memakai pola yang **sama persis** dengan DPA: buka halaman → pilih Tahun → daftar versi tahun itu muncul → alur pergeseran seperti sekarang.

```
BUKA:  /blud/pergeseran → [Tahun Anggaran ▾] → [— Pilih Versi — ▾] → tabel
                           (2026 / 2027)          (hanya versi Pergeseran tahun terpilih)

BUAT:  Pilih Tahun 2026 → "Buat Pergeseran"
       → basis dari DPA TERBARU dalam tahun 2026 (bukan tahun lain)
       → geser vol_p/harga_p → "Sinkronkan DPA" (juga dari DPA 2026) → Simpan
       → tersimpan: tahun_anggaran = 2026
```

**Coupling ketat (KEPUTUSAN FINAL — Opsi A §9.2)**: tahun Pergeseran **= tahun DPA sumbernya**. Tak boleh lintas-tahun (pergeseran 2026 tak boleh mengacu DPA 2027). Konsekuensi: `Buat Pergeseran` & `Sinkronkan DPA/Inject` selalu deterministik mengambil DPA tahun terpilih.

#### Empty-state per tahun (kalau pergeseran tahun itu belum ada)
Memilih tahun **tidak** mengharuskan pergeseran sudah ada — sama seperti DPA yang empty-state-nya diisi oleh "Form Baru".

| Kondisi saat pilih Tahun 2026 | Perilaku |
|---|---|
| **DPA 2026 ada**, pergeseran 2026 belum | Dropdown versi kosong ("Belum ada versi tersimpan") → **"Buat Pergeseran"** aktif → tarik dari DPA 2026 → Simpan menciptakan versi Pergeseran 2026 pertama |
| **DPA 2026 belum ada** (tahun benar-benar baru) | **"Buat Pergeseran" nonaktif** + pesan arahan: *"Buat DPA 2026 dulu di menu DPA BLUD"* — bukan error, tapi guard karena tak ada yang bisa digeser |

Guard ini di server (`savePergeseran`/`inject` validasi `dpa_versi_tanggal` milik tahun sama → 400) **dan** di UI (tombol nonaktif + pesan).

---

## 3. Perubahan skema (migrasi)

**File baru**: `docs/migrations/migration-blud-tahun-anggaran.sql`
**Edit**: `docs/schema-mysql.sql` (kolom baru di 3 tabel + update 2 view). Ikuti aturan CLAUDE.md: MySQL syntax, **tanpa `IF NOT EXISTS` pada `ADD COLUMN`**.

```sql
-- migration-blud-tahun-anggaran.sql
-- Tambah dimensi Tahun Anggaran ke versi DPA & Pergeseran BLUD.
-- Versi lama AMAN: backfill tahun_anggaran = YEAR(versi_tanggal).
-- Identitas versi: (versi_tanggal) -> (tahun_anggaran, versi_tanggal).

-- 1) dpa_blud
ALTER TABLE dpa_blud
  ADD COLUMN tahun_anggaran SMALLINT UNSIGNED NOT NULL DEFAULT 0
  COMMENT 'Tahun anggaran versi DPA (dimensi di atas versi_tanggal)' AFTER id;
UPDATE dpa_blud SET tahun_anggaran = YEAR(versi_tanggal) WHERE tahun_anggaran = 0;
ALTER TABLE dpa_blud ADD INDEX idx_tahun_versi (tahun_anggaran, versi_tanggal);

-- 2) pergeseran_dpa
ALTER TABLE pergeseran_dpa
  ADD COLUMN tahun_anggaran SMALLINT UNSIGNED NOT NULL DEFAULT 0
  COMMENT 'Tahun anggaran versi pergeseran' AFTER id;
UPDATE pergeseran_dpa SET tahun_anggaran = YEAR(versi_tanggal) WHERE tahun_anggaran = 0;
ALTER TABLE pergeseran_dpa ADD INDEX idx_tahun_versi (tahun_anggaran, versi_tanggal);

-- 3) rekap_pk (snapshot Cetak — ikut tahun agar hapus/scoping benar)
ALTER TABLE rekap_pk
  ADD COLUMN tahun_anggaran SMALLINT UNSIGNED NOT NULL DEFAULT 0
  COMMENT 'Tahun anggaran DPA yang di-rekap' AFTER versi_dpa;
UPDATE rekap_pk SET tahun_anggaran = YEAR(versi_dpa) WHERE tahun_anggaran = 0;
ALTER TABLE rekap_pk ADD INDEX idx_tahun_versi (tahun_anggaran, versi_dpa);

-- 4) View history — sertakan tahun_anggaran
CREATE OR REPLACE VIEW v_dpa_history AS
  SELECT tahun_anggaran, versi_tanggal, COUNT(*) AS jumlah_baris
  FROM dpa_blud
  GROUP BY tahun_anggaran, versi_tanggal
  ORDER BY tahun_anggaran DESC, versi_tanggal DESC;

CREATE OR REPLACE VIEW v_pergeseran_history AS
  SELECT tahun_anggaran, versi_tanggal, dpa_versi_tanggal, COUNT(*) AS jumlah_baris
  FROM pergeseran_dpa
  GROUP BY tahun_anggaran, versi_tanggal, dpa_versi_tanggal
  ORDER BY tahun_anggaran DESC, versi_tanggal DESC;

-- 5) Migrasi key blud_locks per-versi: sisipkan tahun (pertahankan counter versi)
--    key lama berformat 'YYYY-MM-DD' → jadi 'YYYY:YYYY-MM-DD'
UPDATE blud_locks
  SET key_id = CONCAT(YEAR(key_id), ':', key_id)
  WHERE entity IN ('dpa_blud','pergeseran_dpa','rekap_pk')
    AND key_id REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
```

> `tahun_anggaran` diberi `DEFAULT 0` hanya sebagai jembatan backfill; setelah itu aplikasi **selalu** mengirim tahun eksplisit. `blud_locks` tak berubah strukturnya — hanya konvensi isi `key_id`.

---

## 4. Perubahan data-layer — `lib/blud/data.ts` + `lib/blud/lock.ts`

**`lock.ts`**: tambah helper konvensi key (opsional) — `bludVersiKey(tahun, versi) => \`${tahun}:${versi}\``. Struktur fungsi lock tak berubah, hanya `keyId` yang dikirim caller.

**`data.ts`** — setiap fungsi per-versi dapat parameter `tahun`:

| Fungsi lama | Jadi | Perubahan SQL inti |
|---|---|---|
| `getDpaHistory()` | `getDpaHistory(tahun)` | `WHERE tahun_anggaran = ? GROUP BY versi_tanggal` |
| `getDpaLatestDate()` | `getDpaLatestDate(tahun)` | `WHERE tahun_anggaran = ?` |
| `getDpaByDate(v)` | `getDpaByDate(tahun, v)` | `WHERE tahun_anggaran = ? AND versi_tanggal = ?` |
| `getDpaVersion(v)` | `getDpaVersion(tahun, v)` | lock keyId `${tahun}:${v}` |
| `saveDpa(v, …)` | `saveDpa(tahun, v, …)` | dedupe `DELETE … WHERE tahun_anggaran=? AND versi_tanggal=?`; insert kolom `tahun_anggaran`; lock keyId `${tahun}:${v}` |
| `deleteDpaVersi(v)` | `deleteDpaVersi(tahun, v)` | DELETE `dpa_blud` + `rekap_pk` **AND tahun_anggaran=?**; drop lock `${tahun}:${v}` |
| — (baru) | `getTahunList()` | `SELECT DISTINCT tahun_anggaran FROM dpa_blud … ORDER BY DESC` (gabung pergeseran) |

Pergeseran: `getPergeseranHistory/LatestDate/ByDate/Version`, `savePergeseran`, `deletePergeseranVersi` — pola sama. `savePergeseran` juga simpan `tahun_anggaran`; acuan `dpa_versi_tanggal` **harus versi DPA dalam tahun yang sama**.

**Kolom insert** (`DPA_COLUMNS`, `PERGESERAN_COLUMNS`): tambah `'tahun_anggaran'` di awal + nilai di `values[]`.

---

## 5. Zod — `lib/blud/schemas.ts`

```ts
export const TahunSchema = z.coerce.number().int().gte(2000).lte(2100)
```
Tambahkan `tahun_anggaran: TahunSchema` ke `DpaBodySchema`, `PergeseranBodySchema`, `RekapPKBodySchema`, `InjectBodySchema`. Route juga parse query `?tahun=` dengan `TahunSchema`.

---

## 6. Perubahan API

| Route | Perubahan |
|---|---|
| `app/api/blud/dpa/route.ts` | GET terima `?tahun=` (default = tahun terbaru / berjalan) + `mode=tahun-list`; POST body `tahun_anggaran`; DELETE `?tahun=&versi=` |
| `app/api/blud/pergeseran/route.ts` | idem + acuan DPA difilter tahun sama |
| `app/api/blud/pergeseran/inject/route.ts` | Inject ambil DPA terbaru **dalam tahun yang sama** |
| `app/api/blud/rekap-pk/route.ts` | simpan/baca rekap per `(tahun, versi_dpa)` |

Audit log detail tambahkan tahun (mis. `Simpan DPA 2027/2026-07-24`).

---

## 7. Perubahan UI

**Komponen baru**: `components/blud/TahunDropdown.tsx` (kembar `VersiDropdown`, pill, theme-aware) — daftar tahun + item **"+ Tahun Baru"**.

| File | Perubahan |
|---|---|
| `app/(dashboard)/blud/dpa/dpa-client.tsx` | State `tahun`; `TahunDropdown` di kiri `VersiDropdown`; semua fetch bawa `?tahun=`; **Form Baru & Simpan pakai `tahun` terpilih** |
| `app/(dashboard)/blud/pergeseran/pergeseran-client.tsx` | idem; acuan DPA difilter tahun |
| `app/(dashboard)/blud/cetak/cetak-client.tsx` | Selector Tahun sebelum Menu/View |
| `app/(dashboard)/blud/pengaturan/pengaturan-client.tsx` | Daftar versi dikelompokkan per Tahun |
| `app/(dashboard)/blud/page.tsx` + `dashboard-client.tsx` | Beranda: selector Tahun (default tahun berjalan); KPI & riwayat di-scope tahun |
| `components/blud/VersiDropdown.tsx` | Tak wajib berubah (tetap terima daftar versi yang sudah difilter tahun) |

Cek juga `*/page.tsx` pembungkus tiap sub-modul: bila pre-fetch data awal, sediakan `tahunList` + tahun default.

---

## 8. Urutan eksekusi

1. **Migrasi** — `migration-blud-tahun-anggaran.sql` + update `schema-mysql.sql` (backfill dulu, data lama aman).
2. **Lock + data-layer** — `lock.ts` (key `${tahun}:${versi}`) → `data.ts` (dedupe & query per `(tahun, versi)` + `getTahunList`).
3. **Zod** — `TahunSchema` + body schemas.
4. **API** — dpa → pergeseran → inject → rekap-pk.
5. **UI** — `TahunDropdown` → dpa-client → pergeseran-client → cetak → pengaturan → beranda.
6. **Verifikasi** — `tsc` + ESLint; smoke test: buat DPA 2027 saat "sekarang" 2026, cek tidak menimpa 2026; buka-tutup tahun; hapus versi 1 tahun tak sentuh tahun lain; concurrent save 2 tahun tanggal sama.

**Estimasi**: sedang — 1 migrasi + data-layer + 4 route + 1 komponen + 5 layar.

---

## 9. Keputusan default (koreksi bila perlu)
1. **Default tahun saat buka** = tahun berjalan (`YEAR(now)`); kalau kosong, jatuh ke tahun LATEST yang ada data.
2. **Pergeseran** hanya boleh acuan versi DPA **dalam tahun yang sama** (tak lintas-tahun). ✅ **FINAL (Opsi A)** — dikonfirmasi user; detail alur & empty-state di §2.1.
3. **"+ Tahun Baru"** → langsung empty-state "Mulai Form DPA Baru" untuk tahun itu.
4. **Tahun_anggaran vs versi_tanggal** tetap 2 hal beda: tahun = tahun anggaran (bisa masa depan); versi_tanggal = jejak kapan disimpan.

---

## 10. Risiko & catatan
- **Data lama**: backfill `YEAR(versi_tanggal)` menjaga semua versi lama tetap muncul di tahunnya. Nol data hilang.
- **Lost-update lintas-tahun**: teratasi karena lock key sudah ber-tahun (poin §1).
- **`toISOString()` UTC** (dpa-client) tetap dipakai untuk `versi_tanggal`; tahun diambil dari **pilihan user**, bukan dari tanggal — jadi tak terpengaruh geser TZ tengah malam.
- **CI gate**: kolom baru wajib masuk `schema-mysql.sql` (gate C tsc) — sudah dicakup langkah 1.

> Referensi pola: BBA `docs/migrations/migration-*bba*` (`tahun_anggaran`), Kinerja/PK (`PkYearContext`). Alur dasar: `docs/TUTORIAL-blud.md`.

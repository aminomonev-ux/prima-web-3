# CONCEPT — "Rima Ngobrol": Perluasan Dataset Obrolan & Pengetahuan Umum

> Status: AKTIF (mulai 2026-06-14). Tujuan: Rima terasa lebih bisa diajak ngobrol
> umum (small-talk + pengetahuan umum), tanpa mengkhianati arsitektur deterministik
> lokal (G14) — gratis, offline, bisa di-audit kata per kata.

## 1. Batas arsitektur (WAJIB dipahami dulu)
Rima = **NLU deterministik lokal**: ensemble `keyword → Naive Bayes → TF-IDF`
(`lib/sentinel/nlu/`) + **jawaban kalengan** per-intent (`lib/sentinel/knowledge.mjs`).
Rima **BUKAN** LLM/generatif. Konsekuensi:
- Yang bisa ditingkatkan = **recall** (mengenali lebih banyak cara user bertanya →
  diarahkan ke jawaban kalengan yang tepat) + **breadth** (jumlah topik/intent).
- Yang **tidak** bisa = mengarang jawaban baru di luar yang ditulis.
- Tetap **tanpa LLM eksternal saat runtime**: privasi (data tak keluar), server
  kantor offline, nol biaya, jawaban auditable. (Keputusan ini final, sejalan CLAUDE.md.)

## 2. Gap nyata (dari uji lapangan user)
1. **Misroute** — "kamu ganteng" → `sopan.deeskalasi` (dikira keluhan), "mau
   berteman dengan aku?" → fallback. Penyebab: contoh latih per-intent obrol masih tipis.
2. **Breadth** — topik pengetahuan umum & small-talk masih sedikit → banyak frasa
   wajar jatuh ke fallback.

## 3. Strategi: deterministik-first, dataset sebagai BIBIT
Dataset internet dipakai sebagai **sumber inspirasi frasa & pilihan fakta**, bukan
di-import mentah. Output akhir tetap **kurasi statis** di `GOLDEN-QUESTIONS.md`
(frasa→intent) + `knowledge.mjs` (jawaban), lalu retrain → `model.json`.

### 3a. Dataset bebas yang relevan (hasil riset 2026-06-14)
| Sumber | Isi | Pakai untuk | Catatan |
|---|---|---|---|
| [IndoMMLU](https://github.com/fajri91/IndoMMLU) | 14.906 soal pengetahuan (SD–universitas) | seleksi **fakta** pengetahuan umum | format MCQ, lisensi riset → ambil ide fakta, tulis ulang jawaban sendiri |
| [Wikidepia/indonesian_datasets](https://github.com/Wikidepia/indonesian_datasets) | scrape KBBI + dataset terjemahan | definisi istilah, ragam frasa | besar; ambil sampel |
| [Kaggle: percakapan bahasa indonesia](https://www.kaggle.com/datasets/angelamawar/dataset-percakapan-bahasa-indonesia) | korpus percakapan | **ragam frasa small-talk** | unduh CSV, tak perlu install |
| [NLP_bahasa_resources](https://github.com/louisowen6/NLP_bahasa_resources) · [Awesome-Indonesia-NLP](https://github.com/irfnrdh/Awesome-Indonesia-NLP) | katalog dataset | indeks sumber lanjutan | — |

**Kenapa tak import mentah:** (1) tak ada label intent → tetap harus dipetakan
manual; (2) 14k soal ≠ 14k intent (model meledak, akurasi jeblok, mayoritas tak
relevan untuk staf RS); (3) lisensi/atribusi riset. Maka: **mining → kurasi →
golden questions**, bukan dump.

### 3b. Pipeline (offline, output auditable)
```
sumber (dataset/ide)  →  pilih frasa & fakta yang relevan & aman
  →  petakan ke taksonomi intent Rima (obrol.* / tahu.* / yang relevan)
  →  tulis ke GOLDEN-QUESTIONS.md (frasa→intent) + jawaban di knowledge.mjs
  →  `npm run rima:train` (augmentasi sinonim+typo bawaan) → model.json
  →  `npm run rima:check` (gate ★≥90% / total≥75% + lint persona + anchor + read-only)
  →  commit (model.json byte-stable, deterministik)
```

## 4. Guardrail (tak boleh dilanggar saat menambah data)
- **deny.*** tetap menolak: politik, SARA, kekerasan, medis/finansial spesifik,
  data pribadi, celah keamanan, curhat sensitif. Jangan tambah fakta sensitif.
- **Fakta evergreen saja** di `tahu.*` (yang berubah → `tahu.terkini`, jujur statis).
- **Persona lint** (`banned-words.json`) — jawaban bebas kata kasar/merendahkan.
- **G14** — KB = kode, berubah lewat PR + gate; tanpa fetch eksternal.
- **Akurasi** — intent baru harus berfrasa distinct; pantau confusion report supaya
  tak menurunkan gate.

## 5. Roadmap
- **Fase 1 (jalan 2026-06-14)** — perbaiki misroute (`obrol.dipuji`/`obrol.teman`
  diperkuat keyword+frasa) + batch small-talk & fakta umum baru. Lihat
  `GOLDEN-QUESTIONS.md` §20–21.
- **Fase 2** — mining terstruktur dari Kaggle percakapan + IndoMMLU: ekstrak ragam
  frasa & fakta, kurasi ke intent. Target: ratusan frasa tambahan utk recall.
- **Fase 3 (jalan 2026-06-14)** — fallback obrolan lebih hangat. `RIMA_FALLBACK`
  + `RIMA_CONFUSED` ditulis ulang ramah + menawarkan opsi ringan (tebak-tebakan/
  fakta/hibur). **Sengaja TANPA intent catch-all `obrol.umum` yang dilatih** —
  catch-all greedy terbukti mencuri dari intent spesifik & menurunkan akurasi;
  menghangatkan fallback memberi efek "terasa ngobrol" dengan **nol risiko ke
  classifier** (hanya kena saat input memang tak dikenali). Bila kelak butuh,
  catch-all bisa dievaluasi terpisah dengan ambang confidence ketat.

## 6. Cara kerja menambah 1 intent obrolan/pengetahuan (ringkas)
1. `knowledge.mjs`: `e('tahu.x', 'Judul', { k:[...], a:'jawaban ≤3 kalimat 😊', c:[chip...] })`
   — chip.q WAJIB frasa yang sudah jadi golden question / keyword (anti chip buntu).
2. `GOLDEN-QUESTIONS.md` §20/§21: tambah `- ◇ "frasa user" → \`tahu.x\`` (≥2 frasa).
3. `npm run rima:train && npm run rima:check` → commit `model.json` bersama sumber.

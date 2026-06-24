// ═══ PRIMA — LKJIP — Penomoran outline (pure, no IO) ═══════════════
// Nomor section DIHITUNG dari posisi di pohon (parent + urutan), TIDAK disimpan.
// Dipakai server (data.ts attach nomor) + generator Word (docgen.ts).
// Skema gaya nomor per depth (default LKJIP/SAKIP):
//   depth 0 → "BAB " + romawi   (children pakai angka arab si bab utk prefix dotted)
//   depth 1 → "3.1"   · depth 2 → "3.1.2"
//   depth 3 → "a."    · depth 4 → "1)"   · depth 5 → "a)"
// Konsep: docs/session/lkjip/CONCEPT.md §2.2.

export const MAX_DEPTH = 5;

export interface SectionFlat {
  id: number;
  parent_id: number | null;
  depth: number;
  urutan: number;
  judul: string;
  locked: number;
}

export interface BlockNode {
  id: number;
  tipe: 'NARASI' | 'TABEL' | 'GAMBAR' | 'GRAFIK';
  payload: unknown;
  urutan: number;
}

export interface SectionNode extends SectionFlat {
  nomor: string;        // label tampil: "BAB III" / "3.1" / "a."
  nomorPlain: string;   // tanpa prefix "BAB " — utk Daftar Isi ("III","3.1","a.")
  children: SectionNode[];
  blocks: BlockNode[];
}

const ROMAN: [number, string][] = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function toRoman(n: number): string {
  let num = Math.max(1, Math.floor(n));
  let out = '';
  for (const [v, s] of ROMAN) {
    while (num >= v) { out += s; num -= v; }
  }
  return out;
}

/** 1→a, 2→b, ... 26→z, 27→aa (base-26 huruf kecil). */
export function toAlpha(n: number): string {
  let num = Math.max(1, Math.floor(n));
  let out = '';
  while (num > 0) {
    const rem = (num - 1) % 26;
    out = String.fromCharCode(97 + rem) + out;
    num = Math.floor((num - 1) / 26);
  }
  return out;
}

/**
 * Label nomor untuk satu node.
 * @param path index 1-based tiap ancestor → node (mis. [3,1,2] = bab ke-3, sub ke-1, sub-sub ke-2)
 * Return { nomor (tampil), nomorPlain (tanpa "BAB ") }.
 */
function labelFor(path: number[]): { nomor: string; nomorPlain: string } {
  const depth = path.length - 1;
  const idx = path[depth];
  switch (depth) {
    case 0: {
      const r = toRoman(idx);
      return { nomor: `BAB ${r}`, nomorPlain: r };
    }
    case 1:
    case 2: {
      // angka arab dotted, leading = bab arab (path[0]), lanjut path[1..depth]
      const dotted = path.slice(0, depth + 1).join('.');
      return { nomor: dotted, nomorPlain: dotted };
    }
    case 3: {
      const s = `${toAlpha(idx)}.`;
      return { nomor: s, nomorPlain: s };
    }
    case 4: {
      const s = `${idx})`;
      return { nomor: s, nomorPlain: s };
    }
    default: {
      const s = `${toAlpha(idx)})`;
      return { nomor: s, nomorPlain: s };
    }
  }
}

/**
 * Bangun pohon ber-nomor dari daftar flat section + blok.
 * Anak diurutkan by `urutan` lalu `id`. Index 1-based dipakai untuk nomor.
 */
export function buildNumberedTree(
  sections: SectionFlat[],
  blocksBySection: Map<number, BlockNode[]>,
): SectionNode[] {
  const byParent = new Map<number | null, SectionFlat[]>();
  for (const s of sections) {
    const key = s.parent_id ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(s);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => (a.urutan - b.urutan) || (a.id - b.id));
  }

  const build = (parentId: number | null, ancestorPath: number[]): SectionNode[] => {
    const kids = byParent.get(parentId) ?? [];
    return kids.map((s, i) => {
      const path = [...ancestorPath, i + 1];
      const { nomor, nomorPlain } = labelFor(path);
      const blocks = (blocksBySection.get(s.id) ?? []).slice().sort((a, b) => (a.urutan - b.urutan) || (a.id - b.id));
      return {
        ...s,
        nomor,
        nomorPlain,
        blocks,
        children: build(s.id, path),
      };
    });
  };

  return build(null, []);
}

/** Flatten pohon ber-nomor jadi urutan render depth-first (untuk docgen). */
export function flattenTree(nodes: SectionNode[]): SectionNode[] {
  const out: SectionNode[] = [];
  const walk = (arr: SectionNode[]) => {
    for (const n of arr) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

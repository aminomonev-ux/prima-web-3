import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // PRIMA: code lama yg sudah tidak dipakai (snapshot pre-refactor)
    "_archive/**",
    // Worktree aplikasi Claude (salinan repo di commit lain) — bukan kode proyek ini (U3).
    ".claude/**",
  ]),
  {
    // Parameter berawalan `_` = sengaja tidak dipakai; tanda tangannya dituntut pemanggil
    // (mis. `verifyTurnstile(_token)`, yang mati di edisi intranet). Sejak CI memakai
    // `--max-warnings 0` (K3, 2026-10-01), peringatan di tempat yang benar memblokir push.
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // CSP `style-src 'self'` (proxy.ts) memblokir stylesheet dari luar TANPA galat di layar —
    // Font Awesome dari cdnjs membuat 41 ikon E-Anggaran tak pernah tampil sejak commit awal
    // (diganti lucide-react 2026-10-01). Server kantor juga intranet: CDN memang tak terjangkau.
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "JSXOpeningElement[name.name='link'] JSXAttribute[name.name='href'][value.value=/^(https?:)?\\/\\//]",
          message: "Stylesheet dari luar diblokir CSP (style-src 'self') dan tak terjangkau di intranet. Pasang lokal, atau pakai ikon lucide-react.",
        },
        {
          selector: "JSXAttribute[name.name='className'][value.value=/(^|\\s)fa[srbl]?\\s+fa-/]",
          message: "Font Awesome tidak dimuat (diblokir CSP) — ikonnya tidak akan tampil. Pakai ikon lucide-react.",
        },
      ],
    },
  },
]);

export default eslintConfig;

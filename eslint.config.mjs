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
]);

export default eslintConfig;

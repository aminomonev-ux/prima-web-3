// ═══ PRIMA — LKJIP — konstanta style client-safe ════════════════════
// Dipisah dari schemas.ts: schemas.ts meng-import ratelimit (→ new Redis() di
// top-level modul). Bila Client Component (editor-client.tsx) import FONT_CHOICES
// dari schemas.ts, rantai ratelimit→Redis ikut ter-bundle ke browser → warning
// "[Upstash Redis] token missing". File ini bersih dari dependency server.
export const FONT_CHOICES = ['Arial', 'Calibri', 'Times New Roman', 'Bookman Old Style', 'Cambria'] as const;

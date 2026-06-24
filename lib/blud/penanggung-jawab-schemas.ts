import { z } from 'zod';

export const PenanggungJawabInputSchema = z.object({
  label: z.string().trim().min(1, 'Label wajib diisi').max(255),
});

export type PenanggungJawabInput = z.infer<typeof PenanggungJawabInputSchema>;

export const PenanggungJawabBodySchema = z.object({
  rows:  z.array(PenanggungJawabInputSchema).max(500, 'Maksimal 500 baris'),
  force: z.boolean().optional().default(false),
  // L51 optimistic locking
  expected_version: z.coerce.number().int().min(0).default(0),
});

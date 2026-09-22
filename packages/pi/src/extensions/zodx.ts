import { z } from 'zod';

export const zx = {
  cwd: z.string().optional(),
  id: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  revision: z.number().int().nonnegative(),
  text: z.string().trim().min(1),
};

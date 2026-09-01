import { z } from 'zod';

export const enable2faSchema = z.object({
  totpSecret: z.string().optional(),
});

export type Enable2faInput = z.infer<typeof enable2faSchema>;

export const verify2faSchema = z.object({
  code: z
    .string()
    .length(6, '2FA code must be 6 digits')
    .regex(/^\d{6}$/, '2FA code must be 6 numeric digits'),
});

export type Verify2faInput = z.infer<typeof verify2faSchema>;

export const disable2faSchema = z.object({
  code: z
    .string()
    .length(6, '2FA code must be 6 digits')
    .regex(/^\d{6}$/, '2FA code must be 6 numeric digits'),
});

export type Disable2faInput = z.infer<typeof disable2faSchema>;

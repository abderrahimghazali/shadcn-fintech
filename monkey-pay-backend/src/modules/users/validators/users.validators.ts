import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  phone: z.string().max(20).optional(),
  avatarUrl: z.string().url('Invalid URL').max(2048).optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'banned']),
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['active', 'suspended', 'banned']).optional(),
  role: z.enum(['admin', 'merchant', 'support']).optional(),
  search: z.string().max(255).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

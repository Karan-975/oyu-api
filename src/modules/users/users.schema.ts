import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8)
  .regex(/[A-Z]/, 'Must contain uppercase')
  .regex(/[a-z]/, 'Must contain lowercase')
  .regex(/[0-9]/, 'Must contain number')
  .regex(/[^A-Za-z0-9]/, 'Must contain special character');

export const createUserSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.string().email(),
    phone: z.string().max(50).optional(),
    password: passwordSchema,
    roleIds: z.array(z.string().uuid()).min(1, 'At least one role required'),
    responsibleNgoAdminId: z.string().uuid().optional(),
    ngoId: z.string().uuid().optional(),
    kycData: z.any().optional(),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    phone: z.string().max(50).optional(),
    roleIds: z.array(z.string().uuid()).optional(),
    ngoId: z.string().uuid().optional().nullable(),
    kycData: z.any().optional(),
  }),
  params: z.object({ id: z.string().uuid() }),
});

export const userStatusSchema = z.object({
  body: z.object({ status: z.enum(['active', 'inactive', 'suspended']) }),
  params: z.object({ id: z.string().uuid() }),
});

export const adminResetPasswordSchema = z.object({
  body: z.object({ password: passwordSchema }),
  params: z.object({ id: z.string().uuid() }),
});

export const submitMyKycSchema = z.object({
  body: z.object({
    kycData: z.record(z.any()),
  }),
});

export const listUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    search: z.string().optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    ngoId: z.string().uuid().optional(),
    roleSlug: z.string().optional(),
  }),
});

import { z } from 'zod';

const statusEnum = z.enum(['active', 'inactive', 'suspended']);

export const createNgoSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(255),
    registrationNumber: z.string().max(100).optional(),
    contactPerson: z.string().min(2).max(150),
    email: z.string().email(),
    phone: z.string().min(7).max(50),
    address: z.string().min(5),
    regionId: z.string().uuid().optional(),
    website: z.string().url().optional(),
    notes: z.string().optional(),
  }),
});

export const updateNgoSchema = z.object({
  body: createNgoSchema.shape.body.partial(),
  params: z.object({ id: z.string().uuid() }),
});

export const ngoStatusSchema = z.object({
  body: z.object({ status: statusEnum }),
  params: z.object({ id: z.string().uuid() }),
});

export const listNgoSchema = z.object({
  query: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    search: z.string().optional(),
    status: statusEnum.optional(),
    regionId: z.string().uuid().optional(),
  }),
});

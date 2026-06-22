import { z } from 'zod';

const functionalStatus = z.enum(['functional', 'partially_functional', 'non_functional', 'unknown']);
const operationalStatus = z.enum(['active', 'under_rehabilitation', 'monitoring_pending', 'completed', 'decommissioned']);

export const createBoreholeSchema = z.object({
  body: z.object({
    boreholeCode: z.string().min(3).max(50).optional(),
    name: z.string().min(2).max(255),
    village: z.string().min(1).max(200),
    district: z.string().min(1).max(200),
    ward: z.string().max(200).optional(),
    province: z.string().max(200).optional(),
    county: z.string().max(200).optional(),
    subCounty: z.string().max(200).optional(),
    regionId: z.string().uuid().optional(),
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    elevation: z.coerce.number().optional(),
    functionalStatus: functionalStatus.default('unknown'),
    waterSource: z.string().max(100).optional(),
    depthMeters: z.coerce.number().optional(),
    staticWaterLevel: z.coerce.number().optional(),
    yieldLps: z.coerce.number().optional(),
    assignedNgoAdminId: z.string().uuid().optional(),
    notes: z.string().optional(),
  }),
});

export const updateBoreholeSchema = z.object({
  body: createBoreholeSchema.shape.body.partial(),
  params: z.object({ id: z.string().uuid() }),
});

export const assignNgoSchema = z.object({
  body: z.object({
    ngoId: z.string().uuid(),
    reason: z.string().optional(),
  }),
  params: z.object({ id: z.string().uuid() }),
});

export const assignUserSchema = z.object({
  body: z.object({
    userId: z.string().uuid().nullable().optional().or(z.literal('')),
    module: z.string().max(100).optional(),
    modules: z.array(z.string().max(100)).optional(),
    reason: z.string().optional(),
  }),
  params: z.object({ id: z.string().uuid() }),
});

export const reassignSchema = z.object({
  body: z.object({
    assigneeType: z.enum(['ngo']),
    assigneeId: z.string().uuid(),
    reason: z.string().min(5, 'Reassignment reason required'),
  }),
  params: z.object({ id: z.string().uuid() }),
});

export const listBoreholeSchema = z.object({
  query: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    search: z.string().optional(),
    functionalStatus: functionalStatus.optional(),
    operationalStatus: operationalStatus.optional(),
    ngoId: z.string().uuid().optional(),
    assignedUserId: z.string().uuid().optional(),
    regionId: z.string().uuid().optional(),
  }),
});

export const mapBoreholeSchema = z.object({
  query: z.object({
    ngoId: z.string().uuid().optional(),
    assignedUserId: z.string().uuid().optional(),
    functionalStatus: functionalStatus.optional(),
    operationalStatus: operationalStatus.optional(),
    regionId: z.string().uuid().optional(),
  }),
});

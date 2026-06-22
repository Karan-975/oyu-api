import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ValidationError } from './errorHandler';

function normalizeEmptyStrings(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map((item: any) => normalizeEmptyStrings(item));
  }

  if (obj && typeof obj === 'object') {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        acc[key] = trimmed === '' ? undefined : trimmed;
      } else if (typeof value === 'object' && value !== null) {
        acc[key] = normalizeEmptyStrings(value);
      } else {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);
  }
  return obj;
}

export function validate(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const normalizedBody = normalizeEmptyStrings(req.body);
      const normalizedQuery = normalizeEmptyStrings(req.query);
      const normalizedParams = normalizeEmptyStrings(req.params);

      const parsed = await schema.parseAsync({
        body: normalizedBody,
        query: normalizedQuery,
        params: normalizedParams,
      });

      req.body = parsed.body ?? normalizedBody;
      req.query = parsed.query ?? normalizedQuery;
      req.params = parsed.params ?? normalizedParams;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map((e) => ({
          field: e.path.slice(1).join('.'),
          message: e.message,
          code: e.code,
        }));
        throw new ValidationError(errors);
      }
      throw err;
    }
  };
}

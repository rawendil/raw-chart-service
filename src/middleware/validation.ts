import { Request, Response, NextFunction } from 'express';
import { z, ZodType } from 'zod';
import { Logger } from '../utils/logger';

const logger = new Logger();

export const chartTypeSchema = z.enum([
  'line', 'bar', 'pie', 'doughnut', 'radar', 'polarArea', 'scatter', 'bubble', 'mixed',
]);

export const themeSchema = z.enum(['light', 'dark', 'custom']).default('light');

export const datasetSchema = z.object({
  label: z.string(),
  data: z.array(z.number()),
  backgroundColor: z.union([z.string(), z.array(z.string())]).optional(),
  borderColor: z.union([z.string(), z.array(z.string())]).optional(),
  borderWidth: z.number().int().min(0).max(10).optional(),
  fill: z.boolean().optional(),
  type: z.enum(['line', 'bar']).optional(),
});

export const chartDataSchema = z.object({
  labels: z.array(z.string()),
  datasets: z.array(datasetSchema).min(1),
});

export const chartConfigSchema = z.object({
  type: chartTypeSchema,
  options: z
    .object({
      responsive: z.boolean().optional(),
      maintainAspectRatio: z.boolean().optional(),
      plugins: z
        .object({
          legend: z
            .object({
              display: z.boolean().optional(),
              position: z.enum(['top', 'bottom', 'left', 'right']).optional(),
            })
            .optional(),
          title: z
            .object({
              display: z.boolean().optional(),
              text: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
      scales: z.record(z.unknown()).optional(),
      elements: z.record(z.unknown()).optional(),
    })
    .optional(),
});

export const generateChartSchema = z.object({
  title: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  chartType: chartTypeSchema,
  data: chartDataSchema,
  width: z.number().int().min(100).max(4000).default(800),
  height: z.number().int().min(100).max(4000).default(600),
  theme: themeSchema,
  isPublic: z.boolean().default(false),
  expiresAt: z
    .coerce.date()
    .refine((d) => d > new Date(), 'expiresAt must be in the future')
    .optional(),
  chartConfig: chartConfigSchema.optional(),
});

export const updateChartSchema = z
  .object({
    title: z.string().max(255).optional(),
    description: z.string().max(1000).optional(),
    data: chartDataSchema.optional(),
    width: z.number().int().min(100).max(4000).optional(),
    height: z.number().int().min(100).max(4000).optional(),
    theme: themeSchema.optional(),
    isPublic: z.boolean().optional(),
    expiresAt: z
      .coerce.date()
      .refine((d) => d > new Date(), 'expiresAt must be in the future')
      .optional(),
    chartConfig: chartConfigSchema.optional(),
  })
  .refine((o) => Object.keys(o).length >= 1, {
    message: 'At least one field must be provided',
  });

type Source = 'body' | 'params' | 'query';

function validate(source: Source, schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      logger.warn(`${source} validation failed`, { errors: details });

      const label = source[0].toUpperCase() + source.slice(1);
      res.status(400).json({
        success: false,
        error: `${label} validation failed`,
        details,
      });
      return;
    }

    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };
}

export const validateBody = (schema: ZodType) => validate('body', schema);
export const validateParams = (schema: ZodType) => validate('params', schema);
export const validateQuery = (schema: ZodType) => validate('query', schema);

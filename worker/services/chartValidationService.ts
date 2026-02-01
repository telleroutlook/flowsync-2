import { z } from 'zod';

/**
 * Chart Validation Service
 * Provides ECharts configuration validation using Zod schemas
 *
 * Note: Complete ECharts validation requires rendering in browser.
 * This service provides structural validation to catch common errors early.
 */

/**
 * Validation error structure
 */
export interface ValidationError {
  message: string;
  path?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Basic ECharts Title Schema
 */
const EChartsTitleSchema = z.object({
  text: z.string().min(1, 'Title text must not be empty'),
  subtext: z.string().optional(),
  left: z.union([z.string(), z.number()]).optional(),
  top: z.union([z.string(), z.number()]).optional(),
});

/**
 * Basic ECharts Tooltip Schema
 */
const EChartsTooltipSchema = z.object({
  trigger: z.enum(['item', 'axis', 'none']).optional(),
  formatter: z.union([z.string(), z.function()]).optional(),
});

/**
 * Basic ECharts Legend Schema
 */
const EChartsLegendSchema = z.object({
  data: z.array(z.string()).optional(),
  orient: z.enum(['horizontal', 'vertical']).optional(),
  left: z.union([z.string(), z.number()]).optional(),
  top: z.union([z.string(), z.number()]).optional(),
});

/**
 * Basic ECharts Axis Schema (xAxis/yAxis)
 */
const EChartsAxisSchema = z.object({
  type: z.enum(['category', 'value', 'time', 'log']),
  data: z.array(z.any()).optional(),
  name: z.string().optional(),
});

/**
 * Main ECharts Option Schema
 * Validates the most critical fields
 */
const EChartsOptionSchema = z.object({
  // Required fields
  title: EChartsTitleSchema,
  series: z.array(z.any()).min(1, 'At least one series is required'),

  // Highly recommended fields
  tooltip: EChartsTooltipSchema.optional(),
  legend: EChartsLegendSchema.optional(),
  xAxis: z.union([EChartsAxisSchema, z.array(EChartsAxisSchema)]).optional(),
  yAxis: z.union([EChartsAxisSchema, z.array(EChartsAxisSchema)]).optional(),

  // Optional common fields
  grid: z.any().optional(),
  color: z.array(z.string()).optional(),
  backgroundColor: z.string().optional(),
  toolbox: z.any().optional(),
  visualMap: z.any().optional(),
  geo: z.any().optional(),
  radar: z.any().optional(),
  angleAxis: z.any().optional(),
  radiusAxis: z.any().optional(),
});

/**
 * Validate ECharts configuration
 *
 * @param config - ECharts configuration object
 * @returns Validation result with errors
 */
export async function validateEChartsConfig(
  config: Record<string, unknown>
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];

  // Step 1: Check if config exists
  if (!config || typeof config !== 'object') {
    return {
      valid: false,
      errors: [{ message: 'Configuration must be a valid object' }],
    };
  }

  // Step 2: Validate using Zod schema
  try {
    EChartsOptionSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      for (const issue of error.issues) {
        const path = issue.path.length > 0 ? issue.path.join('.') : undefined;
        errors.push({
          message: issue.message,
          path,
        });
      }
    } else {
      errors.push({
        message: 'Unknown validation error',
        path: undefined,
      });
    }
  }

  // Step 3: Additional structural checks
  const series = config.series as unknown[];
  if (Array.isArray(series)) {
    if (series.length === 0) {
      errors.push({
        message: 'Series array cannot be empty',
        path: 'series',
      });
    } else {
      // Validate each series has type and data
      series.forEach((s, idx) => {
        if (s && typeof s === 'object') {
          if (!('type' in s)) {
            errors.push({
              message: `Series at index ${idx} is missing 'type' field`,
              path: `series[${idx}]`,
            });
          }
          if (!('data' in s)) {
            errors.push({
              message: `Series at index ${idx} is missing 'data' field`,
              path: `series[${idx}]`,
            });
          }
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate multiple ECharts configurations
 *
 * @param configs - Array of ECharts configurations
 * @returns Array of validation results
 */
export async function validateMultipleEChartsConfigs(
  configs: Record<string, unknown>[]
): Promise<ValidationResult[]> {
  return Promise.all(configs.map(validateEChartsConfig));
}

/**
 * Check if configuration is valid (convenience function)
 *
 * @param config - ECharts configuration object
 * @returns True if valid, false otherwise
 */
export async function isValidEChartsConfig(
  config: Record<string, unknown>
): Promise<boolean> {
  const result = await validateEChartsConfig(config);
  return result.valid;
}

/**
 * Get human-readable error message
 *
 * @param result - Validation result
 * @returns Formatted error message
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.valid) {
    return 'Configuration is valid';
  }

  const errorMessages = result.errors.map(
    (err) => `${err.path ? err.path + ': ' : ''}${err.message}`
  );

  return `Validation failed:\n${errorMessages.join('\n')}`;
}

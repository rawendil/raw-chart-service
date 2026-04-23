import { ChartType, Theme } from './database';
import { z } from 'zod';
import {
  generateChartSchema,
  updateChartSchema,
  chartDataSchema,
} from '../middleware/validation';

export type GenerateChartRequest = z.infer<typeof generateChartSchema>;
export type UpdateChartRequest = z.infer<typeof updateChartSchema>;
export type ChartData = z.infer<typeof chartDataSchema>;

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ChartResponse {
  id: string;
  chart_hash: string;
  title?: string;
  description?: string;
  chart_type: ChartType;
  width: number;
  height: number;
  theme: Theme;
  is_public: boolean;
  expires_at?: string;
  created_at: string;
  updated_at: string;
  access_url: string;
  embed_url: string;
  png_url: string;
  json_url: string;
}


export interface Chart {
  id: string;
  chart_hash: string;
  title?: string;
  description?: string;
  chart_type: ChartType;
  chart_config: ChartConfig;
  chart_data: ChartData;
  width: number;
  height: number;
  theme: Theme;
  is_public: boolean;
  expires_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export type ChartType =
  | 'line'
  | 'bar'
  | 'pie'
  | 'doughnut'
  | 'radar'
  | 'polarArea'
  | 'scatter'
  | 'bubble'
  | 'mixed';

export type Theme = 'light' | 'dark' | 'custom';

export type AccessType = 'view' | 'embed' | 'png' | 'json';

export interface ChartConfig {
  type: ChartType;
  options: {
    responsive?: boolean;
    maintainAspectRatio?: boolean;
    plugins?: {
      legend?: {
        display?: boolean;
        position?: string;
      };
      title?: {
        display?: boolean;
        text?: string;
      };
    };
    scales?: {
      x?: any;
      y?: any;
    };
    elements?: {
      point?: {
        radius?: number;
      };
      line?: {
        tension?: number;
      };
    };
  };
}

export interface ChartData {
  labels: string[];
  datasets: Dataset[];
}

export interface Dataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
  type?: string;
}
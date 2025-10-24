import puppeteer from 'puppeteer';
import { ChartType, ChartData, ChartConfiguration } from 'chart.js';
import { Logger } from '../utils/logger';
import { ChartType as CustomChartType, Theme } from '../types/database';
import { RedisService } from './redis';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export class ChartGeneratorService {
  private logger: Logger;
  private redisService: RedisService;

  constructor(redisService?: RedisService) {
    this.logger = new Logger();
    this.redisService = redisService || new RedisService();
    this.logger.info('Chart generator service initialized');
  }

  private generateCacheKey(
    chartType: CustomChartType,
    data: ChartData,
    options: {
      width: number;
      height: number;
      theme: Theme;
      title?: string;
      backgroundColor: string;
    }
  ): string {
    const dataHash = crypto
      .createHash('md5')
      .update(JSON.stringify({ data, options }))
      .digest('hex');
    
    return `chart_cache:${chartType}:${options.width}:${options.height}:${options.theme}:${dataHash}`;
  }

  async generateChart(
    chartType: CustomChartType,
    data: ChartData,
    options: {
      width?: number;
      height?: number;
      theme?: Theme;
      title?: string;
      backgroundColor?: string;
    } = {}
  ): Promise<Buffer> {
    const {
      width = 800,
      height = 600,
      theme = 'light',
      title,
      backgroundColor = theme === 'dark' ? '#1a1a1a' : '#ffffff'
    } = options;

    const cacheKey = this.generateCacheKey(chartType, data, { width, height, theme, title, backgroundColor });
    
    // Check cache first
    try {
      // Check if Redis is available before attempting operations
      const redisAvailable = await this.redisService.isAvailable();
      if (redisAvailable) {
        const cachedChart = await this.redisService.get(cacheKey);
        if (cachedChart) {
          this.logger.info('Chart served from cache', { chartType, cacheKey });
          return cachedChart;
        }
      } else {
        this.logger.warn('Redis is not available, generating new chart without cache');
      }
    } catch (error) {
      this.logger.warn('Cache retrieval failed, generating new chart', error);
      // Try to reconnect to Redis if connection is lost
      try {
        await this.redisService.disconnect();
        await this.redisService.connect();
      } catch (reconnectError) {
        this.logger.warn('Failed to reconnect to Redis', reconnectError);
      }
    }

    let browser;
    try {
      this.logger.info('Generating chart with Puppeteer', {
        type: chartType,
        width,
        height,
        theme,
        datasets: data.datasets.length
      });

      // Launch browser with path to Chromium in Alpine
      browser = await puppeteer.launch({
        headless: 'new',
        executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-default-apps',
          '--disable-translate',
          '--disable-device-discovery-notifications',
          '--disable-software-rasterizer',
          '--disable-background-networking'
        ],
        timeout: 30000 // 30 seconds timeout
      });

      const page = await browser.newPage();

      // Set viewport and handle potential errors
      try {
        await page.setViewport({ width, height });
      } catch (viewportError) {
        this.logger.warn('Failed to set viewport, continuing with default', viewportError);
      }

      // Create Chart.js HTML
      const chartJsConfig = this.createChartJsConfig(chartType, data, {
        width,
        height,
        theme,
        ...(title && { title }),
        backgroundColor
      });

      // Generate HTML content
      const htmlContent = this.generateHtmlContent(chartJsConfig, {
        width,
        height,
        theme,
        backgroundColor
      });

      // Set page content with better error handling
      try {
        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 15000 });
      } catch (contentError) {
        this.logger.warn('Failed to load content with networkidle0, trying with domcontentloaded', contentError);
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 10000 });
      }

      // Wait for chart to render with retry logic
      let chartRendered = false;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (!chartRendered && retryCount < maxRetries) {
        try {
          await page.waitForSelector('#chart-container canvas', { timeout: 5000 });
          chartRendered = true;
        } catch (selectorError) {
          retryCount++;
          this.logger.warn(`Chart render attempt ${retryCount} failed`, selectorError);
          if (retryCount >= maxRetries) {
            throw new Error(`Failed to render chart after ${maxRetries} attempts`);
          }
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Take screenshot with error handling
      let screenshotBuffer;
      try {
        screenshotBuffer = await page.screenshot({
          clip: { x: 0, y: 0, width, height },
          type: 'png',
          omitBackground: false
        });
      } catch (screenshotError) {
        this.logger.error('Failed to take screenshot', screenshotError);
        throw new Error(`Screenshot failed: ${screenshotError instanceof Error ? screenshotError.message : 'Unknown error'}`);
      }

      // Store in cache for 1 hour
      try {
        // Check if Redis is available before attempting operations
        const redisAvailable = await this.redisService.isAvailable();
        if (redisAvailable) {
          await this.redisService.set(cacheKey, screenshotBuffer, 3600);
        } else {
          this.logger.warn('Redis is not available, skipping cache storage');
        }
      } catch (error) {
        this.logger.warn('Failed to cache chart', error);
        // Try to reconnect to Redis if connection is lost
        try {
          await this.redisService.disconnect();
          await this.redisService.connect();
          // Retry caching
          await this.redisService.set(cacheKey, screenshotBuffer, 3600);
        } catch (reconnectError) {
          this.logger.warn('Failed to reconnect to Redis for caching', reconnectError);
        }
      }

      this.logger.info('Chart generated successfully', {
        size: screenshotBuffer.length,
        type: chartType,
        cached: true
      });

      return screenshotBuffer;
    } catch (error) {
      this.logger.error('Failed to generate chart with Puppeteer', error);
      
      // Provide more specific error messages
      let errorMessage = 'Chart generation failed';
      if (error instanceof Error) {
        if (error.message.includes('Target closed')) {
          errorMessage = 'Browser target closed unexpectedly. This may be due to resource constraints or timeout.';
        } else if (error.message.includes('Protocol error')) {
          errorMessage = 'Browser protocol error. The browser instance may have crashed.';
        } else {
          errorMessage = `Chart generation failed: ${error.message}`;
        }
      }
      
      throw new Error(errorMessage);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          this.logger.warn('Failed to close browser properly', closeError);
        }
      }
    }
  }

  private createChartJsConfig(
    chartType: CustomChartType,
    data: ChartData,
    options: {
      width: number;
      height: number;
      theme: Theme;
      title?: string;
      backgroundColor: string;
    }
  ) {
    return {
      type: this.mapCustomChartType(chartType),
      data: {
        labels: data.labels || [],
        datasets: data.datasets.map(dataset => ({
          ...dataset,
          backgroundColor: this.getBackgroundColors(dataset.backgroundColor, chartType, options.theme),
          borderColor: this.getBorderColors(dataset.borderColor, chartType, options.theme),
          borderWidth: dataset.borderWidth || 2,
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: data.datasets.length > 1,
            position: 'top',
            labels: {
              color: options.theme === 'dark' ? '#ffffff' : '#000000',
              font: {
                size: 12
              }
            }
          },
          title: {
            display: !!options.title,
            text: options.title,
            color: options.theme === 'dark' ? '#ffffff' : '#000000',
            font: {
              size: 16,
              weight: 'bold'
            },
            padding: 20
          }
        },
        scales: this.getScaleOptions(chartType, options.theme),
        elements: {
          point: {
            radius: 4,
            hoverRadius: 6
          },
          line: {
            tension: 0.3
          }
        }
      }
    };
  }

  private generateHtmlContent(
    chartConfig: any,
    options: {
      width: number;
      height: number;
      theme: Theme;
      backgroundColor: string;
    }
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Chart Generation</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.js"></script>
        <style>
          body {
            margin: 0;
            padding: 0;
            background: ${options.backgroundColor};
          }
          #chart-container {
            width: ${options.width}px;
            height: ${options.height}px;
            background: ${options.backgroundColor};
          }
        </style>
      </head>
      <body>
        <div id="chart-container">
          <canvas id="chart-canvas"></canvas>
        </div>
        <script>
          const ctx = document.getElementById('chart-canvas').getContext('2d');
          new Chart(ctx, ${JSON.stringify(chartConfig)});
        </script>
      </body>
      </html>
    `;
  }

  private mapCustomChartType(customType: CustomChartType): ChartType {
    const typeMap: Record<CustomChartType, ChartType> = {
      'line': 'line',
      'bar': 'bar',
      'pie': 'pie',
      'doughnut': 'doughnut',
      'radar': 'radar',
      'polarArea': 'polarArea',
      'scatter': 'scatter',
      'bubble': 'bubble',
      'mixed': 'line' // Default to line for mixed charts
    };

    return typeMap[customType] || 'line';
  }

  private getBackgroundColors(
    providedColors: string | string[] | undefined,
    chartType: CustomChartType,
    theme: Theme
  ): string | string[] {
    if (providedColors) {
      return providedColors;
    }

    // Default color palettes based on chart type and theme
    const colorPalettes = {
      light: {
        line: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
        bar: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
        pie: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
        doughnut: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
        radar: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
        polarArea: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
        scatter: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
        bubble: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
        mixed: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
      },
      dark: {
        line: ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'],
        bar: ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'],
        pie: ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'],
        doughnut: ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'],
        radar: ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'],
        polarArea: ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'],
        scatter: ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'],
        bubble: ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'],
        mixed: ['#60a5fa', '#f87171', '#34d399', '#fbbf24', '#a78bfa', '#f472b6']
      }
    };

    return colorPalettes[theme as keyof typeof colorPalettes][chartType] || colorPalettes[theme as keyof typeof colorPalettes].line;
  }

  private getBorderColors(
    providedColors: string | string[] | undefined,
    chartType: CustomChartType,
    theme: Theme
  ): string | string[] {
    if (providedColors) {
      return providedColors;
    }

    // For most chart types, border colors match background colors
    return this.getBackgroundColors(undefined, chartType, theme);
  }

  private getScaleOptions(chartType: CustomChartType, theme: Theme) {
    const textColor = theme === 'dark' ? '#ffffff' : '#000000';
    const gridColor = theme === 'dark' ? '#374151' : '#e5e7eb';

    const baseOptions = {
      x: {
        ticks: {
          color: textColor,
          font: {
            size: 11
          }
        },
        grid: {
          color: gridColor,
          borderColor: gridColor
        }
      },
      y: {
        ticks: {
          color: textColor,
          font: {
            size: 11
          }
        },
        grid: {
          color: gridColor,
          borderColor: gridColor
        }
      }
    };

    // Special scale options for specific chart types
    if (chartType === 'radar') {
      return {
        r: {
          ticks: {
            color: textColor,
            font: {
              size: 11
            }
          },
          grid: {
            color: gridColor
          },
          pointLabels: {
            color: textColor,
            font: {
              size: 12
            }
          }
        }
      };
    }

    return baseOptions;
  }

  async invalidateChartCache(chartHash: string): Promise<void> {
    try {
      const pattern = `chart_cache:*:*:*:*:*${chartHash}*`;
      await this.redisService.delPattern(pattern);
    } catch (error) {
      this.logger.warn('Failed to invalidate chart cache', error);
    }
  }

  async invalidateAllCache(): Promise<void> {
    try {
      const pattern = 'chart_cache:*';
      await this.redisService.delPattern(pattern);
    } catch (error) {
      this.logger.warn('Failed to invalidate all chart cache', error);
    }
  }
}
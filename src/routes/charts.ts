import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { DatabaseService } from '../services/database';
import { ChartGeneratorService } from '../services/chartGenerator';
import { RedisService } from '../services/redis';
import { authenticateApiKey } from '../middleware/auth';
import { Logger } from '../utils/logger';
import { GenerateChartRequest, UpdateChartRequest, ApiResponse, ChartResponse } from '../types/api';
import { Chart } from '../types/database';
import { validateBody, validateParams, generateChartSchema, updateChartSchema } from '../middleware/validation';

const router = Router();
const logger = new Logger();

// Get services from app locals (set by middleware)
const getServices = (req: Request) => {
  const databaseService = req.app.locals.databaseService as DatabaseService;
  const redisService = req.app.locals.redisService as RedisService;
  const chartGenerator = new ChartGeneratorService(redisService);
  
  return { databaseService, redisService, chartGenerator };
};

// Generate a hash for chart ID
function generateChartHash(): string {
  return crypto.randomBytes(16).toString('hex');
}

// POST /api/charts/generate - Generate new chart (authenticated)
/**
 * @swagger
 * /api/charts/generate:
 *   post:
 *     summary: Generate a new chart
 *     description: Creates a new chart with the provided data and configuration. Requires authentication.
 *     tags: [Charts]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenerateChartRequest'
 *     responses:
 *       201:
 *         description: Chart generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ChartResponse'
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/generate', authenticateApiKey, validateBody(generateChartSchema), async (req: Request, res: Response): Promise<void> => {
   try {
     const { databaseService } = getServices(req);
     const requestData = req.body;

     // Transform camelCase to snake_case for database
     const chartData = {
       title: requestData.title,
       description: requestData.description,
       chart_type: requestData.chartType,
       chart_config: requestData.chartConfig || {},
       chart_data: requestData.data,
       width: requestData.width || 800,
       height: requestData.height || 600,
       theme: requestData.theme || 'light',
       is_public: requestData.isPublic || false,
       expires_at: requestData.expiresAt ? new Date(requestData.expiresAt) : null
     };

     // Validate required fields
     if (!chartData.chart_type || !chartData.chart_data) {
       res.status(400).json({
         success: false,
         error: 'chart_type and chart_data are required'
       } as ApiResponse);
       return;
     }

     // Generate unique chart hash
     const chartHash = generateChartHash();

     // Prepare chart record
     const chartRecord = {
       chart_hash: chartHash,
       title: chartData.title,
       description: chartData.description,
       chart_type: chartData.chart_type,
       chart_config: chartData.chart_config,
       chart_data: chartData.chart_data,
       width: chartData.width,
       height: chartData.height,
       theme: chartData.theme,
       is_public: chartData.is_public,
       expires_at: chartData.expires_at
     };

    // Insert chart record
    const query = `
      INSERT INTO charts (chart_hash, title, description, chart_type, chart_config, chart_data, width, height, theme, is_public, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, chart_hash, title, description, chart_type, width, height, theme, is_public, expires_at, created_at, updated_at
    `;

    const result = await databaseService.query(query, [
      chartRecord.chart_hash,
      chartRecord.title,
      chartRecord.description,
      chartRecord.chart_type,
      JSON.stringify(chartRecord.chart_config),
      JSON.stringify(chartRecord.chart_data),
      chartRecord.width,
      chartRecord.height,
      chartRecord.theme,
      chartRecord.is_public,
      chartRecord.expires_at
    ]);

    const chart = result.rows[0];
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const response: ChartResponse = {
      id: chart.id,
      chart_hash: chart.chart_hash,
      title: chart.title,
      description: chart.description,
      chart_type: chart.chart_type,
      width: chart.width,
      height: chart.height,
      theme: chart.theme,
      is_public: chart.is_public,
      expires_at: chart.expires_at,
      created_at: chart.created_at,
      updated_at: chart.updated_at,
      access_url: `${baseUrl}/api/charts/${chart.chart_hash}`,
      embed_url: `${baseUrl}/api/charts/${chart.chart_hash}/embed`,
      png_url: `${baseUrl}/api/charts/${chart.chart_hash}/png`,
      json_url: `${baseUrl}/api/charts/${chart.chart_hash}/json`
    };

    logger.info('Chart generated successfully', {
      chartId: chart.id,
      chartHash: chart.chart_hash,
      type: chart.chart_type
    });

    res.status(201).json({
      success: true,
      data: response
    } as ApiResponse<ChartResponse>);
  } catch (error) {
    logger.error('Failed to generate chart', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate chart'
    } as ApiResponse);
  }
});

// GET /api/charts/:hash - Get chart information (public)
/**
 * @swagger
 * /api/charts/{hash}:
 *   get:
 *     summary: Get chart information
 *     description: Retrieves chart metadata and access URLs for a specific chart by its hash
 *     tags: [Charts]
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique chart hash identifier
 *     responses:
 *       200:
 *         description: Chart information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ChartResponse'
 *       404:
 *         description: Chart not found or expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:hash', async (req: Request, res: Response): Promise<void> => {
  try {
    const { databaseService } = getServices(req);
    const { hash } = req.params;

    // Get chart from database
    const query = `
      SELECT id, chart_hash, title, description, chart_type, width, height, theme, is_public, expires_at, created_at, updated_at
      FROM charts
      WHERE chart_hash = $1 AND (is_public = true OR expires_at > NOW())
    `;

    const result = await databaseService.query(query, [hash]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Chart not found or expired'
      } as ApiResponse);
      return;
    }

    const chart = result.rows[0];
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    // Log access
    await databaseService.query(
      'INSERT INTO chart_access_logs (chart_id, ip_address, user_agent, access_type) VALUES ($1, $2, $3, $4)',
      [chart.id, req.ip, req.get('User-Agent') || '', 'view']
    );

    const response: ChartResponse = {
      id: chart.id,
      chart_hash: chart.chart_hash,
      title: chart.title,
      description: chart.description,
      chart_type: chart.chart_type,
      width: chart.width,
      height: chart.height,
      theme: chart.theme,
      is_public: chart.is_public,
      expires_at: chart.expires_at,
      created_at: chart.created_at,
      updated_at: chart.updated_at,
      access_url: `${baseUrl}/api/charts/${chart.chart_hash}`,
      embed_url: `${baseUrl}/api/charts/${chart.chart_hash}/embed`,
      png_url: `${baseUrl}/api/charts/${chart.chart_hash}/png`,
      json_url: `${baseUrl}/api/charts/${chart.chart_hash}/json`
    };

    res.json({
      success: true,
      data: response
    } as ApiResponse<ChartResponse>);
  } catch (error) {
    logger.error('Failed to retrieve chart', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve chart'
    } as ApiResponse);
  }
});

// GET /api/charts/:hash/png - Get PNG image (public)
/**
 * @swagger
 * /api/charts/{hash}/png:
 *   get:
 *     summary: Get chart as PNG image
 *     description: Generates and returns a PNG image of the chart
 *     tags: [Charts]
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique chart hash identifier
 *     responses:
 *       200:
 *         description: PNG image generated successfully
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Chart not found or expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to generate PNG
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:hash/png', async (req: Request, res: Response): Promise<void> => {
  try {
    const { databaseService, chartGenerator } = getServices(req);
    const { hash } = req.params;

    // Get chart data from database
    const query = `
      SELECT chart_data, chart_type, width, height, theme, title
      FROM charts
      WHERE chart_hash = $1 AND (is_public = true OR expires_at > NOW())
    `;

    const result = await databaseService.query(query, [hash]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Chart not found or expired'
      } as ApiResponse);
      return;
    }

    const chart = result.rows[0];

    // Generate PNG using chart generator
    const pngBuffer = await chartGenerator.generateChart(
      chart.chart_type,
      chart.chart_data,
      {
        width: chart.width,
        height: chart.height,
        theme: chart.theme,
        title: chart.title
      }
    );

    // Log access
    await databaseService.query(
      'INSERT INTO chart_access_logs (chart_id, ip_address, user_agent, access_type) VALUES ($1, $2, $3, $4)',
      [chart.id, req.ip, req.get('User-Agent') || '', 'png']
    );

    logger.info('PNG served successfully', {
      chartHash: hash,
      size: pngBuffer.length
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(pngBuffer);
  } catch (error) {
    logger.error('Failed to generate PNG', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PNG'
    } as ApiResponse);
  }
});

router.get('/:hash/embed', async (req: Request, res: Response): Promise<void> => {
  try {
    const { databaseService } = getServices(req);
    const { hash } = req.params;

    // Get chart data from database
    const query = `
      SELECT chart_data, chart_type, width, height, theme, title, description
      FROM charts
      WHERE chart_hash = $1 AND (is_public = true OR expires_at > NOW())
    `;

    const result = await databaseService.query(query, [hash]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Chart not found or expired'
      } as ApiResponse);
      return;
    }

    const chart = result.rows[0];

    // Log access
    await databaseService.query(
      'INSERT INTO chart_access_logs (chart_id, ip_address, user_agent, access_type) VALUES ($1, $2, $3, $4)',
      [chart.id, req.ip, req.get('User-Agent') || '', 'embed']
    );

    // Generate HTML embed page
    const embedHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${chart.title || 'Chart'}</title>
        <script src="/js/chart.js"></script>
        <style>
          body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: ${chart.theme === 'dark' ? '#1a1a1a' : '#ffffff'};
            color: ${chart.theme === 'dark' ? '#ffffff' : '#333333'};
          }
          .chart-container {
            max-width: ${chart.width}px;
            margin: 0 auto;
          }
          h1 {
            text-align: center;
            margin-bottom: 20px;
            font-size: 24px;
            font-weight: 600;
          }
          .chart-description {
            text-align: center;
            margin-bottom: 30px;
            color: ${chart.theme === 'dark' ? '#cccccc' : '#666666'};
          }
        </style>
      </head>
      <body>
        <div class="chart-container">
          <h1>${chart.title || 'Chart'}</h1>
          ${chart.description ? `<p class="chart-description">${chart.description}</p>` : ''}
          <canvas id="chartCanvas" width="${chart.width}" height="${chart.height}"></canvas>
        </div>

        <script>
          // Set global variables for the chart
          window.chartData = ${JSON.stringify(chart.chart_data)};
          window.chartType = '${chart.chart_type}';
          window.chartTheme = '${chart.theme}';
        </script>
        <script src="/js/embed-chart.js"></script>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    // Set CSP to allow inline scripts for chart initialization
    res.setHeader('Content-Security-Policy', "script-src 'self' 'unsafe-inline'");
    res.send(embedHtml);
  } catch (error) {
    logger.error('Failed to generate embed page', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate embed page'
    } as ApiResponse);
  }
});

// GET /api/charts/:hash/json - Get chart data as JSON (public)
/**
 * @swagger
 * /api/charts/{hash}/json:
 *   get:
 *     summary: Get chart data as JSON
 *     description: Returns the raw chart data and metadata in JSON format
 *     tags: [Charts]
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique chart hash identifier
 *     responses:
 *       200:
 *         description: Chart data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       example: "bar"
 *                     title:
 *                       type: string
 *                       example: "Sales Report"
 *                     description:
 *                       type: string
 *                       example: "Monthly sales data"
 *                     data:
 *                       $ref: '#/components/schemas/ChartData'
 *       404:
 *         description: Chart not found or expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:hash/json', async (req: Request, res: Response): Promise<void> => {
  try {
    const { databaseService } = getServices(req);
    const { hash } = req.params;

    // Get chart data from database
    const query = `
      SELECT chart_data, chart_type, title, description
      FROM charts
      WHERE chart_hash = $1 AND (is_public = true OR expires_at > NOW())
    `;

    const result = await databaseService.query(query, [hash]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Chart not found or expired'
      } as ApiResponse);
      return;
    }

    const chart = result.rows[0];

    // Log access
    await databaseService.query(
      'INSERT INTO chart_access_logs (chart_id, ip_address, user_agent, access_type) VALUES ($1, $2, $3, $4)',
      [chart.id, req.ip, req.get('User-Agent') || '', 'json']
    );

    res.json({
      success: true,
      data: {
        type: chart.chart_type,
        title: chart.title,
        description: chart.description,
        data: chart.chart_data
      }
    } as ApiResponse);
  } catch (error) {
    logger.error('Failed to serve chart JSON', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve chart data'
    } as ApiResponse);
  }
});

// PUT /api/charts/:hash - Update chart (authenticated)
/**
 * @swagger
 * /api/charts/{hash}:
 *   put:
 *     summary: Update an existing chart
 *     description: Updates chart properties. Only the chart owner can perform this operation.
 *     tags: [Charts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique chart hash identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Updated Chart Title"
 *               description:
 *                 type: string
 *                 example: "Updated description"
 *               chart_data:
 *                 $ref: '#/components/schemas/ChartData'
 *               width:
 *                 type: number
 *                 example: 900
 *               height:
 *                 type: number
 *                 example: 700
 *               theme:
 *                 type: string
 *                 enum: [light, dark]
 *                 example: "dark"
 *               is_public:
 *                 type: boolean
 *                 example: true
 *               expires_at:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Chart updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ChartResponse'
 *       403:
 *         description: Not authorized to update this chart
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Chart not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:hash', authenticateApiKey, validateBody(updateChartSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { databaseService, chartGenerator } = getServices(req);
    const { hash } = req.params;
    const requestData = req.body;

    // Transform camelCase to snake_case for database update
    const updateData = {
      title: requestData.title,
      description: requestData.description,
      chart_data: requestData.data,
      chart_config: requestData.chartConfig,
      width: requestData.width,
      height: requestData.height,
      theme: requestData.theme,
      is_public: requestData.isPublic,
      expires_at: requestData.expiresAt
    };

    // Check if chart exists
    const existingQuery = 'SELECT id FROM charts WHERE chart_hash = $1';
    const existingResult = await databaseService.query(existingQuery, [hash]);

    if (existingResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Chart not found'
      } as ApiResponse);
      return;
    }

    // Update chart
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (updateData.title !== undefined) {
      updateFields.push(`title = $${paramCount}`);
      updateValues.push(updateData.title);
      paramCount++;
    }

    if (updateData.description !== undefined) {
      updateFields.push(`description = $${paramCount}`);
      updateValues.push(updateData.description);
      paramCount++;
    }

    if (updateData.chart_data !== undefined) {
      updateFields.push(`chart_data = $${paramCount}`);
      updateValues.push(JSON.stringify(updateData.chart_data));
      paramCount++;
    }

    if (updateData.chart_config !== undefined) {
      updateFields.push(`chart_config = $${paramCount}`);
      updateValues.push(JSON.stringify(updateData.chart_config));
      paramCount++;
    }

    if (updateData.width !== undefined) {
      updateFields.push(`width = $${paramCount}`);
      updateValues.push(updateData.width);
      paramCount++;
    }

    if (updateData.height !== undefined) {
      updateFields.push(`height = $${paramCount}`);
      updateValues.push(updateData.height);
      paramCount++;
    }

    if (updateData.theme !== undefined) {
      updateFields.push(`theme = $${paramCount}`);
      updateValues.push(updateData.theme);
      paramCount++;
    }

    if (updateData.is_public !== undefined) {
      updateFields.push(`is_public = $${paramCount}`);
      updateValues.push(updateData.is_public);
      paramCount++;
    }

    if (updateData.expires_at !== undefined) {
      updateFields.push(`expires_at = $${paramCount}`);
      updateValues.push(updateData.expires_at ? new Date(updateData.expires_at) : null);
      paramCount++;
    }

    updateFields.push(`updated_at = $${paramCount}`);
    updateValues.push(new Date());

    updateValues.push(hash);

    const updateQuery = `
      UPDATE charts
      SET ${updateFields.join(', ')}
      WHERE chart_hash = $${paramCount}
      RETURNING id, chart_hash, title, description, chart_type, width, height, theme, is_public, expires_at, created_at, updated_at
    `;

    const result = await databaseService.query(updateQuery, updateValues);

    const chart = result.rows[0];
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const response: ChartResponse = {
      id: chart.id,
      chart_hash: chart.chart_hash,
      title: chart.title,
      description: chart.description,
      chart_type: chart.chart_type,
      width: chart.width,
      height: chart.height,
      theme: chart.theme,
      is_public: chart.is_public,
      expires_at: chart.expires_at,
      created_at: chart.created_at,
      updated_at: chart.updated_at,
      access_url: `${baseUrl}/api/charts/${chart.chart_hash}`,
      embed_url: `${baseUrl}/api/charts/${chart.chart_hash}/embed`,
      png_url: `${baseUrl}/api/charts/${chart.chart_hash}/png`,
      json_url: `${baseUrl}/api/charts/${chart.chart_hash}/json`
    };

    // Invalidate cache for the updated chart
    await chartGenerator.invalidateChartCache(hash);

    logger.info('Chart updated successfully', {
      chartId: chart.id,
      chartHash: hash
    });

    res.json({
      success: true,
      data: response
    } as ApiResponse<ChartResponse>);
  } catch (error) {
    logger.error('Failed to update chart', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update chart'
    } as ApiResponse);
  }
});

// DELETE /api/charts/:hash - Delete chart (authenticated)
/**
 * @swagger
 * /api/charts/{hash}:
 *   delete:
 *     summary: Delete a chart
 *     description: Deletes a chart. Only the chart owner can perform this operation.
 *     tags: [Charts]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique chart hash identifier
 *     responses:
 *       200:
 *         description: Chart deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Chart deleted successfully"
 *       403:
 *         description: Not authorized to delete this chart
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Chart not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:hash', authenticateApiKey, async (req: Request, res: Response): Promise<void> => {
  try {
    const { databaseService, chartGenerator } = getServices(req);
    const { hash } = req.params;

    // Check if chart exists
    const existingQuery = 'SELECT id FROM charts WHERE chart_hash = $1';
    const existingResult = await databaseService.query(existingQuery, [hash]);

    if (existingResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Chart not found'
      } as ApiResponse);
      return;
    }

    // Delete chart
    await databaseService.query('DELETE FROM charts WHERE chart_hash = $1', [hash]);

    // Invalidate cache for the deleted chart
    await chartGenerator.invalidateChartCache(hash);

    logger.info('Chart deleted successfully', {
      chartHash: hash
    });

    res.json({
      success: true,
      message: 'Chart deleted successfully'
    } as ApiResponse);
  } catch (error) {
    logger.error('Failed to delete chart', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete chart'
    } as ApiResponse);
  }
});

export default router;
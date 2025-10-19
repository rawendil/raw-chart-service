import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

// Import routes
import chartRoutes from './routes/charts';
import healthRoutes from './routes/health';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { rateLimitMiddleware } from './middleware/rateLimit';

// Import services
import { DatabaseService } from './services/database';
import { Logger } from './utils/logger';

class App {
  public app: express.Application;
  private databaseService: DatabaseService;
  private logger: Logger;

  constructor() {
    this.app = express();
    this.databaseService = new DatabaseService();
    this.logger = new Logger();

    this.initializeConfig();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
    this.initializeDatabase();
  }

  private initializeConfig(): void {
    dotenv.config();
    this.logger.info('Configuration loaded');
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS configuration
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Compression middleware
    this.app.use(compression());

    // Logging middleware
    this.app.use(morgan('combined', { stream: { write: (message: string) => this.logger.info(message.trim()) } }));

    // Rate limiting
    this.app.use('/api/charts/generate', rateLimitMiddleware);

    // Static files serving (for favicons and other assets)
    this.app.use(express.static('public'));
    this.app.use(express.static('dist'));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    this.logger.info('Middleware initialized');
  }

  private initializeRoutes(): void {
    // Swagger documentation
    this.app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Chart Service API Documentation'
    }));

    // API routes
    this.app.use('/api/charts', chartRoutes);
    this.app.use('/api/health', healthRoutes);

    // Favicon routes
    this.app.get('/favicon.ico', (req, res) => {
      res.sendFile('favicon.ico', { root: 'dist' }, (err) => {
        if (err) {
          res.status(404).end();
        }
      });
    });

    this.app.get('/favicon.svg', (req, res) => {
      res.sendFile('favicon.svg', { root: 'dist' }, (err) => {
        if (err) {
          res.status(404).end();
        }
      });
    });

    this.app.get('/apple-touch-icon.png', (req, res) => {
      res.sendFile('apple-touch-icon.png', { root: 'dist' }, (err) => {
        if (err) {
          res.status(404).end();
        }
      });
    });

    this.app.get('/site.webmanifest', (req, res) => {
      res.sendFile('site.webmanifest', { root: 'dist' }, (err) => {
        if (err) {
          res.status(404).end();
        }
      });
    });

    // Root endpoint
    /**
     * @swagger
     * /:
     *   get:
     *     summary: API information
     *     description: Returns basic information about the Chart Service API
     *     tags: [General]
     *     responses:
     *       200:
     *         description: API information retrieved successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                   example: "Chart Service API"
     *                 version:
     *                   type: string
     *                   example: "1.0.0"
     *                 docs:
     *                   type: string
     *                   example: "/api/docs"
     */
    this.app.get('/', (req, res) => {
      res.json({
        message: 'Chart Service API',
        version: '1.0.0',
        docs: '/api/docs'
      });
    });

    this.logger.info('Routes initialized');
  }

  private initializeErrorHandling(): void {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
    this.logger.info('Error handling initialized');
  }

  private async initializeDatabase(): Promise<void> {
    try {
      await this.databaseService.initialize();
      this.logger.info('Database connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      process.exit(1);
    }
  }

  public async start(): Promise<void> {
    const port = process.env.PORT || 3000;

    try {
      await new Promise<void>((resolve, reject) => {
        const server = this.app.listen(port, () => {
          this.logger.info(`Server started on port ${port}`);
          resolve();
        });

        server.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            this.logger.error(`Port ${port} is already in use`);
          } else {
            this.logger.error('Server error', error);
          }
          reject(error);
        });
      });
    } catch (error) {
      this.logger.error('Failed to start server', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    this.logger.info('Shutting down server...');
    await this.databaseService.close();
    process.exit(0);
  }
}

// Start the server
const app = new App();

if (require.main === module) {
  app.start().catch((error) => {
    console.error('Failed to start application', error);
    process.exit(1);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => app.stop());
process.on('SIGINT', () => app.stop());

export default app;
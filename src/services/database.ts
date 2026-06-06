import { Pool } from 'pg';
import { Logger } from '../utils/logger';
import { env } from '../config/env';

export class DatabaseService {
  private pool: Pool;
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
    this.pool = new Pool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      max: env.DB_POOL_MAX,
      idleTimeoutMillis: env.DB_IDLE_TIMEOUT,
      connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT,
    });

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }

  async initialize(): Promise<void> {
    try {
      const client = await this.pool.connect();
      this.logger.info('Database connected successfully');

      // Create tables if they don't exist
      await this.createTables();

      client.release();
    } catch (error) {
      this.logger.error('Failed to initialize database', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    const queries = [
      `
      CREATE TABLE IF NOT EXISTS charts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chart_hash VARCHAR(32) UNIQUE NOT NULL,
        title VARCHAR(255),
        description TEXT,
        chart_type VARCHAR(50) NOT NULL,
        chart_config JSONB NOT NULL,
        chart_data JSONB NOT NULL,
        width INTEGER DEFAULT 800,
        height INTEGER DEFAULT 600,
        theme VARCHAR(50) DEFAULT 'light',
        share_token VARCHAR(255) DEFAULT NULL,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      `,
      `ALTER TABLE charts ADD COLUMN IF NOT EXISTS share_token VARCHAR(255) DEFAULT NULL`,
      `ALTER TABLE charts DROP COLUMN IF EXISTS is_public`,
      `DROP INDEX IF EXISTS idx_charts_public`,
      `DROP TABLE IF EXISTS chart_access_logs`,
      `CREATE INDEX IF NOT EXISTS idx_charts_hash ON charts(chart_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_charts_share_token ON charts(share_token) WHERE share_token IS NOT NULL`
    ];

    for (const query of queries) {
      await this.pool.query(query);
    }

    this.logger.info('Database tables created/verified');
  }

  async query(text: string, params?: any[]): Promise<any> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      this.logger.debug('Executed query', { text, duration, rows: result.rowCount });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.error('Query failed', { text, duration, error });
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    this.logger.info('Database connection pool closed');
  }
}
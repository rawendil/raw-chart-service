import { createClient, RedisClientType } from 'redis';
import { Logger } from '../utils/logger';

export class RedisService {
  private client: RedisClientType;
  private logger: Logger;

  constructor() {
    this.logger = new Logger();
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    this.client.on('error', (err) => {
      this.logger.error('Redis Client Error', err);
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.logger.info('Connected to Redis');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
      this.logger.info('Disconnected from Redis');
    } catch (error) {
      this.logger.error('Error disconnecting from Redis', error);
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.get(key);
      return result ? Buffer.from(result, 'base64') : null;
    } catch (error) {
      this.logger.error('Redis GET error', error);
      return null;
    }
  }

  async set(key: string, value: Buffer, ttlSeconds: number = 3600): Promise<void> {
    try {
      const base64Value = value.toString('base64');
      await this.client.setEx(key, ttlSeconds, base64Value);
      this.logger.debug('Cached data', { key, size: value.length });
    } catch (error) {
      this.logger.error('Redis SET error', error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
      this.logger.debug('Cache invalidated', { key });
    } catch (error) {
      this.logger.error('Redis DEL error', error);
    }
  }

  // Delete cache by pattern
  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        this.logger.debug('Cache invalidated by pattern', { pattern, count: keys.length });
      }
    } catch (error) {
      this.logger.error('Redis DEL pattern error', error);
    }
  }

  // Check if Redis is available
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch (error) {
      return false;
    }
  }
}
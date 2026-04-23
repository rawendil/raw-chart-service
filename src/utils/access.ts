import { Request } from 'express';
import { env } from '../config/env';

export function checkAccess(shareToken: string | null, req: Request): boolean {
  if (shareToken === null) return true;
  if (req.header('x-api-key') === env.API_KEY) return true;
  const provided = (req.query.token as string | undefined) || req.header('x-share-token');
  return provided === shareToken;
}

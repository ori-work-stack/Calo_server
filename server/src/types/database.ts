import { Prisma } from '@prisma/client';

// Database operation types
export interface DatabaseConfig {
  maxConnections: number;
  connectionTimeout: number;
  queryTimeout: number;
  retryAttempts: number;
}

export interface CleanupResult {
  deletedRecords: number;
  freedSpace: number;
  errors: string[];
}

export interface DatabaseHealth {
  status: 'healthy' | 'warning' | 'critical';
  size: number;
  maxSize: number;
  connectionCount: number;
  lastCleanup: Date;
  needsCleanup: boolean;
}

// Query optimization types
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: Record<string, 'asc' | 'desc'>;
  include?: Record<string, boolean>;
  select?: Record<string, boolean>;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Transaction types
export type TransactionCallback<T> = (tx: Prisma.TransactionClient) => Promise<T>;

export interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}
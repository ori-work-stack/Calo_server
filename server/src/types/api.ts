// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  details?: any;
  timestamp?: string;
}

export interface PaginatedApiResponse<T = any> extends ApiResponse<T[]> {
  pagination?: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

// Request types
export interface AuthenticatedRequest {
  user: {
    user_id: string;
    email: string;
    subscription_type: 'FREE' | 'PREMIUM' | 'GOLD';
    is_questionnaire_completed: boolean;
  };
}

// Error types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  statusCode: number;
}

export interface ValidationError extends ApiError {
  field: string;
  value: any;
  constraint: string;
}

// Health check types
export interface HealthCheckResponse {
  status: 'ok' | 'error';
  environment: string;
  database: 'connected' | 'disconnected';
  timestamp: string;
  version: string;
  uptime: number;
  openai_enabled: boolean;
  services?: {
    database: boolean;
    openai: boolean;
    email: boolean;
  };
}
// Standard API response envelope used for all endpoints
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
}

// Paginated list response
export interface PaginatedResponse<T = unknown> {
  success: boolean;
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// Standard error response
export interface ApiError {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, string[]>; // field-level validation errors
}

// Dashboard KPI shape
export interface DashboardKpi {
  totalMembers: number;
  activeMembers: number;
  totalSavings: number;
  totalLoansOutstanding: number;
  totalLoansActive: number;
  overdueLoans: number;
  collectionsTodayTotal: number;
  collectionsTodayCount: number;
}

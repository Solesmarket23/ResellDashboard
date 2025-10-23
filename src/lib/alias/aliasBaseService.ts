// Base Alias API Service with common functionality
import { ALIAS_API_CONFIG } from './aliasConfig';
import { AliasAuthService } from './aliasAuth';

export interface AliasApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  requestId?: string;
}

export interface PaginationParams {
  limit?: number;
  pagination_token?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  next_pagination_token?: string;
  has_more: boolean;
  total_count?: string;
}

export class AliasBaseService {
  protected authService: AliasAuthService;
  protected baseUrl: string;

  constructor(authService: AliasAuthService) {
    this.authService = authService;
    this.baseUrl = ALIAS_API_CONFIG.baseUrl;
  }

  /**
   * Make a request to the Alias API with error handling and retries
   */
  protected async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<AliasApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const requestOptions: RequestInit = {
        ...options,
        headers: {
          ...this.authService.getAuthHeaders(),
          ...options.headers,
        },
      };

      const response = await fetch(url, requestOptions);
      const requestId = response.headers.get('x-request-id') || undefined;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Retry on 5xx errors
        if (response.status >= 500 && retryCount < ALIAS_API_CONFIG.retryAttempts) {
          await this.delay(ALIAS_API_CONFIG.retryDelay * (retryCount + 1));
          return this.makeRequest<T>(endpoint, options, retryCount + 1);
        }

        return {
          success: false,
          error: `HTTP ${response.status}: ${errorData.message || response.statusText}`,
          requestId,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data,
        requestId,
      };
    } catch (error) {
      // Retry on network errors
      if (retryCount < ALIAS_API_CONFIG.retryAttempts) {
        await this.delay(ALIAS_API_CONFIG.retryDelay * (retryCount + 1));
        return this.makeRequest<T>(endpoint, options, retryCount + 1);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Make a GET request
   */
  protected async get<T>(endpoint: string, params?: Record<string, any>): Promise<AliasApiResponse<T>> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => url.searchParams.append(key, String(v)));
          } else {
            url.searchParams.append(key, String(value));
          }
        }
      });
    }

    return this.makeRequest<T>(url.pathname + url.search);
  }

  /**
   * Make a POST request
   */
  protected async post<T>(endpoint: string, data?: any): Promise<AliasApiResponse<T>> {
    return this.makeRequest<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Make a PUT request
   */
  protected async put<T>(endpoint: string, data?: any): Promise<AliasApiResponse<T>> {
    return this.makeRequest<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * Make a DELETE request
   */
  protected async delete<T>(endpoint: string): Promise<AliasApiResponse<T>> {
    return this.makeRequest<T>(endpoint, {
      method: 'DELETE',
    });
  }

  /**
   * Delay utility for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Build query string from parameters
   */
  protected buildQueryString(params: Record<string, any>): string {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, String(v)));
        } else {
          searchParams.append(key, String(value));
        }
      }
    });

    return searchParams.toString();
  }
}

// Alias API Authentication Service
import { ALIAS_API_CONFIG } from './aliasConfig';

export interface AliasAuthConfig {
  bearerToken: string;
}

export class AliasAuthService {
  private bearerToken: string;
  private baseUrl: string;

  constructor(config: AliasAuthConfig) {
    this.bearerToken = config.bearerToken;
    this.baseUrl = ALIAS_API_CONFIG.baseUrl;
  }

  /**
   * Get authorization headers for API requests
   */
  getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.bearerToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  /**
   * Test the authentication token
   */
  async testAuth(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/test`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorData.message || response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        success: data.ok === true,
        error: data.ok !== true ? 'Invalid response format' : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update the bearer token
   */
  updateToken(newToken: string): void {
    this.bearerToken = newToken;
  }

  /**
   * Get current token (masked for security)
   */
  getMaskedToken(): string {
    if (this.bearerToken.length <= 8) {
      return '***';
    }
    return `${this.bearerToken.substring(0, 4)}...${this.bearerToken.substring(this.bearerToken.length - 4)}`;
  }
}

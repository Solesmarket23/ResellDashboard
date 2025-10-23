// Alias Catalog Service for product search and details
import { AliasBaseService, PaginationParams, PaginatedResponse } from './aliasBaseService';
import { ALIAS_ENDPOINTS } from './aliasConfig';

export interface CatalogItem {
  catalog_id: string;
  name: string;
  sku: string;
  brand: string;
  gender: string;
  release_date: string;
  product_category_v2: string;
  product_type: string;
  size_unit: string;
  allowed_sizes: Array<{
    display_name: string;
    value: number;
    us_size_equivalent: number;
  }>;
  minimum_listing_price_cents: number;
  maximum_listing_price_cents: number;
  main_picture_url: string;
  retail_price_cents: number;
  colorway: string;
  nickname: string;
  requires_listing_pictures: boolean;
  resellable: boolean;
  requested_pictures: Array<{
    type: string;
    quantity: number;
  }>;
}

export interface CatalogSearchParams extends PaginationParams {
  query: string;
}

export interface CatalogSearchResponse extends PaginatedResponse<CatalogItem> {
  catalog_items: CatalogItem[];
}

export class AliasCatalogService extends AliasBaseService {
  /**
   * Search the catalog for products
   */
  async searchCatalog(params: CatalogSearchParams): Promise<AliasApiResponse<CatalogSearchResponse>> {
    const { query, limit, pagination_token } = params;
    
    const searchParams: Record<string, any> = { query };
    if (limit !== undefined) searchParams.limit = limit;
    if (pagination_token) searchParams.pagination_token = pagination_token;

    return this.get<CatalogSearchResponse>(ALIAS_ENDPOINTS.catalog, searchParams);
  }

  /**
   * Get a specific catalog item by ID
   */
  async getCatalogItem(catalogId: string): Promise<AliasApiResponse<{ catalog_item: CatalogItem }>> {
    return this.get<{ catalog_item: CatalogItem }>(ALIAS_ENDPOINTS.catalogItem(catalogId));
  }

  /**
   * Search for products by brand
   */
  async searchByBrand(brand: string, limit = 25): Promise<AliasApiResponse<CatalogSearchResponse>> {
    return this.searchCatalog({ query: brand, limit });
  }

  /**
   * Search for products by SKU
   */
  async searchBySku(sku: string, limit = 25): Promise<AliasApiResponse<CatalogSearchResponse>> {
    return this.searchCatalog({ query: sku, limit });
  }

  /**
   * Search for products by name
   */
  async searchByName(name: string, limit = 25): Promise<AliasApiResponse<CatalogSearchResponse>> {
    return this.searchCatalog({ query: name, limit });
  }

  /**
   * Get all available sizes for a product
   */
  async getProductSizes(catalogId: string): Promise<AliasApiResponse<{ sizes: Array<{ display_name: string; value: number; us_size_equivalent: number }> }>> {
    const response = await this.getCatalogItem(catalogId);
    
    if (!response.success || !response.data) {
      return response;
    }

    return {
      success: true,
      data: {
        sizes: response.data.catalog_item.allowed_sizes,
      },
      requestId: response.requestId,
    };
  }

  /**
   * Check if a product requires listing pictures
   */
  async checkPictureRequirements(catalogId: string): Promise<AliasApiResponse<{ requires_pictures: boolean; requested_pictures: Array<{ type: string; quantity: number }> }>> {
    const response = await this.getCatalogItem(catalogId);
    
    if (!response.success || !response.data) {
      return response;
    }

    return {
      success: true,
      data: {
        requires_pictures: response.data.catalog_item.requires_listing_pictures,
        requested_pictures: response.data.catalog_item.requested_pictures,
      },
      requestId: response.requestId,
    };
  }

  /**
   * Get product pricing range
   */
  async getPricingRange(catalogId: string): Promise<AliasApiResponse<{ min_price_cents: number; max_price_cents: number; retail_price_cents: number }>> {
    const response = await this.getCatalogItem(catalogId);
    
    if (!response.success || !response.data) {
      return response;
    }

    return {
      success: true,
      data: {
        min_price_cents: response.data.catalog_item.minimum_listing_price_cents,
        max_price_cents: response.data.catalog_item.maximum_listing_price_cents,
        retail_price_cents: response.data.catalog_item.retail_price_cents,
      },
      requestId: response.requestId,
    };
  }
}

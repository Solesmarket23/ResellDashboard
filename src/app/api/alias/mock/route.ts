// Mock Alias API for testing without a real token
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint') || 'test';

    // Mock responses for different endpoints
    switch (endpoint) {
      case 'test':
        return NextResponse.json({
          success: true,
          data: { ok: true },
          message: 'Mock Alias API - Test endpoint working'
        });

      case 'catalog/search':
        const query = searchParams.get('query') || 'Nike';
        return NextResponse.json({
          success: true,
          data: {
            catalog_items: [
              {
                catalog_id: 'nike-air-jordan-1-retro-high-og-bred-555088-001',
                name: 'Air Jordan 1 Retro High OG "Bred"',
                sku: '555088-001',
                brand: 'Air Jordan',
                gender: 'men',
                release_date: '2020-12-19',
                product_category_v2: 'shoes',
                product_type: 'sneakers',
                size_unit: 'SIZE_UNIT_US',
                allowed_sizes: [
                  { display_name: '7', value: 7, us_size_equivalent: 7 },
                  { display_name: '7.5', value: 7.5, us_size_equivalent: 7.5 },
                  { display_name: '8', value: 8, us_size_equivalent: 8 },
                  { display_name: '8.5', value: 8.5, us_size_equivalent: 8.5 },
                  { display_name: '9', value: 9, us_size_equivalent: 9 },
                  { display_name: '9.5', value: 9.5, us_size_equivalent: 9.5 },
                  { display_name: '10', value: 10, us_size_equivalent: 10 },
                  { display_name: '10.5', value: 10.5, us_size_equivalent: 10.5 },
                  { display_name: '11', value: 11, us_size_equivalent: 11 },
                  { display_name: '11.5', value: 11.5, us_size_equivalent: 11.5 },
                  { display_name: '12', value: 12, us_size_equivalent: 12 }
                ],
                minimum_listing_price_cents: 15000,
                maximum_listing_price_cents: 50000,
                main_picture_url: 'https://image.goat.com/750/attachments/product_template_pictures/images/000/000/001/original/555088_001.png',
                retail_price_cents: 17000,
                colorway: 'Bred/Black-White',
                nickname: 'Bred',
                requires_listing_pictures: false,
                resellable: true,
                requested_pictures: [
                  { type: 'PICTURE_TYPE_OUTER', quantity: 1 },
                  { type: 'PICTURE_TYPE_EXTRA', quantity: 3 }
                ]
              },
              {
                catalog_id: 'nike-air-max-90-infrared-537384-103',
                name: 'Air Max 90 "Infrared"',
                sku: '537384-103',
                brand: 'Nike',
                gender: 'men',
                release_date: '2020-03-26',
                product_category_v2: 'shoes',
                product_type: 'sneakers',
                size_unit: 'SIZE_UNIT_US',
                allowed_sizes: [
                  { display_name: '7', value: 7, us_size_equivalent: 7 },
                  { display_name: '8', value: 8, us_size_equivalent: 8 },
                  { display_name: '9', value: 9, us_size_equivalent: 9 },
                  { display_name: '10', value: 10, us_size_equivalent: 10 },
                  { display_name: '11', value: 11, us_size_equivalent: 11 },
                  { display_name: '12', value: 12, us_size_equivalent: 12 }
                ],
                minimum_listing_price_cents: 8000,
                maximum_listing_price_cents: 25000,
                main_picture_url: 'https://image.goat.com/750/attachments/product_template_pictures/images/000/000/002/original/537384_103.png',
                retail_price_cents: 12000,
                colorway: 'White/Black-Infrared',
                nickname: 'Infrared',
                requires_listing_pictures: false,
                resellable: true,
                requested_pictures: [
                  { type: 'PICTURE_TYPE_OUTER', quantity: 1 },
                  { type: 'PICTURE_TYPE_EXTRA', quantity: 2 }
                ]
              }
            ],
            next_pagination_token: null,
            has_more: false
          }
        });

      case 'pricing/insights':
        return NextResponse.json({
          success: true,
          data: {
            availability: {
              lowest_listing_price_cents: '18000',
              highest_offer_price_cents: '15000',
              last_sold_listing_price_cents: '17500',
              global_indicator_price_cents: '17000'
            }
          }
        });

      case 'pricing/sales':
        return NextResponse.json({
          success: true,
          data: {
            recent_sales: [
              {
                purchased_at: '2024-01-15T14:30:00Z',
                price_cents: '17500',
                size: 10,
                consigned: true,
                catalog_id: 'nike-air-jordan-1-retro-high-og-bred-555088-001'
              },
              {
                purchased_at: '2024-01-14T09:15:00Z',
                price_cents: '18200',
                size: 9.5,
                consigned: false,
                catalog_id: 'nike-air-jordan-1-retro-high-og-bred-555088-001'
              },
              {
                purchased_at: '2024-01-13T16:45:00Z',
                price_cents: '16800',
                size: 11,
                consigned: true,
                catalog_id: 'nike-air-jordan-1-retro-high-og-bred-555088-001'
              }
            ]
          }
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Mock endpoint not found'
        }, { status: 404 });
    }
  } catch (error) {
    console.error('Mock Alias API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

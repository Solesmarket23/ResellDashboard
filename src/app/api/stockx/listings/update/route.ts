import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('stockx_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated with StockX' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { listingId, amount, currencyCode = 'USD', expiresAt } = body;

    if (!listingId || !amount) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing required fields: listingId and amount are required' 
        },
        { status: 400 }
      );
    }

    console.log('🔄 Updating StockX listing:', {
      listingId,
      amount,
      currencyCode,
      expiresAt
    });

    // Prepare the update payload
    const updatePayload: any = {
      amount: String(amount), // Ensure amount is a string
      currencyCode
    };

    // Only include expiresAt if provided
    if (expiresAt) {
      updatePayload.expiresAt = expiresAt;
    }

    // Make the API request to StockX
    const response = await fetch(
      `https://api.stockx.com/v2/selling/listings/${listingId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': process.env.STOCKX_CLIENT_ID || '',
          'User-Agent': 'ResellDashboard/1.0'
        },
        body: JSON.stringify(updatePayload)
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error('❌ StockX API error:', response.status, responseData);
      return NextResponse.json(
        { 
          success: false, 
          error: responseData.message || 'Failed to update listing',
          details: responseData
        },
        { status: response.status }
      );
    }

    console.log('✅ Listing update initiated:', responseData);

    return NextResponse.json({
      success: true,
      operation: responseData,
      message: 'Listing update initiated successfully'
    });

  } catch (error) {
    console.error('❌ Error updating listing:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update listing' 
      },
      { status: 500 }
    );
  }
}

// Support batch updates
export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('stockx_access_token')?.value;

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated with StockX' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { updates } = body; // Array of { listingId, amount, currencyCode, expiresAt }

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing or invalid updates array' 
        },
        { status: 400 }
      );
    }

    console.log(`🔄 Batch updating ${updates.length} StockX listings`);

    const results = [];
    const errors = [];

    // Process updates sequentially to avoid rate limiting
    for (const update of updates) {
      try {
        const { listingId, amount, currencyCode = 'USD', expiresAt } = update;

        if (!listingId || !amount) {
          errors.push({
            listingId,
            error: 'Missing required fields'
          });
          continue;
        }

        const updatePayload: any = {
          amount: String(amount),
          currencyCode
        };

        if (expiresAt) {
          updatePayload.expiresAt = expiresAt;
        }

        const response = await fetch(
          `https://api.stockx.com/v2/selling/listings/${listingId}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'x-api-key': process.env.STOCKX_CLIENT_ID || '',
              'User-Agent': 'ResellDashboard/1.0'
            },
            body: JSON.stringify(updatePayload)
          }
        );

        const responseData = await response.json();

        if (response.ok) {
          results.push({
            listingId,
            success: true,
            operation: responseData,
            newPrice: amount
          });
        } else {
          errors.push({
            listingId,
            error: responseData.message || 'Failed to update',
            details: responseData
          });
        }

        // Add a small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        errors.push({
          listingId: update.listingId,
          error: error instanceof Error ? error.message : 'Update failed'
        });
      }
    }

    console.log(`✅ Batch update complete: ${results.length} succeeded, ${errors.length} failed`);

    return NextResponse.json({
      success: true,
      summary: {
        total: updates.length,
        succeeded: results.length,
        failed: errors.length
      },
      results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('❌ Error in batch update:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Batch update failed' 
      },
      { status: 500 }
    );
  }
}
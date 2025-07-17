import { NextRequest, NextResponse } from 'next/server';
import { 
  saveUserStockXKeys, 
  getUserStockXKeys, 
  deleteUserStockXKeys, 
  testUserStockXKeys,
  getUserApiKeyStatus 
} from '@/lib/firebase/userApiKeys';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const action = searchParams.get('action'); // 'status', 'test', or default to get keys

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    switch (action) {
      case 'status':
        const status = await getUserApiKeyStatus(userId);
        return NextResponse.json({ success: true, status });

      case 'test':
        const testResult = await testUserStockXKeys(userId);
        return NextResponse.json({ success: true, testResult });

      default:
        const keys = await getUserStockXKeys(userId);
        return NextResponse.json({ 
          success: true, 
          isConfigured: keys.isConfigured,
          hasApiKey: !!keys.apiKey,
          hasClientId: !!keys.clientId,
          hasClientSecret: !!keys.clientSecret
        });
    }
  } catch (error) {
    console.error('❌ Error in GET /api/user/stockx-keys:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve API key information' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, apiKey, clientId, clientSecret } = await request.json();

    if (!userId || !apiKey) {
      return NextResponse.json(
        { error: 'User ID and API key are required' },
        { status: 400 }
      );
    }

    await saveUserStockXKeys(userId, apiKey, clientId, clientSecret);

    return NextResponse.json({ 
      success: true, 
      message: 'StockX API keys saved successfully' 
    });
  } catch (error) {
    console.error('❌ Error in POST /api/user/stockx-keys:', error);
    return NextResponse.json(
      { error: 'Failed to save API keys' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    await deleteUserStockXKeys(userId);

    return NextResponse.json({ 
      success: true, 
      message: 'StockX API keys deleted successfully' 
    });
  } catch (error) {
    console.error('❌ Error in DELETE /api/user/stockx-keys:', error);
    return NextResponse.json(
      { error: 'Failed to delete API keys' },
      { status: 500 }
    );
  }
} 
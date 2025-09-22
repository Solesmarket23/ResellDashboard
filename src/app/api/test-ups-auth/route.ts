import { NextRequest, NextResponse } from 'next/server';
import { UPSAuthService } from '@/lib/tracking/upsAuth';

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing UPS Client Credentials authentication...');
    
    const upsAuth = UPSAuthService.getInstance();
    const token = await upsAuth.getValidToken();
    
    return NextResponse.json({
      success: true,
      message: 'UPS Client Credentials authentication successful',
      token: {
        access_token: token.access_token.substring(0, 20) + '...',
        token_type: token.token_type,
        expires_in: token.expires_in,
        scope: token.scope
      }
    });
  } catch (error) {
    console.error('❌ UPS authentication test failed:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : String(error),
        message: 'UPS authentication test failed'
      },
      { status: 500 }
    );
  }
}

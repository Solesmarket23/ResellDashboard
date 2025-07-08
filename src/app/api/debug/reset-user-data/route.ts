import { NextRequest, NextResponse } from 'next/server';
import { clearAllUserData } from '../../../../lib/firebase/userDataUtils';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ 
        error: 'userId parameter required',
        usage: 'POST /api/debug/reset-user-data?userId=YOUR_USER_ID'
      }, { status: 400 });
    }

    console.log('🧹 Starting complete account wipe via API for user:', userId);
    
    const result = await clearAllUserData(userId);
    
    return NextResponse.json({
      success: true,
      message: '🎉 Account successfully reset to fresh state!',
      cleared: result.cleared,
      timestamp: new Date().toISOString(),
      note: 'All user data has been permanently deleted. The account is now fresh and ready to use.'
    });
    
  } catch (error) {
    console.error('❌ Error in reset API:', error);
    return NextResponse.json({ 
      error: 'Failed to reset user data',
      details: error.message 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Reset User Data API',
    method: 'POST',
    usage: 'POST /api/debug/reset-user-data?userId=YOUR_USER_ID',
    description: 'Completely wipes all user data to create a fresh account state',
    warning: '⚠️ This action cannot be undone!'
  });
} 
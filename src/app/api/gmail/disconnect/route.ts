import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    
    // Clear Gmail tokens
    cookieStore.set('gmail_access_token', '', {
      maxAge: 0,
      httpOnly: true
    });
    
    cookieStore.set('gmail_refresh_token', '', {
      maxAge: 0,
      httpOnly: true
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting Gmail:', error);
    return NextResponse.json({ error: 'Failed to disconnect Gmail' }, { status: 500 });
  }
} 
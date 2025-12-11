import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const hasPrivateKey = !!process.env.FIREBASE_PRIVATE_KEY;
    
    return NextResponse.json({
      status: 'checking',
      config: {
        projectId: projectId || 'MISSING',
        clientEmail: clientEmail ? clientEmail.substring(0, 20) + '...' : 'MISSING',
        hasPrivateKey,
        privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length || 0
      },
      env: process.env.NODE_ENV
    });
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      message: error.message
    }, { status: 500 });
  }
}


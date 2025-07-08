import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const currentDomain = url.host;
    const protocol = url.protocol;
    const fullUrl = `${protocol}//${currentDomain}`;
    
    // Get environment variables (safely)
    const hasFirebaseConfig = !!(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY && 
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    );
    
    const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'not-set';
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'not-set';
    
    const debugInfo = {
      currentRequest: {
        domain: currentDomain,
        protocol: protocol,
        fullUrl: fullUrl,
        headers: {
          host: request.headers.get('host'),
          origin: request.headers.get('origin'),
          referer: request.headers.get('referer'),
          userAgent: request.headers.get('user-agent')
        }
      },
      
      firebaseConfig: {
        hasValidConfig: hasFirebaseConfig,
        authDomain: authDomain,
        projectId: projectId,
        apiKeyExists: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        allRequiredEnvVars: {
          'NEXT_PUBLIC_FIREBASE_API_KEY': !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN': !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          'NEXT_PUBLIC_FIREBASE_PROJECT_ID': !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET': !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID': !!process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          'NEXT_PUBLIC_FIREBASE_APP_ID': !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID
        }
      },
      
      commonDeploymentDomains: [
        `${currentDomain}`,
        'localhost',
        '127.0.0.1',
        'localhost:3000',
        'localhost:3001',
        'localhost:3002',
        '127.0.0.1:3000',
        '127.0.0.1:3001',
        '127.0.0.1:3002'
      ],
      
      instructions: {
        step1: 'Go to Firebase Console: https://console.firebase.google.com',
        step2: `Select your project: ${projectId}`,
        step3: 'Navigate to Authentication → Settings → Authorized domains',
        step4: `Add these domains: ${currentDomain}, localhost, 127.0.0.1`,
        step5: 'Save changes and wait 1-2 minutes for propagation',
        step6: 'Test Google sign-in again'
      },
      
      troubleshooting: {
        'auth/unauthorized-domain': 'Current domain not in Firebase authorized domains list',
        'auth/popup-closed-by-user': 'User closed the popup - normal behavior',
        'auth/popup-blocked': 'Browser blocked popup - check popup settings',
        'auth/network-request-failed': 'Network connectivity issue',
        'auth/too-many-requests': 'Rate limited - wait before trying again'
      }
    };
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      debug: debugInfo
    });
    
  } catch (error) {
    console.error('Auth domain debug error:', error);
    return NextResponse.json({ 
      error: 'Failed to debug auth domain',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId, gmailEmail } = await request.json();
    
    if (!userId || !gmailEmail) {
      return NextResponse.json({ 
        error: 'Missing userId or gmailEmail' 
      }, { status: 400 });
    }

    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const adminDb = getAdminDb();
    
    await adminDb.collection('users').doc(userId).set({
      gmailEmail: gmailEmail,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    
    console.log(`✅ Saved Gmail email ${gmailEmail} for user ${userId}`);
    
    return NextResponse.json({ 
      success: true,
      message: `Gmail email saved for user ${userId}` 
    });
  } catch (error: any) {
    console.error('Error saving Gmail email:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}


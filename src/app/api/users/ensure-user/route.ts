import { NextRequest, NextResponse } from 'next/server';

/**
 * Ensures a user document exists in Firebase for site password users
 * This is needed so webhooks can find the user by gmailEmail
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, gmailEmail, gmailTokens } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ 
        error: 'Missing userId' 
      }, { status: 400 });
    }

    const { getAdminDb } = await import('@/lib/firebase/firebaseAdmin');
    const adminDb = getAdminDb();
    
    // Check if user document exists
    const userDoc = await adminDb.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      // Create user document for site password user
      console.log(`📝 Creating user document for site password user ${userId}`);
      await adminDb.collection('users').doc(userId).set({
        userId: userId,
        userType: 'site-password',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      console.log(`✅ User document created for ${userId}`);
    }
    
    // Update with Gmail email and tokens if provided
    const updates: any = {
      updatedAt: new Date().toISOString()
    };
    
    if (gmailEmail) {
      updates.gmailEmail = gmailEmail;
      console.log(`📧 Saved Gmail email ${gmailEmail} for user ${userId}`);
    }
    
    if (gmailTokens) {
      updates.gmailTokens = gmailTokens;
      console.log(`🔑 Saved Gmail tokens for user ${userId}`);
    }
    
    if (Object.keys(updates).length > 1) { // More than just updatedAt
      await adminDb.collection('users').doc(userId).update(updates);
    }
    
    return NextResponse.json({ 
      success: true,
      userExists: userDoc.exists,
      created: !userDoc.exists,
      updated: Object.keys(updates).length > 1
    });
  } catch (error: any) {
    console.error('Error ensuring user document:', error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}


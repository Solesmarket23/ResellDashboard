import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/utils/userApiKeyHelper';

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request);
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();

    if (!adminDb) {
      return NextResponse.json({ error: 'Firebase not initialized' }, { status: 500 });
    }

    // Get all listing settings for this user
    const settingsSnapshot = await adminDb.collection('stockxListingSettings')
      .where('userId', '==', userId)
      .get();

    const settings = settingsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Get user's auto-repricing config
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userData = userDoc.data();

    return NextResponse.json({
      success: true,
      userId,
      totalSettings: settings.length,
      settings,
      autoRepricingEnabled: userData?.stockxAutoRepricingEnabled || false,
      autoRepricingConfig: userData?.stockxAutoRepricingConfig || null,
      lastRepricedAt: userData?.lastRepricedAt || null
    });

  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}


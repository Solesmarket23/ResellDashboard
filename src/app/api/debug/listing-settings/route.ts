import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/utils/userApiKeyHelper';

export async function GET(request: NextRequest) {
  try {
    const cookieUserId = getUserIdFromRequest(request);
    
    // Try to get Firebase auth user ID from query param
    const url = new URL(request.url);
    const firebaseUserId = url.searchParams.get('firebaseUserId');
    
    // Check both user IDs
    const userIds = [cookieUserId, firebaseUserId].filter(Boolean) as string[];
    
    if (userIds.length === 0) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    const { getAdminDb } = await import('@/lib/firebase/admin');
    const adminDb = getAdminDb();

    if (!adminDb) {
      return NextResponse.json({ error: 'Firebase not initialized' }, { status: 500 });
    }

    // Get settings for all user IDs
    const allSettings = [];
    const allUsers = {};
    
    for (const userId of userIds) {
      // Get all listing settings for this user
      const settingsSnapshot = await adminDb.collection('stockxListingSettings')
        .where('userId', '==', userId)
        .get();
      
      const settings = settingsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      allSettings.push(...settings);
      
      // Get user's auto-repricing config
      const userDoc = await adminDb.collection('users').doc(userId).get();
      const userData = userDoc.data();
      
      allUsers[userId] = {
        autoRepricingEnabled: userData?.stockxAutoRepricingEnabled || false,
        autoRepricingConfig: userData?.stockxAutoRepricingConfig || null,
        lastRepricedAt: userData?.lastRepricedAt || null,
        settingsCount: settings.length
      };
    }

    // Get all listing settings for this user (use first user ID for backward compatibility)
    const settingsSnapshot = await adminDb.collection('stockxListingSettings')
      .where('userId', '==', userIds[0])
      .get();

    const settings = settingsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({
      success: true,
      checkedUserIds: userIds,
      allUsers,
      totalSettings: allSettings.length,
      settings: allSettings,
      // Legacy fields for backward compatibility
      userId: userIds[0],
      autoRepricingEnabled: allUsers[userIds[0]]?.autoRepricingEnabled || false,
      autoRepricingConfig: allUsers[userIds[0]]?.autoRepricingConfig || null,
      lastRepricedAt: allUsers[userIds[0]]?.lastRepricedAt || null
    });

  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}


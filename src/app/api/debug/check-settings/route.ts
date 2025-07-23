import { NextResponse } from 'next/server';
import { getDocuments } from '@/lib/firebase/firebaseUtils';
import { auth } from '@/lib/firebase/firebase';

export async function GET() {
  try {
    // Get all settings from Firebase
    const allSettings = await getDocuments('stockxPricingSettings');
    
    // Group by user
    const userSettings: Record<string, any[]> = {};
    allSettings.forEach(setting => {
      const userId = setting.userId || 'unknown';
      if (!userSettings[userId]) {
        userSettings[userId] = [];
      }
      userSettings[userId].push({
        id: setting.id,
        listingId: setting.listingId,
        minPrice: setting.minPrice,
        maxPrice: setting.maxPrice,
        pricingStrategy: setting.pricingStrategy,
        updatedAt: setting.updatedAt
      });
    });
    
    return NextResponse.json({
      totalSettings: allSettings.length,
      userCount: Object.keys(userSettings).length,
      settings: userSettings,
      raw: allSettings
    });
  } catch (error: any) {
    console.error('Error checking settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
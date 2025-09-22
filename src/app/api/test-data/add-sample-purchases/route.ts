import { NextRequest, NextResponse } from 'next/server';
import { addDocument } from '@/lib/firebase/firebaseUtils';

export async function POST(request: NextRequest) {
  try {
    const { userId = 'test-user-123' } = await request.json();
    
    console.log(`🧪 Adding sample purchases for user: ${userId}`);
    
    // Sample purchases with UPS tracking numbers
    const samplePurchases = [
      {
        userId: userId,
        uid: userId,
        orderNumber: 'STX-001',
        productName: 'Air Jordan 1 Retro High OG',
        productBrand: 'Jordan',
        productSize: '10.5',
        status: 'shipped',
        tracking: '1Z999AA1234567890', // This is a test tracking number
        trackingNumber: '1Z999AA1234567890',
        carrier: 'UPS',
        purchaseDate: new Date().toISOString(),
        price: 180.00,
        platform: 'StockX',
        lastUpdated: new Date().toISOString()
      },
      {
        userId: userId,
        uid: userId,
        orderNumber: 'STX-002',
        productName: 'Nike Dunk Low Panda',
        productBrand: 'Nike',
        productSize: '9',
        status: 'in_transit',
        tracking: '1Z999BB9876543210', // This is a test tracking number
        trackingNumber: '1Z999BB9876543210',
        carrier: 'UPS',
        purchaseDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        price: 120.00,
        platform: 'StockX',
        lastUpdated: new Date().toISOString()
      },
      {
        userId: userId,
        uid: userId,
        orderNumber: 'STX-003',
        productName: 'Yeezy Boost 350 V2',
        productBrand: 'Adidas',
        productSize: '11',
        status: 'delivered',
        tracking: '1Z999CC5555555555', // This is a test tracking number
        trackingNumber: '1Z999CC5555555555',
        carrier: 'UPS',
        purchaseDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        price: 250.00,
        platform: 'StockX',
        lastUpdated: new Date().toISOString()
      }
    ];
    
    // Add each purchase to the database
    const results = [];
    for (const purchase of samplePurchases) {
      try {
        const docId = await addDocument('purchases', purchase);
        results.push({ ...purchase, id: docId });
        console.log(`✅ Added purchase: ${purchase.orderNumber}`);
      } catch (error) {
        console.error(`❌ Failed to add purchase ${purchase.orderNumber}:`, error);
        results.push({ ...purchase, error: error instanceof Error ? error.message : String(error) });
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Added ${results.length} sample purchases`,
      purchases: results,
      userId: userId
    });
    
  } catch (error) {
    console.error('❌ Error adding sample purchases:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}

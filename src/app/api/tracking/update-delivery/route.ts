import { NextRequest, NextResponse } from 'next/server';
import { getDocumentsAdmin, updateDocumentAdmin } from '../../../../lib/firebase/admin';

export async function POST(request: NextRequest) {
  try {
    const { trackingNumber, actualDeliveryDate, status } = await request.json();
    
    if (!trackingNumber) {
      return NextResponse.json({ 
        success: false, 
        error: 'Tracking number is required' 
      }, { status: 400 });
    }
    
    console.log(`📦 Updating delivery for: ${trackingNumber}`);
    
    // Find the purchase with this tracking number
    const purchases = await getDocumentsAdmin('purchases');
    const purchase = purchases.find(p => p.tracking === trackingNumber);
    
    if (!purchase) {
      return NextResponse.json({
        success: false,
        error: 'Purchase not found with this tracking number'
      }, { status: 404 });
    }
    
    // Update the purchase with actual delivery info
    const updates: any = {
      updatedAt: new Date().toISOString()
    };
    
    if (actualDeliveryDate) {
      updates.actualDelivery = actualDeliveryDate;
      updates.actualDeliverySource = 'manual';
    }
    
    if (status) {
      updates.status = status;
      updates.shippingStatus = status;
    }
    
    await updateDocumentAdmin('purchases', purchase.id, updates);
    
    console.log(`✅ Updated delivery for ${trackingNumber}:`, updates);
    
    return NextResponse.json({
      success: true,
      message: 'Delivery updated successfully',
      purchaseId: purchase.id,
      updates
    });
    
  } catch (error) {
    console.error('❌ Error updating delivery:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

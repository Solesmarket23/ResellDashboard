import { NextRequest, NextResponse } from 'next/server';
import { getDocuments, updateDocument, deleteDocument } from '../../../../lib/firebase/firebaseUtils';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const action = url.searchParams.get('action') || 'list'; // 'list', 'fix', or 'delete'

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Get all purchases for the user
    const purchases = await getDocuments('purchases', userId);
    
    // Find purchases with "item" as the product name
    const itemPurchases = purchases.filter(p => 
      p.product?.name?.toLowerCase() === 'item' ||
      p.product?.name?.toLowerCase() === 'stockx item'
    );

    console.log(`Found ${itemPurchases.length} purchases with generic "item" names`);

    if (action === 'list') {
      // Just return the list of problematic purchases
      return NextResponse.json({
        total: itemPurchases.length,
        purchases: itemPurchases.map(p => ({
          id: p.id,
          productName: p.product?.name,
          orderNumber: p.orderNumber,
          subject: p.subject,
          fromEmail: p.fromEmail,
          status: p.status,
          dateAdded: p.dateAdded
        }))
      });
    } else if (action === 'fix') {
      // Try to extract better product names from email subjects
      const fixed = [];
      const failed = [];

      for (const purchase of itemPurchases) {
        const subject = purchase.subject || '';
        
        // Check if this is a sales-related email that should be removed
        const salesPatterns = [
          'An Update Regarding Your Sale',
          'You Sold Your Item',
          'Your Sale is Confirmed',
          'Ship Your Item'
        ];
        
        const isSalesEmail = salesPatterns.some(pattern => 
          subject.toLowerCase().includes(pattern.toLowerCase())
        );

        if (isSalesEmail) {
          // This is a sales email, not a purchase - mark for deletion
          failed.push({
            id: purchase.id,
            reason: 'Sales email, not a purchase',
            subject: subject
          });
          continue;
        }

        // Try to extract product name from subject
        let newProductName = null;
        
        // Pattern 1: "Order Confirmed: [Product Name]"
        const pattern1 = subject.match(/Order Confirmed:\s*(.+?)(?:\s*-|\s*\(|$)/i);
        if (pattern1) {
          newProductName = pattern1[1].trim();
        }
        
        // Pattern 2: "Xpress Order Confirmed: [Product Name]"
        const pattern2 = subject.match(/Xpress Order Confirmed:\s*(.+?)(?:\s*-|\s*\(|$)/i);
        if (pattern2) {
          newProductName = pattern2[1].trim();
        }

        if (newProductName && newProductName !== 'item') {
          // Update the purchase with the extracted product name
          const updatedProduct = {
            ...purchase.product,
            name: newProductName
          };
          
          await updateDocument('purchases', purchase.id, userId, {
            product: updatedProduct
          });
          
          fixed.push({
            id: purchase.id,
            oldName: purchase.product?.name,
            newName: newProductName,
            subject: subject
          });
        } else {
          failed.push({
            id: purchase.id,
            reason: 'Could not extract product name',
            subject: subject
          });
        }
      }

      return NextResponse.json({
        total: itemPurchases.length,
        fixed: fixed.length,
        failed: failed.length,
        details: {
          fixed,
          failed
        }
      });
    } else if (action === 'delete') {
      // Delete all purchases with "item" as product name
      const deleted = [];
      const errors = [];

      for (const purchase of itemPurchases) {
        try {
          await deleteDocument('purchases', purchase.id, userId);
          deleted.push({
            id: purchase.id,
            productName: purchase.product?.name,
            subject: purchase.subject
          });
        } catch (error) {
          errors.push({
            id: purchase.id,
            error: error.message
          });
        }
      }

      return NextResponse.json({
        total: itemPurchases.length,
        deleted: deleted.length,
        errors: errors.length,
        details: {
          deleted,
          errors
        }
      });
    } else {
      return NextResponse.json({ error: 'Invalid action. Use "list", "fix", or "delete"' }, { status: 400 });
    }

  } catch (error) {
    console.error('Error fixing item products:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
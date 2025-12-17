import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseMoney(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function getPurchaseCost(p: any): number | null {
  const totalAmount =
    (typeof p.totalAmount === 'number' ? p.totalAmount : parseMoney(p.totalAmount)) ?? null;
  if (typeof totalAmount === 'number' && Number.isFinite(totalAmount) && totalAmount > 0) return totalAmount;

  const purchasePrice =
    (typeof p.purchasePrice === 'number' ? p.purchasePrice : parseMoney(p.purchasePrice)) ?? null;
  if (typeof purchasePrice === 'number' && Number.isFinite(purchasePrice) && purchasePrice > 0) return purchasePrice;

  const priceFromString = parseMoney(p.price);
  if (typeof priceFromString === 'number' && Number.isFinite(priceFromString) && priceFromString > 0) return priceFromString;

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const userId = (body?.userId ? String(body.userId) : '').trim();
    const saleId = (body?.saleId ? String(body.saleId) : '').trim();
    const purchaseId = (body?.purchaseId ? String(body.purchaseId) : '').trim();
    const action = (body?.action ? String(body.action) : 'link').trim(); // link | unlink
    const dryRun = body?.dryRun === true;

    if (!userId) return NextResponse.json({ success: false, error: 'Missing userId' }, { status: 400 });
    if (!saleId) return NextResponse.json({ success: false, error: 'Missing saleId' }, { status: 400 });
    if (action !== 'link' && action !== 'unlink') {
      return NextResponse.json({ success: false, error: 'Invalid action (must be link or unlink)' }, { status: 400 });
    }
    if (action === 'link' && !purchaseId) {
      return NextResponse.json({ success: false, error: 'Missing purchaseId' }, { status: 400 });
    }

    const db = getAdminDb();

    const saleRef = db.collection('user_sales').doc(saleId);
    const saleSnap = await saleRef.get();
    if (!saleSnap.exists) {
      return NextResponse.json({ success: false, error: 'Sale not found' }, { status: 404 });
    }
    const sale = saleSnap.data() as any;
    if (sale?.userId && String(sale.userId) !== userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized (sale does not belong to user)' }, { status: 403 });
    }

    const salePrice = Number(sale?.salePrice) || 0;
    const fees = Number(sale?.fees) || 0;
    const orderNumber = sale?.orderNumber ? String(sale.orderNumber) : null;

    if (action === 'unlink') {
      const priorPurchaseId = sale?.linkedPurchaseId ? String(sale.linkedPurchaseId) : null;
      const updateSale = {
        linkedPurchaseId: null,
        linkedPurchaseOrderNumber: null,
        purchasePrice: 0,
        profit: Number.isFinite(salePrice - fees) ? salePrice - fees : 0,
        updatedAt: new Date().toISOString()
      };

      if (dryRun) {
        return NextResponse.json({
          success: true,
          dryRun: true,
          action: 'unlink',
          saleId,
          orderNumber,
          wouldUpdateSale: updateSale,
          wouldClearPurchaseId: priorPurchaseId || null
        });
      }

      // Best-effort: clear reverse link on purchase if we can.
      if (priorPurchaseId) {
        const purchaseRef = db.collection('purchases').doc(priorPurchaseId);
        const purchaseSnap = await purchaseRef.get();
        if (purchaseSnap.exists) {
          const p = purchaseSnap.data() as any;
          if (!p?.userId || String(p.userId) === userId) {
            // Only clear if it looks linked to this sale.
            const linkedOrder = p?.linkedSaleOrderNumber ? String(p.linkedSaleOrderNumber) : null;
            const linkedSaleId = p?.linkedSaleId ? String(p.linkedSaleId) : null;
            if (!orderNumber || linkedOrder === orderNumber || linkedSaleId === saleId) {
              await purchaseRef.update({
                linkedSaleOrderNumber: FieldValue.delete(),
                linkedSaleId: FieldValue.delete(),
                updatedAt: new Date().toISOString()
              });
            }
          }
        }
      }

      await saleRef.update(updateSale);
      return NextResponse.json({ success: true, action: 'unlink', saleId, orderNumber, sale: updateSale });
    }

    // action === 'link'
    const purchaseRef = db.collection('purchases').doc(purchaseId);
    const purchaseSnap = await purchaseRef.get();
    if (!purchaseSnap.exists) {
      return NextResponse.json({ success: false, error: 'Purchase not found' }, { status: 404 });
    }
    const purchase = purchaseSnap.data() as any;
    if (purchase?.userId && String(purchase.userId) !== userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized (purchase does not belong to user)' }, { status: 403 });
    }

    // Prevent linking a purchase that is already linked to another sale (unless it's the same sale).
    const purchaseLinkedSaleId = purchase?.linkedSaleId ? String(purchase.linkedSaleId) : null;
    const purchaseLinkedOrder = purchase?.linkedSaleOrderNumber ? String(purchase.linkedSaleOrderNumber) : null;
    if (purchaseLinkedSaleId && purchaseLinkedSaleId !== saleId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Purchase already linked to another sale',
          details: { linkedSaleId: purchaseLinkedSaleId, linkedSaleOrderNumber: purchaseLinkedOrder }
        },
        { status: 409 }
      );
    }

    const purchaseCost = getPurchaseCost(purchase) || 0;
    const profit = salePrice - fees - purchaseCost;
    const purchaseOrderNumber = purchase?.orderNumber ? String(purchase.orderNumber) : null;

    const updateSale = {
      linkedPurchaseId: purchaseId,
      linkedPurchaseOrderNumber: purchaseOrderNumber,
      purchasePrice: Number.isFinite(purchaseCost) ? purchaseCost : 0,
      profit: Number.isFinite(profit) ? profit : 0,
      updatedAt: new Date().toISOString()
    };

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        action: 'link',
        saleId,
        purchaseId,
        orderNumber,
        purchaseOrderNumber,
        purchaseCost,
        wouldUpdateSale: updateSale,
        wouldUpdatePurchase: {
          linkedSaleOrderNumber: orderNumber,
          linkedSaleId: saleId
        }
      });
    }

    await saleRef.update(updateSale);
    await purchaseRef.update({
      linkedSaleOrderNumber: orderNumber || FieldValue.delete(),
      linkedSaleId: saleId,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      action: 'link',
      saleId,
      purchaseId,
      orderNumber,
      purchaseOrderNumber,
      purchaseCost,
      sale: updateSale
    });
  } catch (error: any) {
    console.error('❌ Manual purchase linking error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}



import { NextRequest, NextResponse } from 'next/server';

// StockX fee structure by seller level
const STOCKX_FEES = {
  1: { transactionFee: 0.10, paymentProcessing: 0.03 }, // 10% + 3%
  2: { transactionFee: 0.095, paymentProcessing: 0.03 }, // 9.5% + 3%
  3: { transactionFee: 0.09, paymentProcessing: 0.03 }, // 9% + 3%
  4: { transactionFee: 0.085, paymentProcessing: 0.03 }, // 8.5% + 3%
  5: { transactionFee: 0.08, paymentProcessing: 0.03 }, // 8% + 3%
  // Your level appears to be 7% based on your screenshots
  premium: { transactionFee: 0.07, paymentProcessing: 0.03 } // 7% + 3%
};

const SHIPPING_FEE = 4.00; // Standard StockX shipping fee

export async function POST(request: NextRequest) {
  try {
    const { salePrice, sellerLevel = 'premium' } = await request.json();
    
    if (!salePrice || salePrice <= 0) {
      return NextResponse.json({ error: 'Invalid sale price' }, { status: 400 });
    }
    
    const fees = STOCKX_FEES[sellerLevel as keyof typeof STOCKX_FEES] || STOCKX_FEES.premium;
    
    const transactionFee = salePrice * fees.transactionFee;
    const paymentProcessingFee = salePrice * fees.paymentProcessing;
    const shippingFee = SHIPPING_FEE;
    
    const totalFees = transactionFee + paymentProcessingFee + shippingFee;
    const payout = salePrice - totalFees;
    
    return NextResponse.json({
      salePrice,
      fees: {
        transactionFee: parseFloat(transactionFee.toFixed(2)),
        paymentProcessingFee: parseFloat(paymentProcessingFee.toFixed(2)),
        shippingFee: parseFloat(shippingFee.toFixed(2)),
        totalFees: parseFloat(totalFees.toFixed(2))
      },
      payout: parseFloat(payout.toFixed(2)),
      sellerLevel
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to calculate fees' },
      { status: 500 }
    );
  }
}
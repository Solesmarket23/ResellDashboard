import { NextRequest, NextResponse } from 'next/server';
import { getDocuments } from '../../../../lib/firebase/firebaseUtils';
import { getUserSales } from '../../../../lib/firebase/userDataUtils';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId parameter is required' }, { status: 400 });
  }

  try {
    console.log('🔍 Debug: Getting sales for user:', userId);
    
    // Get all sales from database
    const allSales = await getDocuments('sales');
    console.log('🔍 Debug: Total sales in database:', allSales.length);
    
    // Get user-specific sales using both methods
    const userSalesFiltered = allSales.filter((sale: any) => sale.userId === userId);
    const userSalesFunction = await getUserSales(userId);
    
    console.log('🔍 Debug: User sales (filtered):', userSalesFiltered.length);
    console.log('🔍 Debug: User sales (function):', userSalesFunction.length);
    
    // Sample data from each method
    const sampleFiltered = userSalesFiltered.slice(0, 3);
    const sampleFunction = userSalesFunction.slice(0, 3);
    
    return NextResponse.json({
      userId,
      timestamp: new Date().toISOString(),
      totalSalesInDatabase: allSales.length,
      userSalesFiltered: {
        count: userSalesFiltered.length,
        sample: sampleFiltered
      },
      userSalesFunction: {
        count: userSalesFunction.length,
        sample: sampleFunction
      },
      recentSales: allSales
        .filter((sale: any) => sale.userId === userId)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10)
    });
  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch sales data', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 
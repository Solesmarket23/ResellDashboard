import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import { collection, addDoc } from 'firebase/firestore';

export async function GET() {
  try {
    // Try to write a test document
    const testDoc = await addDoc(collection(db, 'test'), {
      message: 'Test from API',
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json({ 
      success: true,
      docId: testDoc.id,
      message: 'Firebase is working!'
    });
  } catch (error: any) {
    return NextResponse.json({ 
      success: false,
      error: error.message,
      code: error.code,
      details: 'Firebase connection or permission error'
    }, { status: 500 });
  }
}
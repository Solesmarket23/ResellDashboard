import { NextResponse } from 'next/server';

export async function GET() {
  console.log('🧪 Test redirect endpoint called');
  return NextResponse.redirect('https://www.google.com');
}


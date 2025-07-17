import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory storage for email subscribers
// In production, you'd want to use a proper database
const subscribers = new Map<string, { email: string; subscribedAt: string; source: string }>();

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }
    
    const normalizedEmail = email.toLowerCase();
    
    // Check if email already exists
    if (subscribers.has(normalizedEmail)) {
      return NextResponse.json({ 
        success: true, 
        message: 'You\'re already on the list!' 
      });
    }
    
    // Add new subscriber
    subscribers.set(normalizedEmail, {
      email: normalizedEmail,
      subscribedAt: new Date().toISOString(),
      source: 'landing_page'
    });
    
    // Log for debugging (in production, you'd save to a database)
    console.log('New subscriber:', normalizedEmail);
    console.log('Total subscribers:', subscribers.size);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Thanks for subscribing! We\'ll be in touch soon.' 
    });
    
  } catch (error) {
    console.error('Subscribe error:', error);
    return NextResponse.json({ 
      error: 'Failed to subscribe. Please try again.' 
    }, { status: 500 });
  }
}

// Optional: Add a GET endpoint to retrieve subscriber count (for admin use)
export async function GET(request: NextRequest) {
  // Check for admin authentication here if needed
  return NextResponse.json({ 
    count: subscribers.size,
    message: 'Subscriber count retrieved successfully'
  });
}
import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for scan sessions (in production, you'd use a database)
const scanSessions = new Map<string, {
  status: 'waiting' | 'scanning' | 'completed';
  result?: string;
  timestamp: number;
}>();

// Clean up old sessions (older than 10 minutes)
const cleanupOldSessions = () => {
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;
  
  for (const [sessionId, session] of scanSessions.entries()) {
    if (now - session.timestamp > tenMinutes) {
      scanSessions.delete(sessionId);
    }
  }
};

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    cleanupOldSessions();
    
    const sessionId = params.sessionId;
    let session = scanSessions.get(sessionId);
    
    // Create session if it doesn't exist
    if (!session) {
      session = {
        status: 'waiting' as const,
        timestamp: Date.now()
      };
      scanSessions.set(sessionId, session);
      console.log(`📱 Created new remote scan session: ${sessionId}`);
    }
    
    return NextResponse.json({
      status: session.status,
      result: session.result,
      timestamp: session.timestamp
    });
    
  } catch (error) {
    console.error('Error getting scan session:', error);
    return NextResponse.json({ 
      error: 'Failed to get scan session' 
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const sessionId = params.sessionId;
    const { status, result } = await request.json();
    
    // Create or update the session
    const session = scanSessions.get(sessionId) || {
      status: 'waiting',
      timestamp: Date.now()
    };
    
    session.status = status;
    session.timestamp = Date.now();
    
    if (result) {
      session.result = result;
    }
    
    scanSessions.set(sessionId, session);
    
    console.log(`📱 Remote scan session ${sessionId}: ${status}`, result ? `- ${result}` : '');
    
    return NextResponse.json({
      success: true,
      session: {
        status: session.status,
        result: session.result,
        timestamp: session.timestamp
      }
    });
    
  } catch (error) {
    console.error('Error updating scan session:', error);
    return NextResponse.json({ 
      error: 'Failed to update scan session' 
    }, { status: 500 });
  }
} 
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // Test with a simple URL first
    const simpleUrl = "https://www.fedex.com/apps/fedextrack/?tracknumbers=393596927187";
    const encodedUrl = "https://www.fedex.com/apps/fedextrack/?tracknumbers%3D393596927187";
    
    const patterns = [
      /tracknumbers=(\d{12})/i,
      /tracknumbers%3D(\d{12})/i,
    ];
    
    const results = patterns.map((pattern, i) => ({
      pattern: i,
      simpleMatch: simpleUrl.match(pattern),
      encodedMatch: encodedUrl.match(pattern),
    }));
    
    return NextResponse.json({
      success: true,
      simpleUrl,
      encodedUrl,
      results,
    });
    
  } catch (error) {
    return NextResponse.json({
      error: "Test failed",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}










import { NextRequest, NextResponse } from "next/server";
import { extractTracking } from "@/app/lib/email/tracking";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { html } = body;
    
    if (!html) {
      return NextResponse.json({ error: "HTML is required" }, { status: 400 });
    }
    
    // Test tracking extraction
    console.log("=== TEST ENDPOINT DEBUG ===");
    console.log("HTML input length:", html.length);
    console.log("HTML preview:", html.substring(0, 200));
    const tracking = extractTracking(html);
    console.log("Tracking extraction result:", tracking);
    
    // Test with the specific URL you provided (fixed malformed encoding)
    const testUrl = "https://us1.wizrocketmail.net/r?e=3DK2xrGR97BX96bGt9DSZkcwQIBgRlYmM1KSQlNU=xOAw1hb2B%2FY2JkN3JwQlEkKTskOQUxJF1bWFEXGi56Kz8kLlxETXo4LjstPjkzP1tfXxQUNjs=oPD82N0kSRk4lMQ0iM3hoaQMHAABmbmR%2FYWoNeQICBARuaGdpe3glMUBbbkQ%2BLD0%2FdWBw=PEhCWmszPzQqIjYmaU8%3D&r=3Dhttps%3A%2F%2Fwww.fedex.com%2Fapps%2Ffedextrack%2F%3Ftracknumbers%3D393596927187&c=3D714829248&token=3DBl1eCQNSBwYDBw%3D%3D=&try=3D1&link_index=3D8&$follow_redirect=3Dtrue";
    
    const testHtml = `<html><body><a href="${testUrl}">Track Your Order</a></body></html>`;
    const testTracking = extractTracking(testHtml);
    
    // Also test with a simpler HTML structure
    const simpleTestHtml = `<html><body><a href="https://www.fedex.com/apps/fedextrack/?tracknumbers%3D393596927187">Track</a></body></html>`;
    console.log("=== SIMPLE TEST DEBUG ===");
    console.log("Simple HTML:", simpleTestHtml);
    const simpleTestTracking = extractTracking(simpleTestHtml);
    console.log("Simple test result:", simpleTestTracking);
    
    // Test individual patterns
    const patterns = [
      /tracknumbers%3D(\d{12})/i,
      /wizrocketmail\.net.*tracknumbers%3D(\d{12})/i,
      /r%3Dhttps.*fedex\.com.*tracknumbers%3D(\d{12})/i,
      /fedex\.com.*tracknumbers%3D(\d{12})/i,
    ];
    
    const patternTests = patterns.map((pattern, i) => ({
      pattern: i,
      matches: testUrl.match(pattern),
      decodedMatches: decodeURIComponent(testUrl).match(pattern)
    }));
    
    // Test the specific pattern that should match
    const specificPattern = /tracknumbers%3D(\d{12})/i;
    const specificMatch = testUrl.match(specificPattern);
    
    // Fix the substring extraction
    const tracknumbersIndex = testUrl.indexOf('tracknumbers');
    const testUrlSubstring = tracknumbersIndex > -1 
      ? testUrl.substring(Math.max(0, tracknumbersIndex - 10), tracknumbersIndex + 30)
      : 'tracknumbers not found';
    
    // Try to decode the URL safely
    let testUrlDecoded = '';
    try {
      testUrlDecoded = decodeURIComponent(testUrl);
    } catch (e) {
      testUrlDecoded = 'URL decoding failed: ' + e.message;
    }
    
    return NextResponse.json({
      success: true,
      tracking,
      testUrl,
      testTracking,
      simpleTestTracking,
      testUrlDecoded,
      patternTests,
      urlContainsTracknumbers: testUrl.includes('tracknumbers%3D'),
      urlContains393596927187: testUrl.includes('393596927187'),
      specificPatternMatch: specificMatch,
      testUrlLength: testUrl.length,
      testUrlSubstring,
      debugInfo: {
        htmlLength: html.length,
        htmlPreview: html.substring(0, 200),
        trackingResult: tracking,
        simpleTestResult: simpleTestTracking,
      }
    });
    
  } catch (error) {
    return NextResponse.json({
      error: "Test failed",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { heuristicParse } from "@/app/lib/email/heuristics";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { html } = body;
    
    if (!html) {
      return NextResponse.json({ error: "HTML is required" }, { status: 400 });
    }
    
    // Extract text content for debugging
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const text = $("body").text().replace(/\s+/g, " ").trim();
    
    // Test heuristic parsing
    const result = heuristicParse(html);
    
    // Look for 8-digit numbers in the text
    const eightDigitMatches = text.match(/\b([0-9]{8})\b/g) || [];
    
    // Look for 12-digit FedEx tracking numbers
    const fedexMatches = text.match(/\b([0-9]{12})\b/g) || [];
    
    // Look for 18-character UPS tracking numbers (1Z + 16 alphanumeric)
    const upsMatches = text.match(/\b(1Z[A-Z0-9]{16})\b/g) || [];
    
    return NextResponse.json({
      success: true,
      result,
      text: text.substring(0, 1000) + "...", // First 1000 chars for debugging
      eightDigitNumbers: eightDigitMatches,
      fedexTrackingNumbers: fedexMatches,
      upsTrackingNumbers: upsMatches,
      html: html.substring(0, 500) + "...", // First 500 chars for debugging
    });
    
  } catch (error) {
    return NextResponse.json({
      error: "Debug failed",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

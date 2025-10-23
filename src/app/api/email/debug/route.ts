import { NextRequest, NextResponse } from "next/server";
import { EmailOrderEventSchema } from "@/lib/email/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Test the schema with the provided data
    const result = EmailOrderEventSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json({
        success: false,
        errors: result.error.errors,
        data: body
      });
    }
    
    return NextResponse.json({
      success: true,
      data: result.data
    });
    
  } catch (error) {
    return NextResponse.json({
      error: "Debug failed",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}




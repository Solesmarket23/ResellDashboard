import { NextRequest, NextResponse } from "next/server";
import { parseEmailToEvent } from "@/app/lib/email/parse";
import { linkOrCreateOrder } from "@/app/lib/email/linking";

// Test endpoint to demonstrate email parsing
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { html, subject, from } = body;

    if (!html) {
      return NextResponse.json(
        { error: "HTML content is required" },
        { status: 400 }
      );
    }

    console.log("🧪 Testing email parsing...");

    // Parse the email
    const parseResult = await parseEmailToEvent({
      rawHtml: html,
      subject: subject || "Test Email",
      from: from || "test@example.com",
      messageId: `test_${Date.now()}`,
      threadId: `thread_${Date.now()}`,
      receivedAt: new Date().toISOString(),
    });

    if (!parseResult.success) {
      return NextResponse.json({
        success: false,
        error: parseResult.error,
        confidence: parseResult.confidence,
        method: parseResult.method,
      });
    }

    // Link to order (this will create a new order in test mode)
    const linkResult = await linkOrCreateOrder(parseResult.event!);

    return NextResponse.json({
      success: true,
      parseResult: {
        confidence: parseResult.confidence,
        method: parseResult.method,
        event: parseResult.event,
      },
      linkResult: {
        success: linkResult.success,
        created: linkResult.created,
        updated: linkResult.updated,
        order: linkResult.order,
      },
    });

  } catch (error) {
    console.error("❌ Test endpoint error:", error);
    return NextResponse.json(
      { 
        error: "Test failed", 
        message: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// Example test data
export async function GET() {
  const exampleHtml = `
    <html>
      <body>
        <h1>Order Confirmation</h1>
        <p>Thank you for your order!</p>
        <p><strong>Order #: ABC-12345</strong></p>
        <div class="order-item">
          <h3>Nike Air Max 97</h3>
          <p>Size: 10</p>
          <p>Price: $210.00</p>
        </div>
        <p><strong>Total: $222.00</strong></p>
        <p>Tracking: <a href="https://www.ups.com/track?tracknum=1Z999AA10123456784">1Z999AA10123456784</a></p>
      </body>
    </html>
  `;

  return NextResponse.json({
    message: "Email parsing test endpoint",
    example: {
      html: exampleHtml,
      subject: "Your Order Confirmation - ABC-12345",
      from: "orders@nike.com",
    },
    usage: "POST to this endpoint with { html, subject, from } to test parsing",
  });
}




import { NextRequest, NextResponse } from "next/server";
import { parseEmailToEvent, shouldProcessEmail } from "@/app/lib/email/parse";
import { linkOrCreateOrder } from "@/app/lib/email/linking";
import { saveRawEmailToStorage, saveEmailEvent } from "@/lib/firebase/firebaseUtils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Extract email data from various webhook formats
    const rawHtml: string = body.html || body["HtmlBody"] || body["html"] || "";
    const plainText: string | undefined = body.text || body["TextBody"] || body["plainText"];
    const subject: string | undefined = body.subject || body["Subject"];
    const from: string | undefined = body.from || body["From"];
    const messageId: string = body.messageId || body["Message-Id"] || body["message-id"] || crypto.randomUUID();
    const threadId: string | undefined = body.threadId || body["Thread-Id"] || body["thread-id"];
    const receivedAt: string = body.receivedAt || body["Date"] || body["date"] || new Date().toISOString();
    const rawHeaders: Record<string, string> | undefined = body.headers || body["Headers"];

    // Validate required fields
    if (!rawHtml) {
      return NextResponse.json(
        { error: "Missing HTML content", received: Object.keys(body) },
        { status: 400 }
      );
    }

    // Check if we should process this email
    if (!shouldProcessEmail(subject, from, rawHtml)) {
      console.log(`📧 Skipping email processing: ${messageId}`);
      return NextResponse.json({ 
        status: "ignored", 
        reason: "Not an order-related email",
        messageId 
      });
    }

    console.log(`📧 Processing email: ${messageId} from ${from}`);

    // Save raw email to storage for audit and re-parsing
    let storagePath: string | undefined;
    try {
      storagePath = await saveRawEmailToStorage({
        messageId,
        threadId,
        rawHtml,
        plainText,
        rawHeaders,
        receivedAt,
      });
    } catch (error) {
      console.error("Failed to save raw email to storage:", error);
      // Continue processing even if storage fails
    }

    // Parse email to extract order information
    const parseResult = await parseEmailToEvent({
      rawHtml,
      subject,
      from,
      messageId,
      threadId,
      receivedAt,
    });

    if (!parseResult.success || !parseResult.event) {
      console.error(`📧 Email parsing failed: ${messageId}`, parseResult.error);
      
      // Save failed parsing event for debugging
      try {
        await saveEmailEvent({
          messageId,
          threadId,
          from,
          subject,
          status: "parse_failed",
          error: parseResult.error,
          confidence: parseResult.confidence || 0,
          method: parseResult.method,
          raw_html_storage_path: storagePath,
          receivedAt,
        });
      } catch (error) {
        console.error("Failed to save email event:", error);
      }

      return NextResponse.json({
        status: "parse_failed",
        error: parseResult.error,
        messageId,
        confidence: parseResult.confidence,
        method: parseResult.method,
      });
    }

    const event = parseResult.event;
    event.raw_html_storage_path = storagePath;

    // Link to existing order or create new one
    const linkResult = await linkOrCreateOrder(event);

    if (!linkResult.success) {
      console.error(`📧 Order linking failed: ${messageId}`, linkResult.error);
      
      // Save failed linking event
      try {
        await saveEmailEvent({
          messageId,
          threadId,
          from,
          subject,
          status: "link_failed",
          error: linkResult.error,
          event,
          raw_html_storage_path: storagePath,
          receivedAt,
        });
      } catch (error) {
        console.error("Failed to save email event:", error);
      }

      return NextResponse.json({
        status: "link_failed",
        error: linkResult.error,
        messageId,
        event,
      });
    }

    // Save successful email event
    try {
      await saveEmailEvent({
        messageId,
        threadId,
        from,
        subject,
        status: "processed",
        orderId: linkResult.order?.id,
        event,
        confidence: event.confidence,
        method: parseResult.method,
        created: linkResult.created,
        updated: linkResult.updated,
        raw_html_storage_path: storagePath,
        receivedAt,
      });
    } catch (error) {
      console.error("Failed to save email event:", error);
    }

    console.log(`📧 Successfully processed email: ${messageId} -> Order: ${linkResult.order?.id}`);

    return NextResponse.json({
      status: "success",
      messageId,
      orderId: linkResult.order?.id,
      orderStatus: linkResult.order?.status,
      created: linkResult.created,
      updated: linkResult.updated,
      confidence: event.confidence,
      method: parseResult.method,
      needsReview: event.needs_review,
      event: {
        order_id: event.order_id,
        status: event.status,
        tracking: event.tracking,
        items: event.items,
        total: event.total,
        currency: event.currency,
      },
    });

  } catch (error) {
    console.error("❌ Error in inbound email webhook:", error);
    
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "email-inbound-webhook",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}




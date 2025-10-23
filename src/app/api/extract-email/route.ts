import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { EmailOrderEventSchema } from "@/app/lib/email/types";

const Input = z.object({
  html: z.string(),
  subject: z.string().optional(),
  from: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Input.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { html, subject, from } = parsed.data;

    // Truncate HTML if too long to avoid token limits
    const maxHtmlLength = 50000; // Adjust based on your needs
    const truncatedHtml = html.length > maxHtmlLength 
      ? html.substring(0, maxHtmlLength) + "..."
      : html;

    const { object } = await generateObject({
      model: openai("gpt-4o-mini"), // Lightweight and cost-effective
      schema: EmailOrderEventSchema,
      prompt: `
Extract order information from this email HTML. Return only valid JSON matching the schema.

Instructions:
- Extract order_id from "Order #", "Order ID", "Confirmation #", etc.
- Set status to one of: confirmed, shipped, out_for_delivery, delivered, canceled, returned
- Extract tracking numbers and carrier if obvious
- Include currency and totals if present
- For items, extract name, size, quantity, SKU, price if available
- Set confidence between 0-1 based on how certain you are
- Set needs_review to true if confidence < 0.8

Email Subject: ${subject || "N/A"}
From: ${from || "N/A"}

HTML Content:
${truncatedHtml}
`.trim(),
    });

    // Validate the response
    const validated = EmailOrderEventSchema.safeParse(object);
    
    if (!validated.success) {
      console.error("LLM response validation failed:", validated.error);
      return NextResponse.json(
        { error: "LLM response validation failed" },
        { status: 500 }
      );
    }

    return NextResponse.json(validated.data);
    
  } catch (error) {
    console.error("Error in extract-email endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




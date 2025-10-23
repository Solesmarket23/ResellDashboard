"use client";

import { useState } from "react";

export default function TestEmailPage() {
  const [html, setHtml] = useState(`<html><body><h1>Order Confirmation</h1><p>Thank you for your order!</p><p><strong>Order #: ABC-12345</strong></p><div class="order-item"><h3>Nike Air Max 97</h3><p>Size: 10</p><p>Price: $210.00</p></div><p><strong>Total: $222.00</strong></p><p>We'll send you tracking information once your order ships.</p></body></html>`);
  const [subject, setSubject] = useState("Your Order Confirmation - ABC-12345");
  const [from, setFrom] = useState("orders@nike.com");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<string>("");

  const testEmail = async () => {
    setLoading(true);
    setResult(null);
    setDebugResult(""); // Clear debug results when testing email parsing

    try {
      // Debug: Log the HTML content being sent
      console.log("HTML being sent:", html);
      
      const response = await fetch("/api/email/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          html,
          subject,
          from,
        }),
      });

      const data = await response.json();
      setResult(data);
      
      // Log the full response for debugging
      console.log("Full API response:", data);
      
    } catch (error) {
      console.error("Test failed:", error);
      setResult({ error: "Test failed", message: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "20px", color: "#ffffff" }}>
        Email Parsing Test
      </h1>
      
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Input Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#ffffff" }}>
              From Email:
            </label>
            <input
              type="email"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
                color: "#000000",
                backgroundColor: "#ffffff"
              }}
              placeholder="orders@nike.com"
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#ffffff" }}>
              Subject:
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "14px",
                color: "#000000",
                backgroundColor: "#ffffff"
              }}
              placeholder="Your Order Confirmation"
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: "500", color: "#ffffff" }}>
              HTML Content:
            </label>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={10}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "12px",
                fontFamily: "monospace",
                color: "#000000",
                backgroundColor: "#ffffff"
              }}
              placeholder="Paste your email HTML here..."
            />
          </div>

          <button
            onClick={testEmail}
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: loading ? "#9ca3af" : "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "16px",
              cursor: loading ? "not-allowed" : "pointer",
              marginBottom: "8px"
            }}
          >
            {loading ? "Testing..." : "Test Email Parsing"}
          </button>
          
          <button
            onClick={async () => {
              try {
                const response = await fetch("/api/email/debug-order", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ html }),
                });
                const data = await response.json();
                console.log("Debug order parsing:", data);
                
                let message = `=== ORDER ID DEBUG ===\n`;
                message += `Order ID found: ${data.result?.order_id || "None"}\n`;
                if (data.eightDigitNumbers?.length > 0) {
                  message += `8-digit numbers found: ${data.eightDigitNumbers.join(", ")}\n`;
                }
                if (data.fedexTrackingNumbers?.length > 0) {
                  message += `12-digit FedEx tracking found: ${data.fedexTrackingNumbers.join(", ")}\n`;
                }
                if (data.upsTrackingNumbers?.length > 0) {
                  message += `18-char UPS tracking found: ${data.upsTrackingNumbers.join(", ")}\n`;
                }
                message += `Text preview: ${data.text?.substring(0, 200)}...`;
                
                setDebugResult(message);
              } catch (error) {
                console.error("Debug failed:", error);
                setDebugResult(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              }
            }}
            style={{
              width: "100%",
              padding: "8px",
              backgroundColor: "#6b7280",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              cursor: "pointer",
              marginBottom: "8px"
            }}
          >
            Debug Order ID Extraction
          </button>
          
          <button
            onClick={async () => {
              try {
                const response = await fetch("/api/email/test-tracking", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ html }),
                });
                const data = await response.json();
                console.log("Test tracking:", data);
                
                let message = `=== TRACKING EXTRACTION DEBUG ===\n`;
                message += `Tracking found: ${data.tracking?.length || 0}\n`;
                if (data.tracking?.length > 0) {
                  data.tracking.forEach((t: any, i: number) => {
                    message += `${i + 1}. ${t.carrier || 'Unknown'}: ${t.number}\n`;
                  });
                }
                message += `\nTest URL result: ${data.testTracking?.length || 0} tracking numbers\n`;
                message += `Simple test result: ${data.simpleTestTracking?.length || 0} tracking numbers\n`;
                message += `URL contains tracknumbers: ${data.urlContainsTracknumbers}\n`;
                message += `URL contains 393596927187: ${data.urlContains393596927187}\n`;
                message += `Specific pattern match: ${data.specificPatternMatch ? 'YES' : 'NO'}\n`;
                message += `URL substring: ${data.testUrlSubstring}\n`;
                if (data.patternTests) {
                  message += `Pattern tests:\n`;
                  data.patternTests.forEach((test: any, i: number) => {
                    message += `Pattern ${i}: ${test.matches ? 'MATCH' : 'NO MATCH'}\n`;
                  });
                }
                if (data.debugInfo) {
                  message += `\nDebug Info:\n`;
                  message += `HTML length: ${data.debugInfo.htmlLength}\n`;
                  message += `HTML preview: ${data.debugInfo.htmlPreview}\n`;
                  message += `Tracking result: ${JSON.stringify(data.debugInfo.trackingResult)}\n`;
                  message += `Simple test result: ${JSON.stringify(data.debugInfo.simpleTestResult)}\n`;
                }
                
                setDebugResult(message);
              } catch (error) {
                console.error("Test tracking failed:", error);
                setDebugResult(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              }
            }}
            style={{
              width: "100%",
              padding: "8px",
              backgroundColor: "#059669",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              cursor: "pointer",
              marginBottom: "8px"
            }}
          >
            Test Tracking Extraction
          </button>
          
          <button
            onClick={async () => {
              try {
                const response = await fetch("/api/email/simple-test", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({}),
                });
                const data = await response.json();
                console.log("Simple test:", data);
                
                let message = `=== BASIC PATTERN TEST ===\n`;
                message += `Simple URL: ${data.simpleUrl}\n`;
                message += `Encoded URL: ${data.encodedUrl}\n\n`;
                data.results.forEach((result: any, i: number) => {
                  message += `Pattern ${i}:\n`;
                  message += `  Simple: ${result.simpleMatch ? 'MATCH' : 'NO MATCH'}\n`;
                  message += `  Encoded: ${result.encodedMatch ? 'MATCH' : 'NO MATCH'}\n`;
                });
                
                setDebugResult(message);
              } catch (error) {
                console.error("Simple test failed:", error);
                setDebugResult(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
              }
            }}
            style={{
              width: "100%",
              padding: "8px",
              backgroundColor: "#7c3aed",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              cursor: "pointer"
            }}
          >
            Test Basic Patterns
          </button>
        </div>

        {/* Debug Results */}
        {debugResult && (
          <div style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "16px", color: "#ffffff" }}>
              Debug Results
            </h2>
            <div style={{ 
              backgroundColor: "white", 
              border: "1px solid #e5e7eb", 
              borderRadius: "8px", 
              padding: "20px", 
              boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
              fontFamily: "monospace",
              fontSize: "12px",
              color: "#000000",
              whiteSpace: "pre-wrap",
              maxHeight: "400px",
              overflow: "auto"
            }}>
              {debugResult}
            </div>
          </div>
        )}

        {/* Results */}
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "16px", color: "#ffffff" }}>
            Results
          </h2>
          
          {result ? (
            <div style={{ 
              backgroundColor: "white", 
              border: "1px solid #e5e7eb", 
              borderRadius: "8px", 
              padding: "16px",
              maxHeight: "500px",
              overflow: "auto"
            }}>
              {result.error ? (
                <div style={{ color: "#dc2626" }}>
                  <h3 style={{ fontWeight: "600", marginBottom: "8px" }}>Error:</h3>
                  <p>{result.error}</p>
                  {result.message && <p style={{ marginTop: "8px", fontSize: "14px" }}>{result.message}</p>}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <h3 style={{ fontWeight: "600", marginBottom: "8px", color: "#000000" }}>Parse Results:</h3>
                    <div style={{ backgroundColor: "#f9fafb", padding: "12px", borderRadius: "6px", fontSize: "14px", color: "#000000" }}>
                      <p><strong>Confidence:</strong> {Math.round((result.parseResult?.confidence || 0) * 100)}%</p>
                      <p><strong>Method:</strong> {result.parseResult?.method}</p>
                      <p><strong>Order ID:</strong> {result.parseResult?.event?.order_id || "Not found"}</p>
                      <p><strong>Status:</strong> {result.parseResult?.event?.status || "Not detected"}</p>
                      <p><strong>Total:</strong> {result.parseResult?.event?.currency || "$"}{result.parseResult?.event?.total || "Not found"}</p>
                      <p><strong>Tracking:</strong> {result.parseResult?.event?.tracking?.length || 0} found</p>
                      <p><strong>Items:</strong> {result.parseResult?.event?.items?.length || 0} found</p>
                    </div>
                  </div>

                  {result.parseResult?.event?.tracking?.length > 0 && (
                    <div>
                      <h4 style={{ fontWeight: "500", marginBottom: "8px", color: "#000000" }}>Tracking Numbers:</h4>
                      <ul style={{ listStyleType: "disc", paddingLeft: "20px", fontSize: "14px", color: "#000000" }}>
                        {result.parseResult.event.tracking.map((track: any, index: number) => (
                          <li key={index} style={{ marginBottom: "4px", color: "#000000" }}>
                            {track.carrier || "Unknown"}: {track.number}
                            {track.url && (
                              <a 
                                href={track.url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                style={{ color: "#2563eb", textDecoration: "underline", marginLeft: "8px" }}
                              >
                                (Track)
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.parseResult?.event?.items?.length > 0 && (
                    <div>
                      <h4 style={{ fontWeight: "500", marginBottom: "8px", color: "#000000" }}>Items:</h4>
                      <ul style={{ listStyleType: "disc", paddingLeft: "20px", fontSize: "14px", color: "#000000" }}>
                        {result.parseResult.event.items.map((item: any, index: number) => (
                          <li key={index} style={{ marginBottom: "4px", color: "#000000" }}>
                            {item.name || "Unknown Item"}
                            {item.size && ` (Size: ${item.size})`}
                            {item.quantity && ` (Qty: ${item.quantity})`}
                            {item.price && ` - $${item.price}`}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h3 style={{ fontWeight: "600", marginBottom: "8px", color: "#000000" }}>Order Linking:</h3>
                    <div style={{ backgroundColor: "#f9fafb", padding: "12px", borderRadius: "6px", fontSize: "14px", color: "#000000" }}>
                      <p><strong>Success:</strong> {result.linkResult?.success ? "Yes" : "No"}</p>
                      <p><strong>Created:</strong> {result.linkResult?.created ? "Yes" : "No"}</p>
                      <p><strong>Updated:</strong> {result.linkResult?.updated ? "Yes" : "No"}</p>
                      {result.linkResult?.order?.id && (
                        <p><strong>Order ID:</strong> {result.linkResult.order.id}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ 
              backgroundColor: "white", 
              border: "1px solid #e5e7eb", 
              borderRadius: "8px", 
              padding: "16px", 
              textAlign: "center", 
              color: "#6b7280" 
            }}>
              Click "Test Email Parsing" to see results
            </div>
          )}
        </div>
      </div>

      {/* Example Emails */}
      <div style={{ marginTop: "48px" }}>
        <h2 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "16px", color: "#ffffff" }}>
          Example Emails
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
          <button
            onClick={() => {
              setSubject("Your Order Confirmation - ABC-12345");
              setFrom("orders@nike.com");
              setHtml(`<html><body><h1>Order Confirmation</h1><p>Thank you for your order!</p><p><strong>Order #: ABC-12345</strong></p><div class="order-item"><h3>Nike Air Max 97</h3><p>Size: 10</p><p>Price: $210.00</p></div><p><strong>Total: $222.00</strong></p><p>We'll send you tracking information once your order ships.</p></body></html>`);
            }}
            style={{
              padding: "16px",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              backgroundColor: "white",
              cursor: "pointer",
              textAlign: "left",
              transition: "background-color 0.2s"
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#f9fafb"}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = "white"}
          >
            <h3 style={{ fontWeight: "500", marginBottom: "4px" }}>Order Confirmation</h3>
            <p style={{ fontSize: "14px", color: "#6b7280" }}>Nike order confirmation email</p>
          </button>

          <button
            onClick={() => {
              setSubject("Your order has shipped!");
              setFrom("orders@nike.com");
              setHtml(`<html><body><h1>Your order has shipped!</h1><p>Order #: ABC-12345</p><p>Tracking: <a href="https://www.ups.com/track?tracknum=1Z999AA10123456784">1Z999AA10123456784</a></p><p>Estimated delivery: 2-3 business days</p></body></html>`);
            }}
            style={{
              padding: "16px",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              backgroundColor: "white",
              cursor: "pointer",
              textAlign: "left",
              transition: "background-color 0.2s"
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#f9fafb"}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = "white"}
          >
            <h3 style={{ fontWeight: "500", marginBottom: "4px" }}>Shipping Notification</h3>
            <p style={{ fontSize: "14px", color: "#6b7280" }}>Order shipped with tracking</p>
          </button>

          <button
            onClick={() => {
              setSubject("Your order has been delivered");
              setFrom("orders@nike.com");
              setHtml(`<html><body><h1>Your order has been delivered!</h1><p>Order #: ABC-12345</p><p>Delivered on: December 15, 2024 at 2:30 PM</p><p>Left at: Front door</p></body></html>`);
            }}
            style={{
              padding: "16px",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              backgroundColor: "white",
              cursor: "pointer",
              textAlign: "left",
              transition: "background-color 0.2s"
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#f9fafb"}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = "white"}
          >
            <h3 style={{ fontWeight: "500", marginBottom: "4px" }}>Delivery Confirmation</h3>
            <p style={{ fontSize: "14px", color: "#6b7280" }}>Order delivered successfully</p>
          </button>

          <button
            onClick={() => {
              setSubject("Order Confirmation - SX-98765");
              setFrom("orders@stockx.com");
              setHtml(`<html><body><h1>Order Confirmation</h1><p>Order Number: SX-98765</p><div class="product"><h3>Jordan 1 Retro High OG</h3><p>Size: 10.5</p><p>Price: $180.00</p></div><p>Total: $195.00 (including $15 shipping)</p></body></html>`);
            }}
            style={{
              padding: "16px",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              backgroundColor: "white",
              cursor: "pointer",
              textAlign: "left",
              transition: "background-color 0.2s"
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#f9fafb"}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = "white"}
          >
            <h3 style={{ fontWeight: "500", marginBottom: "4px" }}>StockX Order</h3>
            <p style={{ fontSize: "14px", color: "#6b7280" }}>StockX order confirmation</p>
          </button>
        </div>
      </div>
    </div>
  );
}
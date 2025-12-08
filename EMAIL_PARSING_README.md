# Email Parsing System

A comprehensive email parsing system that extracts order information from confirmation, shipping, and delivery emails. Built with Next.js 14, TypeScript, Firebase, and Vercel AI SDK.

## Features

- **Hybrid Parsing Pipeline**: Vendor templates → Heuristics → LLM fallback
- **Multi-Carrier Tracking**: UPS, USPS, FedEx, DHL tracking number extraction
- **Status Hierarchy**: Delivered > Out for Delivery > Shipped > Confirmed > Canceled/Returned
- **Order Linking**: Smart order matching by ID, tracking, or thread
- **Raw Email Storage**: Firebase Storage for audit and re-parsing
- **Confidence Scoring**: Automatic review flagging for low-confidence extractions
- **Real-time Updates**: Firebase Firestore for live order status updates

## Architecture

```
Email Webhook → Parse Pipeline → Order Linking → Firebase Storage
     ↓              ↓              ↓              ↓
Raw Storage → Template/Heuristic → Create/Update → Dashboard
     ↓              ↓              ↓              ↓
   Audit      →    LLM Fallback  →  Status Update → Review Queue
```

## Quick Start

### 1. Test the System

Visit `/test-email` to test email parsing with sample data:

```bash
# Start your development server
npm run dev

# Navigate to http://localhost:3000/test-email
```

### 2. Send Test Emails

Use the webhook endpoint to process emails:

```bash
curl -X POST http://localhost:3000/api/email/inbound \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<html><body><h1>Order Confirmation</h1><p>Order #: ABC-123</p></body></html>",
    "subject": "Your Order Confirmation",
    "from": "orders@nike.com",
    "messageId": "test-123"
  }'
```

### 3. View Orders

Visit `/email-dashboard` to see parsed orders and their status.

## API Endpoints

### `/api/email/inbound` (POST)
Main webhook endpoint for processing emails.

**Input:**
```json
{
  "html": "Raw HTML content",
  "subject": "Email subject",
  "from": "sender@example.com",
  "messageId": "unique-message-id",
  "threadId": "optional-thread-id",
  "receivedAt": "2024-01-01T00:00:00Z",
  "headers": { "optional": "headers" }
}
```

**Output:**
```json
{
  "status": "success",
  "messageId": "unique-message-id",
  "orderId": "firebase-order-id",
  "orderStatus": "delivered",
  "created": false,
  "updated": true,
  "confidence": 0.95,
  "method": "template",
  "needsReview": false,
  "event": {
    "order_id": "ABC-123",
    "status": "delivered",
    "tracking": [{"carrier": "UPS", "number": "1Z999AA10123456784"}],
    "items": [{"name": "Nike Air Max 97", "size": "10", "price": 210}],
    "total": 222,
    "currency": "USD"
  }
}
```

### `/api/email/test` (POST)
Test endpoint for development and debugging.

### `/api/extract-email` (POST)
LLM fallback endpoint for complex email parsing.

## Configuration

### Environment Variables

```bash
# Required
NEXT_PUBLIC_BASE_URL=http://localhost:3000  # or your production URL
OPENAI_API_KEY=your_openai_api_key

# Firebase (already configured in your project)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email
```

### Vendor Templates

Add new vendor templates in `src/app/lib/email/templates/index.ts`:

```typescript
{
  id: "new-vendor-v1",
  vendor: "newvendor.com",
  selectors: {
    order_id: "h1:contains('Order'), .order-number",
    total: ".total .amount",
    item_rows: ".line-item",
    item_name: ".product-name",
    // ... more selectors
  },
  confidence: 0.9,
}
```

## Parsing Pipeline

### 1. Template Extraction (Highest Confidence)
- Uses CSS selectors for known vendors
- Extracts structured data from HTML
- Confidence: 0.9-0.95

### 2. Heuristic Parsing (Medium Confidence)
- Regex patterns for common fields
- Text analysis and pattern matching
- Confidence: 0.6-0.8

### 3. LLM Fallback (Lower Confidence)
- OpenAI GPT-4o-mini for complex cases
- Structured JSON extraction
- Confidence: 0.6-0.8

## Status Management

### Status Priority (Highest to Lowest)
1. **Delivered** (5) - Order successfully delivered
2. **Out for Delivery** (4) - Package on delivery vehicle
3. **Shipped** (3) - Package in transit
4. **Confirmed** (2) - Order received and processing
5. **Canceled/Returned** (1) - Order canceled or returned

### Status Updates
- Only upgrades status (never downgrades)
- Maintains complete timeline history
- Idempotent per email Message-Id

## Tracking Number Extraction

### Supported Carriers
- **UPS**: 1Z[0-9A-Z]{16}
- **USPS**: 20-22 digit numbers
- **FedEx**: 12, 15, or 20 digit numbers
- **DHL**: JJD?E?\d{10,15}

### Extraction Methods
1. **Link Analysis**: Extract from tracking URLs
2. **Text Patterns**: Regex matching in email content
3. **Normalization**: Remove spaces, dashes, convert to uppercase

## Database Schema

### Orders Collection
```typescript
{
  id: string;                    // Firebase document ID
  order_id?: string;             // Vendor order ID
  source: {
    vendor?: string;             // Detected vendor
    messageId: string;           // Email message ID
    threadId?: string;           // Email thread ID
  };
  items: Array<{
    name?: string;
    size?: string;
    quantity?: number;
    sku?: string;
    price?: number;
  }>;
  totals: {
    subtotal?: number;
    shipping?: number;
    tax?: number;
    total?: number;
    currency?: string;
  };
  tracking: Array<{
    carrier?: string;
    number?: string;
    url?: string;
  }>;
  status: "confirmed" | "shipped" | "out_for_delivery" | "delivered" | "canceled" | "returned";
  status_timeline: Array<{
    status: string;
    messageId: string;
    at: string;
  }>;
  createdAt: string;
  updatedAt: string;
  confidence: number;
  needs_review: boolean;
}
```

### Email Events Collection
```typescript
{
  id: string;                    // Firebase document ID
  messageId: string;             // Email message ID
  threadId?: string;             // Email thread ID
  from: string;                  // Sender email
  subject: string;               // Email subject
  status: "processed" | "parse_failed" | "link_failed";
  orderId?: string;              // Linked order ID
  event?: EmailOrderEvent;       // Parsed event data
  confidence?: number;           // Parsing confidence
  method?: string;               // Parsing method used
  created?: boolean;             // Order was created
  updated?: boolean;             // Order was updated
  raw_html_storage_path?: string; // Firebase Storage path
  processedAt: Timestamp;        // Processing timestamp
}
```

## Webhook Integration

### Gmail API
```javascript
// Example Gmail webhook handler
app.post('/gmail-webhook', async (req, res) => {
  const { messageId, threadId, raw } = req.body;
  
  // Get full message from Gmail API
  const message = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });
  
  // Extract email data
  const headers = message.payload.headers;
  const subject = headers.find(h => h.name === 'Subject')?.value;
  const from = headers.find(h => h.name === 'From')?.value;
  
  // Get HTML content
  const htmlPart = message.payload.parts?.find(part => 
    part.mimeType === 'text/html'
  );
  const html = Buffer.from(htmlPart.body.data, 'base64').toString();
  
  // Send to parsing webhook
  await fetch('http://localhost:3000/api/email/inbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html,
      subject,
      from,
      messageId,
      threadId,
      receivedAt: new Date().toISOString()
    })
  });
  
  res.status(200).send('OK');
});
```

### SendGrid Inbound Parse
```javascript
// SendGrid webhook handler
app.post('/sendgrid-webhook', async (req, res) => {
  const { html, text, subject, from, messageId } = req.body;
  
  await fetch('http://localhost:3000/api/email/inbound', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html,
      subject,
      from,
      messageId,
      plainText: text,
      receivedAt: new Date().toISOString()
    })
  });
  
  res.status(200).send('OK');
});
```

## Monitoring and Debugging

### Confidence Scoring
- **0.9-1.0**: High confidence, likely accurate
- **0.8-0.9**: Good confidence, minor review needed
- **0.7-0.8**: Medium confidence, review recommended
- **<0.7**: Low confidence, manual review required

### Review Queue
Orders with `needs_review: true` are flagged for manual review. Access via:
- Firebase Console: `orders` collection, filter by `needs_review == true`
- Dashboard: Toggle "Needs Review" filter

### Logging
All parsing attempts are logged with:
- Parsing method used (template/heuristic/llm)
- Confidence scores
- Error messages
- Processing timestamps

## Performance Considerations

### Caching
- Template results are cached by vendor
- LLM responses are cached by content hash
- Firebase queries use appropriate indexes

### Rate Limiting
- LLM fallback has built-in rate limiting
- Firebase operations are batched where possible
- Webhook endpoints include basic validation

### Scaling
- Stateless parsing pipeline
- Firebase auto-scaling
- Vercel serverless functions

## Troubleshooting

### Common Issues

1. **Low Confidence Scores**
   - Add vendor-specific templates
   - Improve regex patterns
   - Check email HTML structure

2. **Missing Order Links**
   - Verify order_id extraction
   - Check tracking number patterns
   - Review fuzzy matching thresholds

3. **Status Not Updating**
   - Check status priority rules
   - Verify timeline entry creation
   - Review Firebase permissions

4. **LLM Fallback Failing**
   - Check OpenAI API key
   - Verify API endpoint accessibility
   - Review token limits

### Debug Mode
Enable detailed logging by setting:
```bash
NODE_ENV=development
DEBUG=email-parsing:*
```

## Contributing

### Adding New Vendors
1. Add template to `templates/index.ts`
2. Test with sample emails
3. Update confidence thresholds if needed

### Improving Heuristics
1. Add regex patterns to `heuristics.ts`
2. Test with diverse email samples
3. Update confidence calculations

### Extending Status Types
1. Update `StatusEnum` in `types.ts`
2. Add keywords to `status.ts`
3. Update priority mapping

## License

This email parsing system is part of your ResellDashboard project and follows the same license terms.









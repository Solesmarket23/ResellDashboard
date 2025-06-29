import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('gmail_access_token')?.value;
    const refreshToken = cookieStore.get('gmail_refresh_token')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 });
    }

    // Set up OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Search for purchase confirmation emails
    const queries = [
      'from:stockx.com "Order Confirmation"',
      'from:goat.com "Order Confirmed"',
      'from:flightclub.com "Order Confirmation"',
      'from:deadstock.com "Order Confirmation"',
      'from:novelship.com "Order Confirmed"'
    ];

    const allPurchases: any[] = [];

    for (const query of queries) {
      try {
        const response = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 10
        });

        if (response.data.messages) {
          for (const message of response.data.messages) {
            const emailData = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            });
            
            const purchase = parsePurchaseEmail(emailData.data);
            if (purchase) {
              allPurchases.push(purchase);
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching emails for query "${query}":`, error);
      }
    }

    return NextResponse.json({ purchases: allPurchases });

  } catch (error) {
    console.error('Error fetching Gmail purchases:', error);
    return NextResponse.json({ error: 'Failed to fetch purchases' }, { status: 500 });
  }
}

function parsePurchaseEmail(email: any) {
  try {
    const content = extractEmailContent(email);
    const fromHeader = email.payload.headers.find((h: any) => h.name === 'From')?.value || '';
    const market = identifyMarket(fromHeader);

    // Extract order number
    const orderNumberRegex = /(?:Order|Purchase|Confirmation)[\s#:]*([A-Z0-9-]{10,})/i;
    const orderMatch = content.match(orderNumberRegex);
    const orderNumber = orderMatch ? orderMatch[1] : `UNKNOWN-${email.id.substring(0, 8)}`;

    // Extract product name
    const productRegex = /(Jordan|Nike|Adidas|Yeezy|Dunk|Air Max|Travis Scott|Off-White|Dior)[^.]*(?:\.|$)/i;
    const productMatch = content.match(productRegex);
    const productName = productMatch ? productMatch[0].replace(/\.$/, '') : 'Unknown Product';

    // Extract brand
    const brand = extractBrand(productName);

    // Extract size
    const sizeRegex = /Size\s*:?\s*([A-Z]*\s*\d+(?:\.\d+)?)/i;
    const sizeMatch = content.match(sizeRegex);
    const size = sizeMatch ? `Size ${sizeMatch[1]}` : 'Unknown Size';

    // Extract price
    const priceRegex = /\$(\d+(?:\.\d{2})?)/g;
    const priceMatches = content.match(priceRegex);
    const price = priceMatches ? priceMatches[0] : '$0.00';

    // Extract tracking
    const trackingRegex = /(?:Tracking|Track)[\s#:]*([A-Z0-9]{10,})/i;
    const trackingMatch = content.match(trackingRegex);
    const tracking = trackingMatch ? trackingMatch[1] : 'No tracking';

    // Extract date
    const dateHeader = email.payload.headers.find((h: any) => h.name === 'Date')?.value;
    const emailDate = dateHeader ? new Date(dateHeader) : new Date();
    const purchaseDate = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dateAdded = emailDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '\n' + 
                     emailDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    return {
      id: email.id,
      orderNumber,
      product: {
        name: productName,
        brand,
        size,
        image: `https://picsum.photos/200/200?random=${email.id.substring(0, 4)}`,
        bgColor: getBrandColor(brand)
      },
      status: 'Ordered',
      statusColor: 'orange',
      tracking,
      market,
      price,
      originalPrice: `${price} + $0.00`,
      purchaseDate,
      dateAdded,
      verified: 'pending',
      verifiedColor: 'orange',
      emailId: email.id
    };

  } catch (error) {
    console.error('Error parsing purchase email:', error);
    return null;
  }
}

function extractEmailContent(email: any): string {
  let content = '';
  
  if (email.payload.body?.data) {
    content = Buffer.from(email.payload.body.data, 'base64').toString();
  } else if (email.payload.parts) {
    for (const part of email.payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        content += Buffer.from(part.body.data, 'base64').toString();
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        content += Buffer.from(part.body.data, 'base64').toString();
      }
    }
  }
  
  return content;
}

function identifyMarket(fromHeader: string): string {
  if (fromHeader.includes('stockx.com')) return 'StockX';
  if (fromHeader.includes('goat.com')) return 'GOAT';
  if (fromHeader.includes('flightclub.com')) return 'Flight Club';
  if (fromHeader.includes('deadstock.com')) return 'Deadstock';
  if (fromHeader.includes('novelship.com')) return 'Novelship';
  return 'Unknown';
}

function extractBrand(productName: string): string {
  if (productName.toLowerCase().includes('jordan')) return 'Jordan';
  if (productName.toLowerCase().includes('nike')) return 'Nike';
  if (productName.toLowerCase().includes('adidas')) return 'Adidas';
  if (productName.toLowerCase().includes('yeezy')) return 'Yeezy';
  if (productName.toLowerCase().includes('travis scott')) return 'Travis Scott';
  if (productName.toLowerCase().includes('off-white')) return 'Off-White';
  if (productName.toLowerCase().includes('dior')) return 'Dior';
  if (productName.toLowerCase().includes('denim tears')) return 'Denim Tears';
  return 'Unknown Brand';
}

function getBrandColor(brand: string): string {
  const brandColors: { [key: string]: string } = {
    'Jordan': 'bg-red-600',
    'Nike': 'bg-orange-500',
    'Adidas': 'bg-blue-600',
    'Yeezy': 'bg-gray-700',
    'Travis Scott': 'bg-amber-900',
    'Off-White': 'bg-gray-100',
    'Dior': 'bg-purple-600',
    'Denim Tears': 'bg-indigo-600'
  };
  return brandColors[brand] || 'bg-gray-400';
} 
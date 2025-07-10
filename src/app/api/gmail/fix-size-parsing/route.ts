import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getDocuments, updateDocument } from '@/lib/firebase/firebaseUtils';

// Enhanced size extraction function specifically for StockX emails
function extractSizeFromStockXEmail(emailContent: string): string | null {
  console.log('🔍 SIZE EXTRACTION DEBUG - Starting size extraction');
  
  // Comprehensive size patterns for StockX emails
  const sizePatterns = [
    // Basic size patterns
    /Size:\s*US\s*([XSMLW]*\s*\d+(?:\.\d+)?)/i,
    /Size:\s*([XSMLW]*\s*\d+(?:\.\d+)?)/i,
    /Size:\s*([XSMLW]+)/i,
    
    // HTML table patterns (improved to handle whitespace and newlines)
    /<td[^>]*>Size[^<]*<\/td>[\s\n]*<td[^>]*>[\s\n]*US[\s\n]*([XSMLW]*\s*\d+(?:\.\d+)?)/i,
    /<td[^>]*>Size[^<]*<\/td>[\s\n]*<td[^>]*>[\s\n]*([XSMLW]*\s*\d+(?:\.\d+)?)/i,
    /<td[^>]*>Size[^<]*<\/td>[\s\n]*<td[^>]*>[\s\n]*([XSMLW]+)/i,
    
    // List item patterns (improved to handle whitespace and newlines)
    /<li[^>]*>Size:[\s\n]*US[\s\n]*([XSMLW]*\s*\d+(?:\.\d+)?)<\/li>/i,
    /<li[^>]*>Size:[\s\n]*([XSMLW]*\s*\d+(?:\.\d+)?)<\/li>/i,
    /<li[^>]*>Size:[\s\n]*([XSMLW]+)<\/li>/i,
    
    // Subject line patterns (common in StockX emails)
    /\(Size\s*US?\s*([XSMLW]*\s*\d+(?:\.\d+)?)\)/i,
    /\(Size\s*([XSMLW]+)\)/i,
    
    // Alternative formats
    /Size[:\s]+US[:\s]+([XSMLW]*\s*\d+(?:\.\d+)?)/i,
    /Size[:\s]+([XSMLW]*\s*\d+(?:\.\d+)?)/i,
    /Size[:\s]+([XSMLW]+)/i,
    
    // Women's size patterns
    /Size\s*US\s*([XSMLW]*\s*\d+(?:\.\d+)?)\s*\(Women's\)/i,
    /Size\s*([XSMLW]*\s*\d+(?:\.\d+)?)\s*\(Women's\)/i,
    
    // Direct size display patterns
    /<td[^>]*style[^>]*font-weight:\s*600[^>]*>([XSMLW]*\s*\d+(?:\.\d+)?)<\/td>/i,
    /<td[^>]*>([XSMLW]*\s*\d+(?:\.\d+)?)<\/td>/i,
    
    // Flexible patterns for various formats
    /\bUS\s*([XSMLW]*\s*\d+(?:\.\d+)?)\b/i,
    /\b([XSMLW]{1,3})\s*(?:Size|US)\b/i,
    
    // Span and div patterns
    /<span[^>]*>Size:\s*US\s*([XSMLW]*\s*\d+(?:\.\d+)?)<\/span>/i,
    /<span[^>]*>Size:\s*([XSMLW]*\s*\d+(?:\.\d+)?)<\/span>/i,
    /<div[^>]*>Size:\s*US\s*([XSMLW]*\s*\d+(?:\.\d+)?)<\/div>/i,
    /<div[^>]*>Size:\s*([XSMLW]*\s*\d+(?:\.\d+)?)<\/div>/i,
    
    // More comprehensive patterns for table cells with any content
    /<td[^>]*>[\s\n]*([XSMLW]{1,4})[\s\n]*<\/td>/i,
    /<td[^>]*>[\s\n]*US[\s\n]+([XSMLW]{1,4})[\s\n]*<\/td>/i,
    /<td[^>]*>[\s\n]*US[\s\n]+(\d+(?:\.\d+)?)[\s\n]*<\/td>/i,
    
    // Direct list patterns for simple cases
    /<li[^>]*>[\s\n]*Size:[\s\n]*US[\s\n]*([XSMLW]+)[\s\n]*<\/li>/i,
  ];
  
  let sizeFound = false;
  for (let i = 0; i < sizePatterns.length; i++) {
    const pattern = sizePatterns[i];
    const match = emailContent.match(pattern);
    if (match) {
      console.log(`🎯 SIZE FOUND with pattern ${i}:`, match[0]);
      console.log(`🎯 SIZE EXTRACTED:`, match[1]);
      
      let size = match[1].trim();
      
      // Clean up size format
      if (size.match(/^\d+(?:\.\d+)?$/)) {
        size = `US ${size}`;
      } else if (size.match(/^[XSMLW]{1,3}$/)) {
        size = `US ${size}`;
      }
      
      // Skip if size is "15" as that's what we're trying to fix
      if (size === "15" || size === "US 15") {
        console.log(`⚠️ Skipping size "15" as it's the problematic value`);
        continue;
      }
      
      return size;
    }
  }
  
  console.log('❌ SIZE NOT FOUND - No patterns matched');
  return null;
}

// Function to get email content from Gmail API
async function getEmailContent(gmail: any, messageId: string): Promise<string> {
  try {
    const emailData = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    // Extract HTML content
    let htmlContent = '';
    if (emailData.data.payload?.parts) {
      for (const part of emailData.data.payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          htmlContent += Buffer.from(part.body.data, 'base64').toString();
        }
      }
    } else if (emailData.data.payload?.body?.data) {
      htmlContent += Buffer.from(emailData.data.payload.body.data, 'base64').toString();
    }

    return htmlContent;
  } catch (error) {
    console.error('Error fetching email content:', error);
    return '';
  }
}

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await request.json();
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Access token is required' }, { status: 400 });
    }

    // Set up Gmail API client
    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    console.log('🔄 Starting size parsing fix for StockX emails...');

    // Get all purchases from Firebase
    const allPurchases = await getDocuments('user_purchases');
    console.log(`📊 Total purchases in database: ${allPurchases.length}`);

    // Find StockX purchases with size "15"
    const problematicPurchases = allPurchases.filter(purchase => 
      purchase.size === "15" && 
      purchase.sender && 
      purchase.sender.toLowerCase().includes('stockx.com')
    );

    console.log(`🎯 Found ${problematicPurchases.length} StockX purchases with size "15"`);

    const results = {
      total: problematicPurchases.length,
      updated: 0,
      failed: 0,
      details: []
    };

    // Process each problematic purchase
    for (const purchase of problematicPurchases) {
      try {
        console.log(`🔄 Processing purchase: ${purchase.id} - ${purchase.productName}`);

        // Check if we have an emailId to fetch content
        if (!purchase.emailId) {
          console.log(`⚠️ No emailId found for purchase ${purchase.id}`);
          results.failed++;
          results.details.push({
            id: purchase.id,
            productName: purchase.productName,
            orderNumber: purchase.orderNumber,
            error: 'No emailId found'
          });
          continue;
        }

        // Get email content from Gmail
        const emailContent = await getEmailContent(gmail, purchase.emailId);
        
        if (!emailContent) {
          console.log(`⚠️ Could not fetch email content for purchase ${purchase.id}`);
          results.failed++;
          results.details.push({
            id: purchase.id,
            productName: purchase.productName,
            orderNumber: purchase.orderNumber,
            error: 'Could not fetch email content'
          });
          continue;
        }

        // Extract correct size from email content
        const correctSize = extractSizeFromStockXEmail(emailContent);
        
        if (correctSize && correctSize !== "15") {
          console.log(`✅ Updating purchase ${purchase.id}: size "15" -> "${correctSize}"`);
          
          // Update the purchase in Firebase
          await updateDocument('user_purchases', purchase.id, {
            size: correctSize
          });
          
          results.updated++;
          results.details.push({
            id: purchase.id,
            productName: purchase.productName,
            orderNumber: purchase.orderNumber,
            oldSize: "15",
            newSize: correctSize,
            success: true
          });
        } else {
          console.log(`❌ Could not find correct size for purchase ${purchase.id}`);
          results.failed++;
          results.details.push({
            id: purchase.id,
            productName: purchase.productName,
            orderNumber: purchase.orderNumber,
            error: 'Could not extract correct size from email'
          });
        }

        // Add small delay to avoid overwhelming Gmail API
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`❌ Error processing purchase ${purchase.id}:`, error);
        results.failed++;
        results.details.push({
          id: purchase.id,
          productName: purchase.productName,
          orderNumber: purchase.orderNumber,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log(`🎉 Size parsing fix completed:`);
    console.log(`   - Total processed: ${results.total}`);
    console.log(`   - Successfully updated: ${results.updated}`);
    console.log(`   - Failed: ${results.failed}`);

    return NextResponse.json({ 
      success: true, 
      message: 'Size parsing fix completed',
      results 
    });

  } catch (error) {
    console.error('Error in size parsing fix:', error);
    return NextResponse.json({ 
      error: 'Failed to fix size parsing',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET endpoint to check how many purchases need fixing
export async function GET(request: NextRequest) {
  try {
    // Get all purchases from Firebase
    const allPurchases = await getDocuments('user_purchases');
    
    // Find StockX purchases with size "15"
    const problematicPurchases = allPurchases.filter(purchase => 
      purchase.size === "15" && 
      purchase.sender && 
      purchase.sender.toLowerCase().includes('stockx.com')
    );

    const summary = {
      totalPurchases: allPurchases.length,
      stockxPurchases: allPurchases.filter(p => p.sender && p.sender.toLowerCase().includes('stockx.com')).length,
      problematicPurchases: problematicPurchases.length,
      purchases: problematicPurchases.map(p => ({
        id: p.id,
        productName: p.productName,
        orderNumber: p.orderNumber,
        size: p.size,
        emailSubject: p.emailSubject,
        hasEmailId: !!p.emailId
      }))
    };

    return NextResponse.json(summary);

  } catch (error) {
    console.error('Error checking size parsing issues:', error);
    return NextResponse.json({ 
      error: 'Failed to check size parsing issues',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 
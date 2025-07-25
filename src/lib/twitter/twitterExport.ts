import { getBackgroundStyle, BackgroundVersion } from './backgrounds';

export interface ArbitrageShareData {
  productName: string;
  size: string;
  purchasePrice: number;
  salePrice: number;
  profit: number;
  profitMargin: number;
  imageUrl?: string;
  affiliateUrl?: string;
  shortUrl?: string;
  backgroundVersion?: BackgroundVersion;
  isXpressAvailable?: boolean;
  xpressPrice?: number;
}

export function generateTwitterText(data: ArbitrageShareData): string {
  let text = `💰 StockX Arbitrage Alert!\n\n` +
    `${data.productName} (Size ${data.size})\n\n` +
    `Highest bid: $${data.purchasePrice.toFixed(2)}\n` +
    `Lowest ask: $${data.salePrice.toFixed(2)}\n\n` +
    `Profit: $${data.profit.toFixed(2)} (${data.profitMargin}%)\n\n` +
    `(estimated profit with buyer fees & selling via no-fee resale)\n\n`;
  
  // Use affiliate URL directly if available, otherwise use short URL
  if (data.affiliateUrl) {
    text += `🔗 ${data.affiliateUrl}\n\n`;
  } else if (data.shortUrl) {
    text += `🔗 ${data.shortUrl}\n\n`;
  }
  
  text += `#StockX #Reselling #SneakerArbitrage`;
  
  return text;
}

export function shareToTwitter(data: ArbitrageShareData) {
  const text = generateTwitterText(data);
  const encodedText = encodeURIComponent(text);
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
  
  window.open(twitterUrl, '_blank', 'width=550,height=450');
}

// Generate a shareable image using canvas
export async function generateShareImage(data: ArbitrageShareData): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      resolve('');
      return;
    }
    
    // Set canvas dimensions (Twitter optimal: 1200x675)
    canvas.width = 1200;
    canvas.height = 675;
    
    // Load product image if available
    if (data.imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        drawImageWithProduct(ctx, canvas, data, img);
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            resolve(url);
          } else {
            resolve('');
          }
        }, 'image/png');
      };
      img.onerror = () => {
        // If image fails to load, draw without it
        drawImageWithProduct(ctx, canvas, data, null);
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            resolve(url);
          } else {
            resolve('');
          }
        }, 'image/png');
      };
      img.src = data.imageUrl;
      return;
    }
    
    // No image available, draw without it
    drawImageWithProduct(ctx, canvas, data, null);
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        resolve(url);
      } else {
        resolve('');
      }
    }, 'image/png');
  });
}

function drawImageWithProduct(
  ctx: CanvasRenderingContext2D, 
  canvas: HTMLCanvasElement, 
  data: ArbitrageShareData, 
  productImage: HTMLImageElement | null
) {
  // Get background style
  const bgStyle = getBackgroundStyle(data.backgroundVersion || 'bright');
  const colors = bgStyle.textColors;
  
  // Draw background
  bgStyle.drawBackground(ctx, canvas);
  
  // Draw product image if available
  if (productImage) {
    // Create a container for the image with padding
    const imgSize = 200;
    const imgX = 50;
    const imgY = (canvas.height - imgSize) / 2;
    
    // White background for image
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(imgX - 10, imgY - 10, imgSize + 20, imgSize + 20);
    
    // Draw image maintaining aspect ratio
    const scale = Math.min(imgSize / productImage.width, imgSize / productImage.height);
    const w = productImage.width * scale;
    const h = productImage.height * scale;
    const offsetX = (imgSize - w) / 2;
    const offsetY = (imgSize - h) / 2;
    
    ctx.drawImage(productImage, imgX + offsetX, imgY + offsetY, w, h);
    
    // Add border
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(imgX - 10, imgY - 10, imgSize + 20, imgSize + 20);
  }
  
  // Adjust text positioning based on whether we have an image
  const textStartX = productImage ? 350 : 100;
  const contentWidth = productImage ? canvas.width - 400 : canvas.width - 200;
  
  // Title
  ctx.font = 'bold 42px Arial';
  ctx.fillStyle = colors.primary;
  ctx.textAlign = 'left';
  ctx.fillText('BUY NOW on StockX!', textStartX, 80);
  
  // Available Now Badge
  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = colors.profit;
  ctx.fillText('✅ AVAILABLE NOW', textStartX, 120);
  
  // Product name
  ctx.font = '28px Arial';
  ctx.fillStyle = colors.secondary;
  const productText = `${data.productName} (Size ${data.size})`;
  // Wrap text if too long
  const maxWidth = contentWidth;
  const words = productText.split(' ');
  let line = '';
  let y = 160;
  
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, textStartX, y);
      line = words[n] + ' ';
      y += 35;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, textStartX, y);
  
  // Price information in a cleaner layout
  const priceY = productImage ? 300 : 270;
  const boxHeight = 80;
  const boxGap = 20;
  
  // Buy Now Price
  ctx.font = '20px Arial';
  ctx.fillStyle = colors.muted;
  ctx.fillText('BUY NOW PRICE', textStartX, priceY);
  ctx.font = 'bold 40px Arial';
  ctx.fillStyle = colors.profit;
  ctx.fillText(`$${data.salePrice.toFixed(2)}`, textStartX, priceY + 40);
  
  // Xpress price if available
  if (data.isXpressAvailable && data.xpressPrice) {
    ctx.font = '18px Arial';
    ctx.fillStyle = colors.accent;
    ctx.fillText(`⚡ Xpress: $${data.xpressPrice.toFixed(2)}`, textStartX, priceY + 65);
  }
  
  // Current bid
  ctx.fillStyle = colors.muted;
  ctx.font = '20px Arial';
  ctx.fillText('CURRENT BID', textStartX + 250, priceY);
  ctx.font = 'bold 36px Arial';
  ctx.fillStyle = colors.primary;
  ctx.fillText(`$${data.purchasePrice.toFixed(2)}`, textStartX + 250, priceY + 40);
  
  // Profit
  ctx.fillStyle = colors.muted;
  ctx.font = '20px Arial';
  ctx.fillText('FLIP PROFIT', textStartX + 450, priceY);
  ctx.font = 'bold 36px Arial';
  ctx.fillStyle = colors.profit;
  ctx.fillText(`$${data.profit.toFixed(2)}`, textStartX + 450, priceY + 40);
  
  // Large profit percentage
  ctx.font = 'bold 72px Arial';
  ctx.fillStyle = colors.profit;
  ctx.textAlign = 'center';
  ctx.fillText(`+${data.profitMargin}%`, canvas.width / 2, 500);
  
  // Call to action
  ctx.font = 'bold 22px Arial';
  ctx.fillStyle = colors.accent;
  ctx.textAlign = 'center';
  ctx.fillText('🏃‍♂️ LIMITED AVAILABILITY - BUY NOW!', canvas.width / 2, 550);
  
  // Footer
  ctx.font = '26px Arial';
  ctx.fillStyle = colors.accent;
  ctx.fillText('Follow @SolesMarket23 on X for more flips', canvas.width / 2, 620);
}
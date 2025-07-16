export interface ArbitrageShareData {
  productName: string;
  size: string;
  purchasePrice: number;
  salePrice: number;
  profit: number;
  profitMargin: number;
  imageUrl?: string;
  affiliateUrl?: string;
}

export function generateTwitterText(data: ArbitrageShareData): string {
  const profitEmoji = data.profit >= 100 ? '🚀' : data.profit >= 50 ? '🔥' : '💰';
  
  let text = `${profitEmoji} StockX Arbitrage Alert!\n\n` +
    `${data.productName} (Size ${data.size})\n` +
    `Buy: $${data.purchasePrice.toFixed(2)}\n` +
    `Sell: $${data.salePrice.toFixed(2)}\n` +
    `Profit: $${data.profit.toFixed(2)} (${data.profitMargin}%)\n\n`;
  
  // Add affiliate link if available
  if (data.affiliateUrl) {
    text += `🔗 ${data.affiliateUrl}\n\n`;
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
    
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#0f0f23');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add grid pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 50) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvas.width, i);
      ctx.stroke();
    }
    
    // Title
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('StockX Arbitrage Opportunity', canvas.width / 2, 100);
    
    // Product name
    ctx.font = '36px Arial';
    ctx.fillStyle = '#00d4ff';
    const productText = `${data.productName} (Size ${data.size})`;
    ctx.fillText(productText, canvas.width / 2, 180);
    
    // Price boxes
    const boxY = 250;
    const boxHeight = 120;
    const boxWidth = 300;
    const boxGap = 50;
    const startX = (canvas.width - (boxWidth * 3 + boxGap * 2)) / 2;
    
    // Buy box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(startX, boxY, boxWidth, boxHeight);
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, boxY, boxWidth, boxHeight);
    
    ctx.font = '24px Arial';
    ctx.fillStyle = '#888888';
    ctx.textAlign = 'center';
    ctx.fillText('BUY PRICE', startX + boxWidth / 2, boxY + 35);
    
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`$${data.purchasePrice.toFixed(2)}`, startX + boxWidth / 2, boxY + 85);
    
    // Sell box
    const sellX = startX + boxWidth + boxGap;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(sellX, boxY, boxWidth, boxHeight);
    ctx.strokeStyle = '#00ff88';
    ctx.strokeRect(sellX, boxY, boxWidth, boxHeight);
    
    ctx.font = '24px Arial';
    ctx.fillStyle = '#888888';
    ctx.fillText('SELL PRICE', sellX + boxWidth / 2, boxY + 35);
    
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`$${data.salePrice.toFixed(2)}`, sellX + boxWidth / 2, boxY + 85);
    
    // Profit box
    const profitX = sellX + boxWidth + boxGap;
    ctx.fillStyle = 'rgba(0, 255, 136, 0.1)';
    ctx.fillRect(profitX, boxY, boxWidth, boxHeight);
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.strokeRect(profitX, boxY, boxWidth, boxHeight);
    
    ctx.font = '24px Arial';
    ctx.fillStyle = '#00ff88';
    ctx.fillText('PROFIT', profitX + boxWidth / 2, boxY + 35);
    
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = '#00ff88';
    ctx.fillText(`$${data.profit.toFixed(2)}`, profitX + boxWidth / 2, boxY + 85);
    
    // Profit percentage
    ctx.font = 'bold 64px Arial';
    ctx.fillStyle = '#00ff88';
    ctx.textAlign = 'center';
    ctx.fillText(`+${data.profitMargin}%`, canvas.width / 2, 480);
    
    // Footer
    ctx.font = '24px Arial';
    ctx.fillStyle = '#666666';
    ctx.fillText('Found with ResellDashboard', canvas.width / 2, 600);
    
    // Branding
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = '#00d4ff';
    ctx.fillText('stockx.com/arbitrage', canvas.width / 2, 640);
    
    // Convert to blob URL
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
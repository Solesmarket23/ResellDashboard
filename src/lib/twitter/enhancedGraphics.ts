export interface EnhancedArbitrageShareData {
  productName: string;
  size: string;
  purchasePrice: number;
  salePrice: number;
  profit: number;
  profitMargin: number;
  imageUrl?: string;
  affiliateUrl?: string;
  shortUrl?: string;
  backgroundVersion?: 'dark' | 'gold' | 'platinum';
  platform?: 'stockx' | 'goat' | 'ebay';
  flipTime?: string; // e.g., "3-5 days"
}

export function generateEnhancedShareImage(data: EnhancedArbitrageShareData): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      resolve('');
      return;
    }
    
    // Square format for Instagram (1:1)
    canvas.width = 1080;
    canvas.height = 1080;
    
    // Draw enhanced background
    drawPremiumBackground(ctx, canvas);
    
    // Load product image if available
    if (data.imageUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        drawEnhancedGraphic(ctx, canvas, data, img);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            resolve('');
          }
        }, 'image/png');
      };
      img.onerror = () => {
        drawEnhancedGraphic(ctx, canvas, data, null);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            resolve('');
          }
        }, 'image/png');
      };
      img.src = data.imageUrl;
    } else {
      drawEnhancedGraphic(ctx, canvas, data, null);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          resolve('');
        }
      }, 'image/png');
    }
  });
}

function drawPremiumBackground(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  // Create a radial gradient from center
  const gradient = ctx.createRadialGradient(
    canvas.width / 2, canvas.height / 2, 0,
    canvas.width / 2, canvas.height / 2, canvas.width * 0.7
  );
  
  // Dark luxury gradient
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(0.5, '#16213e');
  gradient.addColorStop(1, '#0f3460');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Add subtle pattern overlay
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < canvas.width; i += 40) {
    for (let j = 0; j < canvas.height; j += 40) {
      ctx.beginPath();
      ctx.arc(i, j, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawEnhancedGraphic(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  data: EnhancedArbitrageShareData,
  productImage: HTMLImageElement | null
) {
  const centerX = canvas.width / 2;
  
  // Add glow effect function
  const addGlow = (color: string, blur: number = 20) => {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  };
  
  const clearGlow = () => {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  };
  
  // Platform badge (top right)
  if (data.platform) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(canvas.width - 150, 20, 130, 40);
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(data.platform.toUpperCase(), canvas.width - 30, 45);
  }
  
  // Title with glow
  addGlow('#00ff88', 30);
  ctx.font = 'bold 36px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText('ARBITRAGE ALERT', centerX, 80);
  clearGlow();
  
  // Product image or silhouette
  const imgSize = 280;
  const imgY = 120;
  
  if (productImage) {
    // Add shadow to image
    addGlow('rgba(0, 0, 0, 0.5)', 20);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(centerX - imgSize/2 - 10, imgY - 10, imgSize + 20, imgSize + 20);
    clearGlow();
    
    // Draw product image
    const scale = Math.min(imgSize / productImage.width, imgSize / productImage.height);
    const w = productImage.width * scale;
    const h = productImage.height * scale;
    ctx.drawImage(
      productImage,
      centerX - w/2,
      imgY + (imgSize - h)/2,
      w,
      h
    );
  } else {
    // Draw shoe silhouette placeholder
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(centerX - imgSize/2, imgY, imgSize, imgSize);
    ctx.font = '120px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.textAlign = 'center';
    ctx.fillText('👟', centerX, imgY + imgSize/2 + 40);
  }
  
  // Product name
  ctx.font = '24px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  const productY = imgY + imgSize + 40;
  ctx.fillText(`${data.productName} (${data.size})`, centerX, productY);
  
  // Price boxes with depth
  const boxY = productY + 50;
  const boxWidth = 280;
  const boxHeight = 80;
  const spacing = 20;
  
  // Buy price box
  const buyX = centerX - boxWidth - spacing/2;
  drawPriceBox(ctx, buyX, boxY, boxWidth, boxHeight, '#ff4757', 'BUY', data.purchasePrice);
  
  // Sell price box  
  const sellX = centerX + spacing/2;
  drawPriceBox(ctx, sellX, boxY, boxWidth, boxHeight, '#00ff88', 'SELL', data.salePrice);
  
  // Profit percentage - HUGE with glow
  const profitY = boxY + boxHeight + 80;
  addGlow('#00ff88', 40);
  ctx.font = 'bold 120px Arial';
  ctx.fillStyle = '#00ff88';
  ctx.textAlign = 'center';
  ctx.fillText(`+${data.profitMargin}%`, centerX, profitY);
  clearGlow();
  
  // Profit amount
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`$${data.profit.toFixed(2)} PROFIT`, centerX, profitY + 50);
  
  // Flip time if provided
  if (data.flipTime) {
    ctx.font = '20px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(`Flip in ${data.flipTime}`, centerX, profitY + 90);
  }
  
  // Bottom info
  ctx.font = '16px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillText('*Based on buyer fees & no-fee resale', centerX, canvas.height - 80);
  
  // Social handle with better styling
  addGlow('#ffd700', 20);
  ctx.font = 'bold 22px Arial';
  ctx.fillStyle = '#ffd700';
  ctx.fillText('@SolesMarket23', centerX, canvas.height - 40);
  clearGlow();
  
  // Subtle QR code area (bottom right)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(canvas.width - 100, canvas.height - 100, 80, 80);
  ctx.font = '12px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.textAlign = 'center';
  ctx.fillText('SCAN', canvas.width - 60, canvas.height - 45);
}

function drawPriceBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  label: string,
  price: number
) {
  // Shadow for depth
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(x + 5, y + 5, width, height);
  
  // Main box
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(x, y, width, height);
  
  // Border
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
  
  // Label
  ctx.font = '18px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + width/2, y + 25);
  
  // Price
  ctx.font = 'bold 32px Arial';
  ctx.fillStyle = color;
  ctx.fillText(`$${price.toFixed(2)}`, x + width/2, y + 60);
}
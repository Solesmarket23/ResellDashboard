export type BackgroundVersion = 'dark' | 'bright';

export interface BackgroundStyle {
  drawBackground: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void;
  textColors: {
    primary: string;
    secondary: string;
    accent: string;
    profit: string;
    muted: string;
  };
}

// Version 1.0 - Dark theme with grid
export const darkBackground: BackgroundStyle = {
  drawBackground: (ctx, canvas) => {
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
  },
  textColors: {
    primary: '#ffffff',
    secondary: '#00d4ff',
    accent: '#00d4ff',
    profit: '#00ff88',
    muted: '#888888'
  }
};

// Version 2.0 - Bright gradient theme
export const brightBackground: BackgroundStyle = {
  drawBackground: (ctx, canvas) => {
    // Bright gradient background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#667eea');  // Purple
    gradient.addColorStop(0.5, '#764ba2'); // Mid purple
    gradient.addColorStop(1, '#f093fb');   // Pink
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add subtle overlay pattern
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    for (let i = 0; i < canvas.width; i += 100) {
      for (let j = 0; j < canvas.height; j += 100) {
        if ((i + j) % 200 === 0) {
          ctx.beginPath();
          ctx.arc(i, j, 30, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  },
  textColors: {
    primary: '#ffffff',
    secondary: '#ffffff',
    accent: '#ffd700',  // Gold
    profit: '#00ff00',  // Bright green
    muted: 'rgba(255, 255, 255, 0.8)'
  }
};

export function getBackgroundStyle(version: BackgroundVersion = 'dark'): BackgroundStyle {
  switch (version) {
    case 'bright':
      return brightBackground;
    case 'dark':
    default:
      return darkBackground;
  }
}
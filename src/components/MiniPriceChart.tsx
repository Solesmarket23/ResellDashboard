'use client';

import React from 'react';

interface PricePoint {
  timestamp: number;
  price: number;
  type: 'ask' | 'bid' | 'sale';
}

interface MiniPriceChartProps {
  priceHistory?: PricePoint[];
  width?: number;
  height?: number;
  className?: string;
}

const MiniPriceChart: React.FC<MiniPriceChartProps> = ({ 
  priceHistory = [], 
  width = 120, 
  height = 40,
  className = "" 
}) => {
  if (!priceHistory.length) {
    return (
      <div className={`${className} flex items-center justify-center text-gray-500 text-xs`} style={{ width, height }}>
        No data
      </div>
    );
  }

  // Get min/max prices for scaling
  const prices = priceHistory.map(p => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1; // Avoid division by zero

  // Generate SVG path
  const points = priceHistory.map((point, index) => {
    const x = (index / (priceHistory.length - 1)) * width;
    const y = height - ((point.price - minPrice) / priceRange) * height;
    return `${x},${y}`;
  }).join(' L ');

  const path = `M ${points}`;

  // Determine trend color
  const firstPrice = priceHistory[0]?.price || 0;
  const lastPrice = priceHistory[priceHistory.length - 1]?.price || 0;
  const isUp = lastPrice > firstPrice;
  const strokeColor = isUp ? '#10b981' : '#ef4444'; // green-500 : red-500

  return (
    <div className={className} style={{ width, height }}>
      <svg width={width} height={height} className="overflow-visible">
        {/* Background grid */}
        <defs>
          <pattern id="grid" width="20" height="10" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 10" fill="none" stroke="rgba(156, 163, 175, 0.1)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Price line */}
        <path
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* End point */}
        {priceHistory.length > 0 && (
          <circle
            cx={(priceHistory.length - 1) / (priceHistory.length - 1) * width}
            cy={height - ((lastPrice - minPrice) / priceRange) * height}
            r="2"
            fill={strokeColor}
          />
        )}
      </svg>
    </div>
  );
};

export default MiniPriceChart;

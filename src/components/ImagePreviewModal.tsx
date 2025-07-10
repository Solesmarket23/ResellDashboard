'use client';

import { useState, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  productName: string;
  productBrand?: string;
  productSize?: string;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  productName,
  productBrand,
  productSize
}) => {
  const { currentTheme } = useTheme();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setImageLoaded(false);
      setImageError(false);
      setZoom(1);
      setRotation(0);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.2, 0.5));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className={`relative max-w-6xl max-h-[90vh] w-full mx-4 ${currentTheme.colors.cardBackground} rounded-lg shadow-2xl overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${currentTheme.colors.border}`}>
          <div className="flex-1">
            <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} truncate`}>
              {productName}
            </h3>
            {(productBrand || productSize) && (
              <p className={`text-sm ${currentTheme.colors.textSecondary} mt-1`}>
                {productBrand} {productSize && `• ${productSize}`}
              </p>
            )}
          </div>
          
          {/* Controls */}
          <div className="flex items-center space-x-2 ml-4">
            <button
              onClick={handleZoomOut}
              className={`p-2 rounded-lg ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} ${
                currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-100'
              } transition-colors`}
              title="Zoom Out"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            
            <button
              onClick={handleZoomIn}
              className={`p-2 rounded-lg ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} ${
                currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-100'
              } transition-colors`}
              title="Zoom In"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            
            <button
              onClick={handleRotate}
              className={`p-2 rounded-lg ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} ${
                currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-100'
              } transition-colors`}
              title="Rotate"
            >
              <RotateCw className="w-5 h-5" />
            </button>
            
            <div className={`px-3 py-1 rounded-lg ${currentTheme.colors.textSecondary} text-sm font-medium`}>
              {Math.round(zoom * 100)}%
            </div>
            
            <button
              onClick={onClose}
              className={`p-2 rounded-lg ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} ${
                currentTheme.name === 'Neon' ? 'hover:bg-white/10' : 'hover:bg-gray-100'
              } transition-colors`}
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image Container */}
        <div className="relative overflow-hidden" style={{ height: 'calc(90vh - 120px)' }}>
          <div className="absolute inset-0 flex items-center justify-center p-4">
            {!imageLoaded && !imageError && (
              <div className="flex flex-col items-center space-y-4">
                <div className={`w-8 h-8 border-2 border-transparent border-t-current rounded-full animate-spin ${currentTheme.colors.accent}`}></div>
                <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Loading image...</p>
              </div>
            )}
            
            {imageError && (
              <div className="flex flex-col items-center space-y-4">
                <div className={`w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center ${currentTheme.colors.textSecondary}`}>
                  <span className="text-2xl">📷</span>
                </div>
                <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Failed to load image</p>
              </div>
            )}
            
            {imageLoaded && !imageError && (
              <img
                src={imageUrl}
                alt={productName}
                className="max-w-full max-h-full object-contain transition-transform duration-200 ease-in-out cursor-grab active:cursor-grabbing"
                style={{ 
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center'
                }}
                draggable={false}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${currentTheme.colors.border} text-center`}>
          <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
            Click outside to close • Use scroll wheel to zoom • Press Escape to close
          </p>
        </div>
      </div>
    </div>
  );
};

export default ImagePreviewModal; 
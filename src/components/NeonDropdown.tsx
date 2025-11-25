'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface NeonDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  isNeon?: boolean;
}

export default function NeonDropdown({ value, onChange, options, className = '', isNeon = false }: NeonDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between w-full min-w-[105px] text-xs px-2 py-1 rounded border focus:outline-none focus:ring-2 whitespace-nowrap ${
          isNeon 
            ? 'bg-gray-700 border-cyan-500/50 text-cyan-400 focus:ring-cyan-500/50 hover:border-cyan-400' 
            : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 hover:border-blue-400'
        } ${className}`}
      >
        <span className="pr-1">{selectedOption?.label || 'Select...'}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className={`absolute z-50 w-full min-w-[135px] mt-1 rounded-md shadow-lg overflow-hidden ${
          isNeon 
            ? 'bg-gray-800 border border-cyan-500/50' 
            : 'bg-white border border-gray-200'
        }`}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                isNeon 
                  ? option.value === value 
                    ? 'bg-cyan-500/20 text-cyan-300' 
                    : 'text-cyan-400 hover:bg-cyan-500/10'
                  : option.value === value 
                    ? 'bg-blue-50 text-blue-900' 
                    : 'text-gray-900 hover:bg-gray-50'
              }`}
            >
              {option.value === value && (
                <span className="mr-2">✓</span>
              )}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
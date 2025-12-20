'use client';

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export type NeonDropdownOption = {
  value: string;
  label: string;
  description?: string;
  group?: string;
  badge?: string; // e.g. "Recommended"
};

interface NeonDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: NeonDropdownOption[];
  className?: string;
  isNeon?: boolean;
}

export default function NeonDropdown({ value, onChange, options, className = '', isNeon = false }: NeonDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const optionIdBase = useMemo(
    () => `neon-dd-${Math.random().toString(36).slice(2)}`,
    []
  );

  const flatOptions = useMemo(() => options, [options]);
  const selectedOption = useMemo(() => flatOptions.find((opt) => opt.value === value), [flatOptions, value]);

  const grouped = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, NeonDropdownOption[]>();
    for (const opt of flatOptions) {
      const g = opt.group || '';
      if (!map.has(g)) {
        map.set(g, []);
        order.push(g);
      }
      map.get(g)!.push(opt);
    }
    return { order, map };
  }, [flatOptions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      const inButton = dropdownRef.current && dropdownRef.current.contains(t);
      const inMenu = menuRef.current && menuRef.current.contains(t);
      if (!inButton && !inMenu) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Position the menu in a portal so it isn't clipped by overflow containers (tables/cards).
  useEffect(() => {
    if (!isOpen) {
      setMenuPos(null);
      return;
    }

    const compute = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuWidth = 320;
      const padding = 8;

      const left = Math.min(
        Math.max(padding, rect.left),
        Math.max(padding, window.innerWidth - menuWidth - padding)
      );
      const top = rect.bottom + 4;
      setMenuPos({ left, top, width: menuWidth });

      // After the menu renders, if it's clipped by viewport bottom, flip it above.
      requestAnimationFrame(() => {
        const m = menuRef.current;
        if (!m) return;
        const mRect = m.getBoundingClientRect();
        const overflowBottom = mRect.bottom > window.innerHeight - padding;
        if (overflowBottom) {
          const aboveTop = Math.max(padding, rect.top - mRect.height - 4);
          setMenuPos({ left, top: aboveTop, width: menuWidth });
        }
      });
    };

    compute();
    window.addEventListener('resize', compute);
    // capture scroll events from scrollable parents too
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
      return;
    }
    const idx = flatOptions.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [isOpen, flatOptions, value]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!isOpen && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
            e.preventDefault();
            setIsOpen(true);
            return;
          }
          if (!isOpen) return;

          if (e.key === 'Escape') {
            e.preventDefault();
            setIsOpen(false);
            buttonRef.current?.focus();
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(flatOptions.length - 1, (i < 0 ? 0 : i + 1)));
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(0, (i < 0 ? 0 : i - 1)));
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            const opt = flatOptions[activeIndex];
            if (opt) {
              onChange(opt.value);
              setIsOpen(false);
              buttonRef.current?.focus();
            }
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${optionIdBase}-listbox`}
        className={`flex items-center justify-between w-full min-w-[105px] text-xs px-2 py-1 rounded border focus:outline-none focus:ring-2 whitespace-nowrap ${
          isNeon 
            ? 'bg-gray-700 border-cyan-500/50 text-cyan-400 focus:ring-cyan-500/50 hover:border-cyan-400' 
            : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 hover:border-blue-400'
        } ${className}`}
        title={selectedOption?.label || 'Select…'}
      >
        <span className="pr-1 truncate">{selectedOption?.label || 'Select…'}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={`${optionIdBase}-listbox`}
              role="listbox"
              className={`fixed z-[9999] rounded-md shadow-lg overflow-hidden ${
                isNeon ? 'bg-gray-800 border border-cyan-500/50' : 'bg-white border border-gray-200'
              }`}
              style={{
                left: menuPos.left,
                top: menuPos.top,
                width: menuPos.width,
                maxWidth: 'min(90vw, 320px)'
              }}
            >
              <div className="max-h-[320px] overflow-auto">
                {grouped.order.map((groupName) => (
                  <div key={groupName || '__ungrouped'}>
                    {groupName ? (
                      <div
                        className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${
                          isNeon ? 'text-gray-400 bg-gray-900/40' : 'text-gray-500 bg-gray-50'
                        }`}
                      >
                        {groupName}
                      </div>
                    ) : null}

                    {grouped.map.get(groupName)!.map((option) => {
                      const idx = flatOptions.findIndex((o) => o.value === option.value);
                      const isSelected = option.value === value;
                      const isActive = idx === activeIndex;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => {
                            onChange(option.value);
                            setIsOpen(false);
                            buttonRef.current?.focus();
                          }}
                          className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                            isNeon
                              ? isSelected
                                ? 'bg-cyan-500/20 text-cyan-200'
                                : isActive
                                  ? 'bg-cyan-500/10 text-cyan-300'
                                  : 'text-cyan-400 hover:bg-cyan-500/10'
                              : isSelected
                                ? 'bg-blue-50 text-blue-900'
                                : isActive
                                  ? 'bg-gray-50 text-gray-900'
                                  : 'text-gray-900 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {isSelected ? <span className="flex-shrink-0">✓</span> : <span className="w-[12px]" />}
                              <span className="font-semibold truncate">{option.label}</span>
                            </div>
                            {option.badge ? (
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${
                                  isNeon
                                    ? 'border-cyan-500/40 text-cyan-200 bg-cyan-500/10'
                                    : 'border-blue-300 text-blue-800 bg-blue-50'
                                }`}
                              >
                                {option.badge}
                              </span>
                            ) : null}
                          </div>
                          {option.description ? (
                            <div className={`mt-0.5 text-[11px] leading-snug ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                              {option.description}
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  placeholder?: string;
  dropdownPosition?: 'top' | 'bottom' | 'auto';
  variant?: 'default' | 'gradient' | 'premium';
}

const DatePicker: React.FC<DatePickerProps> = ({ 
  value, 
  onChange, 
  placeholder = 'Select date', 
  dropdownPosition = 'auto',
  variant = 'default' 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value.getFullYear(), value.getMonth()) : new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Enhanced modal detection with better patterns
  const isInModal = containerRef.current ? (
    containerRef.current.closest('[role="dialog"]') !== null ||
    containerRef.current.closest('.fixed') !== null ||
    containerRef.current.closest('[data-modal]') !== null ||
    containerRef.current.closest('[style*="fixed"]') !== null ||
    containerRef.current.closest('[style*="radial-gradient"]') !== null ||
    containerRef.current.closest('[class*="modal"]') !== null ||
    containerRef.current.closest('[class*="backdrop"]') !== null ||
    variant === 'premium'
  ) : variant === 'premium';

  // Smart positioning calculation
  const calculatePosition = () => {
    if (!containerRef.current) return { top: 0, left: 0, position: 'bottom' as const };

    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const calendarHeight = 400;
    const calendarWidth = 320;
    const padding = 16; // Minimum padding from screen edges

    // Calculate optimal vertical position
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    let finalPosition: 'top' | 'bottom' = 'bottom';
    let topPosition = 0;

    if (dropdownPosition === 'top' && spaceAbove >= calendarHeight + padding) {
      finalPosition = 'top';
      topPosition = rect.top - calendarHeight - 10;
    } else if (dropdownPosition === 'bottom' && spaceBelow >= calendarHeight + padding) {
      finalPosition = 'bottom';
      topPosition = rect.bottom + 10;
    } else if (dropdownPosition === 'auto') {
      if (spaceBelow >= calendarHeight + padding) {
        finalPosition = 'bottom';
        topPosition = rect.bottom + 10;
      } else if (spaceAbove >= calendarHeight + padding) {
        finalPosition = 'top';
        topPosition = rect.top - calendarHeight - 10;
      } else {
        // Not enough space either way, choose the side with more space
        if (spaceAbove > spaceBelow) {
          finalPosition = 'top';
          topPosition = Math.max(padding, rect.top - calendarHeight - 10);
        } else {
          finalPosition = 'bottom';
          topPosition = Math.min(rect.bottom + 10, viewportHeight - calendarHeight - padding);
        }
      }
    }

    // Calculate optimal horizontal position
    let leftPosition = rect.left;
    
    // Check if calendar would overflow right edge
    if (rect.left + calendarWidth > viewportWidth - padding) {
      // Align to right edge of input if possible
      leftPosition = Math.max(padding, rect.right - calendarWidth);
    }
    
    // Ensure it doesn't overflow left edge
    leftPosition = Math.max(padding, leftPosition);

    return {
      top: topPosition,
      left: leftPosition,
      position: finalPosition
    };
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentMonth);
    const firstDay = getFirstDayOfMonth(currentMonth);
    const days = [];

    // Previous month's trailing days
    const prevMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
    const daysInPrevMonth = getDaysInMonth(prevMonth);
    
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
        date: new Date(prevMonth.getFullYear(), prevMonth.getMonth(), daysInPrevMonth - i)
      });
    }

    // Current month's days
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      const isToday = date.toDateString() === today.toDateString();
      const isSelected = value && date.toDateString() === value.toDateString();
      
      days.push({
        day,
        isCurrentMonth: true,
        isToday,
        isSelected,
        date
      });
    }

    // Next month's leading days
    const remainingDays = 42 - days.length; // 6 rows × 7 days
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
    
    for (let day = 1; day <= remainingDays; day++) {
      days.push({
        day,
        isCurrentMonth: false,
        isToday: false,
        isSelected: false,
        date: new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day)
      });
    }

    return days;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      if (direction === 'prev') {
        newMonth.setMonth(prev.getMonth() - 1);
      } else {
        newMonth.setMonth(prev.getMonth() + 1);
      }
      return newMonth;
    });
  };

  const selectDate = (date: Date) => {
    onChange(date);
    setIsOpen(false);
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth()));
    onChange(today);
    setIsOpen(false);
  };

  const clearDate = () => {
    setIsOpen(false);
  };

  const formatDisplayDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const calendarDays = generateCalendarDays();
  const position = isOpen ? calculatePosition() : { top: 0, left: 0, position: 'bottom' as const };

  return (
    <div className="relative" ref={containerRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`cursor-pointer flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl transition-all duration-300 border-2 text-sm sm:text-base ${
          variant === 'gradient'
            ? 'bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-cyan-500/20 border-blue-300/50 hover:border-blue-400/70 backdrop-blur-sm'
            : 'bg-slate-800/50 border-slate-600/50 hover:border-slate-500/70 backdrop-blur-sm'
        }`}
        style={variant === 'premium' ? {
          background: 'linear-gradient(135deg, rgba(30,41,59,0.8), rgba(51,65,85,0.9))',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
        } : {}}
      >
        <div className="flex items-center min-w-0">
          <Calendar className={`w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-3 flex-shrink-0 ${
            variant === 'gradient' ? 'text-blue-600' : 'text-slate-300'
          }`} />
          <span className={`truncate ${
            variant === 'gradient'
              ? (value ? 'text-white font-medium' : 'text-white/70')
              : (value ? 'text-white font-semibold tracking-wide' : 'text-slate-400 font-medium')
          }`}>
            {value ? formatDisplayDate(value) : placeholder}
          </span>
        </div>
      </div>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Calendar Dropdown */}
          <div 
            className={`${
              isInModal 
                ? 'fixed z-[200]' 
                : 'absolute z-[100]'
            } w-72 sm:w-80 bg-gradient-to-br from-white via-blue-50 to-purple-50 rounded-xl shadow-2xl border border-purple-200/50 overflow-hidden backdrop-blur-sm`}
            style={isInModal ? {
              top: `${position.top}px`,
              left: `${position.left}px`,
            } : {
              top: position.position === 'bottom' ? '100%' : 'auto',
              bottom: position.position === 'top' ? '100%' : 'auto',
              left: '0',
              marginTop: position.position === 'bottom' ? '8px' : undefined,
              marginBottom: position.position === 'top' ? '8px' : undefined
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-white/30 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-cyan-500/10 backdrop-blur-sm">
              <button
                onClick={() => navigateMonth('prev')}
                className="p-1.5 sm:p-2 hover:bg-gradient-to-r hover:from-blue-500/20 hover:to-indigo-500/20 rounded-lg transition-all duration-300 backdrop-blur-sm touch-manipulation"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4 text-gray-700" />
              </button>
              
              <h3 className="text-base sm:text-lg font-bold text-gray-800 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent text-center flex-1 mx-2 truncate">
                {months[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </h3>
              
              <button
                onClick={() => navigateMonth('next')}
                className="p-1.5 sm:p-2 hover:bg-gradient-to-r hover:from-indigo-500/20 hover:to-cyan-500/20 rounded-lg transition-all duration-300 backdrop-blur-sm touch-manipulation"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4 text-gray-700" />
              </button>
            </div>

            {/* Week days */}
            <div className="grid grid-cols-7 border-b border-white/30 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-cyan-500/10">
              {weekDays.map(day => (
                <div key={day} className="p-2 sm:p-3 text-center text-xs sm:text-sm font-bold text-gray-700">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 p-2 sm:p-3 gap-1 max-h-64 overflow-hidden">
              {calendarDays.map((dayObj, index) => (
                <button
                  key={index}
                  onClick={() => selectDate(dayObj.date)}
                  className={`p-2 sm:p-3 text-xs sm:text-sm rounded-lg transition-all duration-300 relative overflow-hidden group touch-manipulation ${
                    dayObj.isSelected
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg font-bold'
                      : dayObj.isToday
                      ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-800 font-bold border-2 border-purple-400/50'
                      : dayObj.isCurrentMonth
                      ? 'text-gray-800 hover:bg-gradient-to-r hover:from-blue-500/20 hover:to-indigo-500/20 font-medium'
                      : 'text-gray-400 hover:bg-gray-100/50'
                  }`}
                >
                  {dayObj.day}
                  {dayObj.isSelected && (
                    <div className="absolute inset-0 bg-white/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  )}
                </button>
              ))}
            </div>

            {/* Footer with improved mobile buttons */}
            <div className="flex items-center justify-between p-3 border-t border-white/30 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-cyan-500/10">
              <button
                onClick={clearDate}
                className="text-xs sm:text-sm text-gray-600 hover:text-gray-800 transition-all duration-300 hover:bg-gradient-to-r hover:from-red-500/20 hover:to-orange-500/20 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg touch-manipulation"
              >
                Clear
              </button>
              <button
                onClick={goToToday}
                className="text-xs sm:text-sm font-bold px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-all duration-300 bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:scale-105 touch-manipulation"
              >
                Today
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DatePicker; 
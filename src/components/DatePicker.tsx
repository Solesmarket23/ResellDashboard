'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  placeholder: string;
  variant?: 'gradient' | 'premium';
}

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, placeholder, variant = 'gradient' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dropdownPosition, setDropdownPosition] = useState<'top' | 'bottom'>('bottom');
  const containerRef = useRef<HTMLDivElement>(null);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const formatDisplayDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleDateSelect = (date: Date) => {
    onChange(formatDate(date));
    setIsOpen(false);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    onChange(formatDate(today));
    setIsOpen(false);
  };

  const clearDate = () => {
    onChange('');
    setIsOpen(false);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date: Date) => {
    if (!value) return false;
    const selectedDate = new Date(value + 'T00:00:00');
    return date.toDateString() === selectedDate.toDateString();
  };

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const calendarHeight = 380;

      // Check if we're in a modal (premium variant with specific parent selectors)
      const isInsideModal = containerRef.current.closest('[style*="radial-gradient"]') !== null;

      if (!isInsideModal && spaceBelow < calendarHeight) {
        setDropdownPosition('top');
      } else {
        setDropdownPosition('bottom');
      }
    }
  }, [isOpen]);

  const days = getDaysInMonth(currentMonth);
  const isInModal = variant === 'premium';

  return (
    <div className="relative" ref={containerRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`cursor-pointer flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 border-2 ${
          variant === 'gradient'
            ? 'bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-cyan-500/20 border-blue-300/50 hover:border-blue-400/70 backdrop-blur-sm'
            : 'bg-slate-800/50 border-slate-600/50 hover:border-slate-500/70 backdrop-blur-sm'
        }`}
        style={variant === 'premium' ? {
          background: 'linear-gradient(135deg, rgba(30,41,59,0.8), rgba(51,65,85,0.9))',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
        } : {}}
      >
        <div className="flex items-center">
          <Calendar className={`w-5 h-5 mr-3 ${
            variant === 'gradient' ? 'text-blue-600' : 'text-slate-300'
          }`} />
        </div>
        
        <span className={
          variant === 'gradient'
            ? (value ? 'text-white font-medium' : 'text-white/70')
            : (value ? 'text-white font-semibold tracking-wide' : 'text-slate-400 font-medium')
        }>
          {value ? formatDisplayDate(value) : placeholder}
        </span>
      </div>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Calendar Dropdown */}
          {isInModal ? (
            // Fixed positioning for modal context to prevent clipping
            <div 
              className="fixed w-80 bg-gradient-to-br from-white via-blue-50 to-purple-50 rounded-xl shadow-2xl border border-purple-200/50 z-[200] overflow-hidden backdrop-blur-sm"
              style={{
                top: containerRef.current ? (() => {
                  const rect = containerRef.current.getBoundingClientRect();
                  const calendarHeight = 380;
                  const spaceBelow = window.innerHeight - rect.bottom;
                  
                  if (dropdownPosition === 'top' || spaceBelow < calendarHeight) {
                    return Math.max(10, rect.top - calendarHeight - 10);
                  } else {
                    return rect.bottom + 10;
                  }
                })() : 0,
                left: containerRef.current ? (() => {
                  const rect = containerRef.current.getBoundingClientRect();
                  const calendarWidth = 320;
                  const spaceRight = window.innerWidth - rect.left;
                  
                  if (spaceRight < calendarWidth) {
                    return Math.max(10, rect.right - calendarWidth);
                  } else {
                    return rect.left;
                  }
                })() : 0
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/30 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-cyan-500/10 backdrop-blur-sm">
                <button
                  onClick={() => navigateMonth('prev')}
                  className="p-2 hover:bg-gradient-to-r hover:from-blue-500/20 hover:to-indigo-500/20 rounded-lg transition-all duration-300 backdrop-blur-sm"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-700" />
                </button>
                
                <h3 className="text-lg font-bold text-gray-800 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  {months[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </h3>
                
                <button
                  onClick={() => navigateMonth('next')}
                  className="p-2 hover:bg-gradient-to-r hover:from-indigo-500/20 hover:to-cyan-500/20 rounded-lg transition-all duration-300 backdrop-blur-sm"
                >
                  <ChevronRight className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              {/* Week days */}
              <div className="grid grid-cols-7 border-b border-white/30 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-cyan-500/10">
                {weekDays.map(day => (
                  <div key={day} className="p-3 text-center text-sm font-bold text-gray-700">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 p-2">
                {days.map((day, index) => (
                  <div key={index} className="p-1">
                    {day ? (
                      <button
                        onClick={() => handleDateSelect(day)}
                        className={`w-10 h-10 rounded-lg text-sm font-bold transition-all duration-300 transform hover:scale-105 ${
                          isSelected(day)
                            ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30'
                            : isToday(day)
                            ? 'bg-gradient-to-r from-blue-400 to-blue-500 text-white shadow-md hover:shadow-lg'
                            : 'hover:bg-gradient-to-r hover:from-blue-500/20 hover:to-indigo-500/20 text-gray-700 hover:text-gray-900 hover:shadow-md'
                        }`}
                      >
                        {day.getDate()}
                      </button>
                    ) : (
                      <div className="w-10 h-10" />
                    )}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-3 border-t border-white/30 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-cyan-500/10">
                <button
                  onClick={clearDate}
                  className="text-sm text-gray-600 hover:text-gray-800 transition-all duration-300 hover:bg-gradient-to-r hover:from-red-500/20 hover:to-orange-500/20 px-2 py-1 rounded-lg"
                >
                  Clear
                </button>
                <button
                  onClick={goToToday}
                  className="text-sm font-bold px-4 py-2 rounded-lg transition-all duration-300 bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  Today
                </button>
              </div>
            </div>
          ) : (
            // Regular absolute positioning for non-modal context
            <div className={`absolute left-0 w-80 bg-gradient-to-br from-white via-blue-50 to-purple-50 rounded-xl shadow-2xl border border-purple-200/50 z-[100] overflow-hidden backdrop-blur-sm ${
              dropdownPosition === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
            }`}>
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-white/30 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-cyan-500/10 backdrop-blur-sm">
                <button
                  onClick={() => navigateMonth('prev')}
                  className="p-2 hover:bg-gradient-to-r hover:from-blue-500/20 hover:to-indigo-500/20 rounded-lg transition-all duration-300 backdrop-blur-sm"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-700" />
                </button>
                
                <h3 className="text-lg font-bold text-gray-800 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  {months[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </h3>
                
                <button
                  onClick={() => navigateMonth('next')}
                  className="p-2 hover:bg-gradient-to-r hover:from-indigo-500/20 hover:to-cyan-500/20 rounded-lg transition-all duration-300 backdrop-blur-sm"
                >
                  <ChevronRight className="w-4 h-4 text-gray-700" />
                </button>
              </div>

              {/* Week days */}
              <div className="grid grid-cols-7 border-b border-white/30 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-cyan-500/10">
                {weekDays.map(day => (
                  <div key={day} className="p-3 text-center text-sm font-bold text-gray-700">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 p-2">
                {days.map((day, index) => (
                  <div key={index} className="p-1">
                    {day ? (
                      <button
                        onClick={() => handleDateSelect(day)}
                        className={`w-10 h-10 rounded-lg text-sm font-bold transition-all duration-300 transform hover:scale-105 ${
                          isSelected(day)
                            ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30'
                            : isToday(day)
                            ? 'bg-gradient-to-r from-blue-400 to-blue-500 text-white shadow-md hover:shadow-lg'
                            : 'hover:bg-gradient-to-r hover:from-blue-500/20 hover:to-indigo-500/20 text-gray-700 hover:text-gray-900 hover:shadow-md'
                        }`}
                      >
                        {day.getDate()}
                      </button>
                    ) : (
                      <div className="w-10 h-10" />
                    )}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-3 border-t border-white/30 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-cyan-500/10">
                <button
                  onClick={clearDate}
                  className="text-sm text-gray-600 hover:text-gray-800 transition-all duration-300 hover:bg-gradient-to-r hover:from-red-500/20 hover:to-orange-500/20 px-2 py-1 rounded-lg"
                >
                  Clear
                </button>
                <button
                  onClick={goToToday}
                  className="text-sm font-bold px-4 py-2 rounded-lg transition-all duration-300 bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  Today
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DatePicker; 
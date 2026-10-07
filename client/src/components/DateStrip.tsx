import React from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { getBookableDates } from '../utils/date.js';

interface DateStripProps {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  timezone: string;
}

export const DateStrip: React.FC<DateStripProps> = ({
  selectedDate,
  onSelectDate,
  timezone,
}) => {
  const dates = React.useMemo(() => getBookableDates(14, timezone), [timezone]);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = direction === 'left' ? -250 : 250;
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Select Class Date
          </span>
          <span className="text-xs text-slate-500">(Next 14 Days)</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scroll('left')}
            className="p-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="p-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 no-scrollbar scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {dates.map((item) => {
          const isSelected = item.isoDate === selectedDate;
          return (
            <button
              key={item.isoDate}
              type="button"
              onClick={() => onSelectDate(item.isoDate)}
              className={`flex-shrink-0 flex flex-col items-center justify-center min-w-[76px] py-2.5 px-3 rounded-xl border transition-all ${
                isSelected
                  ? 'bg-gradient-to-b from-indigo-600 to-indigo-700 border-indigo-400 text-white shadow-lg shadow-indigo-600/30 scale-105'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              <span
                className={`text-[11px] font-semibold uppercase tracking-wider ${
                  isSelected ? 'text-indigo-100' : 'text-slate-400'
                }`}
              >
                {item.isToday ? 'Today' : item.isTomorrow ? 'Tmrw' : item.dayOfWeek}
              </span>
              <span
                className={`text-xl font-bold my-0.5 ${
                  isSelected ? 'text-white' : 'text-slate-200'
                }`}
              >
                {item.dayNumber}
              </span>
              <span
                className={`text-[10px] font-medium uppercase ${
                  isSelected ? 'text-indigo-200' : 'text-slate-500'
                }`}
              >
                {item.monthName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

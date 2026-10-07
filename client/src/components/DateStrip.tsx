import { useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ArrowRight, AlertCircle } from 'lucide-react';
import { getBookableDates } from '../utils/date.js';
import type { DayAvailability } from '../types/index.js';

interface DateStripProps {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  timezone: string;
  availability?: DayAvailability[];
}

export const DateStrip = ({
  selectedDate,
  onSelectDate,
  timezone,
  availability = [],
}: DateStripProps) => {
  const dates = useMemo(() => getBookableDates(14, timezone), [timezone]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Map of date string -> availability
  const availMap = useMemo(() => {
    const map = new Map<string, DayAvailability>();
    for (const item of availability) {
      map.set(item.date, item);
    }
    return map;
  }, [availability]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = direction === 'left' ? -250 : 250;
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // Find next available day if selected date is fully booked
  const selectedDayInfo = availMap.get(selectedDate);
  const isSelectedDateFullyBooked = selectedDayInfo ? !selectedDayInfo.hasAvailability : false;

  const nextAvailableDay = useMemo(() => {
    const currentIdx = dates.findIndex((d) => d.isoDate === selectedDate);
    if (currentIdx === -1) return null;
    for (let i = currentIdx + 1; i < dates.length; i++) {
      const dayAvail = availMap.get(dates[i].isoDate);
      if (!dayAvail || dayAvail.hasAvailability) {
        return dates[i];
      }
    }
    return null;
  }, [dates, selectedDate, availMap]);

  return (
    <div className="space-y-3">
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
          const dayAvail = availMap.get(item.isoDate);
          // If we have availability data, check if it's explicitly fully booked
          const isFullyBooked = dayAvail ? !dayAvail.hasAvailability : false;
          const isLimited = dayAvail ? dayAvail.limited : false;

          return (
            <button
              key={item.isoDate}
              type="button"
              disabled={isFullyBooked}
              onClick={() => onSelectDate(item.isoDate)}
              title={isFullyBooked ? 'Fully booked' : isLimited ? 'Few slots left' : undefined}
              className={`relative flex-shrink-0 flex flex-col items-center justify-center min-w-[80px] py-2 px-2.5 rounded-xl border transition-all ${
                isFullyBooked
                  ? 'bg-slate-950/40 border-slate-900 text-slate-600 cursor-not-allowed opacity-50'
                  : isSelected
                  ? 'bg-gradient-to-b from-indigo-600 to-indigo-700 border-indigo-400 text-white shadow-lg shadow-indigo-600/30 scale-105'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  isSelected ? 'text-indigo-100' : isFullyBooked ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                {item.isToday ? 'Today' : item.isTomorrow ? 'Tmrw' : item.dayOfWeek}
              </span>
              <span
                className={`text-lg font-bold my-0.5 ${
                  isSelected ? 'text-white' : isFullyBooked ? 'text-slate-600 line-through' : 'text-slate-200'
                }`}
              >
                {item.dayNumber}
              </span>

              {/* Status Indicator */}
              {isFullyBooked ? (
                <span className="text-[9px] font-medium text-rose-400/80 bg-rose-950/40 px-1 rounded">
                  Full
                </span>
              ) : isLimited ? (
                <span className={`text-[9px] font-medium px-1 rounded ${
                  isSelected ? 'bg-amber-400/20 text-amber-200' : 'bg-amber-500/10 text-amber-400'
                }`}>
                  Limited
                </span>
              ) : (
                <span
                  className={`text-[10px] font-medium uppercase ${
                    isSelected ? 'text-indigo-200' : 'text-slate-500'
                  }`}
                >
                  {item.monthName}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* "Jump to next available day" button when selected date is full */}
      {isSelectedDateFullyBooked && nextAvailableDay && (
        <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-between text-xs animate-fade-in">
          <div className="flex items-center gap-2 text-amber-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>This day is fully booked. Next open day is <strong>{nextAvailableDay.displayLabel}</strong>.</span>
          </div>
          <button
            type="button"
            onClick={() => onSelectDate(nextAvailableDay.isoDate)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition"
          >
            <span>Jump to {nextAvailableDay.dayOfWeek}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

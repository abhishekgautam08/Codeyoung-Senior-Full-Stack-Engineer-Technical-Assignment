import React from 'react';
import { Sun, Sunset, Moon, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import type { SlotItem } from '../types/index.js';

interface SlotGridProps {
  slots: SlotItem[];
  selectedSlot: SlotItem | null;
  onSelectSlot: (slot: SlotItem) => void;
  isLoading: boolean;
  parentTimezone: string;
}

export const SlotGrid: React.FC<SlotGridProps> = ({
  slots,
  selectedSlot,
  onSelectSlot,
  isLoading,
  parentTimezone,
}) => {
  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((g) => (
          <div key={g} className="space-y-3">
            <div className="h-5 w-32 bg-slate-800/80 rounded animate-pulse" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl bg-slate-900/60 border border-slate-800/60 animate-pulse"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Filter and group by time of day
  const morning = slots.filter((s) => s.timeOfDay === 'morning');
  const afternoon = slots.filter((s) => s.timeOfDay === 'afternoon');
  const evening = slots.filter((s) => s.timeOfDay === 'evening' || s.timeOfDay === 'night');

  const groups = [
    { label: 'Morning Slots', icon: Sun, slots: morning, color: 'text-amber-400' },
    { label: 'Afternoon Slots', icon: Sunset, slots: afternoon, color: 'text-orange-400' },
    { label: 'Evening Slots', icon: Moon, slots: evening, color: 'text-indigo-400' },
  ].filter((g) => g.slots.length > 0);

  const availableCount = slots.filter((s) => s.isAvailable && s.isBookable).length;

  if (slots.length === 0 || availableCount === 0) {
    return (
      <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800 text-center">
        <AlertCircle className="w-10 h-10 text-amber-400/80 mx-auto mb-3" />
        <h4 className="text-base font-semibold text-slate-200">No Slots Available for this Date</h4>
        <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
          All mentor slots on this date are either fully booked, past the 2-hour lead time, or outside mentor working windows (15:00–05:00 IST).
        </p>
        <p className="text-xs text-indigo-400 mt-3 font-medium">
          💡 Try picking the next day or a different timezone above to view open slots.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-[11px] text-slate-400 font-mono">
        Showing all available 30-min slots in your local timezone: <span className="text-indigo-400">{parentTimezone}</span>
      </div>
      {groups.map(({ label, icon: Icon, slots: groupSlots, color }) => (
        <div key={label} className="space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
            <Icon className={`w-4 h-4 ${color}`} />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {label}
            </h4>
            <span className="text-[11px] text-slate-500 font-medium">
              ({groupSlots.filter((s) => s.isAvailable && s.isBookable).length} open)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {groupSlots.map((slot) => {
              const isSelected = selectedSlot?.slotStartUtc === slot.slotStartUtc;
              const canBook = slot.isAvailable && slot.isBookable;

              return (
                <button
                  key={slot.slotStartUtc}
                  type="button"
                  disabled={!canBook}
                  onClick={() => onSelectSlot(slot)}
                  className={`relative p-3 rounded-xl text-left border transition-all flex flex-col justify-between min-h-[82px] ${
                    isSelected
                      ? 'bg-gradient-to-br from-indigo-600/30 via-indigo-900/40 to-slate-900 border-indigo-400 ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-500/20'
                      : canBook
                      ? 'bg-slate-900/80 border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 hover:shadow-md cursor-pointer'
                      : 'bg-slate-950/40 border-slate-900 opacity-45 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 w-full">
                    <div>
                      <div className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                        <span>{slot.localStartTime}</span>
                        <span className="text-xs font-normal text-slate-400">
                          – {slot.localEndTime}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5 font-mono">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{slot.mentorIstInfo.formatted}</span>
                      </div>
                    </div>

                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="mt-2 flex items-center justify-between text-[10px]">
                    {canBook ? (
                      <span className="font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                        {slot.availableMentorsCount} mentor{slot.availableMentorsCount > 1 ? 's' : ''} free
                      </span>
                    ) : (
                      <span className="font-normal text-slate-500 italic">
                        {slot.disabledReason || 'Unavailable'}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

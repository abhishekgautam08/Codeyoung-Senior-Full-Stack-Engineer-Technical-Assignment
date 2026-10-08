import React, { useState, useMemo } from 'react';
import { Globe, Search, Check, ChevronDown, Sparkles } from 'lucide-react';
import type { SuggestedTimezoneGroup } from '../types/index.js';

interface TimezoneSelectorProps {
  selectedTimezone: string;
  onSelectTimezone: (tz: string) => void;
  timezoneGroups?: SuggestedTimezoneGroup[];
}

export const TimezoneSelector: React.FC<TimezoneSelectorProps> = ({
  selectedTimezone,
  onSelectTimezone,
  timezoneGroups = [],
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Fallback defaults if groups haven't loaded yet
  const defaultGroups: SuggestedTimezoneGroup[] = useMemo(() => [
    {
      group: 'North America (US & Canada)',
      zones: [
        { id: 'America/New_York', label: 'US Eastern (New York, Atlanta, Miami)', offset: 'UTC-4 / UTC-5', region: 'US' },
        { id: 'America/Chicago', label: 'US Central (Chicago, Dallas, Houston)', offset: 'UTC-5 / UTC-6', region: 'US' },
        { id: 'America/Denver', label: 'US Mountain (Denver, Salt Lake City)', offset: 'UTC-6 / UTC-7', region: 'US' },
        { id: 'America/Phoenix', label: 'US Mountain - Arizona (No DST)', offset: 'UTC-7', region: 'US' },
        { id: 'America/Los_Angeles', label: 'US Pacific (Los Angeles, Seattle, SF)', offset: 'UTC-7 / UTC-8', region: 'US' },
        { id: 'America/Toronto', label: 'Canada Eastern (Toronto, Montreal)', offset: 'UTC-4 / UTC-5', region: 'CA' },
        { id: 'America/Vancouver', label: 'Canada Pacific (Vancouver)', offset: 'UTC-7 / UTC-8', region: 'CA' },
      ],
    },
    {
      group: 'Europe & United Kingdom',
      zones: [
        { id: 'Europe/London', label: 'UK (London, Edinburgh, Manchester)', offset: 'UTC+1 (BST) / UTC+0 (GMT)', region: 'UK' },
        { id: 'Europe/Dublin', label: 'Ireland (Dublin, Cork, Galway)', offset: 'UTC+1 (IST) / UTC+0 (GMT)', region: 'IE' },
        { id: 'Europe/Paris', label: 'Central European (Paris, Berlin, Amsterdam)', offset: 'UTC+2 / UTC+1', region: 'EU' },
      ],
    },
    {
      group: 'India & Asia Pacific',
      zones: [
        { id: 'Asia/Kolkata', label: 'India (IST - All Mentors Local Time)', offset: 'UTC+5:30 (Fixed)', region: 'IN' },
        { id: 'Asia/Dubai', label: 'Gulf Standard Time (Dubai, Abu Dhabi)', offset: 'UTC+4', region: 'AE' },
        { id: 'Asia/Singapore', label: 'Singapore Standard Time (SGT)', offset: 'UTC+8', region: 'SG' },
        { id: 'Australia/Sydney', label: 'Australian Eastern (Sydney, Melbourne)', offset: 'UTC+10 / UTC+11', region: 'AU' },
      ],
    },
  ], []);

  const groupsToUse =
    Array.isArray(timezoneGroups) && timezoneGroups.length > 0
      ? timezoneGroups
      : defaultGroups;

  // Flattened zones for search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groupsToUse;
    const query = search.toLowerCase();
    return groupsToUse
      .map((g) => ({
        ...g,
        zones: g.zones.filter(
          (z) =>
            z.id.toLowerCase().includes(query) ||
            z.label.toLowerCase().includes(query) ||
            z.offset.toLowerCase().includes(query)
        ),
      }))
      .filter((g) => g.zones.length > 0);
  }, [groupsToUse, search]);

  const selectedZoneInfo = useMemo(() => {
    for (const group of groupsToUse) {
      const match = group.zones.find((z) => z.id === selectedTimezone);
      if (match) return match;
    }
    return {
      id: selectedTimezone,
      label: selectedTimezone,
      offset: '',
      region: '',
    };
  }, [groupsToUse, selectedTimezone]);

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
        Your Local Timezone
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-700/80 text-left hover:border-indigo-500/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition shadow-sm"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <span className="truncate">{selectedZoneInfo.label}</span>
              {selectedTimezone === 'Asia/Kolkata' && (
                <span className="text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.2 rounded">
                  Mentor Local
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
              <span>{selectedZoneInfo.id}</span>
              {selectedZoneInfo.offset && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400">{selectedZoneInfo.offset}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-50 mt-2 w-full max-h-96 overflow-hidden rounded-xl bg-slate-900 border border-slate-700 shadow-2xl backdrop-blur-xl flex flex-col">
            {/* Search input */}
            <div className="p-3 border-b border-slate-800 flex items-center gap-2 bg-slate-950/60">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country, city, or timezone (e.g. London, Chicago, IST)..."
                className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                autoFocus
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Clear
                </button>
              )}
            </div>

            {/* List */}
            <div className="overflow-y-auto max-h-80 p-2 space-y-4">
              {filteredGroups.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-400">
                  No timezones matching &quot;{search}&quot;. Try typing your city or region name.
                </div>
              ) : (
                filteredGroups.map((group) => (
                  <div key={group.group}>
                    <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-400/90">
                      {group.group}
                    </div>
                    <div className="space-y-1 mt-1">
                      {group.zones.map((zone) => {
                        const isSelected = zone.id === selectedTimezone;
                        return (
                          <button
                            key={zone.id}
                            type="button"
                            onClick={() => {
                              onSelectTimezone(zone.id);
                              setIsOpen(false);
                              setSearch('');
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition ${
                              isSelected
                                ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-200'
                                : 'hover:bg-slate-800 text-slate-300'
                            }`}
                          >
                            <div>
                              <div className="font-medium text-slate-200 flex items-center gap-2">
                                <span>{zone.label}</span>
                                {zone.id === 'Asia/Kolkata' && (
                                  <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1 rounded">
                                    Mentor IST
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                {zone.id} {zone.offset ? `• ${zone.offset}` : ''}
                              </div>
                            </div>
                            {isSelected && (
                              <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer note */}
            <div className="p-2.5 bg-slate-950/80 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Automatic Daylight Saving Time (DST) adjustments applied
              </span>
              <span className="text-slate-500 font-mono">Mentors in IST (UTC+5:30)</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

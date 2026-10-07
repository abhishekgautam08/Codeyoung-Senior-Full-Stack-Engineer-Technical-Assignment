import React from 'react';
import { Sparkles, Calendar, Users, Activity, Clock } from 'lucide-react';

interface HeaderProps {
  activeTab: 'book' | 'mentor' | 'status';
  onTabChange: (tab: 'book' | 'mentor' | 'status') => void;
  timezone: string;
  onOpenTzPicker?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  timezone,
  onOpenTzPicker,
}) => {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-amber-400 p-[1px] shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                  Codeyoung
                </span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Trial Booking
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                1:1 Live Coding for Kids (Ages 5–17)
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => onTabChange('book')}
              className={`flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'book'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Book Trial</span>
            </button>

            <button
              onClick={() => onTabChange('mentor')}
              className={`flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'mentor'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Mentor Schedule</span>
            </button>

            <button
              onClick={() => onTabChange('status')}
              className={`flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                activeTab === 'status'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span className="hidden md:inline">System Status</span>
              <span className="md:hidden">Status</span>
            </button>
          </nav>

          {/* Timezone pill button */}
          <div className="hidden lg:flex items-center gap-3">
            <button
              onClick={onOpenTzPicker}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:border-slate-700 hover:bg-slate-850 transition"
              title="Click to change timezone"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-mono text-[11px] text-indigo-300">{timezone}</span>
              <span className="text-[10px] text-slate-500">(Mentor: IST)</span>
            </button>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px]">Online</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

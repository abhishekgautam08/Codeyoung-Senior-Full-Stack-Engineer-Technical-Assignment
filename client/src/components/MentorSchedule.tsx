import React, { useState, useEffect } from 'react';
import {
  Users,
  Calendar,
  Clock,
  Video,
  User,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CalendarDays,
} from 'lucide-react';
import { api } from '../api/client.js';
import type { Mentor, MentorScheduleResponse } from '../types/index.js';
import { formatIstTime } from '../utils/date.js';
import { DateTime } from 'luxon';

export const MentorSchedule: React.FC = () => {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [selectedMentorId, setSelectedMentorId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(
    DateTime.now().setZone('Asia/Kolkata').toFormat('yyyy-MM-dd')
  );
  const [schedule, setSchedule] = useState<MentorScheduleResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch mentors on mount
  useEffect(() => {
    async function loadMentors() {
      try {
        setIsLoading(true);
        const data = await api.getMentors();
        setMentors(data);
        if (data.length > 0) {
          setSelectedMentorId(data[0]._id);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load mentors');
      } finally {
        setIsLoading(false);
      }
    }
    loadMentors();
  }, []);

  // Fetch schedule when mentor or date changes
  useEffect(() => {
    if (!selectedMentorId) return;

    async function loadSchedule() {
      try {
        setIsLoadingSchedule(true);
        const data = await api.getMentorSchedule(selectedMentorId, selectedDate);
        setSchedule(data);
      } catch (err: any) {
        console.error('Failed to load schedule:', err);
      } finally {
        setIsLoadingSchedule(false);
      }
    }
    loadSchedule();
  }, [selectedMentorId, selectedDate]);

  const selectedMentor = mentors.find((m) => m._id === selectedMentorId);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-3">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-sm text-slate-400">Loading mentor database...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-center max-w-lg mx-auto">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
        <p className="text-sm text-rose-200">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Mentor Selection Bar */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              Mentor Daily Rosters & Capacity
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict limit of max 2 trial sessions per mentor per IST calendar day.
            </p>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Mentor selector pills/select */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
          {mentors.map((m) => {
            const isSelected = m._id === selectedMentorId;
            return (
              <button
                key={m._id}
                type="button"
                onClick={() => setSelectedMentorId(m._id)}
                className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 ${
                  isSelected
                    ? 'bg-indigo-600/25 border-indigo-500 text-indigo-100 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 font-bold text-xs flex items-center justify-center flex-shrink-0">
                  {m.name[0]}
                </div>
                <div className="truncate">
                  <div className="text-xs font-semibold truncate">{m.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    {m.workingWindows?.[0]?.startLocal}–{m.workingWindows?.[0]?.endLocal}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Mentor Detail Card */}
      {selectedMentor && (
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-amber-500 p-[1px] shadow-md">
                <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center font-bold text-indigo-300 text-lg">
                  {selectedMentor.name.slice(0, 2).toUpperCase()}
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>{selectedMentor.name}</span>
                  <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded">
                    IST (Asia/Kolkata)
                  </span>
                </h3>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 font-mono">
                  <span>{selectedMentor.email}</span>
                  <span>•</span>
                  <span>
                    Shift: {selectedMentor.workingWindows?.[0]?.startLocal} – {selectedMentor.workingWindows?.[0]?.endLocal} IST
                  </span>
                </div>
              </div>
            </div>

            {/* Capacity Counter */}
            <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-4 py-2.5 rounded-xl">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">
                  Day Load ({selectedDate})
                </div>
                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span
                    className={
                      (schedule?.dailyLoad.count ?? 0) >= 2
                        ? 'text-rose-400'
                        : 'text-emerald-400'
                    }
                  >
                    {schedule?.dailyLoad.count ?? 0} / {schedule?.dailyLoad.max ?? 2}
                  </span>
                  <span className="text-xs text-slate-400 font-normal">trials booked</span>
                </div>
              </div>
              <div
                className={`w-3 h-3 rounded-full ${
                  (schedule?.dailyLoad.count ?? 0) >= 2
                    ? 'bg-rose-500 ring-4 ring-rose-500/20'
                    : 'bg-emerald-500 ring-4 ring-emerald-500/20'
                }`}
              />
            </div>
          </div>

          {/* Bookings for selected date */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Scheduled Trial Classes ({schedule?.bookings.length || 0})
            </h4>

            {isLoadingSchedule ? (
              <div className="p-8 text-center text-slate-400">
                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin mx-auto mb-2" />
                <span className="text-xs">Loading schedule...</span>
              </div>
            ) : schedule?.bookings && schedule.bookings.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {schedule.bookings.map((booking) => (
                  <div
                    key={booking._id}
                    className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {booking.bookingRef}
                      </span>
                      <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        CONFIRMED
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs text-slate-300 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span className="font-semibold text-white">{booking.parentName}</span>
                        {booking.childName && (
                          <span className="text-slate-400">
                            (Student: {booking.childName})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
                        <Mail className="w-3.5 h-3.5 text-slate-500" />
                        <span>{booking.parentEmail}</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 space-y-1">
                      <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatIstTime(booking.slotStartUtc)}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Parent Timezone: {booking.parentTimezone}
                      </div>
                    </div>

                    <a
                      href={booking.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium pt-1"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Open Meeting Room</span>
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-slate-950/40 border border-dashed border-slate-800 text-center">
                <Calendar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400">
                  No bookings scheduled for this mentor on {selectedDate}.
                </p>
                <p className="text-[11px] text-emerald-400/90 mt-1">
                  Full capacity available (0 / 2 slots used).
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Database,
  Cpu,
  Clock,
  Shield,
  Layers,
  Zap,
} from 'lucide-react';
import { api } from '../api/client.js';
import type { Mentor } from '../types/index.js';

export const SystemStats: React.FC = () => {
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [health, setHealth] = useState<{ status: string; timestamp: string } | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [mList, hStatus] = await Promise.all([
          api.getMentors(),
          api.getHealth(),
        ]);
        setMentors(mList);
        setHealth(hStatus);
      } catch (err) {
        console.error('Failed to load stats:', err);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Hero / Architecture Header */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-indigo-950/70 via-slate-900 to-slate-950 border border-indigo-500/30 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
            <Zap className="w-3.5 h-3.5" />
            <span>Architecture & Concurrency Verification</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Production-Grade Trial Booking Engine
          </h2>

          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
            Engineered specifically to solve cross-continent scheduling with Indian mentors
            (Asia/Kolkata) serving parents in US, UK, and Ireland across Daylight Saving Time (DST)
            boundaries, strict mentor daily load caps, and zero race condition double-bookings.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2 text-xs font-mono">
            <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Server: {health?.status === 'ok' ? 'HEALTHY' : 'CONNECTING'}</span>
            </div>
            <div className="text-slate-400 bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-800">
              <span>Mentors: {mentors.length} Active</span>
            </div>
            <div className="text-slate-400 bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-800">
              <span>Limit: 2 Trials / Mentor / IST Day</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Core Invariants Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
            <Shield className="w-4 h-4" />
            <span>Concurrency & Non-Replica Safety</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Works reliably on standalone MongoDB without multi-document transactions. Combines atomic single-document increments (<code className="text-indigo-300">$inc</code>) on <code className="text-indigo-300">MentorDailyLoad</code> with unique partial compound indexes on <code className="text-indigo-300">&#123;mentorId, slotStartUtc, status: &apos;CONFIRMED&apos;&#125;</code> and automatic compensation rollbacks.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <Clock className="w-4 h-4" />
            <span>Pure Luxon Timezone Normalization</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            All database timestamps are stored strictly in UTC. Generation starts from the parent&apos;s local calendar day, converts to UTC, verifies against the mentor&apos;s shift in IST, and checks capacity for the mentor&apos;s local IST calendar date.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
            <Cpu className="w-4 h-4" />
            <span>Mentor Assignment Strategy</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Utilizes an extensible <code className="text-emerald-300">LeastLoadedStrategy</code> to balance bookings across all mentors working the requested slot, maximizing availability and preventing burnout.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm">
            <Layers className="w-4 h-4" />
            <span>Idempotency & Safe Retries</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Supports <code className="text-purple-300">Idempotency-Key</code> header with unique sparse indexing. Network retries and duplicate form clicks return the existing confirmed booking without consuming additional capacity.
          </p>
        </div>
      </div>

      {/* Seeded Mentors Table */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            <span>Seeded Indian Mentors (Asia/Kolkata)</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {mentors.length} active mentors
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
                <th className="pb-3 pl-2">Mentor</th>
                <th className="pb-3">Email</th>
                <th className="pb-3">Shift (IST)</th>
                <th className="pb-3">Coverage (Target Region)</th>
                <th className="pb-3 pr-2 text-right">Daily Cap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {mentors.map((m, idx) => {
                const shift = `${m.workingWindows?.[0]?.startLocal} – ${m.workingWindows?.[0]?.endLocal}`;
                const isEveningShift = m.workingWindows?.[0]?.startLocal === '15:00';
                return (
                  <tr key={m._id} className="hover:bg-slate-850/50 transition">
                    <td className="py-2.5 pl-2 font-sans font-medium text-white flex items-center gap-2">
                      <span className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-[10px]">
                        {idx + 1}
                      </span>
                      <span>{m.name}</span>
                    </td>
                    <td className="py-2.5 text-slate-400">{m.email}</td>
                    <td className="py-2.5 text-amber-300 font-bold">{shift} IST</td>
                    <td className="py-2.5 font-sans text-slate-300">
                      {isEveningShift ? (
                        <span className="text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded text-[11px]">
                          US Morning / UK & Ireland Evening
                        </span>
                      ) : (
                        <span className="text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded text-[11px]">
                          US Afternoon & Evening
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 text-right text-emerald-400 font-bold">
                      2 / day
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Check,
  Calendar,
  Clock,
  Video,
  Download,
  ExternalLink,
  Trash2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import type { Booking } from '../types/index.js';
import { formatDateTimeNice, formatIstTime } from '../utils/date.js';
import { downloadBookingIcs, getGoogleCalendarUrl } from '../utils/ics.js';

interface ConfirmationCardProps {
  booking: Booking;
  onBookAnother: () => void;
  onCancelBooking: (bookingRef: string) => Promise<void>;
  isCancelling: boolean;
}

export const ConfirmationCard: React.FC<ConfirmationCardProps> = ({
  booking,
  onBookAnother,
  onCancelBooking,
  isCancelling,
}) => {
  const [copied, setCopied] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const copyRef = () => {
    navigator.clipboard.writeText(booking.bookingRef);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mentor = typeof booking.mentorId === 'object' ? booking.mentorId : null;
  const isCancelled = booking.status === 'CANCELLED';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Banner */}
      <div
        className={`p-6 rounded-2xl border text-center space-y-2 relative overflow-hidden ${
          isCancelled
            ? 'bg-rose-950/40 border-rose-500/30'
            : 'bg-gradient-to-b from-emerald-950/60 via-slate-900 to-slate-900 border-emerald-500/30 glow-emerald'
        }`}
      >
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-1">
          {isCancelled ? (
            <AlertTriangle className="w-8 h-8 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          )}
        </div>

        <h2 className="text-2xl font-bold text-white tracking-tight">
          {isCancelled ? 'Booking Cancelled' : 'Trial Class Confirmed! 🎉'}
        </h2>

        <p className="text-sm text-slate-300 max-w-md mx-auto">
          {isCancelled
            ? 'This session has been cancelled and the mentor capacity has been released back into the available pool.'
            : `A confirmation email with session instructions has been queued for ${booking.parentEmail}.`}
        </p>

        {/* Booking Reference Pill */}
        <div className="pt-3 flex items-center justify-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono">
            <span className="text-slate-500">REF:</span>
            <span className="font-bold text-indigo-300 tracking-wider">
              {booking.bookingRef}
            </span>
            <button
              onClick={copyRef}
              type="button"
              className="p-1 text-slate-400 hover:text-white transition"
              title="Copy Booking Reference"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Details Card */}
      <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6 shadow-xl">
        {/* Date & Time comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-400">
              <Calendar className="w-4 h-4" />
              <span>Your Local Time</span>
            </div>
            <div className="text-sm font-bold text-white">
              {formatDateTimeNice(booking.slotStartUtc, booking.parentTimezone)}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Timezone: {booking.parentTimezone}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
              <Clock className="w-4 h-4" />
              <span>Mentor Local Time</span>
            </div>
            <div className="text-sm font-bold text-white">
              {formatIstTime(booking.slotStartUtc)}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Timezone: Asia/Kolkata (IST)
            </div>
          </div>
        </div>

        {/* Assigned Mentor Card */}
        {mentor && (
          <div className="p-4 sm:p-5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white font-bold flex items-center justify-center text-lg flex-shrink-0 shadow-md">
              {mentor.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{mentor.name}</span>
                    <span className="text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.2 rounded">
                      Assigned Mentor
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 font-mono">{mentor.email}</p>
                </div>
              </div>
              {mentor.bio && (
                <p className="text-xs text-slate-300 pt-1 line-clamp-2">{mentor.bio}</p>
              )}
            </div>
          </div>
        )}

        {/* Student details */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-xs">
          <div className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
            Attendee Details
          </div>
          <div className="flex flex-wrap gap-4 text-slate-200">
            <div>
              <span className="text-slate-500">Parent: </span>
              <span className="font-semibold">{booking.parentName}</span>
            </div>
            {booking.childName && (
              <div>
                <span className="text-slate-500">Student: </span>
                <span className="font-semibold">{booking.childName}</span>
                {booking.childAge && <span> ({booking.childAge} yrs)</span>}
              </div>
            )}
            {booking.notes && (
              <div className="w-full text-slate-400 italic">
                Notes: &quot;{booking.notes}&quot;
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {!isCancelled && (
          <div className="space-y-3 pt-2">
            {/* Join Meeting Button */}
            <a
              href={booking.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-600/25 transition-all text-center"
            >
              <Video className="w-4 h-4" />
              <span>Join Live Class (Meeting Room)</span>
              <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-70" />
            </a>

            {/* Calendar Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => downloadBookingIcs(booking)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-750 border border-slate-700 transition"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Download .ICS Calendar File</span>
              </button>

              <a
                href={getGoogleCalendarUrl(booking)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-750 border border-slate-700 transition text-center"
              >
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Add to Google Calendar</span>
              </a>
            </div>
          </div>
        )}

        {/* Cancellation Section */}
        {!isCancelled && (
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
            {!showCancelConfirm ? (
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Need to reschedule or cancel?</span>
              </button>
            ) : (
              <div className="w-full flex items-center justify-between p-3 rounded-xl bg-rose-950/30 border border-rose-500/30">
                <span className="text-xs text-rose-300">
                  Cancel this booking and release mentor slot?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(false)}
                    className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled={isCancelling}
                    onClick={() => onCancelBooking(booking.bookingRef)}
                    className="px-3 py-1 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition disabled:opacity-50"
                  >
                    {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Book Another Button */}
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onBookAnother}
            className="inline-flex items-center gap-2 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Book another trial class</span>
          </button>
        </div>
      </div>
    </div>
  );
};

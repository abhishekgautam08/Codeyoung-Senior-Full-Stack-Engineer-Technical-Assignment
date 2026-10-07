import React, { useState } from 'react';
import { User, Sparkles, Clock, ArrowLeft, ShieldCheck, Loader2 } from 'lucide-react';
import type { SlotItem, CreateBookingPayload } from '../types/index.js';

interface BookingFormProps {
  selectedSlot: SlotItem;
  selectedDate: string;
  parentTimezone: string;
  onSubmit: (payload: CreateBookingPayload) => Promise<void>;
  onBack: () => void;
  isSubmitting: boolean;
}

export const BookingForm: React.FC<BookingFormProps> = ({
  selectedSlot,
  selectedDate,
  parentTimezone,
  onSubmit,
  onBack,
  isSubmitting,
}) => {
  const [parentName, setParentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<{ parentName?: string; parentEmail?: string }>({});

  const validate = () => {
    const errs: { parentName?: string; parentEmail?: string } = {};
    if (!parentName.trim()) {
      errs.parentName = 'Parent name is required';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!parentEmail.trim()) {
      errs.parentEmail = 'Parent email is required';
    } else if (!emailRegex.test(parentEmail.trim())) {
      errs.parentEmail = 'Please enter a valid email address';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    await onSubmit({
      parentName: parentName.trim(),
      parentEmail: parentEmail.trim(),
      parentTimezone,
      slotStartUtc: selectedSlot.slotStartUtc,
      childName: childName.trim() || undefined,
      childAge: childAge || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Selected Slot Summary Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/60 to-slate-900 border border-indigo-500/30 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Selected Trial Slot • {selectedDate}
            </span>
            <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-mono">
              30 Mins Live 1:1
            </span>
          </div>
          <div className="text-base font-bold text-white">
            {selectedSlot.formattedLocal}
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Mentor Time: {selectedSlot.mentorIstInfo.formatted}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="text-xs text-indigo-300 hover:text-white flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Change Slot
        </button>
      </div>

      {/* Booking Form Card */}
      <form
        noValidate
        onSubmit={handleSubmit}
        className="p-6 sm:p-8 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6 shadow-xl"
      >
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-400" />
            Parent & Student Information
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            We will send calendar invites, meeting links, and session prep details to this email.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Parent Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Parent Full Name <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={parentName}
                onChange={(e) => {
                  setParentName(e.target.value);
                  if (errors.parentName) setErrors({ ...errors, parentName: undefined });
                }}
                placeholder="e.g. Sarah Jenkins"
                className={`w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition ${
                  errors.parentName
                    ? 'border-red-500/80 focus:ring-red-500/40'
                    : 'border-slate-700/80 focus:border-indigo-500 focus:ring-indigo-500/30'
                }`}
              />
            </div>
            {errors.parentName && (
              <p className="text-xs text-red-400">{errors.parentName}</p>
            )}
          </div>

          {/* Parent Email */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Parent Email Address <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type="email"
                value={parentEmail}
                onChange={(e) => {
                  setParentEmail(e.target.value);
                  if (errors.parentEmail) setErrors({ ...errors, parentEmail: undefined });
                }}
                placeholder="e.g. sarah.j@gmail.com"
                className={`w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition ${
                  errors.parentEmail
                    ? 'border-red-500/80 focus:ring-red-500/40'
                    : 'border-slate-700/80 focus:border-indigo-500 focus:ring-indigo-500/30'
                }`}
              />
            </div>
            {errors.parentEmail && (
              <p className="text-xs text-red-400">{errors.parentEmail}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Child Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Student / Child Name</span>
              <span className="text-slate-500 text-[10px] lowercase font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              placeholder="e.g. Leo Jenkins"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition"
            />
          </div>

          {/* Child Age */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Student Age</span>
              <span className="text-slate-500 text-[10px] lowercase font-normal">(optional)</span>
            </label>
            <select
              value={childAge ?? ''}
              onChange={(e) => setChildAge(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700/80 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition"
            >
              <option value="">Select age...</option>
              {Array.from({ length: 13 }, (_, i) => i + 5).map((age) => (
                <option key={age} value={age}>
                  {age} years old
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Learning Goals / Notes */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>Prior Coding Experience / Learning Goals</span>
            <span className="text-slate-500 text-[10px] lowercase font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. Complete beginner interested in Scratch and Python game creation..."
            className="w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition"
          />
        </div>

        {/* Guarantee Banner */}
        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-3 text-xs text-slate-400">
          <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span>
            100% Free Trial. No credit card required. Includes a personalized curriculum assessment with a vetted IIT/top-tech mentor.
          </span>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onBack}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            ← Back to Slots
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-500 shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/40 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Confirming Booking...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Confirm & Book Free Trial</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

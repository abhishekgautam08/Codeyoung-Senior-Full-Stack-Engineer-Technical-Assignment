import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { Header } from './components/Header.js';
import { TimezoneSelector } from './components/TimezoneSelector.js';
import { DateStrip } from './components/DateStrip.js';
import { SlotGrid } from './components/SlotGrid.js';
import { BookingForm } from './components/BookingForm.js';
import { ConfirmationCard } from './components/ConfirmationCard.js';
import { MentorSchedule } from './components/MentorSchedule.js';
import { SystemStats } from './components/SystemStats.js';
import { ConflictModal } from './components/ConflictModal.js';
import { api, ApiError } from './api/client.js';
import type {
  SlotItem,
  Booking,
  CreateBookingPayload,
  SuggestedTimezoneGroup,
  AlternativeSlot,
} from './types/index.js';
import { getUserTimezone } from './utils/date.js';
import { DateTime } from 'luxon';

export function App() {
  const [activeTab, setActiveTab] = useState<'book' | 'mentor' | 'status'>('book');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Timezone and date state
  const [parentTimezone, setParentTimezone] = useState<string>(getUserTimezone());
  const [timezoneGroups, setTimezoneGroups] = useState<SuggestedTimezoneGroup[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return DateTime.now().setZone(getUserTimezone()).toFormat('yyyy-MM-dd');
  });

  // Slot states
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [slotError, setSlotError] = useState<string | null>(null);

  // Booking states
  const [currentBooking, setCurrentBooking] = useState<Booking | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Conflict modal state
  const [conflictData, setConflictData] = useState<{
    isOpen: boolean;
    message: string;
    alternatives?: AlternativeSlot[];
  }>({
    isOpen: false,
    message: '',
  });

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load suggested timezones on mount
  useEffect(() => {
    api
      .getSuggestedTimezones()
      .then((groups) => setTimezoneGroups(groups))
      .catch((err) => console.error('Error fetching timezones:', err));
  }, []);

  // Fetch slots whenever selectedDate or parentTimezone changes
  const fetchSlots = useCallback(async () => {
    if (!selectedDate || !parentTimezone) return;
    try {
      setIsLoadingSlots(true);
      setSlotError(null);
      const res = await api.getSlots(selectedDate, parentTimezone);
      setSlots(res.slots);

      // If previously selected slot is no longer in this date/tz, clear it
      if (selectedSlot) {
        const stillValid = res.slots.find(
          (s) => s.slotStartUtc === selectedSlot.slotStartUtc && s.isAvailable && s.isBookable
        );
        if (!stillValid) {
          setSelectedSlot(null);
        }
      }
    } catch (err: any) {
      setSlotError(err.message || 'Failed to load trial class slots');
    } finally {
      setIsLoadingSlots(false);
    }
  }, [selectedDate, parentTimezone, selectedSlot]);

  useEffect(() => {
    fetchSlots();
  }, [selectedDate, parentTimezone]);

  // Handle slot selection
  const handleSelectSlot = (slot: SlotItem) => {
    setSelectedSlot(slot);
    setStep(2);
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  // Handle booking submission
  const handleBookingSubmit = async (payload: CreateBookingPayload) => {
    setIsSubmitting(true);
    const idempotencyKey = crypto.randomUUID();

    try {
      const booking = await api.createBooking(payload, idempotencyKey);
      setCurrentBooking(booking);
      setStep(3);
      showToast('Trial class booked successfully!', 'success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        // Slot unavailable race condition
        setConflictData({
          isOpen: true,
          message: err.message,
          alternatives: err.alternatives,
        });
      } else {
        showToast(err.message || 'Booking failed. Please try again.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancellation
  const handleCancelBooking = async (bookingRef: string) => {
    try {
      setIsCancelling(true);
      await api.cancelBooking(bookingRef);
      if (currentBooking) {
        setCurrentBooking({
          ...currentBooking,
          status: 'CANCELLED',
        });
      }
      showToast('Booking cancelled. Mentor capacity released.', 'info');
      // Refresh slots for current date
      fetchSlots();
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel booking', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Handle selecting an alternative slot from conflict modal
  const handleSelectAlternative = (alt: AlternativeSlot) => {
    const dt = DateTime.fromISO(alt.slotStartUtc).setZone(parentTimezone);
    setSelectedDate(dt.toFormat('yyyy-MM-dd'));
    showToast(`Switched date to ${dt.toFormat('LLL d')}. Please pick your preferred slot.`, 'info');
  };

  const handleBookAnother = () => {
    setCurrentBooking(null);
    setSelectedSlot(null);
    setStep(1);
    fetchSlots();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        timezone={parentTimezone}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* TAB 1: Parent Booking Flow */}
        {activeTab === 'book' && (
          <div className="space-y-8">
            {/* Step Wizard Header */}
            {step < 3 && (
              <div className="text-center space-y-2 max-w-2xl mx-auto">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Free 30-Minute 1:1 Live Coding Trial</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Book a Live Coding Class with Top Mentors
                </h1>
                <p className="text-xs sm:text-sm text-slate-400">
                  Select your local timezone and preferred time. Our Indian mentors (Asia/Kolkata)
                  conduct interactive sessions tailored to your child&apos;s age and interests.
                </p>

                {/* Step indicator pills */}
                <div className="flex items-center justify-center gap-2 pt-2">
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                      step === 1
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white/20 text-[10px] flex items-center justify-center">
                      1
                    </span>
                    <span>Select Time</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                      step === 2
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-900 text-slate-500 border border-slate-800'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white/20 text-[10px] flex items-center justify-center">
                      2
                    </span>
                    <span>Student Details</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-900 text-slate-500 border border-slate-800">
                    <span className="w-4 h-4 rounded-full bg-white/20 text-[10px] flex items-center justify-center">
                      3
                    </span>
                    <span>Confirmation</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1: Timezone, Date & Slot Grid */}
            {step === 1 && (
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Timezone picker banner */}
                <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
                  <TimezoneSelector
                    selectedTimezone={parentTimezone}
                    onSelectTimezone={(tz) => setParentTimezone(tz)}
                    timezoneGroups={timezoneGroups}
                  />

                  {/* Date strip */}
                  <div className="pt-2 border-t border-slate-800/80">
                    <DateStrip
                      selectedDate={selectedDate}
                      onSelectDate={(date) => setSelectedDate(date)}
                      timezone={parentTimezone}
                    />
                  </div>
                </div>

                {/* Error Banner */}
                {slotError && (
                  <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{slotError}</span>
                  </div>
                )}

                {/* Slot Grid Container */}
                <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
                  <SlotGrid
                    slots={slots}
                    selectedSlot={selectedSlot}
                    onSelectSlot={handleSelectSlot}
                    isLoading={isLoadingSlots}
                    parentTimezone={parentTimezone}
                  />
                </div>
              </div>
            )}

            {/* STEP 2: Booking Form */}
            {step === 2 && selectedSlot && (
              <BookingForm
                selectedSlot={selectedSlot}
                selectedDate={selectedDate}
                parentTimezone={parentTimezone}
                onSubmit={handleBookingSubmit}
                onBack={() => setStep(1)}
                isSubmitting={isSubmitting}
              />
            )}

            {/* STEP 3: Confirmation */}
            {step === 3 && currentBooking && (
              <ConfirmationCard
                booking={currentBooking}
                onBookAnother={handleBookAnother}
                onCancelBooking={handleCancelBooking}
                isCancelling={isCancelling}
              />
            )}
          </div>
        )}

        {/* TAB 2: Mentor View Portal */}
        {activeTab === 'mentor' && <MentorSchedule />}

        {/* TAB 3: System Status & Metrics */}
        {activeTab === 'status' && <SystemStats />}
      </main>

      {/* Conflict Modal (HTTP 409 slot taken) */}
      <ConflictModal
        isOpen={conflictData.isOpen}
        message={conflictData.message}
        alternatives={conflictData.alternatives}
        onClose={() => setConflictData({ isOpen: false, message: '' })}
        onSelectAlternative={handleSelectAlternative}
      />

      {/* Toast Banner */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-xs text-slate-100 animate-slide-up">
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
          {toast.type === 'info' && <Clock className="w-4 h-4 text-indigo-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Codeyoung Senior Full Stack Engineer Assignment Demo</span>
          <span className="font-mono text-slate-400">
            Node.js / Express • MongoDB • React 19 • TypeScript • Luxon
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;

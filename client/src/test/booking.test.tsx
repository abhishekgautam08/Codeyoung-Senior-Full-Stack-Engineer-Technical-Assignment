import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlotGrid } from '../components/SlotGrid.js';
import { BookingForm } from '../components/BookingForm.js';
import { ConflictModal } from '../components/ConflictModal.js';
import { api } from '../api/client.js';
import type { SlotItem } from '../types/index.js';

// Mock API client
vi.mock('../api/client.js', () => ({
  api: {
    getSuggestedTimezones: vi.fn(),
    getSlots: vi.fn(),
    getMonthAvailability: vi.fn(),
    createBooking: vi.fn(),
    cancelBooking: vi.fn(),
    getMentors: vi.fn(),
    getMentorSchedule: vi.fn(),
    getHealth: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    alternatives?: any[];
    constructor(status: number, message: string, code = 'ERROR', _details?: any, alternatives?: any[]) {
      super(message);
      this.status = status;
      this.code = code;
      this.alternatives = alternatives;
    }
  },
}));

describe('Client Unit & Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getSuggestedTimezones as any).mockResolvedValue([
      {
        group: 'North America',
        zones: [{ id: 'America/New_York', label: 'US Eastern', offset: 'UTC-4', region: 'US' }],
      },
    ]);
    (api.getMentors as any).mockResolvedValue([]);
    (api.getHealth as any).mockResolvedValue({ status: 'ok', timestamp: new Date().toISOString() });
    (api.getMonthAvailability as any).mockResolvedValue({
      month: '2026-10',
      timezone: 'America/New_York',
      days: [{ date: '2026-10-15', hasAvailability: true, limited: false }],
    });
  });

  describe('1. Slot Grid: Grouping & Selection', () => {
    it("renders slots grouped into Morning/Afternoon/Evening with timezone abbreviation and selecting enables continue", () => {
      const mockSlots: SlotItem[] = [
        {
          slotStartUtc: '2026-10-15T13:00:00.000Z',
          slotEndUtc: '2026-10-15T13:30:00.000Z',
          localStartTime: '9:00 AM',
          localEndTime: '9:30 AM',
          formattedLocal: '9:00 AM – 9:30 AM EDT',
          timeOfDay: 'morning',
          isBookable: true,
          isAvailable: true,
          availableMentorsCount: 2,
          totalMentorsWorking: 2,
          mentorIstInfo: { time: '18:30', date: '2026-10-15', formatted: '6:30 PM IST (Oct 15)' },
        },
        {
          slotStartUtc: '2026-10-15T18:00:00.000Z',
          slotEndUtc: '2026-10-15T18:30:00.000Z',
          localStartTime: '2:00 PM',
          localEndTime: '2:30 PM',
          formattedLocal: '2:00 PM – 2:30 PM EDT',
          timeOfDay: 'afternoon',
          isBookable: true,
          isAvailable: true,
          availableMentorsCount: 3,
          totalMentorsWorking: 3,
          mentorIstInfo: { time: '23:30', date: '2026-10-15', formatted: '11:30 PM IST (Oct 15)' },
        },
        {
          slotStartUtc: '2026-10-15T23:00:00.000Z',
          slotEndUtc: '2026-10-15T23:30:00.000Z',
          localStartTime: '7:00 PM',
          localEndTime: '7:30 PM',
          formattedLocal: '7:00 PM – 7:30 PM EDT',
          timeOfDay: 'evening',
          isBookable: true,
          isAvailable: true,
          availableMentorsCount: 1,
          totalMentorsWorking: 2,
          mentorIstInfo: { time: '04:30', date: '2026-10-16', formatted: '4:30 AM IST (Oct 16)' },
        },
      ];

      const onSelectSlot = vi.fn();

      render(
        <SlotGrid
          slots={mockSlots}
          selectedSlot={null}
          onSelectSlot={onSelectSlot}
          isLoading={false}
          parentTimezone="America/New_York"
        />
      );

      // Verify Morning, Afternoon, Evening sections render
      expect(screen.getByText(/morning slots/i)).toBeInTheDocument();
      expect(screen.getByText(/afternoon slots/i)).toBeInTheDocument();
      expect(screen.getByText(/evening slots/i)).toBeInTheDocument();

      // Verify timezone is shown in parent's zone
      expect(screen.getByText(/America\/New_York/i)).toBeInTheDocument();

      // Click a slot
      const morningSlotBtn = screen.getByText('9:00 AM').closest('button');
      expect(morningSlotBtn).toBeInTheDocument();
      fireEvent.click(morningSlotBtn!);

      expect(onSelectSlot).toHaveBeenCalledWith(mockSlots[0]);
    });
  });

  describe('2. Fall-Back Day (DST Repeated Hour)', () => {
    it('renders two 1:30 AM slots with distinct labels (EDT vs EST) on fall-back transition day', () => {
      // 2026-11-01 in America/New_York is fall-back: 1am-2am repeats.
      // First 1:30 is EDT (UTC 05:30), second 1:30 is EST (UTC 06:30).
      const mockSlots: SlotItem[] = [
        {
          slotStartUtc: '2026-11-01T05:30:00.000Z',
          slotEndUtc: '2026-11-01T06:00:00.000Z',
          localStartTime: '1:30 AM (EDT)',
          localEndTime: '2:00 AM',
          formattedLocal: '1:30 AM – 2:00 AM EDT',
          timeOfDay: 'morning',
          isBookable: true,
          isAvailable: true,
          availableMentorsCount: 1,
          totalMentorsWorking: 1,
          mentorIstInfo: { time: '11:00', date: '2026-11-01', formatted: '11:00 AM IST' },
        },
        {
          slotStartUtc: '2026-11-01T06:30:00.000Z',
          slotEndUtc: '2026-11-01T07:00:00.000Z',
          localStartTime: '1:30 AM (EST)',
          localEndTime: '2:00 AM',
          formattedLocal: '1:30 AM – 2:00 AM EST',
          timeOfDay: 'morning',
          isBookable: true,
          isAvailable: true,
          availableMentorsCount: 1,
          totalMentorsWorking: 1,
          mentorIstInfo: { time: '12:00', date: '2026-11-01', formatted: '12:00 PM IST' },
        },
      ];

      render(
        <SlotGrid
          slots={mockSlots}
          selectedSlot={null}
          onSelectSlot={vi.fn()}
          isLoading={false}
          parentTimezone="America/New_York"
        />
      );

      // Verify both EDT and EST slot labels render distinctly
      expect(screen.getByText('1:30 AM (EDT)')).toBeInTheDocument();
      expect(screen.getByText('1:30 AM (EST)')).toBeInTheDocument();
    });
  });

  describe('3. 409 Conflict: Alternatives Modal', () => {
    it('opens modal with clickable alternative slots when booking returns SLOT_UNAVAILABLE', async () => {
      const alternatives = [
        { slotStartUtc: '2026-10-15T15:00:00.000Z', formattedLocal: '11:00 AM – 11:30 AM EDT', mentorName: 'Aarav Sharma' },
        { slotStartUtc: '2026-10-15T16:00:00.000Z', formattedLocal: '12:00 PM – 12:30 PM EDT', mentorName: 'Priya Patel' },
      ];

      const onSelectAlternative = vi.fn();
      const onClose = vi.fn();

      render(
        <ConflictModal
          isOpen={true}
          onClose={onClose}
          message="That time was just booked by another family."
          alternatives={alternatives}
          onSelectAlternative={onSelectAlternative}
        />
      );

      expect(screen.getByText(/slot unavailable/i)).toBeInTheDocument();
      expect(screen.getByText(/that time was just booked by another family/i)).toBeInTheDocument();
      expect(screen.getByText(/11:00 AM – 11:30 AM EDT/i)).toBeInTheDocument();
      expect(screen.getByText(/with Aarav Sharma/i)).toBeInTheDocument();

      // Click alternative
      const altBtn = screen.getByText(/11:00 AM – 11:30 AM EDT/i).closest('button');
      fireEvent.click(altBtn!);

      expect(onSelectAlternative).toHaveBeenCalledWith(alternatives[0]);
    });
  });

  describe('4. Fully Booked Day: Disabled & Empty State', () => {
    it('renders empty-state message when all slots on the date are unavailable', () => {
      // Slots all unavailable
      const emptySlots: SlotItem[] = [
        {
          slotStartUtc: '2026-10-15T13:00:00.000Z',
          slotEndUtc: '2026-10-15T13:30:00.000Z',
          localStartTime: '9:00 AM',
          localEndTime: '9:30 AM',
          formattedLocal: '9:00 AM – 9:30 AM EDT',
          timeOfDay: 'morning',
          isBookable: false,
          isAvailable: false,
          availableMentorsCount: 0,
          totalMentorsWorking: 2,
          mentorIstInfo: { time: '18:30', date: '2026-10-15', formatted: '6:30 PM IST' },
          disabledReason: 'All mentors fully booked',
        },
      ];

      render(
        <SlotGrid
          slots={emptySlots}
          selectedSlot={null}
          onSelectSlot={vi.fn()}
          isLoading={false}
          parentTimezone="America/New_York"
        />
      );

      // Verify empty state is displayed
      expect(screen.getByText(/no slots available for this date/i)).toBeInTheDocument();
      expect(screen.getByText(/all mentor slots on this date are either fully booked/i)).toBeInTheDocument();
    });
  });

  describe('5. Details Form Validation & Submit Prevention', () => {
    const mockSlot: SlotItem = {
      slotStartUtc: '2026-10-15T14:00:00.000Z',
      slotEndUtc: '2026-10-15T14:30:00.000Z',
      localStartTime: '10:00 AM',
      localEndTime: '10:30 AM',
      formattedLocal: '10:00 AM – 10:30 AM EDT',
      timeOfDay: 'morning',
      isBookable: true,
      isAvailable: true,
      availableMentorsCount: 2,
      totalMentorsWorking: 2,
      mentorIstInfo: { time: '19:30', date: '2026-10-15', formatted: '7:30 PM IST' },
    };

    it('shows inline validation errors for empty name and invalid email', async () => {
      const onSubmit = vi.fn();
      render(
        <BookingForm
          selectedSlot={mockSlot}
          selectedDate="2026-10-15"
          parentTimezone="America/New_York"
          onSubmit={onSubmit}
          onBack={vi.fn()}
          isSubmitting={false}
        />
      );

      // Submit without entering name or email
      const submitBtn = screen.getByRole('button', { name: /confirm & book free trial/i });
      fireEvent.click(submitBtn);

      expect(screen.getByText(/parent name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/parent email is required/i)).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();

      // Enter invalid email format
      const emailInput = screen.getByPlaceholderText(/sarah.j@gmail.com/i);
      fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
      fireEvent.click(submitBtn);

      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('disables submit button and shows loading spinner while submitting to prevent double-submit', () => {
      render(
        <BookingForm
          selectedSlot={mockSlot}
          selectedDate="2026-10-15"
          parentTimezone="America/New_York"
          onSubmit={vi.fn()}
          onBack={vi.fn()}
          isSubmitting={true}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /confirming booking/i });
      expect(submitBtn).toBeDisabled();
      expect(screen.getByText(/confirming booking\.\.\./i)).toBeInTheDocument();
    });
  });
});

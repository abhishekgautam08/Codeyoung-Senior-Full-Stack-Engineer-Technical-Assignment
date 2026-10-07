export interface SlotItem {
  slotStartUtc: string;
  slotEndUtc: string;
  localStartTime: string;
  localEndTime: string;
  formattedLocal: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  isBookable: boolean;
  isAvailable: boolean;
  availableMentorsCount: number;
  totalMentorsWorking: number;
  mentorIstInfo: {
    time: string;
    date: string;
    formatted: string;
  };
  disabledReason?: string;
}

export interface SlotsResponse {
  date: string;
  timezone: string;
  tzAbbr: string;
  totalSlots: number;
  availableSlots: number;
  slots: SlotItem[];
}

export interface Mentor {
  _id: string;
  name: string;
  email: string;
  timezone: string;
  workingWindows: Array<{ startLocal: string; endLocal: string }>;
  avatarUrl?: string;
  bio?: string;
  isActive: boolean;
  todayCount?: number;
}

export interface Booking {
  _id: string;
  bookingRef: string;
  parentName: string;
  parentEmail: string;
  parentTimezone: string;
  childName?: string;
  childAge?: number;
  notes?: string;
  slotStartUtc: string;
  slotEndUtc: string;
  mentorId: Mentor | { _id: string; name: string; email: string; timezone: string; avatarUrl?: string; bio?: string };
  mentorLocalDate: string;
  meetingLink: string;
  status: 'CONFIRMED' | 'CANCELLED';
  createdAt: string;
}

export interface CreateBookingPayload {
  parentName: string;
  parentEmail: string;
  parentTimezone: string;
  slotStartUtc: string;
  childName?: string;
  childAge?: number;
  notes?: string;
}

export interface TimezoneOption {
  id: string;
  label: string;
  offset: string;
  region: string;
}

export interface SuggestedTimezoneGroup {
  group: string;
  zones: TimezoneOption[];
}

export interface MentorScheduleResponse {
  mentor: Mentor;
  date: string;
  dailyLoad: { count: number; max: number };
  workingWindows: Array<{ startLocal: string; endLocal: string }>;
  bookings: Booking[];
}

export interface AlternativeSlot {
  slotStartUtc: string;
  formattedLocal: string;
  mentorName?: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    alternatives?: AlternativeSlot[];
  };
}

export interface DayAvailability {
  date: string;
  hasAvailability: boolean;
  limited: boolean;
}

export interface MonthAvailabilityResult {
  month: string;
  timezone: string;
  days: DayAvailability[];
}

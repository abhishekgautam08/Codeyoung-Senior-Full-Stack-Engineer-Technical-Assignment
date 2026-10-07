import type {
  SlotsResponse,
  Booking,
  CreateBookingPayload,
  Mentor,
  MentorScheduleResponse,
  SuggestedTimezoneGroup,
  AlternativeSlot,
} from '../types/index.js';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  alternatives?: AlternativeSlot[];

  constructor(status: number, message: string, code = 'ERROR', details?: unknown, alternatives?: AlternativeSlot[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.alternatives = alternatives;
  }
}

const API_BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errBody: { error?: { message?: string; code?: string; details?: unknown; alternatives?: AlternativeSlot[] } } = {};
    try {
      errBody = await res.json();
    } catch {
      // ignore JSON parse error
    }
    const message = errBody.error?.message || `Request failed with status ${res.status}`;
    const code = errBody.error?.code || 'UNKNOWN_ERROR';
    const alternatives = errBody.error?.alternatives;
    throw new ApiError(res.status, message, code, errBody.error?.details, alternatives);
  }
  return res.json();
}

export const api = {
  async getSuggestedTimezones(): Promise<SuggestedTimezoneGroup[]> {
    const res = await fetch(`${API_BASE}/timezones/suggested`);
    const data = await handleResponse<{ suggestedTimezones: SuggestedTimezoneGroup[] }>(res);
    return data.suggestedTimezones;
  },

  async getSlots(date: string, tz: string): Promise<SlotsResponse> {
    const params = new URLSearchParams({ date, tz });
    const res = await fetch(`${API_BASE}/slots?${params.toString()}`);
    return handleResponse<SlotsResponse>(res);
  },

  async createBooking(payload: CreateBookingPayload, idempotencyKey?: string): Promise<Booking> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const res = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ booking: Booking }>(res);
    return data.booking;
  },

  async getBooking(bookingRef: string): Promise<Booking> {
    const res = await fetch(`${API_BASE}/bookings/${bookingRef}`);
    const data = await handleResponse<{ booking: Booking }>(res);
    return data.booking;
  },

  async cancelBooking(bookingRef: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/bookings/${bookingRef}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  async getMentors(): Promise<Mentor[]> {
    const res = await fetch(`${API_BASE}/mentors`);
    const data = await handleResponse<{ mentors: Mentor[] }>(res);
    return data.mentors;
  },

  async getMentorSchedule(mentorId: string, date?: string): Promise<MentorScheduleResponse> {
    const url = date
      ? `${API_BASE}/mentors/${mentorId}/schedule?date=${date}`
      : `${API_BASE}/mentors/${mentorId}/schedule`;
    const res = await fetch(url);
    return handleResponse<MentorScheduleResponse>(res);
  },

  async getHealth(): Promise<{ status: string; timestamp: string }> {
    const res = await fetch(`${API_BASE}/health`);
    return handleResponse<{ status: string; timestamp: string }>(res);
  },
};

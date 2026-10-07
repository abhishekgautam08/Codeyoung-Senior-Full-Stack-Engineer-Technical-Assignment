/**
 * Application-specific error classes with typed error codes.
 */

export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'SLOT_UNAVAILABLE'
  | 'SLOT_IN_PAST'
  | 'TOO_SOON'
  | 'DUPLICATE_BOOKING'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: AppErrorCode;
  public readonly details?: unknown;

  constructor(statusCode: number, code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class SlotUnavailableError extends AppError {
  public readonly alternatives: unknown[];

  constructor(message: string, alternatives: unknown[] = []) {
    super(409, 'SLOT_UNAVAILABLE', message, { alternatives });
    this.name = 'SlotUnavailableError';
    this.alternatives = alternatives;
  }
}

export class SlotInPastError extends AppError {
  constructor(message = 'This slot is in the past and cannot be booked.') {
    super(400, 'SLOT_IN_PAST', message);
    this.name = 'SlotInPastError';
  }
}

export class TooSoonError extends AppError {
  constructor(minLeadHours: number) {
    super(
      400,
      'TOO_SOON',
      `Slots must be booked at least ${minLeadHours} hours in advance.`
    );
    this.name = 'TooSoonError';
  }
}

export class DuplicateBookingError extends AppError {
  constructor(message = 'You already have a booking for this time slot.') {
    super(409, 'DUPLICATE_BOOKING', message);
    this.name = 'DuplicateBookingError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found.`);
    this.name = 'NotFoundError';
  }
}

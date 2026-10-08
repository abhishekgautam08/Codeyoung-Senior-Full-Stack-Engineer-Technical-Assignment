import { customAlphabet } from 'nanoid';

/**
 * Uppercase letters and digits only, excluding I, O, 0, and 1.
 * Alphabet: 32 unambiguous characters (A-H, J-N, P-Z, 2-9).
 * Format: CY-XXXXXXXX (CY- followed by 8 characters).
 */
const BOOKING_REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const nanoidRef = customAlphabet(BOOKING_REF_ALPHABET, 8);

export function generateBookingRef(): string {
  return `CY-${nanoidRef()}`;
}

export const BOOKING_REF_REGEX = /^CY-[2-9A-HJ-NP-Z]{8}$/;

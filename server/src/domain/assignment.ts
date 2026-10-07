/**
 * Mentor assignment strategy interface and implementations.
 *
 * Strategy pattern: the booking service uses whatever strategy is configured,
 * making it easy to swap assignment logic without touching the booking flow.
 */

import type { Types } from 'mongoose';

export interface MentorCandidate {
  mentorId: Types.ObjectId;
  /** Number of bookings on the specific mentor-local date */
  dailyCount: number;
  /** Total number of confirmed bookings for this mentor */
  totalBookings: number;
}

export interface AssignmentStrategy {
  name: string;
  /**
   * Sort mentor candidates by priority (first = highest priority).
   * The booking service will try each candidate in order.
   */
  rank(candidates: MentorCandidate[]): MentorCandidate[];
}

/**
 * Default strategy: least-loaded-that-day.
 *
 * Priority:
 * 1. Fewest bookings on the target day (spread load across mentors)
 * 2. Tie-break: fewest total bookings (even long-term distribution)
 * 3. Second tie-break: round-robin by ObjectId (deterministic)
 */
export class LeastLoadedStrategy implements AssignmentStrategy {
  name = 'least-loaded';

  rank(candidates: MentorCandidate[]): MentorCandidate[] {
    return [...candidates].sort((a, b) => {
      // Primary: fewest daily bookings
      if (a.dailyCount !== b.dailyCount) return a.dailyCount - b.dailyCount;
      // Secondary: fewest total bookings
      if (a.totalBookings !== b.totalBookings) return a.totalBookings - b.totalBookings;
      // Tertiary: deterministic by ObjectId string
      return a.mentorId.toString().localeCompare(b.mentorId.toString());
    });
  }
}

/**
 * Round-robin strategy (for testing / alternative use).
 * Simply sorts by total bookings for even distribution.
 */
export class RoundRobinStrategy implements AssignmentStrategy {
  name = 'round-robin';

  rank(candidates: MentorCandidate[]): MentorCandidate[] {
    return [...candidates].sort((a, b) => {
      if (a.totalBookings !== b.totalBookings) return a.totalBookings - b.totalBookings;
      return a.mentorId.toString().localeCompare(b.mentorId.toString());
    });
  }
}

/** Factory for creating strategies by name */
export function createAssignmentStrategy(name: string = 'least-loaded'): AssignmentStrategy {
  switch (name) {
    case 'round-robin':
      return new RoundRobinStrategy();
    case 'least-loaded':
    default:
      return new LeastLoadedStrategy();
  }
}

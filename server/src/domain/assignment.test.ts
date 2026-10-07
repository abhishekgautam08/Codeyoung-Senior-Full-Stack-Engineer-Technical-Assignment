/**
 * Unit tests for mentor assignment strategy.
 */

import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import {
  LeastLoadedStrategy,
  RoundRobinStrategy,
  createAssignmentStrategy,
  type MentorCandidate,
} from '../domain/assignment.js';

function makeCandidate(
  dailyCount: number,
  totalBookings: number,
  idSuffix: string = '0'
): MentorCandidate {
  return {
    mentorId: new Types.ObjectId(`aaaa00000000000000000${idSuffix.padStart(3, '0')}`),
    dailyCount,
    totalBookings,
  };
}

describe('LeastLoadedStrategy', () => {
  const strategy = new LeastLoadedStrategy();

  it('ranks by fewest daily bookings first', () => {
    const candidates = [
      makeCandidate(2, 10, '1'),
      makeCandidate(0, 10, '2'),
      makeCandidate(1, 10, '3'),
    ];

    const ranked = strategy.rank(candidates);
    expect(ranked[0].dailyCount).toBe(0);
    expect(ranked[1].dailyCount).toBe(1);
    expect(ranked[2].dailyCount).toBe(2);
  });

  it('breaks daily tie by fewest total bookings', () => {
    const candidates = [
      makeCandidate(0, 20, '1'),
      makeCandidate(0, 5, '2'),
      makeCandidate(0, 15, '3'),
    ];

    const ranked = strategy.rank(candidates);
    expect(ranked[0].totalBookings).toBe(5);
    expect(ranked[1].totalBookings).toBe(15);
    expect(ranked[2].totalBookings).toBe(20);
  });

  it('breaks all ties by ObjectId (deterministic round-robin)', () => {
    const candidates = [
      makeCandidate(0, 10, '3'),
      makeCandidate(0, 10, '1'),
      makeCandidate(0, 10, '2'),
    ];

    const ranked = strategy.rank(candidates);
    // Sorted by ObjectId string
    const ids = ranked.map((c) => c.mentorId.toString());
    expect(ids[0].localeCompare(ids[1])).toBeLessThan(0);
    expect(ids[1].localeCompare(ids[2])).toBeLessThan(0);
  });

  it('does not mutate the input array', () => {
    const candidates = [
      makeCandidate(2, 10, '1'),
      makeCandidate(0, 10, '2'),
    ];
    const original = [...candidates];
    strategy.rank(candidates);
    expect(candidates).toEqual(original);
  });
});

describe('RoundRobinStrategy', () => {
  const strategy = new RoundRobinStrategy();

  it('ranks by total bookings', () => {
    const candidates = [
      makeCandidate(1, 20, '1'),
      makeCandidate(0, 5, '2'),
      makeCandidate(2, 15, '3'),
    ];

    const ranked = strategy.rank(candidates);
    expect(ranked[0].totalBookings).toBe(5);
    expect(ranked[1].totalBookings).toBe(15);
    expect(ranked[2].totalBookings).toBe(20);
  });
});

describe('createAssignmentStrategy', () => {
  it('defaults to least-loaded', () => {
    const strategy = createAssignmentStrategy();
    expect(strategy.name).toBe('least-loaded');
  });

  it('creates round-robin by name', () => {
    const strategy = createAssignmentStrategy('round-robin');
    expect(strategy.name).toBe('round-robin');
  });

  it('falls back to least-loaded for unknown name', () => {
    const strategy = createAssignmentStrategy('unknown');
    expect(strategy.name).toBe('least-loaded');
  });
});

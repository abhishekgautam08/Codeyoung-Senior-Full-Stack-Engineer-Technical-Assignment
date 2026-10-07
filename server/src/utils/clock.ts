import { DateTime } from 'luxon';

export interface Clock {
  now(): DateTime;
}

export class SystemClock implements Clock {
  now(): DateTime {
    return DateTime.utc();
  }
}

export class FixedClock implements Clock {
  constructor(private fixedTime: DateTime) {}

  now(): DateTime {
    return this.fixedTime;
  }

  setTime(time: DateTime): void {
    this.fixedTime = time;
  }
}

let activeClock: Clock = new SystemClock();

export function getClock(): Clock {
  return activeClock;
}

export function setClock(clock: Clock): void {
  activeClock = clock;
}

export function resetClock(): void {
  activeClock = new SystemClock();
}

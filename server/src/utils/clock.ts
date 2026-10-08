import { DateTime } from 'luxon';

export interface Clock {
  now(): DateTime;
}

export class SystemClock implements Clock {
  now(): DateTime {
    const offsetDays = Number(process.env.FAKE_CLOCK_OFFSET_DAYS || 0);
    const nowUtc = DateTime.utc();
    return offsetDays !== 0 ? nowUtc.plus({ days: offsetDays }) : nowUtc;
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

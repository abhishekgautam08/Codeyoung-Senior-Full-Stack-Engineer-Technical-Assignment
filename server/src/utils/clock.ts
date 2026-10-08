import { DateTime } from 'luxon';

export interface Clock {
  now(): DateTime;
}

export class SystemClock implements Clock {
  private static warned = false;

  public static resetWarningState(): void {
    SystemClock.warned = false;
  }

  now(): DateTime {
    const rawOffset = process.env.FAKE_CLOCK_OFFSET_DAYS;
    const offsetDays = Number(rawOffset || 0);
    const nodeEnv = process.env.NODE_ENV || 'development';

    // Only honor FAKE_CLOCK_OFFSET_DAYS when NODE_ENV is 'test' or 'development'
    if (offsetDays !== 0 && (nodeEnv === 'test' || nodeEnv === 'development')) {
      if (!SystemClock.warned) {
        console.warn(
          `[SystemClock WARNING] FAKE_CLOCK_OFFSET_DAYS active (+${offsetDays} days). NODE_ENV=${nodeEnv}.`
        );
        SystemClock.warned = true;
      }
      return DateTime.utc().plus({ days: offsetDays });
    }

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

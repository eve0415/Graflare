import type { MuteTimeInterval } from '../schemas/alerting';

export function isMuted(intervals: MuteTimeInterval[], now: Date): boolean {
  return intervals.some(interval => isWithinInterval(interval, now));
}

function isWithinInterval(interval: MuteTimeInterval, now: Date): boolean {
  const tz = interval.timezone ?? 'UTC';
  const localized = localizeDate(now, tz);

  if (interval.weekdays.length > 0 && !interval.weekdays.includes(localized.weekday)) {
    return false;
  }

  if (interval.months.length > 0 && !interval.months.includes(localized.month)) {
    return false;
  }

  const currentMinutes = localized.hours * 60 + localized.minutes;
  const startMinutes = parseTimeToMinutes(interval.startTime);
  const endMinutes = parseTimeToMinutes(interval.endTime);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function parseTimeToMinutes(time: string): number {
  const parts = time.split(':');
  return Number.parseInt(parts[0], 10) * 60 + Number.parseInt(parts[1], 10);
}

interface LocalizedTime {
  weekday: number;
  month: number;
  hours: number;
  minutes: number;
}

function localizeDate(date: Date, tz: string): LocalizedTime {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(date);

    const parts: Record<string, string> = {};
    for (const part of formatted) {
      parts[part.type] = part.value;
    }

    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    return {
      weekday: dayMap[parts['weekday']] ?? date.getUTCDay(),
      month: Number.parseInt(parts['month'] ?? '1', 10),
      hours: Number.parseInt(parts['hour'] ?? '0', 10),
      minutes: Number.parseInt(parts['minute'] ?? '0', 10),
    };
  } catch {
    return {
      weekday: date.getUTCDay(),
      month: date.getUTCMonth() + 1,
      hours: date.getUTCHours(),
      minutes: date.getUTCMinutes(),
    };
  }
}

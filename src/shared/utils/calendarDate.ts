// A Postgres `date` is a calendar day: build it from local parts, not from the UTC day of toISOString().
export function todayAsCalendarDate(now: Date = new Date()): string {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map(part => String(part).padStart(2, '0'))
    .join('-')
}

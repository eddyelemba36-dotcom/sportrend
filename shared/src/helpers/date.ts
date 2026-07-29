export function formatISO(date: Date): string {
  return date.toISOString();
}

export function parseISO(dateStr: string): Date {
  return new Date(dateStr);
}

export function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function isLiveMatch(startTime: string): boolean {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  return start <= now && now < start + 3 * 60 * 60 * 1000;
}

export function timeUntilMatch(startTime: string): string {
  const diff = new Date(startTime).getTime() - Date.now();
  if (diff <= 0) return "En cours";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `J-${days}`;
  }
  return `${hours}h${minutes}m`;
}

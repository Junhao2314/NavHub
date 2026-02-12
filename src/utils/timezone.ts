export const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

export type CommonTimeZoneOption = {
  value: string;
  label: string;
};

export const COMMON_TIME_ZONES: CommonTimeZoneOption[] = [
  { value: DEFAULT_TIME_ZONE, label: '北京时间 (Asia/Shanghai)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Tokyo', label: '东京 (Asia/Tokyo)' },
  { value: 'Asia/Singapore', label: '新加坡 (Asia/Singapore)' },
  { value: 'Europe/London', label: '伦敦 (Europe/London)' },
  { value: 'Europe/Paris', label: '巴黎 (Europe/Paris)' },
  { value: 'America/New_York', label: '纽约 (America/New_York)' },
  { value: 'America/Los_Angeles', label: '洛杉矶 (America/Los_Angeles)' },
  { value: 'Australia/Sydney', label: '悉尼 (Australia/Sydney)' },
];

export const isValidTimeZone = (timeZone: string): boolean => {
  if (!timeZone) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

export const normalizeTimeZone = (timeZone: string | undefined | null): string => {
  if (typeof timeZone !== 'string') return DEFAULT_TIME_ZONE;
  const normalized = timeZone.trim();
  return isValidTimeZone(normalized) ? normalized : DEFAULT_TIME_ZONE;
};

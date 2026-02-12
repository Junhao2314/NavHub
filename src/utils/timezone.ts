export const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

export type CommonTimeZoneOption = {
  value: string;
  label: string;
};

export const COMMON_TIME_ZONES: CommonTimeZoneOption[] = [
  { value: DEFAULT_TIME_ZONE, label: '北京时间 (Asia/Shanghai)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Tokyo', label: '东京 (Asia/Tokyo)' },
  { value: 'Asia/Seoul', label: '首尔 (Asia/Seoul)' },
  { value: 'Asia/Singapore', label: '新加坡 (Asia/Singapore)' },
  { value: 'Asia/Hong_Kong', label: '香港 (Asia/Hong_Kong)' },
  { value: 'Asia/Taipei', label: '台北 (Asia/Taipei)' },
  { value: 'Asia/Bangkok', label: '曼谷 (Asia/Bangkok)' },
  { value: 'Asia/Kolkata', label: '孟买 (Asia/Kolkata)' },
  { value: 'Asia/Dubai', label: '迪拜 (Asia/Dubai)' },
  { value: 'Asia/Vladivostok', label: '海参崴 (Asia/Vladivostok)' },
  { value: 'Europe/London', label: '伦敦 (Europe/London)' },
  { value: 'Europe/Paris', label: '巴黎 (Europe/Paris)' },
  { value: 'Europe/Berlin', label: '柏林 (Europe/Berlin)' },
  { value: 'Europe/Moscow', label: '莫斯科 (Europe/Moscow)' },
  { value: 'Europe/Istanbul', label: '伊斯坦布尔 (Europe/Istanbul)' },
  { value: 'America/New_York', label: '纽约 (America/New_York)' },
  { value: 'America/Chicago', label: '芝加哥 (America/Chicago)' },
  { value: 'America/Denver', label: '丹佛 (America/Denver)' },
  { value: 'America/Los_Angeles', label: '洛杉矶 (America/Los_Angeles)' },
  { value: 'America/Anchorage', label: '安克雷奇 (America/Anchorage)' },
  { value: 'America/Sao_Paulo', label: '圣保罗 (America/Sao_Paulo)' },
  { value: 'America/Vancouver', label: '温哥华 (America/Vancouver)' },
  { value: 'America/Toronto', label: '多伦多 (America/Toronto)' },
  { value: 'Australia/Sydney', label: '悉尼 (Australia/Sydney)' },
  { value: 'Australia/Perth', label: '珀斯 (Australia/Perth)' },
  { value: 'Pacific/Auckland', label: '奥克兰 (Pacific/Auckland)' },
  { value: 'Pacific/Honolulu', label: '檀香山 (Pacific/Honolulu)' },
  { value: 'Africa/Cairo', label: '开罗 (Africa/Cairo)' },
  { value: 'Africa/Johannesburg', label: '约翰内斯堡 (Africa/Johannesburg)' },
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

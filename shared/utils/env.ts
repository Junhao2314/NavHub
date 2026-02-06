export const parseEnvList = (value?: string): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};

export const parseEnvBool = (value?: string): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

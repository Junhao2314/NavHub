import { LinkItem } from '../types';

export interface PrivateVaultPayload {
  links: LinkItem[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseLinkItem = (value: unknown): LinkItem | null => {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' ? value.id : null;
  const title = typeof value.title === 'string' ? value.title : null;
  const url = typeof value.url === 'string' ? value.url : null;
  const categoryId = typeof value.categoryId === 'string' ? value.categoryId : null;
  const createdAt = parseFiniteNumber(value.createdAt);

  if (!id || !title || !url || !categoryId || createdAt === null) return null;

  const link: LinkItem = { id, title, url, categoryId, createdAt };

  if (typeof value.icon === 'string') link.icon = value.icon;
  if (typeof value.iconTone === 'string') link.iconTone = value.iconTone;
  if (typeof value.description === 'string') link.description = value.description;

  if (Array.isArray(value.tags)) {
    link.tags = value.tags.filter((tag): tag is string => typeof tag === 'string');
  }

  if (typeof value.pinned === 'boolean') link.pinned = value.pinned;
  const pinnedOrder = parseFiniteNumber(value.pinnedOrder);
  if (pinnedOrder !== null) link.pinnedOrder = pinnedOrder;

  const order = parseFiniteNumber(value.order);
  if (order !== null) link.order = order;

  if (typeof value.recommended === 'boolean') link.recommended = value.recommended;
  const recommendedOrder = parseFiniteNumber(value.recommendedOrder);
  if (recommendedOrder !== null) link.recommendedOrder = recommendedOrder;

  const adminClicks = parseFiniteNumber(value.adminClicks);
  if (adminClicks !== null) link.adminClicks = adminClicks;
  const adminLastClickedAt = parseFiniteNumber(value.adminLastClickedAt);
  if (adminLastClickedAt !== null) link.adminLastClickedAt = adminLastClickedAt;

  return link;
};

const parseVaultLinks = (value: unknown): LinkItem[] | null => {
  const rawLinks = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.links)
      ? value.links
      : null;

  if (!rawLinks) return null;

  return rawLinks.map(parseLinkItem).filter((link): link is LinkItem => link !== null);
};

export const parsePlainPrivateVault = (value: string): PrivateVaultPayload | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const links = parseVaultLinks(parsed);
    if (!links) return null;
    return { links };
  } catch {
    return null;
  }
};

const VAULT_VERSION = 'v1';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const deriveKey = async (password: string, salt: Uint8Array) => {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

export const encryptPrivateVault = async (password: string, payload: PrivateVaultPayload) => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);
  const encoded = encoder.encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${VAULT_VERSION}.${toBase64(salt)}.${toBase64(iv)}.${toBase64(encrypted)}`;
};

export const decryptPrivateVault = async (
  password: string,
  cipherText: string,
): Promise<PrivateVaultPayload> => {
  const [version, saltB64, ivB64, dataB64] = cipherText.split('.');
  if (version !== VAULT_VERSION || !saltB64 || !ivB64 || !dataB64) {
    throw new Error('Invalid vault payload');
  }
  const salt = fromBase64(saltB64);
  const iv = fromBase64(ivB64);
  const data = fromBase64(dataB64);
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  const parsed = JSON.parse(decoder.decode(decrypted)) as unknown;
  const links = parseVaultLinks(parsed);
  if (!links) return { links: [] };
  return { links };
};

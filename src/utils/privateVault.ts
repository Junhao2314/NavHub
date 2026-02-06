import { LinkItem } from '../types';
import {
  decryptVersionedJsonPayload,
  encryptVersionedJsonPayload,
  InvalidPayloadError,
  isDecryptionFailedError,
  isInvalidPayloadError,
} from './cryptoPayload';
import { isRecord } from './typeGuards';

export interface PrivateVaultPayload {
  links: LinkItem[];
}

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
const INVALID_VAULT_PAYLOAD_MESSAGE = 'Invalid vault payload';

export const encryptPrivateVault = async (password: string, payload: PrivateVaultPayload) => {
  return encryptVersionedJsonPayload(password, payload, { version: VAULT_VERSION });
};

export const decryptPrivateVault = async (
  password: string,
  cipherText: string,
): Promise<PrivateVaultPayload> => {
  const parsed = await decryptVersionedJsonPayload(password, cipherText, {
    version: VAULT_VERSION,
    invalidPayloadErrorMessage: INVALID_VAULT_PAYLOAD_MESSAGE,
  });
  const links = parseVaultLinks(parsed);
  if (!links) {
    throw new InvalidPayloadError(INVALID_VAULT_PAYLOAD_MESSAGE);
  }
  return { links };
};

export const decryptPrivateVaultWithFallback = async (
  passwords: string[],
  cipherText: string,
  options?: { maxCandidates?: number },
): Promise<PrivateVaultPayload> => {
  const maxCandidates = options?.maxCandidates ?? 5;
  const candidates = Array.from(
    new Set(passwords.map((password) => password.trim()).filter(Boolean)),
  );

  if (candidates.length > maxCandidates) {
    throw new Error('Too many password candidates');
  }

  for (const candidate of candidates) {
    try {
      return await decryptPrivateVault(candidate, cipherText);
    } catch (error) {
      if (isInvalidPayloadError(error)) throw error;
      if (isDecryptionFailedError(error)) continue;
      throw error;
    }
  }

  throw new Error('No valid password');
};

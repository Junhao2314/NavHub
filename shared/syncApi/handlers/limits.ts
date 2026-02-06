export const KV_VALUE_MAX_BYTES = 25 * 1024 * 1024;

const kvValueEncoder = new TextEncoder();

export const getUtf8ByteLength = (value: string): number => kvValueEncoder.encode(value).length;

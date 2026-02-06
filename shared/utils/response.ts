export type JsonResponseInit = {
  status?: number;
  headers?: Record<string, string>;
};

export function jsonResponse(data: unknown, init: JsonResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

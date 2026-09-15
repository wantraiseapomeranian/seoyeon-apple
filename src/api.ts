export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
    body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined,
  });
  const data = await response.json().catch(() => ({ error: '서버 응답을 읽을 수 없습니다.' }));
  if (!response.ok)
    throw new ApiError(
      typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
        ? data.error
        : '요청을 처리하지 못했습니다.',
      response.status,
    );
  return data as T;
}

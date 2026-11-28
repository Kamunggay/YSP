import { apiGet, ContractApiError } from './client.ts';

export interface PaginatedFetchOptions {
  pageSize?: number;
  maxPages?: number;
  extraHeaders?: Record<string, string>;
  shouldContinue?: () => boolean;
}

function appendQueryParams(basePath: string, params: Record<string, string | number>): string {
  const [pathOnly, existingQuery] = basePath.split('?', 2);
  const search = new URLSearchParams(existingQuery ?? '');
  for (const [key, value] of Object.entries(params)) {
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `${pathOnly}?${serialized}` : pathOnly;
}

/**
 * Follows authorized server pagination cursors across pages so pickers and workflows
 * never silently truncate results at the first page. Retries once from page 1 if
 * a live snapshot cursor reports `409 snapshot_stale` mid-scroll.
 */
export async function fetchAllAuthorizedPages<T>(
  basePath: string,
  options: PaginatedFetchOptions = {},
): Promise<T[]> {
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 100));
  const maxPages = Math.max(1, options.maxPages ?? 25);

  const runLoop = async (): Promise<T[]> => {
    const items: T[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;

    for (let page = 0; page < maxPages; page += 1) {
      if (options.shouldContinue && !options.shouldContinue()) {
        return items;
      }
      const queryParams: Record<string, string | number> = { limit: pageSize };
      if (cursor) {
        queryParams.cursor = cursor;
      }
      const res = await apiGet<T[]>(appendQueryParams(basePath, queryParams), options.extraHeaders);
      if (Array.isArray(res.data)) {
        items.push(...res.data);
      }
      const next = typeof res.page?.next_cursor === 'string' && res.page.next_cursor.trim() !== ''
        ? res.page.next_cursor
        : null;
      if (!next || seenCursors.has(next)) {
        break;
      }
      seenCursors.add(next);
      cursor = next;
    }

    return items;
  };

  try {
    return await runLoop();
  } catch (err) {
    if (err instanceof ContractApiError && err.status === 409 && err.code === 'snapshot_stale') {
      return runLoop();
    }
    throw err;
  }
}

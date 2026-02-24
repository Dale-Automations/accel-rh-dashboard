import { supabaseExternal } from '@/lib/supabaseExternal';

const sb = supabaseExternal as any;
const PAGE_SIZE = 1000;

/**
 * Fetch all rows from a table, paginating past the 1000-row limit.
 * Optionally pass filters as [column, value] tuples.
 */
export async function fetchAll<T = any>(
  table: string,
  filters?: [string, string][]
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = sb.from(table).select('*').range(from, from + PAGE_SIZE - 1);
    if (filters) {
      for (const [col, val] of filters) {
        query = query.eq(col, val);
      }
    }
    const { data, error } = await query;
    if (error || !data) break;
    allRows.push(...(data as T[]));
    hasMore = data.length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  return allRows;
}

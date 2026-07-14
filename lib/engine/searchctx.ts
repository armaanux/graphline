import { AsyncLocalStorage } from "async_hooks";

/**
 * Per-request search keys. Collectors read keys through searchKeys() instead
 * of process.env, so the same code runs keyless when the budget is exhausted
 * or a request opts out of spending the owner's credits.
 */
export interface SearchKeys {
  serper?: string;
  brave?: string;
}

const store = new AsyncLocalStorage<SearchKeys>();

export function runWithSearchKeys<T>(keys: SearchKeys, fn: () => Promise<T>): Promise<T> {
  return store.run(keys, fn);
}

export function searchKeys(): SearchKeys {
  return (
    store.getStore() ?? {
      serper: process.env.SERPER_API_KEY,
      brave: process.env.BRAVE_API_KEY,
    }
  );
}

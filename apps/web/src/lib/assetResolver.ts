/**
 * Aura DIMS - Asset URL Resolver & Cache
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Resolves storage asset IDs to authenticated preview URLs with memory caching.
 */

import { api } from '@/lib/api';

const urlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Resolves a single assetId to a signed preview URL.
 * Reuses unexpired cached URLs (with a 5-minute safety buffer).
 */
export async function resolveAssetUrl(
  assetId: string,
  kind: 'thumbnail' | 'original' = 'original'
): Promise<string | null> {
  if (!assetId || assetId.trim() === '') return null;

  const cacheKey = `${assetId}_${kind}`;
  const cached = urlCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now + 300_000) {
    return cached.url;
  }

  try {
    const res = await api.getMediaPreviewUrl({ assetId, kind });
    const expiresAt = new Date(res.expiresAt).getTime();
    urlCache.set(cacheKey, { url: res.url, expiresAt });
    return res.url;
  } catch (err) {
    console.error(`[Aura DIMS] Failed to resolve asset URL for ${assetId}:`, err);
    return null;
  }
}

/**
 * Resolves a batch of asset IDs in parallel, returning a Map of assetId -> URL.
 */
export async function resolveAssetsBatch(
  assetIds: string[],
  kind: 'thumbnail' | 'original' = 'original'
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(assetIds.filter((id) => id && id.trim() !== '')));
  const results = new Map<string, string>();

  await Promise.all(
    uniqueIds.map(async (id) => {
      const url = await resolveAssetUrl(id, kind);
      if (url) {
        results.set(id, url);
      }
    })
  );

  return results;
}

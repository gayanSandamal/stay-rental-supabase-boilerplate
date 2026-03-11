/**
 * Get the first photo URL from a listing's photos field.
 */
export function getFirstListingPhoto(photos: unknown): string | null {
  if (!photos) return null;
  try {
    const arr = typeof photos === 'string' ? JSON.parse(photos) : photos;
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string') {
      return arr[0];
    }
  } catch {
    // ignore
  }
  return null;
}

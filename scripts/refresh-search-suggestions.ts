/**
 * Refresh the search_location_suggestions materialized view.
 * Run periodically (e.g. cron every 15 min) or after bulk listing changes.
 *
 * Usage: pnpm db:refresh-suggestions
 */
import { refreshSearchLocationSuggestions } from '@/lib/db/search-suggestions';

async function main() {
  await refreshSearchLocationSuggestions();
  console.log('✓ search_location_suggestions refreshed');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to refresh:', err);
  process.exit(1);
});

-- 0062 — how many people the platform says saw a social post.
--
-- The listing page now prints "Facebook views / Instagram views / TikTok views"
-- beside its own website count, and those figures have to come from somewhere
-- durable: a public page cannot call Meta and TikTok on every render, and the
-- rate limits would not survive it if it tried. `refreshSocialMetrics` reads
-- them on the publish cron and writes them here.
--
-- view_count is NULLABLE ON PURPOSE and NULL IS NOT ZERO. It means we have no
-- reading — never read yet, a dry run, an insights call that failed, or a
-- metric the connection has no scope for. Every reader must render NULL as
-- unknown rather than 0: claiming an advert was seen by nobody because OUR
-- permission is missing is the one thing these numbers must never do.
--
-- metrics_fetched_at records when we last ASKED, not when we last got an
-- answer: a failed read stamps it too, which is what stops the sweeper retrying
-- a missing OAuth scope every five minutes forever. metrics_error is how the
-- two are told apart — NULL means the last ask succeeded and view_count is
-- current; set means view_count (if any) is the last good reading, in the
-- platform's own words. Cleared on the next success.
--
-- Replay-safe: three IF NOT EXISTS column adds and one IF NOT EXISTS index,
-- none of which touch existing data. No DO block (see the splitStatements note
-- in CLAUDE.md).

ALTER TABLE listing_social_posts ADD COLUMN IF NOT EXISTS view_count integer;

ALTER TABLE listing_social_posts ADD COLUMN IF NOT EXISTS metrics_fetched_at timestamp;

ALTER TABLE listing_social_posts ADD COLUMN IF NOT EXISTS metrics_error text;

-- The refresh sweeper's claim: live posts, oldest reading first. Partial,
-- because only a `posted` row has anything to read — queued, failed, skipped
-- and pulled rows are dead weight in the scan.
CREATE INDEX IF NOT EXISTS listing_social_posts_metrics_idx
  ON listing_social_posts (metrics_fetched_at)
  WHERE status = 'posted';

/**
 * Text repairs the IMPORTER makes to somebody else's advert.
 *
 * Everything here is importer-local on purpose. `lib/intake/parser/rule-parser.ts`
 * is shared with the live WhatsApp intake, so a change there alters what every
 * intake extracts and needs a RULES_VERSION bump plus a `pnpm parser:probe`
 * re-run. These are the same call `importDescription` already makes for the
 * 400-character clip: the importer deciding about its own text.
 *
 * Neither helper touches `post_imports.raw_text` as evidence. `tidyAdvertBullets`
 * runs only on what gets PUBLISHED, so the stored paste stays byte-faithful to
 * what the operator saw. `dropDuplicateLeadLine` is the exception and is allowed
 * to run before storage, because the duplicate it removes is not in the advert at
 * all — see below, we manufacture it ourselves.
 */

/**
 * The advert text an OpenGraph preview actually contains.
 *
 * `og:description` is the post body, truncated. `og:title` is the **group or
 * page's own name** — for a group post Facebook writes
 *
 *     House, Annex & Rooms For Rent - ඉක්මනින් හොයාගන්න | HOUSE FOR RENT - DEHIWALA
 *
 * i.e. the group's name, then the post's first line after a pipe. Joining that
 * whole string onto the description fed the GROUP'S NAME to the parser as if
 * the landlord had written it, and it spread everywhere: the listing came out
 * "3BR **Annex** in Dehiwala" for an advert that says HOUSE, because the group
 * is called "House, Annex & Rooms For Rent"; `locationDetail` read "DEHIWALA"
 * out of the same line and published the rest of the group's name as the
 * property's address; and the headline still arrived twice, because
 * `dropDuplicateLeadLine` compares whole lines and this one had a group name
 * glued to the front.
 *
 * So: only the segment AFTER the last pipe can be post content, and it is kept
 * only when the description does not already open with it. With no pipe there
 * is no way to tell a group's name from a post's first line — and every sample
 * we have shows `og:description` starting at the top of the post — so the title
 * is dropped. It is used whole only when there is no description at all, which
 * is the one case where it is the only text we have.
 */
export function composeOgText(
  title: string | null | undefined,
  description: string | null | undefined
): string {
  const body = description?.trim() ?? '';
  const heading = title?.trim() ?? '';
  if (!body) return heading;

  const pipe = heading.lastIndexOf('|');
  if (pipe === -1) return body;

  const excerpt = heading.slice(pipe + 1).trim();
  if (!excerpt) return body;

  const firstLine = body.split('\n').find((line) => line.trim() !== '') ?? '';
  if (compareKey(firstLine) === compareKey(excerpt)) return body;

  return `${excerpt}\n\n${body}`;
}

/**
 * Remove a lead line that the very next line repeats.
 *
 * OUR BUG, NOT FACEBOOK'S. `resolvePost` composes the OG fallback as
 * `[og.title, og.description].join('\n\n')`, and Facebook's `og:description`
 * for a post *opens with the post's own first line* — which is exactly what it
 * put in `og:title`. So an advert headed "Annex for girls" arrives as
 *
 *     Annex for girls
 *
 *     Annex for girls
 *     🟩 Colombo - Kirulapone, Polhengoda.
 *
 * and publishes with its title said twice. Applied at composition so new
 * imports never carry it, and again inside `importDescription` so the rows
 * already sitting in `post_imports` with the duplicate baked into `raw_text`
 * do not keep publishing it — nothing re-fetches those.
 *
 * Deliberately conservative: only the FIRST line, only against the next
 * non-empty line, and only on a full match after normalisation. A repeated
 * line further down is an advert that repeats itself, which is the owner's
 * business and not ours to edit.
 */
export function dropDuplicateLeadLine(text: string): string {
  const lines = text.split('\n');

  const first = lines.findIndex((line) => line.trim() !== '');
  if (first === -1) return text;
  const second = lines.findIndex((line, i) => i > first && line.trim() !== '');
  if (second === -1) return text;

  if (compareKey(lines[first]) !== compareKey(lines[second])) return text;

  // Drop the duplicate AND the blank run that separated it, so the result does
  // not open with an empty line.
  return lines.slice(second).join('\n');
}

/**
 * Case- and punctuation-insensitive comparison key for a single line.
 *
 * A title arrives stripped of the " | Facebook" suffix and a description does
 * not always keep the advert's trailing full stop, so an exact string compare
 * misses the very duplicates this exists to catch.
 */
function compareKey(line: string): string {
  return line
    .replace(MARKER_RUN, ' ')
    .replace(/[\s\p{P}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Decorative list-marker characters, plus the invisible glue that travels with
 * them (VS16 and ZWJ).
 *
 * SCOPE IS DELIBERATELY NARROW: geometric shapes (U+25A0–U+25FF, e.g. the ◽ that
 * bullets half the adverts in Sri Lankan rental groups) and the coloured
 * squares/circles of Geometric Shapes Extended (U+1F7E0–U+1F7EB, e.g. 🟩).
 * These are punctuation wearing an emoji costume — they say "list item", nothing
 * more, and they render as tofu boxes in our own back office and on the public
 * listing page.
 *
 * Emoji that carry actual meaning in an advert (🏠, 🛏, ✅) are NOT in here. A
 * renter reading "🛏 3 bedrooms" loses something if we flatten it; a renter
 * reading "◽️️ Pantry" loses nothing.
 */
const MARKERS = '\\u25A0-\\u25FF\\u{1F7E0}-\\u{1F7EB}\\uFE0F\\u200D';
const MARKER_RUN = new RegExp(`[${MARKERS}]+`, 'gu');
const LEADING_MARKERS = new RegExp(`^[\\s${MARKERS}]*[${MARKERS}][\\s${MARKERS}]*`, 'u');

/**
 * Turn decorative markers into something that survives a font fallback.
 *
 * A marker run that OPENS a line is that line's bullet, so it becomes "• " and
 * the list still reads as a list. A run anywhere else is separator noise and
 * collapses to a space.
 */
export function tidyAdvertBullets(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const bulleted = LEADING_MARKERS.test(line);
      const body = line.replace(LEADING_MARKERS, '').replace(MARKER_RUN, ' ').replace(/[ \t]+/g, ' ').trim();
      if (!body) return '';
      return bulleted ? `• ${body}` : body;
    })
    .join('\n');
}

/**
 * Both repairs, in the order the publish path wants them: de-duplicate first
 * (it compares whole lines, and a stray marker must not defeat the match), then
 * tidy the markers.
 */
export function tidyImportedAdvert(text: string): string {
  return tidyAdvertBullets(dropDuplicateLeadLine(text));
}

/**
 * Model prompts and their version.
 *
 * PROMPT_VERSION is part of the image_moderation_cache primary key: bumping it
 * invalidates every cached verdict by construction, so prompt tuning can never
 * silently inherit stale judgements. Bump deliberately — a bump means the whole
 * catalogue is re-moderated (and re-billed) on its next pass.
 */

export const PROMPT_VERSION = 1;

/**
 * Per-image gate. Asks for grounded boxes because Qwen3-VL is trained for
 * detection with `bbox_2d`, and face boxes are what the deferred face-blur
 * feature will need — collecting them now costs nothing.
 */
export const IMAGE_GATE_SYSTEM = `You inspect ONE photo submitted to Easy Rent, a Sri Lankan house-rental marketplace. Report only what is visibly present. Never speculate about what might be outside the frame.

Definitions you must apply exactly:

overlay_text = text ADDED to the image after it was taken. Examples: a watermark, an agency logo, a phone number typed over the photo, a price banner, a "SOLD"/"FOR RENT" graphic sticker, collage labels, screenshot UI, a caption bar added at the edge.
overlay_text does NOT include text that was physically present in the scene when the photo was taken. Examples that are NOT overlay_text: a street sign, a shop signboard, a house number plate, a nameplate on a gate, a "For Rent" board standing in the garden, appliance labels, book spines, a calendar on the wall, writing on a vehicle.
If you are unsure whether text was added or photographed, set overlay_text=false and set uncertain=true.

person_visible = a human being is discernible anywhere in the image: fully or partly in frame, in a mirror or window reflection, or in a photograph/portrait hanging on the wall. A statue, mannequin, doll, cartoon or figure in wall art is NOT a person.
Return a bounding box for every human face you can locate.

unsafe = nudity or sexual content, violence or gore, a brandished weapon, or hateful/harassing imagery.

is_property_photo = the image shows a room, a building, or its grounds. It is false for documents, screenshots, memes, selfies, vehicles, food, or pets as the subject.

Reply with ONLY a JSON object, no prose, no code fence:
{"unsafe":bool,"unsafe_category":string|null,"overlay_text":bool,"overlay_text_sample":string|null,"scene_text_present":bool,"person_visible":bool,"faces":[{"bbox_2d":[x1,y1,x2,y2]}],"is_property_photo":bool,"uncertain":bool,"confidence":number,"notes":string|null}`;

/**
 * Second pass, only for images the gate marked uncertain. Spatial/physical
 * reasoning is exactly what the bigger model is for.
 */
export const IMAGE_ADJUDICATE_SYSTEM = `You are settling one uncertain question about a photo of a Sri Lankan rental property.

Decide whether any text in this image was ADDED to the picture afterwards (a watermark, an agency logo, a typed phone number, a price banner, a graphic sticker, collage labels, screenshot UI) or was PHYSICALLY PRESENT in the scene when the photo was taken (a street sign, a shop signboard, a house number, a nameplate, a "For Rent" board standing in the garden, writing on an appliance or vehicle).

Reason from physical evidence: added text ignores perspective, lighting and occlusion — it sits flat on the frame, is perfectly aligned to the image edges, has uniform sharpness regardless of depth, and is often semi-transparent or in a corner. Photographed text follows the surface it is printed on, shares the scene's lighting and blur, and can be partly occluded.

Also decide whether a human being is present AS A SUBJECT of the photo, as opposed to an incidental faint reflection or a person appearing inside a framed picture on the wall.

Reply with ONLY a JSON object, no prose, no code fence:
{"overlay_text":bool,"overlay_text_sample":string|null,"reasoning":string,"person_is_subject":bool,"confidence":number}`;

/**
 * Text checks in one call. The cross-language clause is load-bearing: the rule
 * parser always composes English titles ("2BR House in Nugegoda") even for
 * Sinhala or Tamil descriptions, so without it every non-English listing would
 * fail title coherence — the highest-volume false positive in the design.
 */
export const TEXT_CHECK_SYSTEM = `You are checking one listing on Easy Rent, a Sri Lankan house-rental marketplace, before it is published.

IMPORTANT: the title may be in a different language from the description. Easy Rent composes titles in English (for example "2BR House in Nugegoda") even when the landlord wrote in Sinhala or Tamil. Judge whether the title and description describe THE SAME PROPERTY — same property type, same rough size, same town. Never require them to share words or language.

Supported languages are English, Sinhala and Tamil, including romanized Sinhala/Tamil written in Latin letters (for example "gedara kuliyata", "kamara 2", "niwasa"). Treat those as supported.

language: report "en", "si" (Sinhala script), "ta" (Tamil script), "si-Latn" (romanized Sinhala), "ta-Latn" (romanized Tamil), or "other:<language name>" for anything else.

Instead of judging whether the title and description "match", EXTRACT what each one describes and let us compare them:
- title_property / description_property: for each, report the property type as one of "house", "apartment", "annex", "room", or "unknown", and the number of bedrooms as a number or null.
  A single room in a shared house (shared kitchen or bathroom, "room for a working lady", boarding) is type "room" with bedrooms 1 — NOT a house.
  "Annex" means a self-contained part of a house with its own entrance.
  Report what the text actually says, not what you think it should say. Use "unknown" whenever the text does not say.

location_consistent: false only for a real contradiction between the address, town and district given. Sri Lanka has thousands of small towns — an unfamiliar town name is NOT an inconsistency. Notes from our town database are provided as context; weigh them, they are hints and not verdicts.

looks_like_rental_listing: false for spam, a job or investment advert, a sales pitch, a scam, or text that is not offering a property to rent.

Reply with ONLY a JSON object, no prose, no code fence:
{"language":string,"title_property":{"type":string,"bedrooms":number|null},"description_property":{"type":string,"bedrooms":number|null},"describes_same_property":bool,"difference_reason":string|null,"location_consistent":bool,"location_mismatch_reason":string|null,"looks_like_rental_listing":bool,"spam_reason":string|null,"confidence":number}`;

export function buildTextCheckUser(input: {
  title: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  notes: string[];
}): string {
  const lines = [
    `Title: ${input.title ?? '(none)'}`,
    `Description: ${input.description ?? '(none)'}`,
    `Address: ${input.address ?? '(none)'}`,
    `Town/city: ${input.city ?? '(none)'}`,
    `District: ${input.district ?? '(none)'}`,
  ];
  if (input.notes.length) {
    lines.push('', 'Notes from our town database (hints, not verdicts):');
    for (const n of input.notes) lines.push(`- ${n}`);
  }
  return lines.join('\n');
}

/** Landlord-facing reason strings. Kept here so copy lives with the prompts. */
export const REASON_COPY = {
  overlayText: 'it has text or a logo added over the picture — please send the original photo',
  otherWatermark:
    "it carries another company's watermark — please send a photo you took yourself",
  person: 'someone is visible in it — please send a photo without people in frame',
  unsafe: 'it does not meet our content rules',
  notProperty: "it doesn't show the property — please send photos of the rooms or the building",
} as const;

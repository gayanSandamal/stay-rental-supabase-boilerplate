/**
 * Moderation contracts. Dependency-free so the policy layer stays unit-testable.
 */

/** cosmetic → drop just that photo. safety → hold the whole listing. */
export type Severity = 'cosmetic' | 'safety';

/** Grounded box from Qwen3-VL, in pixels of the image we sent. */
export interface BoundingBox {
  bbox_2d: [number, number, number, number];
  label?: string;
}

/** What the per-image gate reports. */
export interface ImageGateResult {
  unsafe: boolean;
  unsafeCategory: string | null;
  /** Text visibly ADDED after capture (watermark, price banner, agency logo). */
  overlayText: boolean;
  overlayTextSample: string | null;
  /** Text that is physically part of the scene — never a rejection reason. */
  sceneTextOnly: boolean;
  personVisible: boolean;
  /** Face boxes, kept so the deferred face-blur feature needs no re-detection. */
  faceBoxes: BoundingBox[];
  isPropertyPhoto: boolean;
  confidence: number;
  notes: string | null;
  /** True when the gate was unsure and an adjudication pass ran. */
  adjudicated?: boolean;
}

export interface ImageVerdict {
  originalUrl: string;
  contentHash: string;
  verdict: 'pass' | 'reject';
  severity?: Severity;
  /** Landlord-facing, one sentence each. */
  reasons: string[];
  fromCache: boolean;
  faceBoxes?: BoundingBox[];
  raw?: unknown;
}

export interface TextVerdict {
  /** BCP-47-ish: en | si | ta | si-Latn | ta-Latn | other:<name> */
  language: string;
  languageSupported: boolean;
  titleCoherent: boolean;
  locationCoherent: boolean;
  looksLikeRental: boolean;
  /** Ops-facing explanations. */
  reasons: string[];
  /** Deterministic gazetteer observations fed to the model as context. */
  deterministicNotes: string[];
}

export type ModerationOutcome = 'passed' | 'held' | 'error' | 'skipped';

export interface ModerationVerdict {
  outcome: ModerationOutcome;
  /** Ops-facing summary lines. */
  reasons: string[];
  /** Sender-facing lines (WhatsApp/in-app). */
  landlordReasons: string[];
  text: TextVerdict | null;
  images: ImageVerdict[];
  droppedUrls: string[];
  keptUrls: string[];
  language: string | null;
  model: string;
  promptVersion: number;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
  /** Set when outcome === 'error'. */
  errorMessage?: string;
}

/** Flags the policy layer reads. Passed in so verdict.ts stays pure. */
export interface ModerationPolicy {
  moderateImages: boolean;
  moderateTextCoherence: boolean;
  /** A safety-severity image holds the entire listing rather than being dropped. */
  holdOnUnsafeImages: boolean;
  /** Publish anyway when the provider is unreachable. Emergency valve. */
  failOpen: boolean;
  maxImages: number;
}

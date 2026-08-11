import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { probeImageToolchain, processListingImage } from '@/lib/images/process';

/**
 * Exercises the real sharp pipeline (no mocking) — the point is to assert the
 * OUTPUT: format, bounds, that EXIF/GPS is gone, and that the watermark is
 * applied or skipped per the size rules.
 */

async function makePhoto(width: number, height: number, withExif = false) {
  let img = sharp({
    create: {
      width,
      height,
      channels: 3,
      // Mid-grey so the watermark composite is detectable as a pixel change.
      background: { r: 120, g: 130, b: 140 },
    },
  }).jpeg({ quality: 92 });

  if (withExif) {
    // sharp drops the ENTIRE metadata block (we never call withMetadata() in the
    // pipeline), so proving one EXIF tag is gone proves GPS is gone too — GPS in
    // a publicly served rental photo is the privacy case that motivates this.
    img = img.withMetadata({ exif: { IFD0: { Copyright: 'Test Owner' } } });
  }
  return img.toBuffer();
}

describe('processListingImage', () => {
  it('re-encodes to webp and bounds the long edge at 1920', async () => {
    const out = await processListingImage(await makePhoto(3000, 2000));
    expect(out.contentType).toBe('image/webp');
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(1920);
    expect(out.width).toBe(1920);
  });

  it('never enlarges a small image', async () => {
    const out = await processListingImage(await makePhoto(800, 600));
    expect(out.width).toBe(800);
    expect(out.height).toBe(600);
  });

  it('strips all metadata, including GPS', async () => {
    const withExif = await makePhoto(1200, 900, true);
    // Sanity: the fixture really carries EXIF before processing.
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const out = await processListingImage(withExif);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it('compresses meaningfully versus the original', async () => {
    const original = await makePhoto(2400, 1800);
    const out = await processListingImage(original);
    expect(out.bytes).toBeLessThan(original.length);
    expect(out.compressionSkipped).toBe(false);
  });

  it('skips re-compression for WhatsApp images but still watermarks them', async () => {
    const out = await processListingImage(await makePhoto(1600, 1200), { whatsappSourced: true });
    expect(out.compressionSkipped).toBe(true);
    expect(out.width).toBe(1600); // untouched: below the 2400 guard
    expect(out.watermarked).toBe(true);
  });

  it('still resizes a WhatsApp image that is implausibly large', async () => {
    const out = await processListingImage(await makePhoto(3200, 2400), { whatsappSourced: true });
    expect(out.width).toBe(2400);
  });

  it('watermarks normal photos', async () => {
    const out = await processListingImage(await makePhoto(1200, 900));
    expect(out.watermarked).toBe(true);
  });

  it('skips the watermark on images too small to brand legibly', async () => {
    const out = await processListingImage(await makePhoto(420, 320));
    expect(out.watermarked).toBe(false);
  });

  it('can be asked not to watermark', async () => {
    const out = await processListingImage(await makePhoto(1200, 900), { watermark: false });
    expect(out.watermarked).toBe(false);
  });

  it('applies the watermark to the centre of the frame only', async () => {
    const src = await makePhoto(1200, 900);
    const plain = await processListingImage(src, { watermark: false });
    const marked = await processListingImage(src, { watermark: true });

    const region = async (buf: Buffer, box: { left: number; top: number }) =>
      sharp(buf).extract({ ...box, width: 180, height: 120 }).raw().toBuffer();

    // Mean absolute pixel difference between the two encodes, per region.
    const meanDiff = (a: Buffer, b: Buffer) => {
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
      return sum / a.length;
    };

    const centreDiff = meanDiff(
      await region(plain.buffer, { left: 510, top: 390 }),
      await region(marked.buffer, { left: 510, top: 390 })
    );
    // The old home of the mark: it must no longer be touched.
    const brDiff = meanDiff(
      await region(plain.buffer, { left: 1000, top: 760 }),
      await region(marked.buffer, { left: 1000, top: 760 })
    );
    const tlDiff = meanDiff(
      await region(plain.buffer, { left: 0, top: 0 }),
      await region(marked.buffer, { left: 0, top: 0 })
    );

    // The mark lands dead centre; elsewhere only lossy-encoding noise differs.
    expect(centreDiff).toBeGreaterThan(2);
    expect(tlDiff).toBeLessThan(1);
    expect(brDiff).toBeLessThan(1);
    expect(centreDiff).toBeGreaterThan(tlDiff * 5);
  });

  it('sizes the mark at 15% of the image width', async () => {
    // 1600px wide → a ~240px mark. Measured by finding the columns the overlay
    // actually altered, so it pins the RATIO, not just "a mark exists".
    const src = await makePhoto(1600, 1200);
    const plain = await processListingImage(src, { watermark: false });
    const marked = await processListingImage(src, { watermark: true });

    const row = async (buf: Buffer) =>
      sharp(buf)
        .extract({ left: 0, top: 570, width: 1600, height: 60 })
        .greyscale()
        .raw()
        .toBuffer();
    const a = await row(plain.buffer);
    const b = await row(marked.buffer);

    let first = -1;
    let last = -1;
    for (let x = 0; x < 1600; x++) {
      let changed = false;
      for (let y = 0; y < 60; y++) {
        if (Math.abs(a[y * 1600 + x] - b[y * 1600 + x]) > 12) {
          changed = true;
          break;
        }
      }
      if (changed) {
        if (first === -1) first = x;
        last = x;
      }
    }

    const markWidth = last - first + 1;
    const expected = 1600 * 0.15;
    // Generous band: the logo asset has its own transparent padding, and the
    // outermost pixels of a 55%-alpha mark may not clear the threshold.
    expect(markWidth).toBeGreaterThan(expected * 0.6);
    expect(markWidth).toBeLessThanOrEqual(expected * 1.1);
    // …and it is centred, so the mark straddles the middle column.
    expect(first).toBeLessThan(800);
    expect(last).toBeGreaterThan(800);
  });
});

describe('probeImageToolchain', () => {
  it('confirms the native module is loadable', async () => {
    // Trivial here, load-bearing in production: sharp is the app's only native
    // dependency, so a packaging regression is otherwise invisible until photos
    // come out unprocessed. The moderation cron reports this on every run.
    await expect(probeImageToolchain()).resolves.toEqual({ ok: true });
  });
});

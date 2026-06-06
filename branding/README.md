# Easy Rent — Logo System

A **super-minimal, single-colour** mark: a rounded house outline. One clean line,
rounded corners, no fill — friendly and instantly legible at any size. Paired with
a letter-spaced **EASY RENT** wordmark.

The in-app mark is a React component (`components/brand/easy-rent-logo.tsx`,
`<EasyRentMark/>`) whose stroke uses `currentColor`, so it adapts to light/dark
surfaces (teal on light, white on dark). These files are for everything outside
the app (icons, email, social, print).

## Files

| File | Use for |
|------|---------|
| `easy-rent-logo-primary.svg` | Default lockup (teal mark + EASY RENT) on light backgrounds. |
| `easy-rent-logo-stacked.svg` | Mark above the wordmark — square-ish spaces. |
| `easy-rent-logo-reversed.svg` | White, for dark / teal backgrounds. |
| `easy-rent-logo-mono.svg` | One-colour lockup. |
| `easy-rent-mark.svg` | The house mark alone (teal outline). |
| `easy-rent-icon.svg` | App icon — white house on a teal tile. |
| `favicon.ico` | Browser favicon (16–64px). |
| `easy-rent-apple-touch-icon.png` | iOS home-screen icon (180×180). |
| `easy-rent-icon-512.png` | PWA / store icon (512×512). |
| `easy-rent-logo-overview.png` | One-page overview of the system. |

PNG copies accompany each SVG.

## Where it's wired in the app

- Header, footer, listings search bar → `<EasyRentMark/>` (adaptive colour).
- `app/favicon.ico`, `app/icon.svg`, `app/icon.png`, `app/apple-icon.png` → the teal-tile icon.
- `app/opengraph-image.tsx` → white house mark on the brand dark gradient.
- Emails (`lib/email.ts`) → `public/brand/easy-rent-logo-reversed.png` in a teal header.

## Colour

| Name | Hex | Role |
|------|-----|------|
| Deep Teal | `#0F5C5A` | The mark & wordmark on light; matches the app's `--primary`. |
| White | `#FFFFFF` | The mark on dark / inside the icon tile. |

Single hue by design — it's a mono mark. On dark surfaces use the reversed/white version.

## Usage

Keep clear space around the mark equal to half the house width. Minimum sizes:
mark ≥ 20px; favicon ≥ 16px. Don't fill it, add a second colour, rotate, or
restyle the corners — the rounded outline is the identity. Wordmark: **Poppins**
(Medium), letter-spaced.

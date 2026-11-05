// Renders guide.html → docs/guides/facebook-import-guide.pdf
//
//   node docs/guides/facebook-import/build.mjs
//
// Two passes: the first PDF is only read back (pypdf) to find which page each
// heading's invisible @@marker@@ landed on; those page numbers are written into
// the table of contents and the second pass is the real output. Needs the
// Playwright Chromium already installed for the e2e suite, and python3 + pypdf.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, 'guide.html');
const output = path.join(here, '..', 'facebook-import-guide.pdf');

const PDF_OPTIONS = { format: 'A4', printBackground: true, preferCSSPageSize: true };

const FIND_PAGES = `
import json, re, sys
from pypdf import PdfReader
found = {}
for number, page in enumerate(PdfReader(sys.argv[1]).pages, start=1):
    for marker in re.findall(r"@@(ch\\d+(?:-\\d+)?)@@", (page.extract_text() or "").replace(" ", "")):
        found.setdefault(marker, number)
print(json.dumps(found))
`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(source).href, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts.ready);

  const draft = path.join(mkdtempSync(path.join(tmpdir(), 'fb-guide-')), 'pass1.pdf');
  writeFileSync(draft, await page.pdf(PDF_OPTIONS));

  const pages = JSON.parse(execFileSync('python3', ['-c', FIND_PAGES, draft], { encoding: 'utf8' }));
  const expected = await page.$$eval('.toc .p', (els) => els.map((el) => el.dataset.for));
  const missing = expected.filter((id) => !(id in pages));
  if (missing.length) throw new Error(`No page found for: ${missing.join(', ')}`);

  await page.evaluate((map) => window.__pages(map), pages);
  await page.pdf({ ...PDF_OPTIONS, path: output });
  console.log(`Wrote ${path.relative(process.cwd(), output)} (${Object.keys(pages).length} headings indexed)`);
} finally {
  await browser.close();
}

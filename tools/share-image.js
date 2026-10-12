// Renders tools/share-image.html to share.png (1200x630, the og:image).
// Needs Playwright (not a project dependency): `node tools/share-image.js`
// with the dev server running (`npm start`). Set PLAYWRIGHT_PATH if
// Playwright isn't resolvable from here, e.g. a global install.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const url = process.env.SHARE_URL || 'http://localhost:8080/tools/share-image.html';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url);
await page.waitForFunction(() => window.shareImageReady === true);
const dataUrl = await page.$eval('#c', (c) => c.toDataURL('image/png'));
writeFileSync(new URL('../share.png', import.meta.url), Buffer.from(dataUrl.split(',')[1], 'base64'));
await browser.close();
console.log('wrote share.png');

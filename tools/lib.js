// Shared helpers for the QA scripts.
const path = require('path');
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');

// Fonts are hosted on production, not in this repo; ignore only those.
const IGNORABLE = [/\/assets\/fonts\//];
const BASE = process.env.BASE || 'http://localhost:8765';
const BROWSER_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];

async function launch() { return pw.chromium.launch({ args: BROWSER_ARGS }); }

// Collect everything that would show up red in DevTools.
function watch(page, bucket) {
  page.on('console', (m) => {
    if (!['error', 'warning'].includes(m.type())) return;
    const url = (m.location() && m.location().url) || '';
    if (IGNORABLE.some((re) => re.test(url))) return;
    bucket.push(`console.${m.type()}: ${m.text()}${url ? ' [' + url + ']' : ''}`);
  });
  page.on('pageerror', (e) => bucket.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => bucket.push(`requestfailed: ${r.url()} (${r.failure() && r.failure().errorText})`));
  page.on('response', (r) => { if (r.status() >= 400) bucket.push(`http ${r.status()}: ${r.url()}`); });
}

// Third-party hosts are not reachable from CI: answer them locally so they do not count as site errors.
async function stubExternal(ctx) {
  await ctx.route(/^https?:\/\/(?!localhost)/, (route) => {
    const u = route.request().url();
    if (/fonts\.googleapis\.com/.test(u)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (/maps\.google\.com/.test(u)) return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body style="background:#222"></body></html>' });
    return route.fulfill({ status: 204, body: '' });
  });
}

const clean = (list) => list.filter((m) => !IGNORABLE.some((re) => re.test(m)));

module.exports = { pw, BASE, launch, watch, stubExternal, clean, path };

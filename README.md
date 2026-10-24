# SWK Properties UAE — static site

Warm light theme (cream canvas, deep navy ink, tan/gold accents), serif display type, cinematic golden-hour WebGL hero, scroll-driven 3D depth, dock navigation, fan gallery, glow listing cards.
No runtime dependencies. Output is plain static files in `public/`.

## Build

```bash
python3 build.py          # Python 3.9+, stdlib only
```

Reads `data/*.json`, `src/css`, `src/js`, `src/vendor`, `src/root`. Writes `public/` (27 pages, clean directory URLs, sitemap, robots, assets with a content-hash version).

Edit content in `data/` (properties, communities, services, team, blog, faq, site), then rebuild and commit `public/`.

## Preview and test

```bash
node tools/dev-server.js 8765      # serves public/, draws SVG placeholders for missing /assets/images/*
PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tools/qa.js
```

`tools/qa.js` checks every page (console errors, SEO tags, links, alt text, overflow, axe), the hero scroll scrub, dock, slider, fan, lightbox, filters, calculator maths, forms, a 320–1920px layout sweep, reduced motion, `?nowebgl` and no-JS. Optional: `AXE_PATH` (axe-core file), `SHOTS` (screenshot dir).

## 3D hero

Three.js r160 is vendored (`src/vendor/three.module.min.js`) and loaded only when WebGL works and the visitor has no reduced-motion, save-data or low-memory flag. Otherwise the hero falls back to the photo. Add `?nowebgl` to force the fallback.

The Dubai golden-hour skyline is procedural (`src/js/hero-scene.js`). Scrolling the hero flies the camera down the boulevard; chapter captions follow scroll progress.

The static poster shown before WebGL starts (and used as the fallback) is a render of the scene's first frame, so there is no visible switch. After changing the scene, re-render it: serve `public/`, open `/?hold` (draws one still frame) and screenshot the canvas at 1600x1067 and 900x600 into `src/assets/images/hero/hero-scene.jpg` and `hero-scene-mobile.jpg`.

## Deploy

Upload `public/` to any static host. `vercel.json` sets the output directory, redirects and headers; `public/.htaccess` covers Apache (HTTPS/www redirect, old URL 301s, caching).

Brand assets live in `src/assets/` and the build copies them into `public/assets/`:

- `images/brand` logo, favicon, cursor · `images/hero` · `images/developers` (marquee logos `logo-01..10`) · `images/team` · `images/about` · `images/blog` · `images/communities` · `images/gallery` (`image1..25`)
- `images/properties/{id}-{n}.{png|jpg}`, matching `imageExt` / `imageOrder` in `data/properties.json`
- `fonts/instrument-serif` (display, regular + italic) and `fonts/general-sans` (UI and body, 400-700), declared in `src/css/base.css`. All fonts are self-hosted; nothing loads from Google. `fonts/clash-display` is kept but no longer used.

Add new files under `src/assets/`, never directly in `public/` (the build deletes and regenerates it).

## Needs your input

- `data/site.json` `formEndpoint` is empty. Until set, forms open the visitor's mail app and never claim a message was received.
- `brn` and `tradeLicense` are empty. Fill them in for the footer and legal pages.
- FAQ fee wording (for example the "AED 4,200" DLD admin fee and housing-fee text) is kept from the original site. Verify it before relying on it.
- Privacy and Terms are templates. Have them reviewed.

## Theme and motion

- Colours and fonts are tokens in `src/css/variables.css`. Navy bands (CTA, newsletter, stats, lightbox) re-scope the tokens via `.on-dark`, so components inside them need no overrides.
- Navigation: a top bar on desktop (`.site-header`), the floating dock on tablet and phone. `src/css/theme.css` (loaded last) holds page transitions, skeleton loaders and scroll-scrubbed 3D entrances; `src/js/modules/35-scroll3d.js` drives them. Everything is off under `prefers-reduced-motion`.
- Loading: the main fonts are preloaded, `<img>` tags get intrinsic `width`/`height` read from the files at build time, images show a skeleton until decoded, and the preloader only appears on slow loads.

## Notes

- Mobile dock sits at the bottom of the screen so touch targets stay large.
- An earlier audit counted "14 listings" as a bug. That was real pagination (9 per page). It also said split-text headings lacked accessible text; the original already used sr-only text with `aria-hidden` letters.

## Site-wide UI, SEO and compliance

- `data/site.json` controls the announcement bar (`announcement`), newsletter pop-up (`popup`), analytics IDs (`analytics.ga4/gtm/metaPixel`, loaded only after cookie consent), search-console verification (`verification`) and `twitter`.
- Cookie banner + preferences, toasts, callback modal, back-to-top: `src/js/modules/75-ui.js`, `src/css/ui.css`.
- Each page gets a meta CSP with computed script hashes (`csp_for` in `build.py`); extra headers live in `vercel.json`.
- Generated: `sitemap.xml` (with images), `robots.txt`, `feed.xml`, `manifest.webmanifest`, `.well-known/security.txt`, `/cookies/`.
- `python3 tools/make-icons.py` rebuilds favicon/PWA icons. Hero poster is saved as `src/assets/images/hero/hero-scene(.webp|-mobile.webp)`.

## Cinematic refinement (October 2026)

- `src/css/premium.css` layers pearl, champagne and muted plum over the existing navy; it preserves page structure and includes reduced-motion and mobile rules.
- `src/js/modules/80-concierge.js` provides a deterministic website assistant and explicit WhatsApp handoff. It has no LLM API, agent inbox, server persistence or online-agent detection. A staffed live-chat service remains an integration task.
- Approved customer testimonials belong in `data/testimonials.json` as `{ "quote": "...", "name": "...", "context": "..." }`. Verify permission and provenance before adding them. Until then, the homepage explicitly presents eight service commitments, not reviews. Never add fabricated review schema.
- The new services artwork is an AI-created Dubai illustration, used only on `/services/`. Source: built-in image generation. Prompt: photorealistic Dubai skyline from a limestone terrace at blue hour; distant Burj Khalifa, pearl/mauve/bronze tones, realistic glass and atmospheric depth, space left for a headline; no text, people or trees. Asset: `src/assets/images/hero/dubai-services-cinematic.webp`.
- The WebGL skyline is a stylised composite with developer wordmarks, not a geographically exact recreation or an assertion of a developer relationship. Vehicle details use generic sedan/SUV geometry, not licensed manufacturer models. A film-quality, location-accurate scene needs surveyed/licensed geometry, texture and reference work.
- **Hero posters must be re-rendered after the skyline change.** The existing posters still show the previous scene. Follow the `/?hold` procedure above with a working browser before production deployment.

### Editorial expansion

The three existing journal posts now support answer-first introductions, individual sections, official source links and a real `dateModified`. Existing URLs and publication dates are preserved. Their updated date is 24 October 2026. They do not promise yields, eligibility or processing times.

The requested 400+ article archive is **not published by this change**. Create individually researched articles covering the 2011–2026 period as retrospectives published on their actual publication date. Source historical comparisons from DLD open data and Digital Dubai; state the period and methodology, distinguish asking prices from completed transactions, and document revisions. Do not manufacture a historical SWK publishing history or multiply near-identical keyword pages. Google guidance: https://developers.google.com/search/docs/essentials/spam-policies#scaled-content

Before expanding: add category pagination, search, author/reviewer records, per-article source dates, unique media and related-content limits. Each article needs an original question, verified evidence, a useful answer and editorial review. Ranking or inclusion in AI answers cannot be guaranteed.

### Validation for this change

`python3 build.py`, `python3 tools/check-static.py`, JavaScript syntax checks, and `git diff --check` pass. Browser QA includes new carousel and chat checks in `tools/qa.js`, but could not run in the editing environment: Chromium is absent, its download failed, and the remote browser cannot access the local preview. Desktop/mobile visual QA, performance and the poster re-render remain required before merging. Form endpoints, licence fields and analytics verification still require owner configuration as documented above.

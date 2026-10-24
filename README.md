# SWK Properties UAE — static site

Warm light theme (cream canvas, deep navy ink, tan/gold accents), serif display type, cinematic golden-hour WebGL hero, scroll-driven 3D depth, dock navigation, fan gallery, glow listing cards.
No runtime dependencies. Output is plain static files in `public/`.

## Build

```bash
python3 build.py          # Python 3.9+, stdlib only
```

Reads `data/*.json`, `src/css`, `src/js`, `src/vendor`, `src/root`. Writes `public/` (462 pages, clean directory URLs, sitemap, robots, assets with a content-hash version).

Edit content in `data/` (properties, communities, services, team, blog, faq, site), then rebuild and commit `public/`.

## Preview and test

```bash
node tools/dev-server.js 8765      # serves public/, draws SVG placeholders for missing /assets/images/*
PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tools/qa.js
```

`tools/qa.js` checks every page (console errors, SEO tags, links, alt text, overflow, axe), the hero scroll scrub, dock, slider, fan, lightbox, filters, calculator maths, forms, a 320–1920px layout sweep, reduced motion, `?nowebgl` and no-JS. Optional: `AXE_PATH` (axe-core file), `SHOTS` (screenshot dir).

## 3D hero

Three.js r160 is vendored (`src/vendor/three.module.min.js`) and loaded only when WebGL works and the visitor has no reduced-motion, save-data or low-memory flag. Otherwise the hero falls back to the photo. Add `?nowebgl` to force the fallback.

The optional Dubai golden-hour skyline is procedural (`src/js/hero-scene.js`). Scrolling the hero flies the camera down the boulevard; chapter captions follow scroll progress.

The homepage defaults to an AI-created cinematic Dubai visualisation with scroll-driven motion. `/?scene=3d` selects the procedural walkthrough. Its fallback posters are clean renders of the first frame. Run `tools/render-posters.cjs` against the local server after changing the scene; it hides UI overlays before capture. Convert the desktop and portrait PNGs to `src/assets/images/hero/hero-scene-cinematic.webp` and `hero-scene-mobile-cinematic.webp`. Use new filenames when replacing cached imagery.

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

## Completed refinement — 24 October 2026

- Existing page structure is preserved. Pearl, champagne and muted plum complement navy; portfolio photos respond to pointer movement; service and team cards animate; all five colleagues appear in a desktop row.
- The homepage has a cinematic visualisation and an optional interactive 3D walkthrough. Both support reduced motion and static fallback. Generated art is labelled as a visualisation, not an advertised property's photograph. The 3D city remains stylised rather than a geographically exact film-production model.
- `src/assets/images/hero/dubai-cinema-home.webp` is a unique built-in image-generation asset. Prompt: cinematic Dubai boulevard at champagne sunset, correctly proportioned Burj Khalifa, architectural EMAAR/SOBHA wordmarks, realistic UAE vehicles, limestone and reflective glass; no UI or text overlays. A second edit removed the remaining trees and greenery. The unique services illustration remains confined to `/services/`.
- Home uses eight service commitments while real testimonials are unavailable. Add only approved, verified quotes to `data/testimonials.json` as `{ "quote": "...", "name": "...", "context": "..." }`. Never invent customers or review schema.
- SWK's own visitor chat, API and operator inbox are implemented. Read [SWK-LIVE-CHAT.md](docs/SWK-LIVE-CHAT.md) for private storage and operator configuration. The site does not pretend chat is configured when it is not. The static property assistant and WhatsApp handoff remain usable.
- The journal now includes **416 statistical area/year reports**, plus the three expanded guides. Source evidence is an independent CC BY 4.0 snapshot derived from DLD data, covering sales through **5 October 2026**. All new reports are published **24 October 2026**, with historical observation periods explicitly separated from publication dates. They are labelled as programmatic analysis, not individually authored eyewitness accounts or official DLD reports.
- Every report has figures, sample limitations, registration/quarter/bedroom tables and a downloadable aggregate. Tiny price cells are labelled small sample. Source provenance and SHA-256 are in `data/research-source.json`; inspectable aggregates are in `data/research-statistics.json`. Full narrative data is committed as `data/research.json.gz`, keeping normal builds dependency-free. Research regeneration alone needs pandas/pyarrow and the licensed source Parquet: `python3 tools/build-research.py /path/to/snapshot.parquet` (requires the expected checksum, unless `--refresh` is explicitly chosen).
- `/blog/research/` provides year browsing and search, with 26 reports per year across 2011–2026. `/swk-inbox/` is excluded from public indexing; API authentication protects messages.

### Build and deploy

Vercel now runs `python3 build.py`. The additional research pages and their downloadable JSON files are generated from committed data, rather than committing hundreds of generated copies. **Run the build before serving locally or deploying to another static host.** The first-party chat requires a Node-capable host; static-only hosting retains the property assistant and WhatsApp fallback.

### Checks

- `python3 build.py` and `python3 tools/check-static.py`: all generated pages, links/assets, unique IDs, H1s, canonical URLs and JSON-LD.
- `node --test tools/chat.test.cjs tools/research.test.cjs`: authentication, isolation, expiry, rate limits and all 416 cohort invariants/downloads.
- `CHROMIUM_PATH=/path/to/chromium node tools/chat-integration.cjs`: separate visitor/operator browser contexts, mobile chat, actual reply exchange and thread closure against test-only storage.
- `QA_RESEARCH_SAMPLE=1 CHROMIUM_PATH=/path/to/chromium node tools/qa.js`: every original public template, every year index and one report per year, plus the full interaction/mobile/fallback suite. Omit `QA_RESEARCH_SAMPLE` to visit every public URL. Start the local server in the same network environment as the tests.

Production activation still needs private Redis/operator settings. Genuine testimonials require approved customer material. Form endpoints, licence fields and verification IDs remain owner-managed configuration; no search-ranking guarantee is made.

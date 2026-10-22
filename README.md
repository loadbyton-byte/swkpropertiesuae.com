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

The static poster shown before WebGL starts (and used as the fallback) is a render of the scene's first frame, so there is no visible switch. After changing the scene, re-render it: serve `public/`, open `/?hold` (draws one still frame) and screenshot the canvas at 1600x1067 and 900x600 into `src/assets/images/hero/dubai-golden.jpg` and `dubai-golden-mobile.jpg`.

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

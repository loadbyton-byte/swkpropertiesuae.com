# SWK Properties UAE — static site

Light corporate theme (white canvas, navy ink, coral / gold / azure / teal accents), daytime WebGL skyline hero, scroll-driven 3D depth, dock navigation, fan gallery, glow listing cards.
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

The sunlit Dubai skyline is procedural (`src/js/hero-scene.js`). Scrolling the hero flies the camera down the boulevard; chapter captions follow scroll progress. The static poster used before WebGL starts (and as the fallback) is a render of that scene: `src/assets/images/hero/dubai-day*.jpg`. Re-render it after changing the scene.

## Theme and motion

- Colours are tokens in `src/css/variables.css`. Navy surfaces (footer, stats band, lightbox) are "dark islands": they re-scope the semantic tokens, so components inside need no overrides.
- `src/css/theme.css` is loaded last: skyline divider, stat ribbon, image skeletons, scroll-scrubbed 3D entrances, cross-page View Transitions.
- `src/js/modules/35-scroll3d.js` drives the scrubbed entrances and parallax skyline. Everything is off for `prefers-reduced-motion`.
- Logo variants: `swk-logo.png` (white, for navy) and `swk-logo-dark.png` (navy, for light). `favicon-app.png` and `favicon-32.png` are navy tiles; `swk-cursor-dark.png` is the cursor.
- Loading: the two main self-hosted fonts are preloaded, Google Fonts load without blocking render, `<img>` tags get intrinsic `width`/`height` from the files, and the preloader only appears on slow loads.

## Deploy

Upload `public/` to any static host. `vercel.json` sets the output directory, redirects and headers; `public/.htaccess` covers Apache (HTTPS/www redirect, old URL 301s, caching).

Brand assets live in `src/assets/` and the build copies them into `public/assets/`:

- `images/brand` logo, favicon, cursor · `images/hero` · `images/developers` (marquee logos `logo-01..10`) · `images/team` · `images/about` · `images/blog` · `images/communities` · `images/gallery` (`image1..25`)
- `images/properties/{id}-{n}.{png|jpg}`, matching `imageExt` / `imageOrder` in `data/properties.json`
- `fonts/clash-display` and `fonts/general-sans` (woff2, weights 400-700), declared in `src/css/base.css`

Inter, Playfair Display and Bodoni Moda are still loaded from Google Fonts. Add new files under `src/assets/`, never directly in `public/` (the build deletes and regenerates it).

## Needs your input

- `data/site.json` `formEndpoint` is empty. Until set, forms open the visitor's mail app and never claim a message was received.
- `brn` and `tradeLicense` are empty. Fill them in for the footer and legal pages.
- FAQ fee wording (for example the "AED 4,200" DLD admin fee and housing-fee text) is kept from the original site. Verify it before relying on it.
- Privacy and Terms are templates. Have them reviewed.

## Notes

- Mobile dock sits at the bottom of the screen so touch targets stay large.
- An earlier audit counted "14 listings" as a bug. That was real pagination (9 per page). It also said split-text headings lacked accessible text; the original already used sr-only text with `aria-hidden` letters.

# swkpropertiesuae.com

Static site for SWK Properties. Content lives in `data/`, templates in `build.py`, and the generated site is written to `public/` (committed, so it can be uploaded as-is).

```
python3 build.py        # needs Python 3.12+, no dependencies
```

## Deploy
1. Copy the existing image folders from the live host into `static/images/` (`brand/`, `hero/`, `gallery/`, `properties/`, `developers/`, `blog/`, `about/`) and run the build. The repo does not contain the images.
2. Upload the contents of `public/` to the web root (it includes `.htaccess`, which 301-redirects the old `.html` and `?id=` / `?slug=` URLs, forces HTTPS + www and sets security headers; Apache only).
3. Submit `https://www.swkpropertiesuae.com/sitemap.xml` in Google Search Console.

## What changed vs. the old site
- One real page per property and article (clean URLs, canonical, Open Graph with absolute image URLs, JSON-LD), `robots.txt`, `sitemap.xml`, branded `404.html`.
- Community cards, filter options, counts and "N properties found" are generated from `data/properties.json`, so they cannot drift from the real inventory. Filters work identically on the home and listings pages.
- Off-plan "ROI" figures (40–50%) removed. Only ready properties show an **estimated gross yield**, labelled as such.
- Unverifiable stats removed ("100+ homes sold", "100% client satisfaction"); the IT-admin "expert" and the mismatched team list replaced with the About-page consultants.
- Mortgage calculator: enforces the 20% / 50% minimum deposit, correct "total repaid", separate one-off cost estimates, clamps only on blur.
- FAQ corrections (housing fee is normally paid by the tenant; yield method described accurately).
- Privacy Policy and Terms pages, consent checkboxes on forms, no dead `#` links, no Facebook link, current copyright range, no build tag.
- Split-text headings removed (duplicated H1 text / missing spaces); decorative gallery has empty alt text; one H1 per page.
- Google Maps JS key removed (keyless embed).

## Needs your input before launch
- **`data/site.json` → `formEndpoint`**: the forms need a backend. Until one is set (e.g. a Formspree/Basin URL), submitting opens the visitor's email app instead of pretending to send. Never shows a false "received" message.
- **`brn`, `tradeLicense`** in `site.json` and **`permit`** per listing in `properties.json`: Dubai property advertising generally requires permit and broker numbers. They render automatically once filled in.
- **Properties**: only the 9 listings that were visible in the old page are included (it claimed 14). Add the rest to `properties.json`. `type` is `Residential` where the old site didn't say; detail pages for those listings show only what the old site published (no floor plans, areas or amenities).
- **River Cove Residences** is in Abu Dhabi, so the site is now positioned as Dubai *and* Abu Dhabi. Remove the listing if that's unintended.
- **Office hours** (`Sun–Thu, Sat`) were kept as published; confirm they're correct.
- **Fees in the FAQ/calculator** (DLD admin fee AED 4,000 / 2,000, 4% transfer, 0.25% registration) should be checked against current DLD rules.
- **Privacy/Terms** are standard templates, have them reviewed by counsel.
- Blog posts were expanded with general, hedged content; have a consultant review them and update dates when edited.

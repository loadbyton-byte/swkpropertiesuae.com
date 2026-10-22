#!/usr/bin/env python3
"""Static site generator for swkpropertiesuae.com (no dependencies, Python 3.9+).

    python3 build.py        # writes the finished site to public/

Content lives in data/*.json, styles in src/css, scripts in src/js, templates
in this file. Pages are real HTML files (no client-side rendering), so search
engines, link previews and no-JS visitors all get the full content.
"""
import hashlib
import html
import json
import re
import shutil
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "public"
DATA = ROOT / "data"


def load(name):
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


SITE = load("site")
PROPS = load("properties")
COMMUNITIES = load("communities")
SERVICES = load("services")
FAQ = load("faq")
TEAM = load("team")
POSTS = sorted(load("blog"), key=lambda p: p["date"], reverse=True)

BASE = SITE["url"]
TODAY = date.today()
e = html.escape

# ---------------------------------------------------------------- helpers

BUDGETS = [
    ("0-1000000", "Up to AED 1M"),
    ("1000000-3000000", "AED 1M - 3M"),
    ("3000000-6000000", "AED 3M - 6M"),
    ("6000000-10000000", "AED 6M - 10M"),
    ("10000000", "AED 10M+"),
]
FEATURE_THEMES = ["14 78% 55%", "28 70% 45%", "250 50% 32%", "189 55% 32%", "150 45% 28%"]
SERVICE_THEMES = ["14 78% 55%", "189 55% 40%", "250 55% 45%", "150 45% 38%", "38 75% 50%", "220 12% 55%"]
PAGE_HERO_IMG = "hero/dubai-skyline-hero.jpg"


def money(n):
    return f"AED {n:,.0f}"


def num(n):
    return f"{n:,.2f}".rstrip("0").rstrip(".")


def roi(p):
    return f"{p['roiPercent']:g}% ROI"


def nice_date(iso):
    d = datetime.strptime(iso, "%Y-%m-%d")
    return f"{d.day} {d.strftime('%B %Y')}"


def wa(text):
    return f"https://wa.me/{SITE['phone'].lstrip('+')}?text={quote(text)}"


WA_DEFAULT = wa("Hello SWK Properties, I'd like to know more about your listings.")


def asset(path):
    return "/" + path.lstrip("/")


def prop_images(p):
    return [f"assets/images/properties/{p['id']}-{n}.{p['imageExt']}" for n in p["imageOrder"]]


def location(p):
    return f"{p['community']}, {p.get('emirate') or 'Dubai'}"


def count_in(community):
    return sum(1 for p in PROPS if p["community"] == community)


def img(src, alt="", cls="", lazy=True, extra=""):
    c = f' class="{cls}"' if cls else ""
    l = ' loading="lazy"' if lazy else ""
    return f'<img src="{asset(src)}" alt="{e(alt)}"{c}{l} decoding="async"{extra}>'


def cascade(text):
    """Hover letter-reveal heading. Plain text for assistive tech, split chars for sighted users."""
    out, i = [], 0
    for word in text.split(" "):
        chars = []
        for ch in word:
            chars.append(f'<span class="cascade-text__char" style="transition-delay: {i * 25}ms;">{e(ch)}</span>')
            i += 1
        out.append(f'<span class="cascade-text__word">{"".join(chars)}</span>')
    style = "--cascade-shadow-y: 1.28em; --cascade-duration: 250ms; --cascade-color: var(--white); --cascade-hover-color: var(--ember-400);"
    return (f'<span class="sr-only">{e(text)}</span><span aria-hidden="true">{" ".join(out)}</span>', style)


def h2_cascade(text, extra_cls=""):
    inner, style = cascade(text)
    return f'<h2 class="font-clash cascade-text {extra_cls}" style="{style}">{inner}</h2>'


GLOW = ('<div class="ambient-glow" aria-hidden="true"><div class="ambient-glow__blob ambient-glow__blob--a"></div>'
        '<div class="ambient-glow__blob ambient-glow__blob--b"></div></div>')

# ---------------------------------------------------------------- icons

ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>'
PIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>'
SEARCH = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
CHEV = '<svg class="calc-disclosure__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>'
NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>'
WHATSAPP = ('<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.27 4.9L2 22l5.24-1.38a9.96 9.96 0 0 0 4.8 1.22h.01c5.52 0 10-4.48 10-10s-4.49-9.84-10.01-9.84Zm5.8 14.2c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.12.11-1.8-.11-.42-.14-.95-.3-1.64-.6-2.88-1.24-4.76-4.15-4.9-4.34-.14-.19-1.17-1.56-1.17-2.98 0-1.41.74-2.1 1-2.39.26-.28.58-.35.77-.35.19 0 .39 0 .55.01.18.01.42-.07.65.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.68-.79.86-1.06.18-.28.36-.23.6-.14.24.09 1.55.73 1.82.87.27.14.45.21.51.32.07.12.07.65-.17 1.33Z"/></svg>')

DOCK = [
    ("/", "Home", '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>'),
    ("/properties/", "Properties", '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-4h6v4M9 7h1M9 11h1M14 7h1M14 11h1"/>'),
    ("/about/", "About", '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/>'),
    ("/services/", "Services", '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>'),
    ("/mortgage/", "Mortgage", '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>'),
    ("/blog/", "Blog", '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>'),
    ("/contact/", "Contact", '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>'),
]

SERVICE_ICONS = {
    "buying-selling": '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    "investment-advisory": '<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
    "property-management": '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l3 3"/>',
    "mortgage-assistance": '<path d="M3 10l9-6 9 6"/><path d="M5 10v9M9 10v9M15 10v9M19 10v9M3 21h18"/>',
    "legal-documentation": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    "interior-fitout": '<path d="M4 18v-5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5M4 18h16M6 10V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2M6 18v2M18 18v2"/>',
}


def service_icon(sid):
    return f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">{SERVICE_ICONS[sid]}</svg>'


# ---------------------------------------------------------------- assets

ASSET_V = ""


def build_assets():
    """Concatenate CSS and JS, fingerprint them, and copy vendor files."""
    global ASSET_V
    css_order = ["variables", "base", "components", "sections", "animations", "responsive", "cinematic"]
    css = "\n".join((SRC / "css" / f"{n}.css").read_text(encoding="utf-8") for n in css_order)
    css = css.replace("../assets/", "/assets/")
    mods = sorted((SRC / "js" / "modules").glob("*.js"))
    js = "\n".join(m.read_text(encoding="utf-8") for m in mods)
    scene = (SRC / "js" / "hero-scene.js").read_text(encoding="utf-8")
    ASSET_V = hashlib.sha1((css + js + scene).encode("utf-8")).hexdigest()[:8]

    (OUT / "assets" / "css").mkdir(parents=True, exist_ok=True)
    (OUT / "assets" / "js").mkdir(parents=True, exist_ok=True)
    (OUT / "assets" / "vendor").mkdir(parents=True, exist_ok=True)
    (OUT / "assets" / "css" / "site.css").write_text(css, encoding="utf-8")
    (OUT / "assets" / "js" / "main.js").write_text(js, encoding="utf-8")
    (OUT / "assets" / "js" / "hero-scene.js").write_text(scene, encoding="utf-8")
    for f in (SRC / "vendor").iterdir():
        shutil.copy(f, OUT / "assets" / "vendor" / f.name)
    for f in (SRC / "root").iterdir():
        shutil.copy(f, OUT / f.name)
    # Brand assets: images (logo, hero, listings, team...) and self-hosted fonts.
    shutil.copytree(SRC / "assets", OUT / "assets", dirs_exist_ok=True)


# ---------------------------------------------------------------- layout

FONTS = ("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700"
         "&family=Bodoni+Moda:wght@600;700&display=swap")


def dock(path):
    items = []
    for href, label, d in DOCK:
        cur = href == path or (href != "/" and path.startswith(href))
        c = ' aria-current="page"' if cur else ""
        items.append(
            f'<a class="dock__item" href="{href}" aria-label="{label}"{c}>'
            f'<span class="dock__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">{d}</svg></span>'
            f'<span class="dock__tooltip" aria-hidden="true">{label}</span></a>')
    return f'<nav class="dock-wrap" aria-label="Quick navigation"><div class="dock" data-dock>{"".join(items)}</div></nav>'


PRELOADER = """<div class="preloader" role="status" aria-live="polite">
<img src="/assets/images/brand/swk-logo.png" alt="" class="preloader__logo">
<div class="preloader__spinner" aria-hidden="true"></div><span class="preloader__text">Loading...</span></div>
<script>
(function () {
  var el = document.querySelector('.preloader');
  if (!el) return;
  // Only reveal the loader if the page hasn't finished within 300ms, so it never flashes on a fast connection.
  window.__swkPreloaderTimer = setTimeout(function () { el.classList.add('is-visible'); }, 300);
  // Safety net independent of main.js: the loader can never trap a visitor.
  setTimeout(function () { var x = document.querySelector('.preloader'); if (x && x.parentNode) x.parentNode.removeChild(x); }, 8000);
})();
</script>"""


def footer():
    comm_links = [c for c in COMMUNITIES if count_in(c["name"]) > 0][:5]
    clinks = "".join(f'<li><a href="/properties/?community={quote(c["name"])}">{e(c["name"])}</a></li>' for c in comm_links)
    ids = [SITE["rera"]]
    if SITE.get("brn"):
        ids.append(f"BRN {SITE['brn']}")
    if SITE.get("tradeLicense"):
        ids.append(f"Licence {SITE['tradeLicense']}")
    year = f"{SITE['founded']}–{TODAY.year}"
    return f"""<footer class="site-footer">
<a href="{WA_DEFAULT}" class="whatsapp-float" aria-label="Chat with SWK Properties on WhatsApp" target="_blank" rel="noopener noreferrer">{WHATSAPP}</a>
<div class="footer-glow" aria-hidden="true"><div class="footer-glow__blob footer-glow__blob--a"></div><div class="footer-glow__blob footer-glow__blob--b"></div></div>
<div class="container footer-card"><div class="footer-grid">
<div class="footer-col"><a href="/" class="brand" style="color:var(--cream-50)"><img src="/assets/images/brand/swk-logo.png" alt="SWK Properties" class="brand-logo" loading="lazy" decoding="async"></a>
<p style="margin-top:var(--space-4); max-width:34ch">A premium Dubai real estate agency helping investors and homeowners buy, sell and manage property with confidence.</p>
<div class="social-row">
<a href="{SITE['instagram']}" target="_blank" rel="noopener noreferrer" aria-label="SWK Properties on Instagram"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></a>
<a href="{SITE['linkedin']}" target="_blank" rel="noopener noreferrer" aria-label="SWK Properties on LinkedIn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 10v7M7 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/></svg></a>
</div></div>
<div class="footer-col"><h2 class="footer-title">Explore</h2><ul><li><a href="/properties/">Properties</a></li><li><a href="/about/">About Us</a></li><li><a href="/services/">Services</a></li><li><a href="/mortgage/">Mortgage Calculator</a></li><li><a href="/blog/">Journal</a></li></ul></div>
<div class="footer-col"><h2 class="footer-title">Communities</h2><ul>{clinks}</ul></div>
<div class="footer-col"><h2 class="footer-title">Stay Updated</h2><p style="font-size:var(--fs-sm)">Market insights and new launches, monthly.</p>
<form class="footer-newsletter" data-form="newsletter" data-endpoint="{e(SITE['formEndpoint'])}" aria-label="Newsletter signup" novalidate>
<label for="newsletter-email" class="sr-only">Email address</label>
<input type="email" id="newsletter-email" name="email" placeholder="Your email" autocomplete="email" required>
<button type="submit" class="btn btn-primary btn-sm">Join</button>
<input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
<label class="form-check" style="flex-basis:100%"><input type="checkbox" name="consent" required><span>I agree to receive market updates and accept the <a href="/privacy/">Privacy Policy</a>.</span></label>
<p class="form-status" role="status" aria-live="polite" hidden style="flex-basis:100%"></p>
</form>
<p style="margin-top:var(--space-5); font-size:var(--fs-sm)"><a href="tel:{SITE['phone']}">{SITE['phoneDisplay']}</a><br><a href="mailto:{SITE['email']}">{SITE['email']}</a><br>{e(SITE['address'])}</p>
</div></div></div>
<div class="footer-bottom container"><span>© {year} {SITE['name']}. All rights reserved. {' · '.join(e(i) for i in ids)}.</span>
<span><a href="/privacy/">Privacy Policy</a> · <a href="/terms/">Terms of Use</a></span></div>
</footer>"""


def head(path, title, desc, image, ld, og_type, robots, preload):
    url = BASE + path
    og = f"{BASE}/assets/images/{image}"
    ld_json = "".join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in (ld or []))
    rb = f'<meta name="robots" content="{robots}">\n' if robots else ""
    pre = "".join(f'<link rel="preload" as="image" href="{u}"{a}>\n' for u, a in (preload or []))
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="theme-color" content="#07090d">
<meta name="color-scheme" content="dark">
<link rel="canonical" href="{url}">
{rb}<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="{SITE['name']}">
<meta property="og:locale" content="en_AE">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{og}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(desc)}">
<meta name="twitter:image" content="{og}">
<link rel="icon" type="image/png" href="/assets/images/brand/favicon.png">
<script>document.documentElement.classList.add('js');</script>
{pre}<link rel="preconnect" href="https://fonts.googleapis.com/">
<link rel="preconnect" href="https://fonts.gstatic.com/" crossorigin>
<link href="{FONTS}" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css?v={ASSET_V}">
{ld_json}</head>"""


def page(path, title, desc, body, *, image=PAGE_HERO_IMG, ld=None, og_type="website", robots=None, preload=None):
    return head(path, title, desc, image, ld, og_type, robots, preload) + f"""
<body>
<div class="scroll-progress" aria-hidden="true"></div>
{PRELOADER}
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header-bar"><a href="/" class="site-brand" aria-label="SWK Properties — Home"><img src="/assets/images/brand/swk-logo.png" alt="SWK Properties" class="brand-logo" decoding="async"></a></header>
{dock(path)}
<main id="main">
{body}
</main>
{footer()}
<script>window.SWK_V="{ASSET_V}";window.SWK_ASSETS="/assets/js/";</script>
<script src="/assets/js/main.js?v={ASSET_V}" defer></script>
</body>
</html>
"""


def write(path, content):
    rel = path.strip("/")
    target = OUT / rel / "index.html" if not rel.endswith((".html", ".txt", ".xml")) else OUT / rel
    if path == "/":
        target = OUT / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


# ---------------------------------------------------------------- components

def crumbs(items):
    parts = []
    for i, (label, href) in enumerate(items):
        if href:
            parts.append(f'<a href="{href}">{e(label)}</a>')
        else:
            parts.append(f'<span aria-current="page">{e(label)}</span>')
    return '<nav class="breadcrumbs" aria-label="Breadcrumb" style="margin-bottom:var(--space-4)">' + ' <span aria-hidden="true">/</span> '.join(parts) + "</nav>"


def breadcrumb_ld(items):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": label, "item": BASE + (href or "")} for i, (label, href) in enumerate(items)]}


def page_hero(title, lead, trail):
    return f"""<section class="page-hero"><div class="container">{crumbs(trail)}
<h1 class="page-hero__title">{e(title)}</h1><p>{e(lead)}</p></div></section>"""


def badges(p):
    return f'<span class="badge badge-navy">{e(p["status"])}</span>' + (f'<span class="badge badge-gold">{roi(p)}</span>' if p.get("roiPercent") else "")


def feature_card(p, i):
    theme = FEATURE_THEMES[i % len(FEATURE_THEMES)]
    cover = prop_images(p)[0]
    return f"""<article class="property-card property-card--feature" data-reveal data-reveal-delay="{min(i, 3) * 70}" data-tilt="9" style="--theme-color:{theme}">
<a href="/properties/{p['id']}/" class="property-card__feature-link" aria-label="View details for {e(p['title'])}">
{img(cover, "", "property-card__feature-bg")}
<div class="property-card__feature-overlay"></div>
<div class="property-card__badges property-card__badges--feature">{badges(p)}</div>
<div class="property-card__feature-content"><h3 class="property-card__feature-title">{e(p['title'])}</h3>
<div class="property-card__feature-location">{PIN} {e(location(p))}</div>
<div class="property-card__feature-price"><span class="label">Starting Price</span>{money(p['price'])}</div>
<div class="property-card__explore"><span>Explore Now</span><svg class="property-card__explore-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg></div></div>
</a></article>"""


def prop_card(p, reveal=False):
    cover = prop_images(p)[0]
    rv = ' data-reveal' if reveal else ""
    return f"""<article class="property-card"{rv} data-tilt="6" data-community="{e(p['community'])}" data-type="{e(p['type'])}" data-status="{e(p['status'])}" data-price="{p['price']}">
<a href="/properties/{p['id']}/" class="property-card__link" aria-label="View details for {e(p['title'])}">
<div class="property-card__media"><div class="property-card__badges">{badges(p)}</div>{img(cover, f"{p['title']} in {p['community']}")}</div>
<div class="property-card__body"><div class="property-card__price">{money(p['price'])} <span>starting</span></div>
<h3 class="property-card__title">{e(p['title'])}</h3><div class="property-card__location">{PIN} {e(location(p))}</div>
<div class="property-card__meta"><div class="property-card__meta-item"><span class="label">Developer</span><span class="value">{e(p['developer'])}</span></div>
<div class="property-card__meta-item"><span class="label">Payment plan</span><span class="value">{e(p['paymentPlan'])}</span></div>
<div class="property-card__meta-item"><span class="label">Handover</span><span class="value">{e(p['handover'])}</span></div></div></div>
</a></article>"""


def blog_card(p, i=0):
    return f"""<article class="blog-card" data-reveal data-reveal-delay="{i * 70}">
<a href="/blog/{p['slug']}/" aria-label="Read: {e(p['title'])}"><div class="blog-card__media">{img(p['image'], p['title'])}</div>
<div class="blog-card__body"><span class="badge badge-gold" style="align-self:flex-start">{e(p['category'])}</span>
<h3>{e(p['title'])}</h3><p>{e(p['excerpt'])}</p>
<span class="blog-card__date"><time datetime="{p['date']}">{nice_date(p['date'])}</time> · {e(p['readTime'])}</span></div></a></article>"""


def select(id_, name, label, options, any_label, cls=""):
    opts = f'<option value="">{any_label}</option>' + "".join(f'<option value="{e(v)}">{e(t)}</option>' for v, t in options)
    return f'<div class="search-field {cls}"><label for="{id_}">{label}</label><select id="{id_}" name="{name}">{opts}</select></div>'


def filter_options():
    comm = sorted({p["community"] for p in PROPS})
    types = sorted({p["type"] for p in PROPS})
    return ([(c, c) for c in comm], [(t, t) for t in types], BUDGETS, [("Ready", "Ready"), ("Off-Plan", "Off-Plan"), ("Under Construction", "Under Construction")])


def calculator(analyze_href, analyze_label="Analyze"):
    return f"""<div class="calculator" data-calculator>
<div class="calc-card">
<h3 class="calc-card__title">Mortgage Calculator</h3>
<div class="calc-field"><label for="c-price">Property value (AED)</label><input class="calc-input" id="c-price" type="number" inputmode="numeric" min="200000" max="50000000" step="10000" value="2500000" data-calc-field="price"></div>
<div class="calc-field"><span class="calc-field__label" id="c-down-l">Down payment</span>
<div class="calc-input-group"><input class="calc-input" id="c-down" type="number" inputmode="decimal" min="0" step="1" value="25" aria-labelledby="c-down-l" aria-describedby="c-hint" data-calc-field="down">
<div class="calc-toggle" role="group" aria-label="Down payment unit"><button type="button" class="calc-toggle__btn is-active" data-down-unit="percent" aria-pressed="true">%</button><button type="button" class="calc-toggle__btn" data-down-unit="amount" aria-pressed="false">AED</button></div></div>
<small class="calc-hint" id="c-hint" data-calc-hint aria-live="polite">Minimum 20% for UAE residents on a first home; non-residents typically 50%.</small></div>
<div class="calc-field"><span class="calc-field__label" id="c-term-l">Loan term (years)</span>
<div class="calc-pill-group" role="group" aria-labelledby="c-term-l"><button type="button" class="calc-pill" data-calc-term="15" aria-pressed="false">15</button><button type="button" class="calc-pill" data-calc-term="20" aria-pressed="false">20</button><button type="button" class="calc-pill is-active" data-calc-term="25" aria-pressed="true">25</button></div></div>
<div class="calc-field"><label for="c-rate">Annual interest rate (%)</label><input class="calc-input" id="c-rate" type="number" inputmode="decimal" min="0" max="25" step="0.1" value="4.5" data-calc-field="rate"></div>
<div class="calc-field-row"><div class="calc-field"><label for="c-start">Start date</label><input class="calc-input" id="c-start" type="date" data-calc-field="startDate"></div>
<div class="calc-field"><label for="c-end">Payoff date</label><input class="calc-input" id="c-end" type="text" readonly data-calc-output="endDate"></div></div>
<button type="button" class="btn-calc btn-calc--block" data-calc-recalc>Calculate</button>
</div>
<div class="calc-card">
<h3 class="calc-card__title">Monthly Payment</h3>
<div class="calc-donut-row"><div class="calc-donut"><svg class="calc-donut__svg" viewBox="0 0 120 120" aria-hidden="true">
<circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="16"/>
<g class="calc-donut__ring"><circle class="calc-donut__seg calc-donut__seg--pi" data-seg="pi" cx="60" cy="60" r="48"/><circle class="calc-donut__seg calc-donut__seg--svc" data-seg="svc" cx="60" cy="60" r="48"/><circle class="calc-donut__seg calc-donut__seg--ins" data-seg="ins" cx="60" cy="60" r="48"/></g></svg>
<div class="calc-donut__center"><span class="calc-donut__amount" data-calc-output="monthlyPayment" aria-live="polite">AED 0</span></div></div>
<ul class="calc-legend"><li><span class="calc-legend__dot calc-legend__dot--pi"></span>Principal &amp; interest <b data-calc-output="piAmount">AED 0</b></li>
<li><span class="calc-legend__dot calc-legend__dot--svc"></span>Service charges (est.) <b data-calc-output="svcAmount">AED 0</b></li>
<li><span class="calc-legend__dot calc-legend__dot--ins"></span>Mortgage insurance (est.) <b data-calc-output="insAmount">AED 0</b></li></ul></div>
<p class="calc-sublabel">Total monthly cost including estimated service charges and insurance. Only principal &amp; interest goes to the bank.</p>
<button type="button" class="calc-disclosure" data-calc-disclosure aria-expanded="false" aria-controls="calc-panel"><span>Down payment, loan &amp; interest breakdown</span>{CHEV}</button>
<div class="calc-disclosure__panel" id="calc-panel" data-calc-disclosure-panel hidden>
<div class="row"><span>Down payment</span><span data-calc-output="downAmount">AED 0</span></div>
<div class="row"><span>Loan amount</span><span data-calc-output="loanAmount">AED 0</span></div>
<div class="row"><span>Total interest</span><span data-calc-output="totalInterest">AED 0</span></div>
<div class="row"><span>Total repaid to the bank</span><span data-calc-output="totalPayment">AED 0</span></div>
<div class="row"><span>Total cost incl. down payment</span><span data-calc-output="totalCost">AED 0</span></div></div>
<p class="calc-sublabel">Illustrative only. Final rates and terms depend on your bank and profile. UAE residents can typically borrow up to 80% of a first property's value; non-residents up to about 50%.</p>
<div class="calc-card__actions"><a href="{analyze_href}" class="btn btn-outline-dark">{analyze_label}</a></div>
</div></div>"""


def cta_section(title="Ready to find your next address in Dubai?", text="Tell us what you're looking for and one of our consultants will curate a shortlist within 24 hours."):
    return f"""<section class="section section--alt ambient-glow-host" style="text-align:center">{GLOW}
<div class="container"><h2>{e(title)}</h2><p style="max-width:52ch; margin:var(--space-4) auto 0">{e(text)}</p>
<div class="hero__ctas" style="justify-content:center; margin-top:var(--space-6)">
<a href="/contact/" class="btn btn-primary btn-lg">Book a Consultation</a>
<a href="{wa("Hello, I'd like to speak to a consultant about buying property in Dubai.")}" class="btn btn-whatsapp btn-lg" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a></div></div></section>"""


def org_ld():
    return {"@context": "https://schema.org", "@type": "RealEstateAgent", "@id": BASE + "/#org", "name": SITE["name"], "url": BASE + "/",
            "logo": f"{BASE}/assets/images/brand/swk-logo.png", "image": f"{BASE}/assets/images/{PAGE_HERO_IMG}",
            "telephone": SITE["phone"], "email": SITE["email"], "areaServed": "Dubai, United Arab Emirates", "foundingDate": str(SITE["founded"]),
            "address": {"@type": "PostalAddress", "streetAddress": SITE["street"], "addressLocality": "Dubai", "addressCountry": "AE"},
            "geo": {"@type": "GeoCoordinates", "latitude": SITE["geo"][0], "longitude": SITE["geo"][1]},
            "openingHoursSpecification": [
                {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"], "opens": "09:00", "closes": "19:00"},
                {"@type": "OpeningHoursSpecification", "dayOfWeek": "Saturday", "opens": "10:00", "closes": "16:00"}],
            "sameAs": [SITE["instagram"], SITE["linkedin"]]}


# ---------------------------------------------------------------- pages

def build_home():
    comm_opts, type_opts, budget_opts, status_opts = filter_options()
    search = (select("s-community", "community", "Community", comm_opts, "Any community")
              + select("s-type", "type", "Property type", type_opts, "Any type")
              + select("s-budget", "budget", "Budget", budget_opts, "Any budget")
              + select("s-status", "status", "Status", status_opts, "Any status"))
    gallery = "".join(
        f'<button type="button" class="fan-card" data-fan-card="{i}" aria-label="Open photo {i + 1} of 25">'
        f'{img(f"assets/images/gallery/image{i + 1}.jpg", "", "", lazy=i >= 7)}</button>' for i in range(25))
    dots = "".join(f'<span class="fan-dot" data-fan-dot="{i}"></span>' for i in range(25))
    featured = [p for p in PROPS if p["featured"]][:6] or PROPS[:6]
    feat_cards = "".join(feature_card(p, i) for i, p in enumerate(featured))

    logos = [("01", "Arada"), ("02", "Dubai Properties"), ("03", "DAMAC"), ("04", "Samana Developers"), ("05", "Danube Properties"),
             ("06", "Binghatti"), ("07", "Azizi"), ("08", "Dubai Properties"), ("09", "Empire Developments"), ("10", "Sobha Realty")]
    one = "".join(f'<div class="marquee__item">{img(f"assets/images/developers/logo-{n}.png", name)}</div>' for n, name in logos)
    two = "".join(f'<div class="marquee__item" aria-hidden="true">{img(f"assets/images/developers/logo-{n}.png", "")}</div>' for n, name in logos)

    comm_cards = ""
    for i, c in enumerate(COMMUNITIES):
        n = count_in(c["name"])
        label = f"{n} listing{'s' if n != 1 else ''}" if n else "Ask about availability"
        comm_cards += f"""<a class="community-card" data-reveal data-reveal-delay="{(i % 4) * 70}" href="/properties/?community={quote(c['name'])}" aria-label="View properties in {e(c['name'])}">
{img(c['image'], f"{c['name']}, Dubai")}<div class="community-card__overlay"><h3>{e(c['name'])}</h3><span class="community-card__count">{label}</span></div></a>"""

    svc_cards = ""
    for i, s in enumerate(SERVICES):
        svc_cards += f"""<div class="service-card service-card--themed" data-tilt="5" style="--theme-color:{SERVICE_THEMES[i % 6]}">
<div class="service-card__body"><h3>{e(s['title'])}</h3><a href="/services/" class="service-card__link" aria-label="Learn more about {e(s['title'])}">Learn more
<svg class="service-card__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg></a></div>
<div class="service-card__decor" aria-hidden="true">{service_icon(s['id'])}</div></div>"""

    tilts = [-6, 4, -3]
    photos = "".join(
        f'<div class="tc-photo" data-tc-photo="{i}" style="--tc-rot:{tilts[i % 3]}deg">{img(t["photo"], t["name"])}</div>' for i, t in enumerate(TEAM))
    t0 = TEAM[0]
    words = "".join(f'<span class="tc-word is-in">{e(w)}</span> ' for w in t0["bio"].split(" "))
    team = f"""<div class="testimonials-carousel" data-testimonials-carousel><div class="testimonials-carousel__media" data-tc-media>{photos}</div>
<div class="testimonials-carousel__content"><div data-tc-text><h3 class="tc-name">{e(t0['name'])}</h3><p class="tc-designation">{e(t0['role'])}</p><p class="tc-quote">{words}</p></div>
<div class="tc-nav"><button type="button" class="tc-arrow" data-tc-prev aria-label="Previous team member">{PREV}</button><button type="button" class="tc-arrow" data-tc-next aria-label="Next team member">{NEXT}</button></div></div></div>
<script type="application/json" id="team-data">{json.dumps([{"name": t["name"], "role": t["role"], "bio": t["bio"]} for t in TEAM], ensure_ascii=False).replace("</", "<\\/")}</script>"""

    body = f"""<div class="hero-cine"><section class="hero" aria-label="Introduction">
<div class="hero__bg"><picture><source media="(max-width: 767px)" srcset="/assets/images/hero/city-sparkles-static-mobile.jpg">
<img src="/assets/images/hero/city-sparkles-static.jpg" alt="Dubai city lights at night" fetchpriority="high" decoding="async"></picture></div>
<canvas class="hero__gl" aria-hidden="true"></canvas>
<div class="hero__scrim"></div><div class="hero__vignette"></div><div class="hero__grain" aria-hidden="true"></div><div class="hero__streak" aria-hidden="true"></div>
<div class="hero__captions" aria-hidden="true"><p class="hero__caption">Dubai. <em>After dark.</em></p><p class="hero__caption">Every tower, <em>a story.</em></p><p class="hero__caption">Find <em>yours.</em></p></div>
<div class="hero__bar hero__bar--top" aria-hidden="true"></div><div class="hero__bar hero__bar--bottom" aria-hidden="true"></div>
<div class="hero__content container">
<span class="hero__eyebrow">Dubai's Trusted Real Estate Partner</span>
<h1 class="hero__title"><span class="sr-only">Experience Luxury Living in UAE</span><span data-typewriter aria-hidden="true">Experience Luxury<br>Living in <em data-colorful-text>UAE</em></span></h1>
<div class="hero__ctas"><a href="/properties/" class="btn-slide-arrow"><span class="btn-slide-arrow__fill" aria-hidden="true"><span class="btn-slide-arrow__icon">{ARROW}</span></span><span class="btn-slide-arrow__text">Explore Listings</span></a></div>
<div class="hero__search-wrap"><form class="search-bar glass-panel" action="/properties/" method="get" aria-label="Search properties">{search}
<button type="submit" class="btn btn-primary">{SEARCH} Search</button></form></div>
</div>
<div class="hero__scroll-cue" aria-hidden="true"><span>Scroll</span><span class="line"></span></div>
</section></div>

<section class="section container arc-gallery ambient-glow-host" data-arc-gallery>{GLOW}
<div class="section-header center"><span class="eyebrow">Portfolio</span>{h2_cascade("A closer look at our listings")}
<p>A curated sweep through the homes, interiors and skylines SWK Properties has placed clients in this year.</p></div>
<div class="fan-carousel-wrap" data-fan-carousel aria-label="Portfolio photo carousel" role="region">
<div class="fan-layout" data-fan-track>{gallery}</div>
<div class="fan-pagination"><button type="button" class="fan-arrow" data-fan-prev aria-label="Previous photos">{PREV}</button>
<div class="fan-dots" data-fan-dots aria-hidden="true">{dots}</div><button type="button" class="fan-arrow" data-fan-next aria-label="Next photos">{NEXT}</button></div></div>
<div class="arc-gallery__viewall"><a href="/properties/" class="btn btn-outline-dark">View all properties</a></div></section>

<section class="section section--alt featured-section ambient-glow-host">{GLOW}<div class="container">
<div class="section-head-row"><div class="section-header" style="margin-bottom:0"><span class="eyebrow">Featured</span>{h2_cascade("Featured listings this month")}</div>
<a href="/properties/" class="btn btn-outline-dark">View all properties</a></div>
<div class="feature-slider" data-feature-slider><div class="feature-slider__viewport"><div class="feature-slider__track" data-featured-grid>{feat_cards}</div></div><div class="feature-slider__nav"></div></div>
<p class="listing-note">ROI figures are estimates based on current market rents and are not guaranteed. Prices and availability are subject to change.</p>
</div></section>

<section class="section ambient-glow-host" data-developers>{GLOW}<div class="container">
<div class="section-header center"><span class="eyebrow">Trusted Partners</span>{h2_cascade("Backed by Dubai's leading developers")}
<p>We work directly with the master developers behind the city's skyline, so pricing and payment plans come straight from source.</p></div>
<div class="marquee" data-developer-marquee><div class="marquee__track">{one}{two}</div></div></div></section>

<section class="section container ambient-glow-host">{GLOW}<div class="section-header center"><span class="eyebrow">Where to Live</span>{h2_cascade("Explore Dubai's communities")}
<p>Every neighbourhood has a different rhythm — from Marina's waterfront energy to the quiet greenery of Arabian Ranches.</p></div>
<div class="communities-grid" data-communities-grid>{comm_cards}</div></section>

<section class="section section--alt ambient-glow-host">{GLOW}<div class="container">
<div class="section-header center"><span class="eyebrow">How We Help</span>{h2_cascade("Full-service, start to handover")}
<p>From your first shortlist to renewing Ejari five years later — one team, one point of contact.</p></div>
<div class="services-grid" data-services-teaser data-reveal>{svc_cards}</div></div></section>

<section class="section ambient-glow-host">{GLOW}<div class="container"><div class="section-header center"><span class="eyebrow">Plan Your Purchase</span>{h2_cascade("Estimate your monthly mortgage")}
<p>Adjust the figures below for an instant estimate, or get a personalised rate comparison on our mortgage page.</p></div>
{calculator("/mortgage/", "Analyze")}</div></section>

<section class="section section--alt ambient-glow-host">{GLOW}<div class="container"><div class="section-header center"><span class="eyebrow">Our Experts</span><h2 class="sr-only">Meet our team</h2></div>{team}</div></section>

<section class="section ambient-glow-host">{GLOW}<div class="container">
<div class="section-head-row"><div class="section-header" style="margin-bottom:0"><span class="eyebrow">Insights</span>{h2_cascade("From the SWK journal")}</div>
<a href="/blog/" class="btn btn-outline-dark">Read all articles</a></div>
<div class="blog-grid" data-blog-preview-grid>{"".join(blog_card(p, i) for i, p in enumerate(POSTS[:3]))}</div></div></section>

{cta_section()}"""
    ld = [org_ld(), {"@context": "https://schema.org", "@type": "WebSite", "name": SITE["name"], "url": BASE + "/", "inLanguage": "en"}]
    write("/", page("/", "SWK Properties | Luxury Real Estate in Dubai",
                    "SWK Properties is a premium Dubai real estate agency — off-plan and ready homes across Downtown, Dubai Marina, Palm Jumeirah and more, with full buying, mortgage and investment support.",
                    body, ld=ld,
                    preload=[("/assets/images/hero/city-sparkles-static-mobile.jpg", ' media="(max-width: 767px)" fetchpriority="high"'),
                             ("/assets/images/hero/city-sparkles-static.jpg", ' media="(min-width: 768px)" fetchpriority="high"')]))


def build_properties():
    comm, types, budgets, stats = filter_options()

    def sel(name, label, opts, any_label):
        o = f'<option value="">{any_label}</option>' + "".join(f'<option value="{e(v)}">{e(t)}</option>' for v, t in opts)
        return f'<label>{label}<select name="{name}" data-filter="{name}">{o}</select></label>'

    filters = (sel("community", "Community", comm, "All communities") + sel("type", "Property type", types, "All types")
               + sel("budget", "Budget", budgets, "Any budget") + sel("status", "Status", stats, "Any status"))
    cards = "".join(prop_card(p) for p in PROPS)
    trail = [("Home", "/"), ("Properties", None)]
    body = f"""{page_hero("Properties for Sale in Dubai", "Off-plan and ready homes across Dubai's most sought-after communities, updated as new listings launch.", trail)}
<section class="section container ambient-glow-host">{GLOW}
<form class="filter-bar" data-filters aria-label="Filter properties" novalidate>{filters}
<button type="button" class="btn btn-outline-dark btn-sm" data-filters-reset>Reset</button>
<span class="results-count" data-results-count role="status" aria-live="polite">{len(PROPS)} properties found</span></form>
<h2 class="sr-only">Listings</h2>
<div class="property-grid" data-properties-grid data-reveal>{cards}</div>
<div class="empty-state" data-empty-state hidden><p>No properties match those filters yet. Try widening your search, or
<a href="{wa("Hi, I couldn't find a property matching my search — could you help me find something similar?")}" target="_blank" rel="noopener noreferrer">ask a consultant on WhatsApp</a>.</p></div>
<nav class="pagination" data-pagination aria-label="Listing pages"></nav>
<p class="listing-note">ROI figures are estimates based on current market rents and are not guaranteed. Prices and availability are subject to change.</p>
</section>
<section class="section section--alt ambient-glow-host" style="text-align:center">{GLOW}<div class="container"><h2>Can't find exactly what you're after?</h2>
<p style="max-width:52ch; margin:var(--space-4) auto 0">Tell us your budget, community and must-haves — we'll send a shortlist within 24 hours, including off-market listings.</p>
<div class="hero__ctas" style="justify-content:center; margin-top:var(--space-6)"><a href="/contact/" class="btn btn-primary btn-lg">Request a Shortlist</a></div></div></section>"""
    ld = [breadcrumb_ld(trail), {"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "url": f"{BASE}/properties/{p['id']}/", "name": p["title"]} for i, p in enumerate(PROPS)]}]
    write("/properties/", page("/properties/", "Properties for Sale in Dubai | SWK Properties",
                               f"Browse {len(PROPS)} off-plan and ready homes across Dubai — filter by community, type, budget and status to find your next address.", body, ld=ld))


def build_property(p):
    images = prop_images(p)
    tiles = ""
    for i, src in enumerate(images):
        alt = f"{p['title']} — photo {i + 1}"
        tiles += (f'<button type="button" class="pd-bento-gallery__item" data-lightbox-index="{i}" data-full="{asset(src)}" aria-label="Open photo {i + 1} of {len(images)}">'
                  f'{img(src, alt, lazy=i > 2)}<span class="pd-bento-gallery__overlay"><span class="pd-bento-gallery__caption">Photo {i + 1}</span></span></button>')
    facts = [("Type", p["type"]), ("Bedrooms", p["bedrooms"]), ("Bathrooms", str(p["bathrooms"])), ("Area", f"{num(p['areaSqft'])} sqft"),
             ("Payment plan", p["paymentPlan"]), ("Handover", p["handover"]), ("Developer", p["developer"]), ("Est. ROI", f"{p['roiPercent']:g}%")]
    facts_html = "".join(f'<div class="fact"><div class="label">{k}</div><div class="value">{e(v)}</div></div>' for k, v in facts)
    amen = "".join(f"<li>{e(a)}</li>" for a in p["amenities"])
    similar = sorted((q for q in PROPS if q["id"] != p["id"]), key=lambda q: (q["status"] != p["status"], q["community"] != p["community"]))[:3]
    trail = [("Home", "/"), ("Properties", "/properties/"), (p["title"], None)]
    body = f"""<section class="page-hero"><div class="container">{crumbs(trail)}
<div class="pd-head">{badges(p)}</div><h1 class="page-hero__title">{e(p['title'])}</h1>
<p>{PIN} {e(location(p))} · by {e(p['developer'])}</p></div></section>
<section class="section container ambient-glow-host">{GLOW}
<div class="pd-bento-gallery" data-gallery aria-label="{e(p['title'])} photo gallery">{tiles}</div>
<div class="pd-layout"><div>
<div class="pd-facts">{facts_html}</div>
<h2 class="pd-section-title">Overview</h2><p>{e(p['description'])}</p>
<h2 class="pd-section-title">Amenities</h2><ul class="amenity-list">{amen}</ul>
<p class="pd-note">Prices, availability and payment plans are indicative and may change without notice. ROI is an estimate based on current market rents and is not guaranteed. Contact us for the current price list, floor plans and payment schedule.</p>
</div>
<aside class="pd-sidebar" aria-label="Enquire about {e(p['title'])}">
<div class="pd-agent-card"><div class="pd-price"><small>Starting price</small><br>{money(p['price'])}</div>
<div class="pd-cta" style="margin-top:var(--space-5)"><a href="/contact/?property={p['id']}" class="btn btn-primary btn-block">Request details</a>
<a href="{wa(f"Hello SWK Properties, I'd like details on {p['title']}.")}" class="btn btn-whatsapp btn-block" target="_blank" rel="noopener noreferrer">Ask on WhatsApp</a></div></div>
<div class="pd-agent-card">{img("assets/images/team/mohd-shahid-khan.jpg", "Mohd Shahid Khan")}<p class="pd-agent-name">Mohd Shahid Khan</p><p>Your point of contact for this listing</p></div>
</aside></div></section>
<section class="section section--alt ambient-glow-host">{GLOW}<div class="container"><div class="section-header"><span class="eyebrow">You may also like</span><h2>Similar properties</h2></div>
<div class="property-grid">{"".join(prop_card(q) for q in similar)}</div></div></section>"""
    cover = prop_images(p)[0].replace("assets/images/", "")
    ld = [breadcrumb_ld(trail), {"@context": "https://schema.org", "@type": "RealEstateListing", "name": p["title"], "description": p["description"],
          "url": f"{BASE}/properties/{p['id']}/", "image": f"{BASE}/assets/images/{cover}",
          "offers": {"@type": "Offer", "price": p["price"], "priceCurrency": p["currency"]}}]
    desc = f"{p['title']} in {location(p)} by {p['developer']} — {money(p['price'])}, {p['bedrooms']} bed, {p['status']}. {p['paymentPlan']} payment plan, handover {p['handover']}."
    write(f"/properties/{p['id']}/", page(f"/properties/{p['id']}/", f"{p['title']} | SWK Properties", desc, body, image=cover, ld=ld))


def build_about():
    people = [("Fahad Khan", "Senior Property Consultant · Downtown & Marina"), ("Usman Khan", "Investment Advisor · Palm & Ultra-Prime"),
              ("Junaid Ahmad", "Property Consultant · Off-Plan & Creek Harbour"), ("Megha Nair", "Senior Sales Manager · Business Bay & JVC")]
    avatar = '<div class="avatar-placeholder" style="width:84px;height:84px;border-radius:999px" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg></div>'
    cards = "".join(f'<div class="developer-card" data-reveal data-reveal-delay="{i * 80}">{avatar}<h3>{e(n)}</h3><p class="text-muted" style="font-size:var(--fs-xs)">{e(r)}</p></div>' for i, (n, r) in enumerate(people))
    values = [("Radical Transparency", "Every fee, commission and clause disclosed upfront — no surprises at signing."),
              ("Data Over Hype", "ROI and appreciation projections built on transaction data, not developer marketing."),
              ("One Point of Contact", "The consultant who takes your first call is the one who sees your deal through to handover."),
              ("Long-Term Relationships", "Most of our new business comes from repeat clients and referrals — that's the metric we optimise for.")]
    steps = "".join(f'<div class="step-item" data-reveal data-reveal-delay="{i * 80}"><div class="num">{i + 1:02d}</div><div><h3>{e(t)}</h3><p>{e(d)}</p></div></div>' for i, (t, d) in enumerate(values))
    stats = [("10", "+", "Years in Dubai"), ("100", "+", "Homes Sold"), ("40", "+", "Consultants"), ("100", "%", "Client Satisfaction")]
    stat_html = "".join(f'<div><div class="stat-num" data-count="{n}" data-suffix="{s}">{n}{s}</div><div class="stat-label">{l}</div></div>' for n, s, l in stats)
    trail = [("Home", "/"), ("About", None)]
    body = f"""{page_hero("Ten years of getting Dubai property right", "SWK Properties was founded on a simple idea: buying a home in Dubai — whether you live down the road or on the other side of the world — should feel transparent, not transactional.", trail)}
<section class="section container ambient-glow-host">{GLOW}<div class="split-block">{img("assets/images/about/swk-office.jpg", "SWK Properties office overlooking Business Bay")}
<div data-reveal><span class="eyebrow">Our Story</span><h2>Built by agents, run for clients</h2>
<p>SWK Properties was started in 2016 by a small team of agents frustrated with how opaque property buying in Dubai could feel for outsiders. Today we're a full-service brokerage of over 40 consultants, but the founding principle hasn't changed: every fee, every payment plan clause, and every ROI figure gets explained in plain language before you sign anything.</p>
<p style="margin-top:var(--space-4)">We work across off-plan and secondary sales, mortgage arrangement, and long-term property management — so the relationship doesn't end at handover.</p>
<a href="/contact/" class="btn btn-dark" style="margin-top:var(--space-5)">Talk to our team</a></div></div></section>
<section class="section section--alt ambient-glow-host">{GLOW}<div class="container"><div class="section-header center"><span class="eyebrow">Our Values</span><h2>What guides every deal we close</h2></div><div class="step-list">{steps}</div></div></section>
<section class="section section--dark ambient-glow-host">{GLOW}<div class="container"><div class="stat-strip">{stat_html}</div></div></section>
<section class="section ambient-glow-host">{GLOW}<div class="container"><div class="section-header center"><span class="eyebrow">Our People</span><h2>Meet a few of our consultants</h2>
<p>Every client is paired with a dedicated consultant for the life of their purchase.</p></div><div class="testimonials-grid">{cards}</div></div></section>
{cta_section("Let's find your next Dubai address", "Book a no-obligation consultation and we'll come prepared with listings matched to your budget.")}"""
    write("/about/", page("/about/", "About Us | SWK Properties",
                          "SWK Properties is a Dubai-based real estate agency built on ten years of local market expertise, transparent advice, and full-service support for buyers and investors.",
                          body, image="about/swk-office.jpg", ld=[breadcrumb_ld(trail), org_ld()]))


def build_services():
    cards = "".join(f"""<div class="service-card service-card--themed service-card--detailed" data-tilt="5" style="--theme-color:{SERVICE_THEMES[i % 6]}">
<div class="service-card__body"><h3>{e(s['title'])}</h3><p>{e(s['description'])}</p></div><div class="service-card__decor" aria-hidden="true">{service_icon(s['id'])}</div></div>""" for i, s in enumerate(SERVICES))
    process = [("Discovery Call", "We learn your budget, must-haves, and whether you're buying to live or to invest."),
               ("Curated Shortlist", "A shortlist matched to your brief within 24 hours, including off-market options."),
               ("Viewings & Offer", "In-person or virtual viewings, followed by negotiation on your behalf."),
               ("Handover & Beyond", "Legal transfer, mortgage coordination, and ongoing management if you choose to let.")]
    steps = "".join(f'<div class="step-item" data-reveal data-reveal-delay="{i * 80}"><div class="num">{i + 1:02d}</div><div><h3>{e(t)}</h3><p>{e(d)}</p></div></div>' for i, (t, d) in enumerate(process))
    trail = [("Home", "/"), ("Services", None)]
    body = f"""{page_hero("Full-service support, start to handover", "Buying, selling, financing or managing a Dubai property — one team handles every step, with a single consultant as your point of contact throughout.", trail)}
<section class="section container ambient-glow-host">{GLOW}<h2 class="sr-only">Our services</h2><div class="services-grid" data-reveal>{cards}</div></section>
<section class="section section--alt ambient-glow-host">{GLOW}<div class="container"><div class="section-header center"><span class="eyebrow">How It Works</span><h2>Our process</h2></div><div class="step-list">{steps}</div></div></section>
{cta_section("Not sure which service you need?", "Start with a free consultation — we'll recommend the right path for your goals.")}"""
    write("/services/", page("/services/", "Our Services | SWK Properties",
                             "From buying and selling to mortgage arrangement, legal documentation and property management — SWK Properties supports Dubai real estate clients end to end.",
                             body, ld=[breadcrumb_ld(trail)]))


def build_mortgage():
    steps_data = [("Pre-Approval", "Passport, six months of bank statements, and proof of income. Takes 5-10 working days."),
                  ("Property Valuation", "The bank commissions an independent valuation once you've signed a reservation form."),
                  ("Final Offer", "Formal offer letter issued, outlining rate, tenure and conditions for your signature."),
                  ("Mortgage Registration", "0.25% registration fee paid to DLD; the mortgage is registered against the title deed.")]
    steps = "".join(f'<div class="step-item" data-reveal data-reveal-delay="{i * 80}"><div class="num">{i + 1:02d}</div><div><h3>{e(t)}</h3><p>{e(d)}</p></div></div>' for i, (t, d) in enumerate(steps_data))
    faq = "".join(f"""<div class="accordion-item" data-accordion-item><h3><button type="button" class="accordion-trigger" data-accordion-trigger aria-expanded="false" aria-controls="faq-panel-{i}" id="faq-trigger-{i}">{e(f['question'])}<span class="icon-plus" aria-hidden="true"></span></button></h3>
<div class="accordion-panel" data-accordion-panel id="faq-panel-{i}" role="region" aria-labelledby="faq-trigger-{i}"><p>{e(f['answer'])}</p></div></div>""" for i, f in enumerate(FAQ))
    trail = [("Home", "/"), ("Mortgage", None)]
    body = f"""{page_hero("Mortgage Calculator", "Get an instant estimate of your monthly payment, then let our lending partners find you the sharpest rate available.", trail)}
<section class="section container ambient-glow-host">{GLOW}<h2 class="sr-only">Calculate your repayments</h2><div class="mortgage-layout">{calculator("/contact/", "Analyze")}</div></section>
<section class="section section--alt ambient-glow-host">{GLOW}<div class="container"><div class="section-header center"><span class="eyebrow">Getting Approved</span><h2>What you'll need for a UAE mortgage</h2></div><div class="step-list">{steps}</div></div></section>
<section class="section container ambient-glow-host">{GLOW}<div class="section-header center"><span class="eyebrow">Questions</span><h2>Mortgage &amp; buying costs FAQ</h2></div>
<div style="max-width:760px; margin-inline:auto" data-faq-list>{faq}</div></section>"""
    ld = [breadcrumb_ld(trail), {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": f["question"], "acceptedAnswer": {"@type": "Answer", "text": f["answer"]}} for f in FAQ]}]
    write("/mortgage/", page("/mortgage/", "Mortgage Calculator | SWK Properties",
                             "Estimate your Dubai mortgage instantly, then get a personalised rate comparison from SWK Properties' lending partners.", body, ld=ld))


def build_contact():
    interests = ["Buying a property", "Selling a property", "Renting", "Property management", "Mortgage advice", "General enquiry"]
    opts = "".join(f"<option>{i}</option>" for i in interests)
    gm = f"https://maps.google.com/maps?q={SITE['geo'][0]},{SITE['geo'][1]}&z=16&output=embed"
    ic = lambda d: f'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">{d}</svg>'
    trail = [("Home", "/"), ("Contact", None)]
    body = f"""{page_hero("Let's talk about your next move", "Whether you're buying, selling, or just exploring the market — a consultant will get back to you within one business day.", trail)}
<section class="section container ambient-glow-host">{GLOW}<div class="contact-layout">
<div data-reveal><span class="eyebrow">Send a Message</span><h2>Tell us what you're looking for</h2>
<form id="contact-form" data-form="contact" data-endpoint="{e(SITE['formEndpoint'])}" novalidate style="margin-top:var(--space-6)"><div class="form-grid">
<div class="form-field"><label for="cf-name">Full name</label><input id="cf-name" name="name" autocomplete="name" required></div>
<div class="form-grid cols-2" style="gap:var(--space-5)"><div class="form-field"><label for="cf-email">Email</label><input id="cf-email" name="email" type="email" autocomplete="email" required></div>
<div class="form-field"><label for="cf-phone">Phone</label><input id="cf-phone" name="phone" type="tel" autocomplete="tel"></div></div>
<div class="form-field"><label for="cf-interest">I'm interested in</label><select id="cf-interest" name="interest">{opts}</select></div>
<div class="form-field"><label for="cf-message">Message</label><textarea id="cf-message" name="message" required></textarea></div>
<label class="form-check"><input type="checkbox" name="consent" required><span>I agree that SWK Properties may contact me about my enquiry and I accept the <a href="/privacy/">Privacy Policy</a>.</span></label>
<input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
<button type="submit" class="btn btn-primary btn-lg">Send Message</button>
<p class="form-status" role="status" aria-live="polite" hidden></p></div></form></div>
<div data-reveal data-reveal-delay="100"><span class="eyebrow">Reach Us Directly</span><h2>Other ways to connect</h2>
<div class="contact-cards" style="margin-top:var(--space-6)">
<div class="contact-info-card">{ic('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>')}<div><h3>Call or WhatsApp</h3><p><a href="tel:{SITE['phone']}">{SITE['phoneDisplay']}</a></p><p><a href="{wa("Hello, I'd like to get in touch.")}" target="_blank" rel="noopener noreferrer">Message us on WhatsApp →</a></p></div></div>
<div class="contact-info-card">{ic('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>')}<div><h3>Email</h3><p><a href="mailto:{SITE['email']}">{SITE['email']}</a></p></div></div>
<div class="contact-info-card">{ic('<path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>')}<div><h3>Office</h3><p>{e(SITE['address'])}</p></div></div>
<div class="contact-info-card">{ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}<div><h3>Office Hours</h3><p>{e(SITE['hours'])}</p></div></div></div>
<div class="map-embed" style="margin-top:var(--space-6)"><iframe title="Map showing the SWK Properties office on Sheikh Zayed Road, Dubai" src="{gm}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></div>
</div></section>"""
    write("/contact/", page("/contact/", "Contact Us | SWK Properties",
                            "Get in touch with SWK Properties — book a consultation, ask about a listing, or reach us on WhatsApp, phone or email.", body, ld=[breadcrumb_ld(trail), org_ld()]))


def build_blog():
    trail = [("Home", "/"), ("Journal", None)]
    body = f"""{page_hero("The SWK Journal", "Market insight, buyer guides and community spotlights from our consultants on the ground in Dubai.", trail)}
<section class="section container ambient-glow-host">{GLOW}<h2 class="sr-only">All articles</h2><div class="blog-grid" data-blog-grid>{"".join(blog_card(p, i) for i, p in enumerate(POSTS))}</div></section>
<section class="section section--alt ambient-glow-host" style="text-align:center">{GLOW}<div class="container"><h2>Want market updates in your inbox?</h2>
<p style="max-width:52ch; margin:var(--space-4) auto var(--space-5)">Subscribe for monthly insight on Dubai pricing trends, new launches and yield opportunities.</p>
<form class="footer-newsletter" data-form="newsletter" data-endpoint="{e(SITE['formEndpoint'])}" aria-label="Blog newsletter signup" style="max-width:460px; margin-inline:auto; flex-wrap:wrap" novalidate>
<label for="nl-blog" class="sr-only">Email address</label><input type="email" id="nl-blog" name="email" placeholder="Your email" autocomplete="email" required>
<button type="submit" class="btn btn-primary btn-sm">Subscribe</button>
<input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
<label class="form-check" style="flex-basis:100%; text-align:left"><input type="checkbox" name="consent" required><span>I agree to receive market updates and accept the <a href="/privacy/">Privacy Policy</a>.</span></label>
<p class="form-status" role="status" aria-live="polite" hidden style="flex-basis:100%"></p></form></div></section>"""
    write("/blog/", page("/blog/", "Journal | SWK Properties",
                         "Market insights, buyer guides and community spotlights from SWK Properties — everything you need to know about buying and investing in Dubai real estate.", body, ld=[breadcrumb_ld(trail)]))
    for p in POSTS:
        others = [q for q in POSTS if q["slug"] != p["slug"]]
        tr = [("Home", "/"), ("Journal", "/blog/"), (p["title"], None)]
        b = f"""<section class="page-hero"><div class="container">{crumbs(tr)}<span class="badge badge-gold">{e(p['category'])}</span>
<h1 class="page-hero__title" style="margin-top:var(--space-4)">{e(p['title'])}</h1>
<p class="post-meta"><time datetime="{p['date']}">{nice_date(p['date'])}</time> · {e(p['readTime'])}</p></div></section>
<article class="section container ambient-glow-host">{GLOW}<div class="prose">{img(p['image'], p['title'], lazy=False)}<p>{e(p['content'])}</p>
<p style="font-size:var(--fs-xs)">This article is general information, not financial, legal or investment advice. Market conditions and regulations change — speak to a consultant before you decide.</p></div></article>
<section class="section section--alt ambient-glow-host">{GLOW}<div class="container"><div class="section-header"><span class="eyebrow">Keep reading</span><h2>More from the journal</h2></div>
<div class="blog-grid">{"".join(blog_card(q, i) for i, q in enumerate(others))}</div></div></section>
{cta_section()}"""
        ld = [breadcrumb_ld(tr), {"@context": "https://schema.org", "@type": "Article", "headline": p["title"], "datePublished": p["date"], "dateModified": p["date"],
              "description": p["excerpt"], "image": f"{BASE}/{p['image']}", "mainEntityOfPage": f"{BASE}/blog/{p['slug']}/",
              "author": {"@type": "Organization", "name": SITE["name"]},
              "publisher": {"@type": "Organization", "name": SITE["name"], "logo": {"@type": "ImageObject", "url": f"{BASE}/assets/images/brand/swk-logo.png"}}}]
        long_title = f"{p['title']} | SWK Properties"
        write(f"/blog/{p['slug']}/", page(f"/blog/{p['slug']}/", long_title if len(long_title) <= 70 else p["title"], p["excerpt"], b,
                                           image=p["image"].replace("assets/images/", ""), ld=ld, og_type="article"))


def legal(path, title, desc, sections):
    parts = "".join(f"<h2>{e(h)}</h2>" + "".join(f"<p>{e(t)}</p>" for t in ps) for h, ps in sections)
    trail = [("Home", "/"), (title, None)]
    body = f"""{page_hero(title, desc, trail)}<section class="section container ambient-glow-host">{GLOW}<div class="prose legal"><p class="post-meta">Last updated {nice_date(TODAY.isoformat())}</p>{parts}</div></section>"""
    write(path, page(path, f"{title} | SWK Properties", desc, body, ld=[breadcrumb_ld(trail)]))


def build_legal():
    n, em = SITE["name"], SITE["email"]
    legal("/privacy/", "Privacy Policy", "How SWK Properties collects, uses and protects your personal data.", [
        ("Who we are", [f"{n} ('we', 'us') is a real estate brokerage at {SITE['address']}. You can reach us at {em} or {SITE['phoneDisplay']}."]),
        ("What we collect", ["Information you give us through our contact form, newsletter sign-up, email, phone or WhatsApp: your name, email address, phone number, enquiry details and property preferences.",
                             "This website does not use advertising or analytics cookies. The contact page embeds a Google map, which may load content from Google when displayed."]),
        ("Why we use it", ["To respond to your enquiry, arrange viewings, prepare shortlists and any mortgage or legal introductions you ask for and, if you opt in, to send market updates. We rely on your consent and on our legitimate interest in running our business."]),
        ("Who we share it with", ["Only with partners needed to deliver what you asked for, such as developers, banks and legal partners, and with service providers who help us run our systems. We do not sell your personal data."]),
        ("How long we keep it", ["For as long as needed to deal with your enquiry and meet our legal and regulatory record-keeping duties. Newsletter data is kept until you unsubscribe."]),
        ("Your rights", [f"Under UAE data-protection law (Federal Decree-Law No. 45 of 2021) you may ask to access, correct or delete your data, and withdraw consent at any time. Email {em} to make a request."]),
        ("Changes", ["We may update this policy and will change the date above when we do."])])
    legal("/terms/", "Terms of Use", "The terms that apply when you use the SWK Properties website.", [
        ("Information only", ["Content on this website is general information, not an offer, valuation, or financial, legal or investment advice. Listings, prices, availability, payment plans and handover dates are indicative, supplied by developers or owners, and may change without notice."]),
        ("Estimates and calculators", ["Mortgage, cost and ROI figures are illustrative estimates. They do not guarantee returns, loan approval or specific terms. Verify all figures with your bank, the developer and your advisers before committing funds."]),
        ("Third-party links and content", ["We link to third-party sites such as WhatsApp, Instagram, LinkedIn and Google Maps. We are not responsible for their content or practices."]),
        ("Intellectual property", [f"Text, logos and images on this site belong to {n} or its licensors. Please do not copy or reuse them without written permission."]),
        ("Liability", ["To the extent permitted by law, we are not liable for loss arising from reliance on this website. Nothing here limits liability that cannot be limited by law."]),
        ("Governing law", ["These terms are governed by the laws of the United Arab Emirates as applied in the Emirate of Dubai."]),
        ("Contact", [f"Questions about these terms: {em}."])])


def build_404():
    body = """<section class="section not-found"><div class="container"><h1>Page not found</h1><p style="margin:var(--space-4) auto var(--space-6); max-width:44ch">That page doesn't exist or has moved. Try one of these instead.</p>
<div class="hero__ctas" style="justify-content:center"><a href="/" class="btn btn-primary">Back to home</a><a href="/properties/" class="btn btn-outline-dark">Browse properties</a></div></div></section>"""
    (OUT / "404.html").write_text(page("/404.html", "Page not found | SWK Properties", "Page not found.", body, robots="noindex"), encoding="utf-8")


def build_meta_files():
    urls = ["/", "/properties/", "/about/", "/services/", "/mortgage/", "/blog/", "/contact/", "/privacy/", "/terms/"]
    urls += [f"/properties/{p['id']}/" for p in PROPS] + [f"/blog/{p['slug']}/" for p in POSTS]
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    xml += [f"<url><loc>{BASE}{u}</loc><lastmod>{TODAY.isoformat()}</lastmod></url>" for u in urls]
    xml.append("</urlset>")
    (OUT / "sitemap.xml").write_text("\n".join(xml) + "\n", encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n", encoding="utf-8")


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    build_assets()
    build_home(); build_properties(); build_about(); build_services(); build_mortgage()
    build_contact(); build_blog(); build_legal(); build_404(); build_meta_files()
    for p in PROPS:
        build_property(p)
    print(f"Built {sum(1 for _ in OUT.rglob('*.html'))} pages, assets v{ASSET_V}, into {OUT}")


if __name__ == "__main__":
    main()

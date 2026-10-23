#!/usr/bin/env python3
"""Static site generator for swkpropertiesuae.com (no dependencies, Python 3.9+).

    python3 build.py        # writes the finished site to public/

Content lives in data/*.json, styles in src/css, scripts in src/js, templates
in this file. Pages are real HTML files (no client-side rendering), so search
engines, link previews and no-JS visitors all get the full content.
"""
import base64
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
REVIEWS = load("testimonials")
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
FEATURE_THEMES = ["30 46% 30%", "24 40% 26%", "36 44% 34%", "28 36% 24%", "33 42% 28%"]
SERVICE_THEMES = ["30 46% 40%", "24 40% 36%", "36 44% 44%", "28 36% 34%", "33 42% 38%", "30 30% 42%"]
PAGE_HERO_IMG = "og/default.jpg"


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


_SIZES = {}


def img_size(src):
    """Intrinsic (width, height) of a PNG/JPEG/WebP under src/assets, read from its header (stdlib only)."""
    rel = src.lstrip("/")
    if rel in _SIZES:
        return _SIZES[rel]
    size = None
    f = SRC / rel
    try:
        with open(f, "rb") as fh:
            head = fh.read(32)
            if head[:8] == b"\x89PNG\r\n\x1a\n":
                size = (int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big"))
            elif head[:4] == b"RIFF" and head[8:12] == b"WEBP":
                kind = head[12:16]
                if kind == b"VP8 ":
                    size = (int.from_bytes(head[26:28], "little") & 0x3FFF, int.from_bytes(head[28:30], "little") & 0x3FFF)
                elif kind == b"VP8L":
                    bits = int.from_bytes(head[21:25], "little")
                    size = ((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1)
                elif kind == b"VP8X":
                    size = (int.from_bytes(head[24:27], "little") + 1, int.from_bytes(head[27:30], "little") + 1)
            elif head[:2] == b"\xff\xd8":
                fh.seek(2)
                while True:
                    b = fh.read(1)
                    while b and b != b"\xff":
                        b = fh.read(1)
                    m = fh.read(1)
                    while m == b"\xff":
                        m = fh.read(1)
                    if not m:
                        break
                    if m[0] in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                        fh.read(3)
                        h, w = int.from_bytes(fh.read(2), "big"), int.from_bytes(fh.read(2), "big")
                        size = (w, h)
                        break
                    if m[0] in (0xD8, 0x01) or 0xD0 <= m[0] <= 0xD7:
                        continue
                    fh.seek(int.from_bytes(fh.read(2), "big") - 2, 1)
    except (OSError, ValueError):
        size = None
    _SIZES[rel] = size
    return size


SIZES_CARD = "(min-width: 1100px) 380px, (min-width: 640px) 50vw, 100vw"


def img(src, alt="", cls="", lazy=True, extra="", sizes=SIZES_CARD):
    c = f' class="{cls}"' if cls else ""
    l = ' loading="lazy"' if lazy else ""
    s = img_size(src)
    dims = f' width="{s[0]}" height="{s[1]}"' if s else ""
    srcset = ""
    small = src.rsplit(".", 1)[0] + "-640.webp"
    if src.endswith(".webp") and (SRC / small.lstrip("/")).is_file() and s and s[0] > 700:
        srcset = f' srcset="{asset(small)} 640w, {asset(src)} {s[0]}w" sizes="{sizes}"'
    return f'<img src="{asset(src)}" alt="{e(alt)}"{c}{l}{dims}{srcset} decoding="async"{extra}>'


def cascade(text):
    """Hover letter-reveal heading. Plain text for assistive tech, split chars for sighted users."""
    out, i = [], 0
    for word in text.split(" "):
        chars = []
        for ch in word:
            chars.append(f'<span class="cascade-text__char" style="transition-delay: {i * 25}ms;">{e(ch)}</span>')
            i += 1
        out.append(f'<span class="cascade-text__word">{"".join(chars)}</span>')
    style = "--cascade-shadow-y: 1.28em; --cascade-duration: 250ms; --cascade-color: var(--color-text); --cascade-hover-color: var(--color-accent);"
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
    css_order = ["variables", "base", "components", "sections", "animations", "responsive", "cinematic", "theme", "ui", "luxe", "lumiere"]
    css = "\n".join((SRC / "css" / f"{n}.css").read_text(encoding="utf-8") for n in css_order)
    css = css.replace("../assets/", "/assets/")
    mods = sorted((SRC / "js" / "modules").glob("*.js"))
    js = "\n".join(m.read_text(encoding="utf-8") for m in mods)
    ASSET_V = hashlib.sha1((css + js).encode("utf-8")).hexdigest()[:8]

    (OUT / "assets" / "css").mkdir(parents=True, exist_ok=True)
    (OUT / "assets" / "js").mkdir(parents=True, exist_ok=True)
    (OUT / "assets" / "vendor").mkdir(parents=True, exist_ok=True)
    (OUT / "assets" / "css" / "site.css").write_text(css, encoding="utf-8")
    (OUT / "assets" / "js" / "main.js").write_text(js, encoding="utf-8")
    for f in (SRC / "vendor").iterdir():
        shutil.copy(f, OUT / "assets" / "vendor" / f.name)
    for f in (SRC / "root").iterdir():
        shutil.copy(f, OUT / f.name)
    # Brand assets: images (logo, hero, listings, team...) and self-hosted fonts.
    shutil.copytree(SRC / "assets", OUT / "assets", dirs_exist_ok=True)


# ---------------------------------------------------------------- layout

# Fonts are self-hosted (see src/css/base.css); the faces used above the fold are preloaded.
FONT_PRELOADS = "".join(
    f'<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/{f}.woff2" crossorigin>\n'
    for f in ("inter/inter-variable", "montserrat/montserrat-500"))


NAV = [("/", "Home"), ("/properties/", "Properties"), ("/about/", "About"), ("/services/", "Services"), ("/mortgage/", "Mortgage"), ("/blog/", "Journal"), ("/contact/", "Contact")]


def bell_html():
    items = list(SITE.get("notifications", []))
    if POSTS:
        items.insert(1, {"id": "n-post-" + POSTS[0]["slug"], "tag": "Journal", "title": POSTS[0]["title"], "text": POSTS[0]["excerpt"], "href": f"/blog/{POSTS[0]['slug']}/", "date": POSTS[0]["date"]})
    if not items:
        return ""
    rows = "".join(f'<li><a href="{e(i["href"])}" data-notif-id="{e(i["id"])}"><span class="notif__tag">{e(i["tag"])}</span><strong>{e(i["title"])}</strong><span>{e(i["text"])}</span></a></li>' for i in items)
    ids = json.dumps([i["id"] for i in items]).replace('"', "&quot;")
    return (f'<div class="notif" data-notif data-ids="{ids}"><button type="button" class="notif__btn" data-notif-btn aria-haspopup="true" aria-expanded="false" aria-label="Notifications">'
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>'
            '<span class="notif__badge" data-notif-badge hidden></span></button>'
            f'<div class="notif__panel" data-notif-panel role="dialog" aria-label="Notifications" hidden><div class="notif__head"><h2>Updates</h2><button type="button" class="link-button" data-notif-readall>Mark all read</button></div><ul>{rows}</ul></div></div>')


def site_header(path):
    links = "".join(
        f'<a href="{h}"{" aria-current=\"page\"" if (h == path or (h != "/" and path.startswith(h))) else ""}>{l}</a>' for h, l in NAV)
    return (f'<header class="site-header" data-site-header><div class="site-header__inner container">'
            f'<a href="/" class="site-brand" aria-label="SWK Properties — Home"><img src="/assets/images/brand/swk-logo-white.png" alt="SWK Properties" class="brand-logo" width="338" height="275" decoding="async" fetchpriority="high"></a>'
            f'<nav class="site-nav" aria-label="Primary">{links}</nav>'
            f'<div class="site-header__tools">{bell_html()}<a href="/contact/" class="btn btn-primary btn-sm site-header__cta">Book a consultation</a></div></div></header>')


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
<img src="/assets/images/brand/swk-logo-white.png" alt="" class="preloader__logo" width="338" height="275" fetchpriority="high">
<div class="preloader__spinner" aria-hidden="true"></div><span class="preloader__text">Loading...</span></div>
<script>
(function () {
  var el = document.querySelector('.preloader');
  if (!el) return;
  // Only reveal the loader if the page hasn't finished within 300ms, so it never flashes on a fast connection.
  window.__swkPreloaderTimer = setTimeout(function () { window.__swkShownAt = Date.now(); el.classList.add('is-visible'); }, 300);
  // Safety net independent of main.js: the loader can never trap a visitor.
  setTimeout(function () { var x = document.querySelector('.preloader'); if (x && x.parentNode) x.parentNode.removeChild(x); }, 8000);
})();
</script>"""


ICON_PHONE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>'
ICON_MAIL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>'
ICON_PIN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>'
ICON_CLOCK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'


ICON_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>'
ICON_CHART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'
ICON_HEADSET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="14" width="4" height="6" rx="1.5"/><rect x="17.5" y="14" width="4" height="6" rx="1.5"/><path d="M20 20c0 1.5-1.5 2-4 2h-2"/></svg>'
ICON_HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.4 12 20 12 20z"/></svg>'
VALUE_ITEMS = [(ICON_SHIELD, "Radical Transparency", "Every fee, commission and clause disclosed upfront."),
               (ICON_CHART, "Data Over Hype", "ROI projections built on transaction data."),
               (ICON_HEADSET, "One Point of Contact", "The consultant who takes your first call sees it through."),
               (ICON_HEART, "Long-Term Relationships", "Most new business comes from repeat clients and referrals.")]
VALUES = ('<section class="value-strip" aria-labelledby="values-title"><h2 id="values-title" class="sr-only">Why SWK Properties</h2><div class="container value-strip__grid">' + "".join(
    f'<div class="value-item" data-reveal data-reveal-delay="{i * 70}"><span class="value-item__icon">{ic}</span><h3>{t}</h3><p>{d}</p></div>' for i, (ic, t, d) in enumerate(VALUE_ITEMS)) + "</div></section>")


STATS = [("10", "+", "Years in Dubai"), ("100", "+", "Homes Sold"), ("40", "+", "Consultants"), ("100", "%", "Client Satisfaction")]
STORY = ('<section class="section container story ambient-glow-host">' + GLOW + '<div class="story__grid">'
         '<div class="story__media" data-reveal>' + img("assets/images/about/swk-office.webp", "SWK Properties office overlooking Business Bay", sizes="(min-width: 900px) 600px, 100vw") + '</div>'
         '<div class="story__copy" data-reveal><span class="eyebrow">Why SWK</span><h2>Built by agents, run for clients</h2>'
         '<p>SWK Properties was started in 2016 by a small team of agents frustrated with how opaque property buying in Dubai could feel for outsiders. '
         'Every fee, every payment plan clause and every ROI figure gets explained in plain language before you sign anything.</p>'
         '<div class="story__stats">' + "".join(
             f'<div><div class="story__num" data-count="{n}" data-suffix="{sfx}">{n}{sfx}</div><div class="story__label">{lab}</div></div>' for n, sfx, lab in STATS) +
         '</div><a href="/about/" class="btn btn-primary">Our story</a></div></div></section>')


def footer():
    comm_links = [c for c in COMMUNITIES if count_in(c["name"]) > 0][:6]
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
<div class="container footer-inner">
<div class="footer-news">
<div class="footer-news__copy"><h2 class="footer-news__title">Stay ahead of the market</h2><p>New launches, price moves and community guides, once a month.</p></div>
<form class="footer-newsletter" data-form="newsletter" data-endpoint="{e(SITE['formEndpoint'])}" aria-label="Newsletter signup" novalidate>
<div class="footer-newsletter__row"><label for="newsletter-email" class="sr-only">Email address</label>
<input type="email" id="newsletter-email" name="email" placeholder="Your email address" autocomplete="email" required>
<button type="submit" class="btn btn-primary">Join</button></div>
<input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
<label class="form-check"><input type="checkbox" name="consent" required><span>I agree to receive market updates and accept the <a href="/privacy/">Privacy Policy</a>.</span></label>
<p class="form-status" role="status" aria-live="polite" hidden></p>
</form></div>
<div class="footer-grid">
<div class="footer-col footer-col--brand"><a href="/" class="footer-logo" aria-label="SWK Properties — Home"><img src="/assets/images/brand/swk-logo-white.png" alt="SWK Properties" width="338" height="275" loading="lazy" decoding="async"></a>
<p>A premium Dubai real estate agency helping investors and homeowners buy, sell and manage property with confidence.</p>
<div class="social-row">
<a href="{SITE['instagram']}" target="_blank" rel="noopener noreferrer" aria-label="SWK Properties on Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></a>
<a href="{SITE['linkedin']}" target="_blank" rel="noopener noreferrer" aria-label="SWK Properties on LinkedIn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 10v7M7 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/></svg></a>
</div></div>
<div class="footer-col"><h2 class="footer-title">Explore</h2><ul><li><a href="/properties/">Properties</a></li><li><a href="/about/">About Us</a></li><li><a href="/services/">Services</a></li><li><a href="/mortgage/">Mortgage Calculator</a></li><li><a href="/blog/">Journal</a></li><li><a href="/contact/">Contact</a></li></ul></div>
<div class="footer-col"><h2 class="footer-title">Communities</h2><ul>{clinks}</ul></div>
<div class="footer-col"><h2 class="footer-title">Visit &amp; contact</h2><ul class="footer-contact">
<li>{ICON_PHONE}<a href="tel:{SITE['phone']}">{SITE['phoneDisplay']}</a></li>
<li>{ICON_MAIL}<a href="mailto:{SITE['email']}">{SITE['email']}</a></li>
<li>{ICON_PIN}<span>{e(SITE['address'])}</span></li>
<li>{ICON_CLOCK}<span>{e(SITE['hours'])}</span></li>
<li><button type="button" class="btn btn-gold" data-open-callback style="margin-top:var(--space-2)">Request a callback</button></li></ul></div>
</div>
<div class="footer-bottom"><span>© {year} {SITE['name']}. All rights reserved. {' · '.join(e(i) for i in ids)}.</span>
<span class="footer-legal"><a href="/privacy/">Privacy Policy</a><a href="/terms/">Terms of Use</a><a href="/cookies/">Cookie Policy</a><button type="button" class="link-button" data-cookie-settings>Cookie settings</button><a href="/feed.xml">RSS</a></span></div>
</div>
</footer>"""



# ---------------------------------------------------------------- site-wide UI (announcement, cookies, popups)

ANN = SITE.get("announcement") or {}
POPUP = SITE.get("popup") or {}
ANALYTICS = SITE.get("analytics") or {}
ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
ICON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>'
CONSOLE_BUILDING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-4h6v4M9 7h1M9 11h1M14 7h1M14 11h1"/></svg>'


def deck_console(path):
    """Fixed listing console pinned right beneath the announcement bar:
    arrow paging + a live page readout + a scroll-to-listings pill."""
    if path not in ("/", "/properties/"):
        return ""
    return (f'<div class="deck-console" data-deck-console aria-label="Listing deck controls">'
            f'<div class="deck-console__inner"><span class="console-brand">{CONSOLE_BUILDING}SWK</span>'
            f'<button type="button" class="console-arrow" data-deck-page="-1" aria-label="Previous page of listings">{PREV}</button>'
            f'<button type="button" class="console-arrow" data-deck-page="1" aria-label="Next page of listings">{NEXT}</button>'
            f'<span class="console-read" aria-hidden="true"><b data-deck-now>&ndash;</b><i>/</i><span data-deck-total>&ndash;</span></span>'
            f'<button type="button" class="console-jump" data-jump-listings>Scroll to listings {ICON_DOWN}</button>'
            f'</div></div>')


def announce_bar():
    if not ANN.get("enabled"):
        return ""
    link = f' <a href="{e(ANN["href"])}">{e(ANN["linkText"])}</a>' if ANN.get("href") else ""
    return (f'<div class="announce" data-announce="{e(ANN["id"])}" role="region" aria-label="Announcement"><span>{e(ANN["text"])}</span>{link}'
            '<button type="button" class="announce__close" data-announce-close aria-label="Dismiss announcement">&times;</button></div>')


def dialog_html(attr, title_id, title, body_html, label):
    return (f'<div class="dialog" {attr} hidden><div class="dialog__panel" role="dialog" aria-modal="true" aria-labelledby="{title_id}">'
            f'<button type="button" class="dialog__close" data-dialog-close aria-label="Close {label}">&times;</button>'
            f'<h2 id="{title_id}">{e(title)}</h2>{body_html}</div></div>')


def ui_markup():
    cfg = {"popup": {"enabled": bool(POPUP.get("enabled")), "delaySeconds": POPUP.get("delaySeconds", 30)},
           "analytics": {k: ANALYTICS.get(k, "") for k in ("ga4", "gtm", "metaPixel")}}
    cookie = ('<div class="cookie-banner" data-cookie-banner role="region" aria-label="Cookie consent" hidden>'
              '<div><h2>We value your privacy</h2><p>We use essential cookies to run this site. With your permission we also use analytics to improve it. '
              'Read our <a href="/cookies/">Cookie Policy</a>.</p></div>'
              '<div class="cookie-banner__actions"><button type="button" class="btn btn-primary" data-cookie-accept>Accept all</button>'
              '<button type="button" class="btn btn-outline-dark" data-cookie-reject>Essential only</button>'
              '<button type="button" class="btn btn-outline-dark" data-cookie-customise>Customise</button></div></div>')
    prefs = dialog_html("data-cookie-prefs", "cc-title", "Cookie preferences",
        '<p>Choose which cookies we may use. You can change this any time from the footer.</p>'
        '<div class="toggle-row"><div><h3>Essential</h3><p>Needed for the site to work and to remember these choices. Always on.</p></div>'
        '<label class="switch"><input type="checkbox" checked disabled aria-label="Essential cookies (always on)"><span></span></label></div>'
        '<div class="toggle-row"><div><h3>Analytics</h3><p>Anonymous usage statistics that help us improve pages and listings.</p></div>'
        '<label class="switch"><input type="checkbox" name="cc-analytics" aria-label="Analytics cookies"><span></span></label></div>'
        '<div class="toggle-row"><div><h3>Marketing</h3><p>Lets us measure the reach of our advertising.</p></div>'
        '<label class="switch"><input type="checkbox" name="cc-marketing" aria-label="Marketing cookies"><span></span></label></div>'
        '<div class="dialog__actions"><button type="button" class="btn btn-primary" data-cookie-save data-autofocus>Save preferences</button>'
        '<button type="button" class="btn btn-outline-dark" data-cookie-accept-all>Accept all</button></div>', "cookie preferences")
    lead = ""
    if POPUP.get("enabled"):
        lead = dialog_html("data-lead-popup", "lead-title", POPUP["title"],
            f'<p>{e(POPUP["text"])}</p>'
            f'<form data-form="newsletter" data-endpoint="{e(SITE["formEndpoint"])}" novalidate>'
            '<div class="form-field"><label for="lead-email">Email address</label><input type="email" id="lead-email" name="email" autocomplete="email" placeholder="you@example.com" required data-autofocus></div>'
            '<input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">'
            '<label class="form-check"><input type="checkbox" name="consent" required><span>I agree to receive market updates and accept the <a href="/privacy/">Privacy Policy</a>.</span></label>'
            '<button type="submit" class="btn btn-primary btn-block">Send me the watchlist</button>'
            '<p class="form-status" role="status" aria-live="polite" hidden></p></form>', "newsletter popup")
    callback = dialog_html("data-callback-modal", "cb-title", "Request a callback",
        '<p>Leave your number and a consultant will call you at a time that suits you.</p>'
        f'<form data-form="callback" data-endpoint="{e(SITE["formEndpoint"])}" novalidate>'
        '<div class="form-field"><label for="cb-name">Name</label><input id="cb-name" name="name" autocomplete="name" required data-autofocus></div>'
        '<div class="form-field"><label for="cb-phone">Phone (with country code)</label><input id="cb-phone" name="phone" type="tel" autocomplete="tel" pattern="[+0-9 ()\\-]{7,20}" required></div>'
        '<div class="form-field"><label for="cb-when">Best time to call</label><select id="cb-when" name="when"><option>Morning (9-12)</option><option>Afternoon (12-4)</option><option>Evening (4-7)</option></select></div>'
        '<input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">'
        '<label class="form-check"><input type="checkbox" name="consent" required><span>I agree to be contacted and accept the <a href="/privacy/">Privacy Policy</a>.</span></label>'
        '<button type="submit" class="btn btn-primary btn-block">Call me back</button>'
        '<p class="form-status" role="status" aria-live="polite" hidden></p></form>', "callback form")
    viewing = dialog_html("data-viewing-modal", "vw-title", "Book a viewing",
        '<p>Pick a day and time and a consultant will confirm by phone or WhatsApp.</p>'
        f'<form data-form="viewing" data-endpoint="{e(SITE["formEndpoint"])}" novalidate>'
        '<div class="form-field"><label for="vw-name">Name</label><input id="vw-name" name="name" autocomplete="name" required data-autofocus></div>'
        '<div class="form-field"><label for="vw-phone">Phone (with country code)</label><input id="vw-phone" name="phone" type="tel" autocomplete="tel" pattern="[+0-9 ()\\-]{7,20}" required></div>'
        '<div class="form-grid cols-2" style="gap:var(--space-3)"><div class="form-field"><label for="vw-date">Preferred date</label><input id="vw-date" name="date" type="date" required></div>'
        '<div class="form-field"><label for="vw-time">Time</label><select id="vw-time" name="time"><option>10:00</option><option>12:00</option><option>14:00</option><option>16:00</option><option>18:00</option></select></div></div>'
        '<input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">'
        '<label class="form-check"><input type="checkbox" name="consent" required><span>I agree to be contacted and accept the <a href="/privacy/">Privacy Policy</a>.</span></label>'
        '<button type="submit" class="btn btn-primary btn-block">Request viewing</button>'
        '<p class="form-status" role="status" aria-live="polite" hidden></p></form>', "viewing form")
    cfg["whatsapp"] = WA_DEFAULT
    cfg_json = json.dumps(cfg).replace("</", "<\\/")
    return (f'<script type="application/json" id="swk-config">{cfg_json}</script>\n'
            '<div class="toasts" id="toasts" aria-live="polite" aria-atomic="false"></div>\n'
            f'{cookie}\n{prefs}\n{lead}\n{callback}\n{viewing}\n'
            f'<button type="button" class="back-top" data-back-top aria-label="Back to top">{ICON_UP}</button>')


def csp_for(html_text):
    hashes = []
    for m in re.finditer(r"<script>(.*?)</script>", html_text, re.S):
        hashes.append("'sha256-" + base64.b64encode(hashlib.sha256(m.group(1).encode("utf-8")).digest()).decode() + "'")
    ga = bool(ANALYTICS.get("ga4") or ANALYTICS.get("gtm"))
    fb = bool(ANALYTICS.get("metaPixel"))
    script_src = ["'self'"] + hashes + (["https://www.googletagmanager.com"] if ga else []) + (["https://connect.facebook.net"] if fb else [])
    connect = ["'self'"]
    if SITE.get("formEndpoint"):
        parts = SITE["formEndpoint"].split("/")
        connect.append(parts[0] + "//" + parts[2])
    if ga:
        connect += ["https://www.google-analytics.com", "https://*.google-analytics.com", "https://*.analytics.google.com", "https://www.googletagmanager.com"]
    if fb:
        connect += ["https://www.facebook.com", "https://connect.facebook.net"]
    return ("default-src 'self'; script-src " + " ".join(script_src) + "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; "
            "font-src 'self'; media-src 'self' https://videos.pexels.com; connect-src " + " ".join(connect) + "; frame-src https://www.google.com https://maps.google.com; worker-src 'self' blob:; "
            "object-src 'none'; base-uri 'self'; form-action 'self' mailto:")


HERO_POSTER = "https://images.pexels.com/videos/31383779/4k-aerial-ascend-building-31383779.jpeg?auto=compress&cs=tinysrgb&h=720&w=1280"
HERO_VIDEO_HD = "https://videos.pexels.com/video-files/31383779/13391463_1280_720_60fps.mp4"
HERO_VIDEO_SD = "https://videos.pexels.com/video-files/31383779/13391462_960_540_60fps.mp4"


def head(path, title, desc, image, ld, og_type, robots, preload):
    url = BASE + path
    og = f"{BASE}/assets/{image}"
    ann_js = ""
    if ANN.get("enabled"):
        ann_js = f"document.documentElement.classList.add('has-ann');try{{if(localStorage.getItem('swk_ann')==={json.dumps(ANN['id'])})document.documentElement.classList.add('ann-off')}}catch(e){{}}"
    ld_json = "".join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in (ld or []))
    rb = f'<meta name="robots" content="{robots}">\n' if robots else '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">\n'
    vf = SITE.get("verification", {})
    ver = "".join(f'<meta name="{n}" content="{e(v)}">\n' for n, v in (("google-site-verification", vf.get("google", "")), ("msvalidate.01", vf.get("bing", ""))) if v)
    tw = f'<meta name="twitter:site" content="@{e(SITE["twitter"])}">\n' if SITE.get("twitter") else ""
    alt = e(f"{title} - {SITE['name']}")
    hreflang = "" if robots and "noindex" in robots else f'<link rel="alternate" hreflang="en-AE" href="{url}">\n<link rel="alternate" hreflang="x-default" href="{url}">\n'
    pre = "".join(f'<link rel="preload" as="image" href="{u}"{a} referrerpolicy="no-referrer">\n' for u, a in (preload or []))
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta name="author" content="{SITE['name']}">
<meta name="format-detection" content="telephone=no">
<meta name="theme-color" content="#faf7f2">
<meta name="color-scheme" content="light">
<link rel="canonical" href="{url}">
{hreflang}{rb}{ver}<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="{SITE['name']}">
<meta property="og:locale" content="en_AE">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{alt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(desc)}">
<meta name="twitter:image" content="{og}">
<meta name="twitter:image:alt" content="{alt}">
{tw}
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/images/brand/favicon-32.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="alternate" type="application/rss+xml" title="{SITE['name']} Journal" href="/feed.xml">
<link rel="apple-touch-icon" href="/assets/images/brand/favicon-app.png">
<script>document.documentElement.classList.add('js');{ann_js}</script>
{pre}{FONT_PRELOADS}<link rel="stylesheet" href="/assets/css/site.css?v={ASSET_V}">
{ld_json}</head>"""


def page(path, title, desc, body, *, image=PAGE_HERO_IMG, ld=None, og_type="website", robots=None, preload=None):
    out = head(path, title, desc, image, ld, og_type, robots, preload) + f"""
<body>
<div class="scroll-progress" aria-hidden="true"></div>
{PRELOADER}
<a class="skip-link" href="#main">Skip to content</a>
{announce_bar()}
{site_header(path)}
{deck_console(path)}
{dock(path)}
<main id="main">
{body}
</main>
{footer()}
{ui_markup()}
<script>window.SWK_V="{ASSET_V}";window.SWK_ASSETS="/assets/js/";</script>
<script src="/assets/js/main.js?v={ASSET_V}" defer></script>
</body>
</html>
"""
    return out.replace("<title>", f'<meta http-equiv="Content-Security-Policy" content="{e(csp_for(out))}">\n<title>', 1)


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


# Unsplash photos for the interior heroes (hot-linked, per Unsplash guidelines; each page gets its own).
UNSPLASH = {
    "properties": ("photo-1743819455744-05417bf55cea", "Ben Koorengevel", "Luxury villa with a green lawn in Dubai"),
    "about": ("photo-1775866899351-11414443e0d0", "Dynamic Hong Kong", "Dubai skyline in desert haze"),
    "services": ("photo-1682184805271-11671b7ecf4c", "Lumbardh Plluzhina", "Modern living room with a large window"),
    "mortgage": ("photo-1682410601760-6372fd33ad2b", "Jhonwayne Pumaras", "Aerial view of Dubai Marina"),
    "blog": ("photo-1580674684081-7617fbf3d745", "Wael Hneini", "High-rise towers beside the water in Dubai"),
    "contact": ("photo-1677632227880-4d21073ef8f4", "Thomas Haas", "Palm Jumeirah seen from above"),
    "legal": ("photo-1700556498243-9b5b66326e68", "Hongbin", "Sunset over Dubai Creek"),
}


def hero_photo(key):
    pid, who, alt = UNSPLASH[key]
    base = f"https://images.unsplash.com/{pid}?auto=format&fit=crop&q=70"
    srcset = ", ".join(f"{base}&w={w} {w}w" for w in (800, 1400, 2000))
    return (f'<div class="page-hero__bg" aria-hidden="true"><img src="{base}&w=1400" srcset="{srcset}" sizes="100vw" alt="" width="1400" height="900" '
            'fetchpriority="high" decoding="async" referrerpolicy="no-referrer"></div>',
            f'<a class="photo-credit" href="https://unsplash.com/?utm_source=swk_properties&utm_medium=referral" target="_blank" rel="noopener noreferrer" title="{e(alt)}">Photo: {e(who)} / Unsplash</a>')


def page_hero(title, lead, trail, bg=None, local=None):
    """bg: key into UNSPLASH; local: path of a local image used instead (property / article pages)."""
    media, credit = "", ""
    if bg:
        media, credit = hero_photo(bg)
    elif local:
        media = f'<div class="page-hero__bg" aria-hidden="true">{img(local, "", lazy=False, sizes="100vw")}</div>'
    cls = " page-hero--photo" if media else ""
    return f"""<section class="page-hero{cls}">{media}<div class="container">{crumbs(trail)}
<h1 class="page-hero__title">{e(title)}</h1><p>{e(lead)}</p></div>{credit}</section>"""


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


def blog_filters():
    cats = []
    for p in POSTS:
        if p["category"] not in cats:
            cats.append(p["category"])
    btns = '<button type="button" class="chip is-active" data-blog-filter="all" aria-pressed="true">All</button>' + "".join(
        f'<button type="button" class="chip" data-blog-filter="{e(c)}" aria-pressed="false">{e(c)}</button>' for c in cats)
    return f'<div class="chip-row" role="group" aria-label="Filter articles by topic">{btns}<span class="chip-count" data-blog-count aria-live="polite"></span></div>'


def blog_feature(p):
    return f"""<article class="blog-feature" data-reveal data-category="{e(p['category'])}"><a href="/blog/{p['slug']}/" aria-label="Read: {e(p['title'])}">
<div class="blog-feature__media">{img(p['image'], p['title'], lazy=False, sizes="(min-width: 900px) 640px, 100vw")}</div>
<div class="blog-feature__body"><span class="badge badge-gold">Featured &middot; {e(p['category'])}</span><h2>{e(p['title'])}</h2><p>{e(p['excerpt'])}</p>
<span class="blog-card__date"><time datetime="{p['date']}">{nice_date(p['date'])}</time> &middot; {e(p['readTime'])}</span><span class="btn btn-primary">Read article &rarr;</span></div></a></article>"""


def blog_card(p, i=0):
    return f"""<article class="blog-card" data-reveal data-reveal-delay="{i * 70}" data-category="{e(p['category'])}">
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
    return f"""<section class="section cta-section"><div class="container"><div class="cta-band on-dark">
<div class="cta-band__copy"><span class="eyebrow">Let's make it happen</span><h2>{e(title)}</h2><p>{e(text)}</p>
<div class="cta-band__actions"><a href="/contact/" class="btn btn-gold btn-lg">Book a Consultation</a>
<a href="{wa("Hello, I'd like to speak to a consultant about buying property in Dubai.")}" class="btn btn-outline btn-lg" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a></div></div>
<div class="cta-band__art" aria-hidden="true"></div></div></div></section>"""


def org_ld():
    return {"@context": "https://schema.org", "@type": "RealEstateAgent", "@id": BASE + "/#org", "name": SITE["name"], "url": BASE + "/",
            "logo": f"{BASE}/assets/images/brand/swk-logo.png", "image": f"{BASE}/assets/{PAGE_HERO_IMG}",
            "telephone": SITE["phone"], "email": SITE["email"], "areaServed": "Dubai, United Arab Emirates", "foundingDate": str(SITE["founded"]),
            "address": {"@type": "PostalAddress", "streetAddress": SITE["street"], "addressLocality": "Dubai", "addressCountry": "AE"},
            "geo": {"@type": "GeoCoordinates", "latitude": SITE["geo"][0], "longitude": SITE["geo"][1]},
            "openingHoursSpecification": [
                {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"], "opens": "09:00", "closes": "19:00"},
                {"@type": "OpeningHoursSpecification", "dayOfWeek": "Saturday", "opens": "10:00", "closes": "16:00"}],
            "sameAs": [SITE["instagram"], SITE["linkedin"]], "priceRange": "AED 500,000 - AED 50,000,000", "slogan": SITE.get("tagline", ""),
            "contactPoint": {"@type": "ContactPoint", "telephone": SITE["phone"], "email": SITE["email"], "contactType": "sales", "areaServed": "AE", "availableLanguage": ["English", "Arabic"]}}


# ---------------------------------------------------------------- pages

def build_home():
    comm_opts, type_opts, budget_opts, status_opts = filter_options()
    search = (select("s-community", "community", "Community", comm_opts, "Any community")
              + select("s-type", "type", "Property type", type_opts, "Any type")
              + select("s-budget", "budget", "Budget", budget_opts, "Any budget")
              + select("s-status", "status", "Status", status_opts, "Any status"))
    gallery = "".join(
        f'<button type="button" class="fan-card" data-fan-card="{i}" aria-label="Open photo {i + 1} of 25">'
        f'{img(f"assets/images/gallery/image{i + 1}.webp", "", "", lazy=i >= 7, sizes="(min-width: 700px) 20vw, 45vw")}</button>' for i in range(25))
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
{img(c['image'], f"{c['name']}, Dubai", sizes="(min-width: 1100px) 290px, (min-width: 640px) 25vw, 50vw")}<div class="community-card__overlay"><h3>{e(c['name'])}</h3><span class="community-card__count">{label}</span></div></a>"""

    svc_cards = ""
    for i, s in enumerate(SERVICES):
        svc_cards += f"""<div class="service-card service-card--themed" data-tilt="5" style="--theme-color:{SERVICE_THEMES[i % 6]}">
<div class="service-card__body"><h3>{e(s['title'])}</h3><a href="/services/" class="service-card__link" aria-label="Learn more about {e(s['title'])}">Learn more
<svg class="service-card__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg></a></div>
<div class="service-card__decor" aria-hidden="true">{service_icon(s['id'])}</div></div>"""

    slides = "".join(
        f'<figure class="rv-slide{" is-active" if i == 0 else ""}" data-rv-slide aria-hidden="{"false" if i == 0 else "true"}"><blockquote><p>{e(r["text"])}</p></blockquote>'
        f'<figcaption><strong>{e(r["name"])}</strong><span>{e(r["place"])}</span></figcaption></figure>' for i, r in enumerate(REVIEWS))
    team = f"""<div class="rv" data-reviews><div class="rv__stage" aria-live="off">{slides}</div>
<div class="rv__bar"><div class="rv__progress" aria-hidden="true"><i data-rv-progress></i></div>
<div class="rv__count" aria-hidden="true"><b data-rv-now>01</b> / {len(REVIEWS):02d}</div>
<div class="rv__nav"><button type="button" class="tc-arrow" data-rv-prev aria-label="Previous review">{PREV}</button><button type="button" class="tc-arrow" data-rv-next aria-label="Next review">{NEXT}</button></div></div></div>"""

    body = f"""<div class="hero-cine"><section class="hero" aria-label="Introduction">
<div class="hero__bg"><img src="{HERO_POSTER}" alt="" width="1280" height="720" fetchpriority="high" decoding="async" referrerpolicy="no-referrer"></div>
<video class="hero__video" muted playsinline preload="auto" aria-hidden="true" tabindex="-1" data-video-desktop="{HERO_VIDEO_HD}" data-video-mobile="{HERO_VIDEO_SD}" poster="{HERO_POSTER}" crossorigin="anonymous"></video>
<div class="hero__scrim"></div><div class="hero__glow" aria-hidden="true"></div><div class="hero__vignette"></div><div class="hero__streak" aria-hidden="true"></div>
<div class="hero__captions" aria-hidden="true"><p class="hero__caption"><span class="cap-kicker">Act I &mdash; The Skyline</span><span class="cap-line">Dubai. <em>Built to rise.</em></span></p><p class="hero__caption"><span class="cap-kicker">Act II &mdash; The Story</span><span class="cap-line">Every tower, <em>a story.</em></span></p><p class="hero__caption"><span class="cap-kicker">Act III &mdash; Your Address</span><span class="cap-line">Find <em>yours.</em></span></p></div>
<div class="hero__content container">
<span class="hero__eyebrow">Dubai's Trusted Real Estate Partner</span>
<h1 class="hero__title"><span class="sr-only">Experience Luxury Living in UAE</span><span data-typewriter aria-hidden="true">Experience Luxury<br><em>Living in UAE</em></span></h1>
<p class="hero__subtitle">Off-plan and ready homes across Downtown, Dubai Marina, Palm Jumeirah and more, with full buying, mortgage and investment support.</p>
<div class="hero__ctas"><a href="/properties/" class="btn btn-primary btn-lg">Explore Listings {ARROW}</a><a href="/contact/" class="btn btn-outline-dark btn-lg">Talk to an advisor</a></div>
<div class="hero__search-wrap"><form class="search-bar glass-panel" action="/properties/" method="get" aria-label="Search properties">{search}
<button type="submit" class="btn btn-primary">{SEARCH} Search</button></form></div>
</div>
<div class="hero__scroll-cue" aria-hidden="true"><span>Scroll</span><span class="line"></span></div>
</section></div>

{VALUES}

<section class="section container arc-gallery ambient-glow-host" data-arc-gallery>{GLOW}
<div class="section-header center"><span class="eyebrow">Portfolio</span>{h2_cascade("A closer look at our listings")}
<p>A curated sweep through the homes, interiors and skylines SWK Properties has placed clients in this year.</p></div>
<div class="fan-carousel-wrap" data-fan-carousel aria-label="Portfolio photo carousel" role="region">
<div class="fan-layout" data-fan-track>{gallery}</div>
<div class="fan-pagination"><button type="button" class="fan-arrow" data-fan-prev aria-label="Previous photos">{PREV}</button>
<div class="fan-dots" data-fan-dots aria-hidden="true">{dots}</div><button type="button" class="fan-arrow" data-fan-next aria-label="Next photos">{NEXT}</button></div></div>
<div class="arc-gallery__viewall"><a href="/properties/" class="btn btn-outline-dark">View all properties</a></div></section>

<section class="section section--alt featured-section ambient-glow-host" id="featured">{GLOW}<div class="container">
<div class="section-head-row deck-head"><div class="section-header deck-head__title" style="margin-bottom:0"><span class="eyebrow">Featured</span>{h2_cascade("Featured listings this month")}</div>
<div class="deck-head__tools"><span class="deck-hint" aria-hidden="true">{CONSOLE_BUILDING} Swipe the deck</span><div class="feature-slider__nav" data-deck-nav></div><a href="/properties/" class="btn btn-outline-dark btn-sm">All listings</a></div></div>
<div class="feature-slider" data-feature-slider><div class="feature-slider__viewport"><div class="feature-slider__track" data-featured-grid>{feat_cards}</div></div></div>
<p class="listing-note">ROI figures are estimates based on current market rents and are not guaranteed. Prices and availability are subject to change.</p>
</div></section>

{STORY}

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

<section class="section reviews-section ambient-glow-host" id="reviews" aria-labelledby="reviews-title">{GLOW}<div class="container"><div class="section-header center"><span class="eyebrow">Client reviews</span><h2 id="reviews-title">What Dubai property buyers say about SWK Properties</h2></div>{team}</div></section>

<section class="section ambient-glow-host">{GLOW}<div class="container">
<div class="section-head-row"><div class="section-header" style="margin-bottom:0"><span class="eyebrow">Insights</span>{h2_cascade("From the SWK journal")}</div>
<a href="/blog/" class="btn btn-outline-dark">Read all articles</a></div>
<div class="blog-grid" data-blog-preview-grid>{"".join(blog_card(p, i) for i, p in enumerate(POSTS[:3]))}</div></div></section>

{cta_section()}"""
    ld = [org_ld(), {"@context": "https://schema.org", "@type": "WebSite", "name": SITE["name"], "url": BASE + "/", "inLanguage": "en"}]
    write("/", page("/", "SWK Properties | Luxury Real Estate in Dubai",
                    "SWK Properties is a premium Dubai real estate agency — off-plan and ready homes across Downtown, Dubai Marina, Palm Jumeirah and more, with full buying, mortgage and investment support.",
                    body, ld=ld,
                    preload=[(HERO_POSTER, ' fetchpriority="high"')]))


def build_properties():
    comm, types, budgets, stats = filter_options()

    def sel(name, label, opts, any_label):
        o = f'<option value="">{any_label}</option>' + "".join(f'<option value="{e(v)}">{e(t)}</option>' for v, t in opts)
        return f'<label>{label}<select name="{name}" data-filter="{name}">{o}</select></label>'

    filters = (sel("community", "Community", comm, "All communities") + sel("type", "Property type", types, "All types")
               + sel("budget", "Budget", budgets, "Any budget") + sel("status", "Status", stats, "Any status"))
    cards = "".join(prop_card(p) for p in PROPS)
    trail = [("Home", "/"), ("Properties", None)]
    body = f"""{page_hero("Properties for Sale in Dubai", "Off-plan and ready homes across Dubai's most sought-after communities, updated as new listings launch.", trail, bg="properties")}
<section class="section container ambient-glow-host" id="listings">{GLOW}
<div class="listings-console-row"><span class="lc-mark" aria-hidden="true"><i class="lc-pulse"></i>Live listings</span>
<div class="lc-actions"><button type="button" class="mini-arrow" data-deck-page="-1" aria-label="Previous listings page">{PREV}</button><button type="button" class="mini-arrow" data-deck-page="1" aria-label="Next listings page">{NEXT}</button><button type="button" class="console-jump" data-jump-listings>Scroll to listings {ICON_DOWN}</button></div></div>
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
                  f'{img(src, alt, lazy=i > 2, sizes="(min-width: 1024px) 50vw, 100vw")}<span class="pd-bento-gallery__overlay"><span class="pd-bento-gallery__caption">Photo {i + 1}</span></span></button>')
    facts = [("Type", p["type"]), ("Bedrooms", p["bedrooms"]), ("Bathrooms", str(p["bathrooms"])), ("Area", f"{num(p['areaSqft'])} sqft"),
             ("Payment plan", p["paymentPlan"]), ("Handover", p["handover"]), ("Developer", p["developer"]), ("Est. ROI", f"{p['roiPercent']:g}%")]
    facts_html = "".join(f'<div class="fact"><div class="label">{k}</div><div class="value">{e(v)}</div></div>' for k, v in facts)
    amen = "".join(f"<li>{e(a)}</li>" for a in p["amenities"])
    similar = sorted((q for q in PROPS if q["id"] != p["id"]), key=lambda q: (q["status"] != p["status"], q["community"] != p["community"]))[:3]
    trail = [("Home", "/"), ("Properties", "/properties/"), (p["title"], None)]
    body = f"""<section class="page-hero page-hero--photo"><div class="page-hero__bg" aria-hidden="true">{img(prop_images(p)[0], "", lazy=False, sizes="100vw")}</div><div class="container">{crumbs(trail)}
<div class="pd-head">{badges(p)}</div><h1 class="page-hero__title">{e(p['title'])}</h1>
<p>{PIN} {e(location(p))} · by {e(p['developer'])}</p></div></section>
<section class="section container ambient-glow-host">{GLOW}
<div class="pd-bento-gallery" data-gallery aria-label="{e(p['title'])} photo gallery">{tiles}</div>
{f'<div class="pd-gallery-more"><button type="button" class="btn btn-outline-dark" data-gallery-more>View all {len(images)} photos</button></div>' if len(images) > 9 else ""}
<div class="pd-layout"><div>
<div class="pd-facts">{facts_html}</div>
<h2 class="pd-section-title">Overview</h2><p>{e(p['description'])}</p>
<h2 class="pd-section-title">Amenities</h2><ul class="amenity-list">{amen}</ul>
<p class="pd-note">Prices, availability and payment plans are indicative and may change without notice. ROI is an estimate based on current market rents and is not guaranteed. Contact us for the current price list, floor plans and payment schedule.</p>
</div>
<aside class="pd-sidebar" aria-label="Enquire about {e(p['title'])}">
<div class="pd-agent-card"><div class="pd-price"><small>Starting price</small><br>{money(p['price'])}</div>
<div class="pd-cta" style="margin-top:var(--space-5)"><a href="/contact/?property={p['id']}" class="btn btn-primary btn-block">Request details</a>
<a href="{wa(f"Hello SWK Properties, I'd like details on {p['title']}.")}" class="btn btn-whatsapp btn-block" target="_blank" rel="noopener noreferrer">Ask on WhatsApp</a>
<button type="button" class="btn btn-gold btn-block" data-open-viewing>Book a viewing</button>
<button type="button" class="btn btn-outline-dark btn-block" data-open-callback>Request a callback</button>
<button type="button" class="btn btn-outline-dark btn-block" data-save-listing="{p['id']}" aria-pressed="false">Save listing</button>
<button type="button" class="btn btn-outline-dark btn-block" data-share>Share this listing</button></div></div>
<div class="pd-agent-card">{img("assets/images/team/mohd-shahid-khan.webp", "Mohd Shahid Khan")}<p class="pd-agent-name">Mohd Shahid Khan</p><p>Your point of contact for this listing</p></div>
</aside></div></section>
<section class="section section--alt ambient-glow-host">{GLOW}<div class="container"><div class="section-header"><span class="eyebrow">You may also like</span><h2>Similar properties</h2></div>
<div class="property-grid">{"".join(prop_card(q) for q in similar)}</div></div></section>"""
    cover = prop_images(p)[0].replace("assets/images/", "")
    ld = [breadcrumb_ld(trail), {"@context": "https://schema.org", "@type": "RealEstateListing", "name": p["title"], "description": p["description"],
          "url": f"{BASE}/properties/{p['id']}/", "image": f"{BASE}/assets/og/{p['id']}.jpg",
          "offers": {"@type": "Offer", "price": p["price"], "priceCurrency": p["currency"]}}]
    desc = f"{p['title']} in {location(p)} by {p['developer']} — {money(p['price'])}, {p['bedrooms']} bed, {p['status']}. {p['paymentPlan']} payment plan, handover {p['handover']}."
    write(f"/properties/{p['id']}/", page(f"/properties/{p['id']}/", f"{p['title']} | SWK Properties", desc, body, image=f"og/{p['id']}.jpg", ld=ld))


def build_about():
    card_accents = ["213 88% 66%", "168 74% 62%", "258 88% 76%", "33 40% 52%", "199 74% 66%"]
    cards = "".join(f'''<article class="id-card" data-reveal data-reveal-delay="{i * 90}" style="--i:{i}; --tc:{card_accents[i % len(card_accents)]}">
<div class="id-card__head"><span class="id-card__hole" aria-hidden="true"></span></div>
<div class="id-card__photo">{img(t["photo"], t["name"], sizes="(min-width: 1100px) 20vw, 62vw")}<span class="id-card__sheen" aria-hidden="true"></span></div>
<div class="id-card__body"><div class="id-card__org">SWK Properties &middot; Dubai</div><h3>{e(t["name"])}</h3><p class="id-card__role">{e(t["role"])}</p><p class="id-card__bio">{e(t["bio"])}</p></div>
<div class="id-card__bar" aria-hidden="true"></div>
<div class="id-card__foot"><span class="id-card__num">SWK&ndash;{i + 1:02d}</span><span class="id-card__ok" aria-hidden="true">Verified</span></div></article>''' for i, t in enumerate(TEAM))
    values = [("Radical Transparency", "Every fee, commission and clause disclosed upfront — no surprises at signing."),
              ("Data Over Hype", "ROI and appreciation projections built on transaction data, not developer marketing."),
              ("One Point of Contact", "The consultant who takes your first call is the one who sees your deal through to handover."),
              ("Long-Term Relationships", "Most of our new business comes from repeat clients and referrals — that's the metric we optimise for.")]
    steps = "".join(f'<div class="step-item" data-reveal data-reveal-delay="{i * 80}"><div class="num">{i + 1:02d}</div><div><h3>{e(t)}</h3><p>{e(d)}</p></div></div>' for i, (t, d) in enumerate(values))
    stats = STATS
    stat_html = "".join(f'<div><div class="stat-num" data-count="{n}" data-suffix="{s}">{n}{s}</div><div class="stat-label">{l}</div></div>' for n, s, l in stats)
    trail = [("Home", "/"), ("About", None)]
    body = f"""{page_hero("Ten years of getting Dubai property right", "SWK Properties was founded on a simple idea: buying a home in Dubai — whether you live down the road or on the other side of the world — should feel transparent, not transactional.", trail, bg="about")}
<section class="section container ambient-glow-host">{GLOW}<div class="split-block">{img("assets/images/about/swk-office.webp", "SWK Properties office overlooking Business Bay", sizes="(min-width: 900px) 600px, 100vw")}
<div data-reveal><span class="eyebrow">Our Story</span><h2>Built by agents, run for clients</h2>
<p>SWK Properties was started in 2016 by a small team of agents frustrated with how opaque property buying in Dubai could feel for outsiders. Today we're a full-service brokerage of over 40 consultants, but the founding principle hasn't changed: every fee, every payment plan clause, and every ROI figure gets explained in plain language before you sign anything.</p>
<p style="margin-top:var(--space-4)">We work across off-plan and secondary sales, mortgage arrangement, and long-term property management — so the relationship doesn't end at handover.</p>
<a href="/contact/" class="btn btn-dark" style="margin-top:var(--space-5)">Talk to our team</a></div></div></section>
<section class="section section--alt ambient-glow-host">{GLOW}<div class="container"><div class="section-header center"><span class="eyebrow">Our Values</span><h2>What guides every deal we close</h2></div><div class="step-list">{steps}</div></div></section>
<section class="section section--dark ambient-glow-host">{GLOW}<div class="container"><div class="stat-strip">{stat_html}</div></div></section>
<section class="section ambient-glow-host" id="team">{GLOW}<div class="container"><div class="section-header center"><span class="eyebrow">Our People</span><h2>Meet a few of our consultants</h2>
<p>Every client is paired with a dedicated consultant for the life of their purchase.</p></div>
<div class="team-rail" data-team-rail>{cards}</div>
<p class="team-rail-note">On a team of 40+ consultants &mdash; scroll the badge rail to meet the desk leads.</p></div></section>
{cta_section("Let's find your next Dubai address", "Book a no-obligation consultation and we'll come prepared with listings matched to your budget.")}"""
    write("/about/", page("/about/", "About Us | SWK Properties",
                          "SWK Properties is a Dubai-based real estate agency built on ten years of local market expertise, transparent advice, and full-service support for buyers and investors.",
                          body, image="og/about.jpg", ld=[breadcrumb_ld(trail), org_ld()]))


def build_services():
    cards = "".join(f"""<div class="service-card service-card--themed service-card--detailed" data-tilt="5" style="--theme-color:{SERVICE_THEMES[i % 6]}">
<div class="service-card__body"><h3>{e(s['title'])}</h3><p>{e(s['description'])}</p></div><div class="service-card__decor" aria-hidden="true">{service_icon(s['id'])}</div></div>""" for i, s in enumerate(SERVICES))
    process = [("Discovery Call", "We learn your budget, must-haves, and whether you're buying to live or to invest."),
               ("Curated Shortlist", "A shortlist matched to your brief within 24 hours, including off-market options."),
               ("Viewings & Offer", "In-person or virtual viewings, followed by negotiation on your behalf."),
               ("Handover & Beyond", "Legal transfer, mortgage coordination, and ongoing management if you choose to let.")]
    steps = "".join(f'<div class="step-item" data-reveal data-reveal-delay="{i * 80}"><div class="num">{i + 1:02d}</div><div><h3>{e(t)}</h3><p>{e(d)}</p></div></div>' for i, (t, d) in enumerate(process))
    trail = [("Home", "/"), ("Services", None)]
    body = f"""{page_hero("Full-service support, start to handover", "Buying, selling, financing or managing a Dubai property — one team handles every step, with a single consultant as your point of contact throughout.", trail, bg="services")}
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
    body = f"""{page_hero("Mortgage Calculator", "Get an instant estimate of your monthly payment, then let our lending partners find you the sharpest rate available.", trail, bg="mortgage")}
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
    body = f"""{page_hero("Let's talk about your next move", "Whether you're buying, selling, or just exploring the market — a consultant will get back to you within one business day.", trail, bg="contact")}
<section class="section container ambient-glow-host contact-page">{GLOW}
<div class="quick-tiles" data-reveal>
<a class="quick-tile" href="tel:{SITE['phone']}"><span class="quick-tile__icon">{ic('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>')}</span><span class="quick-tile__txt"><small>Call us</small><strong>{SITE['phoneDisplay']}</strong></span><span class="quick-tile__go" aria-hidden="true">&rarr;</span></a>
<a class="quick-tile quick-tile--wa" href="{WA_DEFAULT}" target="_blank" rel="noopener noreferrer"><span class="quick-tile__icon">{WHATSAPP}</span><span class="quick-tile__txt"><small>WhatsApp</small><strong>Chat in minutes</strong></span><span class="quick-tile__go" aria-hidden="true">&rarr;</span></a>
<a class="quick-tile quick-tile--mail" href="mailto:{SITE['email']}"><span class="quick-tile__icon">{ic('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>')}</span><span class="quick-tile__txt"><small>Email</small><strong>{SITE['email']}</strong></span><span class="quick-tile__go" aria-hidden="true">&rarr;</span></a>
<button type="button" class="quick-tile quick-tile--cb" data-open-callback><span class="quick-tile__icon">{ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}</span><span class="quick-tile__txt"><small>We call you</small><strong>Request a callback</strong></span><span class="quick-tile__go" aria-hidden="true">&rarr;</span></button>
</div>
<div class="contact-layout">
<div class="ui-card" data-reveal><div class="ui-card__head"><span class="eyebrow">Send a message</span><h2>Tell us what you're looking for</h2><p>Share a few details and a consultant will reply within one business day.</p></div>
<form id="contact-form" data-form="contact" data-endpoint="{e(SITE['formEndpoint'])}" novalidate class="ui-card__body"><div class="form-grid">
<div class="form-field"><label for="cf-name">Full name</label><input id="cf-name" name="name" autocomplete="name" placeholder="Your full name" required></div>
<div class="form-grid cols-2" style="gap:var(--space-5)"><div class="form-field"><label for="cf-email">Email</label><input id="cf-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
<div class="form-field"><label for="cf-phone">Phone</label><input id="cf-phone" name="phone" type="tel" autocomplete="tel" placeholder="+971 5X XXX XXXX"></div></div>
<div class="form-field"><label for="cf-interest">I'm interested in</label><select id="cf-interest" name="interest">{opts}</select></div>
<div class="form-field"><label for="cf-message">Message</label><textarea id="cf-message" name="message" placeholder="Budget, communities, timeline..." required></textarea></div>
<label class="form-check"><input type="checkbox" name="consent" required><span>I agree that SWK Properties may contact me about my enquiry and I accept the <a href="/privacy/">Privacy Policy</a>.</span></label>
<input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
<button type="submit" class="btn btn-primary btn-lg btn-block">Send Message</button>
<p class="form-status" role="status" aria-live="polite" hidden></p></div></form></div>
<div class="contact-side" data-reveal data-reveal-delay="100">
<div class="ui-card ui-card--map"><div class="map-embed"><iframe title="Map showing the SWK Properties office on Sheikh Zayed Road, Dubai" src="{gm}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
<div class="ui-card__body"><div class="office-head"><h3>Visit our office</h3><span class="status-pill" data-open-status data-tz="Asia/Dubai">Checking hours&hellip;</span></div>
<p class="office-addr">{PIN} {e(SITE['address'])}</p>
<dl class="hours"><div><dt>Sunday &ndash; Thursday</dt><dd>9:00 &ndash; 19:00</dd></div><div><dt>Saturday</dt><dd>10:00 &ndash; 16:00</dd></div><div><dt>Friday</dt><dd>Closed</dd></div></dl>
<div class="office-actions"><a class="btn btn-outline-dark btn-sm" href="https://www.google.com/maps/dir/?api=1&destination={SITE['geo'][0]},{SITE['geo'][1]}" target="_blank" rel="noopener noreferrer">Get directions</a>
<button type="button" class="btn btn-gold btn-sm" data-open-viewing>Book a visit</button></div></div></div>
<div class="ui-card ui-card--note"><h3>What happens next?</h3><ol class="next-steps"><li><b>Reply within one business day.</b> A consultant reads your brief.</li><li><b>A short discovery call.</b> Budget, timeline and must-haves.</li><li><b>A curated shortlist</b> matched to you, with transparent costs.</li></ol></div>
</div></div></section>"""
    write("/contact/", page("/contact/", "Contact Us | SWK Properties",
                            "Get in touch with SWK Properties — book a consultation, ask about a listing, or reach us on WhatsApp, phone or email.", body, ld=[breadcrumb_ld(trail), org_ld()]))


def build_blog():
    trail = [("Home", "/"), ("Journal", None)]
    body = f"""{page_hero("The SWK Journal", "Market insight, buyer guides and community spotlights from our consultants on the ground in Dubai.", trail, bg="blog")}
<section class="section container ambient-glow-host">{GLOW}<h2 class="sr-only">All articles</h2>
{blog_filters()}
{blog_feature(POSTS[0])}
<div class="blog-grid" data-blog-grid>{"".join(blog_card(p, i) for i, p in enumerate(POSTS[1:]))}</div></section>
<section class="section section--alt ambient-glow-host" style="text-align:center">{GLOW}<div class="container"><h2>Want market updates in your inbox?</h2>
<p style="max-width:52ch; margin:var(--space-4) auto var(--space-5)">Subscribe for monthly insight on Dubai pricing trends, new launches and yield opportunities.</p>
<form class="nl-inline" data-form="newsletter" data-endpoint="{e(SITE['formEndpoint'])}" aria-label="Blog newsletter signup" novalidate>
<div class="nl-inline__row"><label for="nl-blog" class="sr-only">Email address</label><input type="email" id="nl-blog" name="email" placeholder="Your email address" autocomplete="email" required>
<button type="submit" class="btn btn-primary">Subscribe</button></div>
<input type="text" name="website" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
<label class="form-check"><input type="checkbox" name="consent" required><span>I agree to receive market updates and accept the <a href="/privacy/">Privacy Policy</a>.</span></label>
<p class="form-status" role="status" aria-live="polite" hidden></p></form></div></section>"""
    write("/blog/", page("/blog/", "Journal | SWK Properties",
                         "Market insights, buyer guides and community spotlights from SWK Properties — everything you need to know about buying and investing in Dubai real estate.", body, ld=[breadcrumb_ld(trail)]))
    for p in POSTS:
        others = [q for q in POSTS if q["slug"] != p["slug"]]
        tr = [("Home", "/"), ("Journal", "/blog/"), (p["title"], None)]
        b = f"""<section class="page-hero page-hero--photo"><div class="page-hero__bg" aria-hidden="true">{img(p['image'], "", lazy=False, sizes="100vw")}</div><div class="container">{crumbs(tr)}<span class="badge badge-gold">{e(p['category'])}</span>
<h1 class="page-hero__title" style="margin-top:var(--space-4)">{e(p['title'])}</h1>
<p class="post-meta"><time datetime="{p['date']}">{nice_date(p['date'])}</time> · {e(p['readTime'])}</p>
<div class="pd-actions"><button type="button" class="btn btn-outline-dark" data-share>Share this article</button></div></div></section>
<article class="section container ambient-glow-host">{GLOW}<div class="prose">{img(p['image'], p['title'], lazy=False)}<p>{e(p['content'])}</p>
<p style="font-size:var(--fs-xs)">This article is general information, not financial, legal or investment advice. Market conditions and regulations change — speak to a consultant before you decide.</p></div></article>
<section class="section section--alt ambient-glow-host">{GLOW}<div class="container"><div class="section-header"><span class="eyebrow">Keep reading</span><h2>More from the journal</h2></div>
<div class="blog-grid">{"".join(blog_card(q, i) for i, q in enumerate(others))}</div></div></section>
{cta_section()}"""
        ld = [breadcrumb_ld(tr), {"@context": "https://schema.org", "@type": "Article", "headline": p["title"], "datePublished": p["date"], "dateModified": p["date"],
              "description": p["excerpt"], "image": f"{BASE}/assets/og/blog-{p['slug']}.jpg", "mainEntityOfPage": f"{BASE}/blog/{p['slug']}/",
              "author": {"@type": "Organization", "name": SITE["name"]},
              "publisher": {"@type": "Organization", "name": SITE["name"], "logo": {"@type": "ImageObject", "url": f"{BASE}/assets/images/brand/swk-logo.png"}}}]
        long_title = f"{p['title']} | SWK Properties"
        write(f"/blog/{p['slug']}/", page(f"/blog/{p['slug']}/", long_title if len(long_title) <= 70 else p["title"], p["excerpt"], b,
                                           image=f"og/blog-{p['slug']}.jpg", ld=ld, og_type="article"))


def legal(path, title, desc, sections):
    parts = "".join(f"<h2>{e(h)}</h2>" + "".join(f"<p>{e(t)}</p>" for t in ps) for h, ps in sections)
    trail = [("Home", "/"), (title, None)]
    body = f"""{page_hero(title, desc, trail, bg="legal")}<section class="section container ambient-glow-host">{GLOW}<div class="prose legal"><p class="post-meta">Last updated {nice_date(TODAY.isoformat())}</p>{parts}</div></section>"""
    write(path, page(path, f"{title} | SWK Properties", desc, body, ld=[breadcrumb_ld(trail)]))


def build_legal():
    n, em = SITE["name"], SITE["email"]
    legal("/privacy/", "Privacy Policy", "How SWK Properties collects, uses and protects your personal data.", [
        ("Who we are", [f"{n} ('we', 'us') is a real estate brokerage at {SITE['address']}. You can reach us at {em} or {SITE['phoneDisplay']}."]),
        ("What we collect", ["Information you give us through our contact form, newsletter sign-up, email, phone or WhatsApp: your name, email address, phone number, enquiry details and property preferences.",
                             "We only use analytics or marketing cookies if you allow them in the cookie banner; see our Cookie Policy. The contact page embeds a Google map, which may load content from Google when displayed."]),
        ("Why we use it", ["To respond to your enquiry, arrange viewings, prepare shortlists and any mortgage or legal introductions you ask for and, if you opt in, to send market updates. We rely on your consent and on our legitimate interest in running our business."]),
        ("Who we share it with", ["Only with partners needed to deliver what you asked for, such as developers, banks and legal partners, and with service providers who help us run our systems. We do not sell your personal data."]),
        ("How long we keep it", ["For as long as needed to deal with your enquiry and meet our legal and regulatory record-keeping duties. Newsletter data is kept until you unsubscribe."]),
        ("Your rights", [f"Under UAE data-protection law (Federal Decree-Law No. 45 of 2021) you may ask to access, correct or delete your data, and withdraw consent at any time. Email {em} to make a request."]),
        ("Changes", ["We may update this policy and will change the date above when we do."])])
    legal("/cookies/", "Cookie Policy", "Which cookies and similar technologies swkpropertiesuae.com uses, and how to control them.", [
        ("What are cookies", ["Cookies are small files stored on your device. We also use similar browser storage to remember choices you make on the site."]),
        ("Essential", ["Needed for the site to work. We store your cookie choice, whether you dismissed the announcement bar, and whether you have already seen our newsletter pop-up. These do not identify you and cannot be switched off."]),
        ("Analytics", ["Only if you allow it. Analytics tools such as Google Analytics tell us which pages are visited so we can improve them. IP addresses are anonymised."]),
        ("Marketing", ["Only if you allow it. These measure how well our advertising performs. We do not sell your data."]),
        ("Your choices", ["Use the Cookie settings link in the footer to change your choice at any time. You can also clear cookies and site data in your browser settings."]),
        ("Contact", [f"Questions about cookies: {SITE['email']}."])])
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
    pages = ["/", "/properties/", "/about/", "/services/", "/mortgage/", "/blog/", "/contact/", "/privacy/", "/terms/", "/cookies/"]
    entries = [(u, TODAY.isoformat(), []) for u in pages]
    entries += [(f"/properties/{p['id']}/", TODAY.isoformat(), [f"{BASE}/assets/og/{p['id']}.jpg"]) for p in PROPS]
    entries += [(f"/blog/{p['slug']}/", p["date"], [f"{BASE}/assets/og/blog-{p['slug']}.jpg"]) for p in POSTS]
    xml = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']
    for u, lm, imgs in entries:
        pri = "1.0" if u == "/" else "0.8" if u.count("/") <= 2 and u not in ("/privacy/", "/terms/", "/cookies/") else "0.6"
        xml.append(f"<url><loc>{BASE}{u}</loc><lastmod>{lm}</lastmod><priority>{pri}</priority>" + "".join(f"<image:image><image:loc>{i}</image:loc></image:image>" for i in imgs) + "</url>")
    xml.append("</urlset>")
    (OUT / "sitemap.xml").write_text("\n".join(xml) + "\n", encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nDisallow: /404.html\n\nSitemap: {BASE}/sitemap.xml\n", encoding="utf-8")

    # RSS feed for the journal
    items = "".join(
        f"<item><title>{e(p['title'])}</title><link>{BASE}/blog/{p['slug']}/</link><guid isPermaLink=\"true\">{BASE}/blog/{p['slug']}/</guid>"
        f"<pubDate>{datetime.strptime(p['date'], '%Y-%m-%d').strftime('%a, %d %b %Y 08:00:00 +0400')}</pubDate><category>{e(p['category'])}</category>"
        f"<description>{e(p['excerpt'])}</description></item>" for p in POSTS)
    (OUT / "feed.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
        f"<title>{e(SITE['name'])} Journal</title><link>{BASE}/blog/</link><description>Dubai property market insight, buyer guides and community spotlights.</description>"
        f'<language>en-ae</language><atom:link href="{BASE}/feed.xml" rel="self" type="application/rss+xml"/>{items}</channel></rss>', encoding="utf-8")

    # Web app manifest and security.txt
    manifest = {"name": SITE["name"], "short_name": "SWK", "description": SITE.get("tagline", ""), "start_url": "/", "scope": "/", "display": "browser",
                "background_color": "#faf7f2", "theme_color": "#faf7f2", "lang": "en-AE",
                "icons": [{"src": "/assets/images/brand/icon-192.png", "sizes": "192x192", "type": "image/png"},
                          {"src": "/assets/images/brand/icon-512.png", "sizes": "512x512", "type": "image/png"},
                          {"src": "/assets/images/brand/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
    (OUT / "manifest.webmanifest").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    wk = OUT / ".well-known"
    wk.mkdir(exist_ok=True)
    (wk / "security.txt").write_text(f"Contact: mailto:{SITE['email']}\nExpires: {TODAY.year + 1}-12-31T23:59:59.000Z\nPreferred-Languages: en\nCanonical: {BASE}/.well-known/security.txt\n", encoding="utf-8")


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

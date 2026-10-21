#!/usr/bin/env python3
"""Static site generator for swkpropertiesuae.com.

Reads data/*.json and writes the finished site to public/. No dependencies.
Usage: python3 build.py
"""
import html
import json
import shutil
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).parent
OUT = ROOT / "public"
SITE = json.loads((ROOT / "data/site.json").read_text(encoding="utf-8"))
PROPS = json.loads((ROOT / "data/properties.json").read_text(encoding="utf-8"))
POSTS = sorted(json.loads((ROOT / "data/posts.json").read_text(encoding="utf-8")),
               key=lambda p: p["date"], reverse=True)
BASE = SITE["url"]
TODAY = date.today()

BANDS = [
    ("lt1", "Up to AED 1M", 0, 1_000_000),
    ("1-3", "AED 1M – 3M", 1_000_000, 3_000_000),
    ("3-6", "AED 3M – 6M", 3_000_000, 6_000_000),
    ("6-10", "AED 6M – 10M", 6_000_000, 10_000_000),
    ("10p", "AED 10M+", 10_000_000, float("inf")),
]

e = html.escape


def band(price):
    return next(k for k, _, lo, hi in BANDS if lo <= price < hi)


def money(n):
    return f"AED {n:,.0f}"


def nice_date(iso):
    d = datetime.strptime(iso, "%Y-%m-%d")
    return f"{d.day} {d.strftime('%B %Y')}"


def wa(text):
    from urllib.parse import quote
    return f"https://wa.me/{SITE['phone'].lstrip('+')}?text={quote(text)}"


def img(src, alt, cls="", eager=False):
    loading = "" if eager else ' loading="lazy" decoding="async"'
    c = f' class="{cls}"' if cls else ""
    return f'<img src="/assets/images/{src}" alt="{e(alt)}"{c}{loading}>'


def location(p):
    return f"{p['community']}, {p['emirate']}"


def overview(p):
    if p.get("overview"):
        return p["overview"]
    kind = "off-plan development" if p["status"] == "Off-Plan" else "ready property"
    s = (f"{p['name']} is an {kind} by {p['developer']} in {location(p)}, "
         f"starting from {money(p['price'])}.")
    if p["status"] == "Off-Plan":
        s += f" The payment plan is {p['plan']} with handover scheduled for {p['handover']}."
    else:
        s += " It is ready to move in and can be bought with cash or a mortgage."
    return s


PROP_BY_ID = {p["id"]: p for p in PROPS}
COMMUNITIES = {}
for _p in PROPS:
    COMMUNITIES.setdefault(_p["community"], []).append(_p)
TYPES = sorted({p["type"] for p in PROPS})
DEVELOPERS = sorted({p["developer"] for p in PROPS})


# ---------------------------------------------------------------- layout
NAV = [("/", "Home"), ("/properties/", "Properties"), ("/about/", "About"),
       ("/services/", "Services"), ("/mortgage/", "Mortgage"),
       ("/blog/", "Blog"), ("/contact/", "Contact")]


def header(path):
    links = []
    for href, label in NAV:
        cur = ' aria-current="page"' if (href == path or (href != "/" and path.startswith(href))) else ""
        links.append(f'<li><a href="{href}"{cur}>{label}</a></li>')
    return f"""<header class="site-header">
<div class="wrap site-header__inner">
<a class="brand" href="/" aria-label="SWK Properties — Home"><img src="/assets/images/brand/swk-logo.png" alt="SWK Properties" height="44" class="brand__logo"></a>
<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav"><span class="sr-only">Menu</span><span class="nav-toggle__bars" aria-hidden="true"></span></button>
<nav id="site-nav" class="site-nav" aria-label="Main"><ul>{''.join(links)}</ul></nav>
</div></header>"""


def newsletter_form():
    return f"""<form class="newsletter" data-form="newsletter" data-endpoint="{e(SITE['formEndpoint'])}" novalidate>
<label for="nl-email">Email address</label>
<div class="newsletter__row"><input id="nl-email" name="email" type="email" autocomplete="email" required placeholder="you@example.com">
<button class="btn btn--gold" type="submit">Join</button></div>
<label class="check"><input type="checkbox" name="consent" required> <span>I agree to receive market updates and accept the <a href="/privacy/">Privacy Policy</a>.</span></label>
<input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<p class="form-status" role="status" aria-live="polite" hidden></p>
</form>"""


def footer():
    comm = "".join(f'<li><a href="/properties/?community={e(c)}">{e(c)}</a></li>'
                   for c in sorted(COMMUNITIES, key=lambda c: -len(COMMUNITIES[c]))[:5])
    ids = [SITE["rera"]]
    if SITE.get("brn"):
        ids.append(f"BRN {SITE['brn']}")
    if SITE.get("tradeLicense"):
        ids.append(f"Licence {SITE['tradeLicense']}")
    year = f"{SITE['founded']}–{TODAY.year}"
    return f"""<footer class="site-footer"><div class="wrap">
<div class="footer-grid">
<div><img src="/assets/images/brand/swk-logo.png" alt="SWK Properties" height="44" class="brand__logo brand__logo--footer" loading="lazy">
<p>A Dubai real estate agency helping investors and homeowners buy, sell and manage property with confidence.</p>
<p class="social"><a href="{SITE['instagram']}" rel="noopener" target="_blank">Instagram</a> · <a href="{SITE['linkedin']}" rel="noopener" target="_blank">LinkedIn</a></p></div>
<div><h2 class="footer-h">Explore</h2><ul><li><a href="/properties/">Properties</a></li><li><a href="/about/">About Us</a></li><li><a href="/services/">Services</a></li><li><a href="/mortgage/">Mortgage Calculator</a></li><li><a href="/blog/">Journal</a></li><li><a href="/contact/">Contact</a></li></ul></div>
<div><h2 class="footer-h">Communities</h2><ul>{comm}</ul></div>
<div><h2 class="footer-h">Stay updated</h2><p>Market insights and new launches, monthly.</p>{newsletter_form()}</div>
</div>
<address class="footer-contact"><a href="tel:{SITE['phone']}">{SITE['phoneDisplay']}</a> · <a href="mailto:{SITE['email']}">{SITE['email']}</a> · {e(SITE['address'])}</address>
<p class="footer-legal">© {year} {SITE['name']}. All rights reserved. {' · '.join(e(i) for i in ids)}. <a href="/privacy/">Privacy Policy</a> · <a href="/terms/">Terms of Use</a></p>
</div></footer>
<a class="wa-float" href="{wa("Hello SWK Properties, I'd like to know more about your listings.")}" target="_blank" rel="noopener" aria-label="Chat with SWK Properties on WhatsApp">
<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 5 5.1-1.3A10 10 0 1 0 12 2zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.7 1.2 1.6 1.9 1.1 1 2 1.3 2.3 1.4.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4z"/></svg></a>"""


def page(path, title, desc, body, *, image="hero/dubai-skyline-hero.jpg", ld=None,
         og_type="website", robots=None):
    url = BASE + path
    og_img = f"{BASE}/assets/images/{image}"
    ld_json = "".join(f'<script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>'
                      for x in (ld or []))
    robots_meta = f'<meta name="robots" content="{robots}">' if robots else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
{robots_meta}
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="{SITE['name']}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{og_img}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/images/brand/favicon.png">
<link rel="stylesheet" href="/assets/css/style.css">
{ld_json}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
{header(path)}
<main id="main">
{body}
</main>
{footer()}
<script src="/assets/js/main.js" defer></script>
</body>
</html>
"""


def write(path, content):
    rel = path.strip("/")
    target = OUT / rel / "index.html" if not rel.endswith((".html", ".txt", ".xml")) else OUT / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


# ---------------------------------------------------------------- components
def hero_banner(title, lead):
    return f'<section class="page-hero"><div class="wrap"><h1>{e(title)}</h1><p class="lead">{e(lead)}</p></div></section>'


def cta_band(heading="Ready to find your next address in the UAE?",
             text="Tell us what you're looking for and one of our consultants will send a shortlist within 24 hours."):
    return f"""<section class="cta"><div class="wrap cta__inner"><div><h2>{e(heading)}</h2><p>{e(text)}</p></div>
<div class="cta__btns"><a class="btn btn--gold" href="/contact/">Book a Consultation</a>
<a class="btn btn--ghost" href="{wa("Hello, I'd like to speak to a consultant about buying property in the UAE.")}" target="_blank" rel="noopener">Chat on WhatsApp</a></div></div></section>"""


def card(p):
    badge = f'<span class="badge badge--{"ready" if p["status"] == "Ready" else "off"}">{e(p["status"])}</span>'
    yld = (f'<span class="badge badge--yield">{p["yield"]:g}% est. gross yield</span>'
           if p.get("yield") else "")
    return f"""<article class="card" data-community="{e(p['community'])}" data-type="{e(p['type'])}" data-status="{e(p['status'])}" data-band="{band(p['price'])}">
<div class="card__media">{img('properties/' + p['image'], f"{p['name']} in {location(p)}", 'card__img')}<div class="card__badges">{badge}{yld}</div></div>
<div class="card__body"><p class="card__price">{money(p['price'])} <span>starting</span></p>
<h3 class="card__title"><a class="card__link" href="/properties/{p['id']}/">{e(p['name'])}</a></h3>
<p class="card__loc">{e(location(p))}</p>
<dl class="card__meta"><div><dt>Developer</dt><dd>{e(p['developer'])}</dd></div><div><dt>Payment plan</dt><dd>{e(p['plan'])}</dd></div><div><dt>Handover</dt><dd>{e(p['handover'])}</dd></div></dl></div></article>"""


def select(id_, name, label, options, any_label):
    opts = f'<option value="">{any_label}</option>' + "".join(
        f'<option value="{e(v)}">{e(t)}</option>' for v, t in options)
    return f'<div class="field"><label for="{id_}">{label}</label><select id="{id_}" name="{name}">{opts}</select></div>'


def filter_fields(prefix):
    comm = [(c, c) for c in sorted(COMMUNITIES)]
    types = [(t, t) for t in TYPES]
    bands = [(k, l) for k, l, _, _ in BANDS]
    stat = [("Ready", "Ready"), ("Off-Plan", "Off-Plan")]
    return (select(f"{prefix}-community", "community", "Community", comm, "Any community")
            + select(f"{prefix}-type", "type", "Property type", types, "Any type")
            + select(f"{prefix}-budget", "budget", "Budget", bands, "Any budget")
            + select(f"{prefix}-status", "status", "Status", stat, "Any status"))


def calculator():
    return """<form class="calc" id="calc" aria-labelledby="calc-h" novalidate>
<h3 id="calc-h">Mortgage calculator</h3>
<div class="calc__grid">
<div class="field"><label for="c-price">Property value (AED)</label><input id="c-price" type="number" inputmode="numeric" min="200000" max="50000000" step="50000" value="2500000"></div>
<div class="field"><label for="c-buyer">Buyer status</label><select id="c-buyer"><option value="resident" selected>UAE resident (first property)</option><option value="non-resident">Non-resident</option></select></div>
<div class="field"><label for="c-down">Down payment (%)</label><input id="c-down" type="number" inputmode="decimal" min="20" max="100" step="1" value="25"><small id="c-down-hint">Minimum 20% for UAE residents on a first property.</small></div>
<div class="field"><label for="c-term">Loan term (years)</label><select id="c-term"><option>15</option><option>20</option><option selected>25</option></select></div>
<div class="field"><label for="c-rate">Annual interest rate (%)</label><input id="c-rate" type="number" inputmode="decimal" min="1" max="12" step="0.1" value="4.5"></div>
</div>
<div class="calc__out" role="status" aria-live="polite">
<p class="calc__monthly"><span>Estimated monthly mortgage payment</span><strong id="o-monthly">–</strong></p>
<dl class="calc__rows">
<div><dt>Down payment</dt><dd id="o-down">–</dd></div><div><dt>Loan amount</dt><dd id="o-loan">–</dd></div>
<div><dt>Total interest</dt><dd id="o-interest">–</dd></div><div><dt>Total repaid to the bank</dt><dd id="o-repay">–</dd></div>
<div><dt>Total cost incl. down payment</dt><dd id="o-total">–</dd></div><div><dt>Mortgage ends</dt><dd id="o-end">–</dd></div>
</dl>
<h4>Estimated one-off buying costs</h4>
<dl class="calc__rows">
<div><dt>DLD transfer fee (4%)</dt><dd id="o-dld">–</dd></div><div><dt>DLD admin fee</dt><dd id="o-admin">–</dd></div>
<div><dt>Agency commission (2%)</dt><dd id="o-agency">–</dd></div><div><dt>Mortgage registration (0.25% of loan)</dt><dd id="o-reg">–</dd></div>
</dl>
<p class="calc__note" id="o-note"></p>
<p class="calc__note">Illustrative only. Excludes service charges, insurance, bank arrangement fees and valuation fees. Final terms depend on your bank and profile.</p>
</div></form>"""


def post_card(p):
    return f"""<article class="post-card"><a class="post-card__media" href="/blog/{p['slug']}/" tabindex="-1" aria-hidden="true">{img('blog/' + p['image'], '', 'post-card__img')}</a>
<div class="post-card__body"><p class="eyebrow">{e(p['category'])}</p><h3><a href="/blog/{p['slug']}/">{e(p['title'])}</a></h3><p>{e(p['excerpt'])}</p>
<p class="meta"><time datetime="{p['date']}">{nice_date(p['date'])}</time></p></div></article>"""


# ---------------------------------------------------------------- pages
def org_ld():
    sameas = [SITE["instagram"], SITE["linkedin"]]
    return {"@context": "https://schema.org", "@type": "RealEstateAgent", "name": SITE["name"],
            "url": BASE, "logo": f"{BASE}/assets/images/brand/swk-logo.png",
            "image": f"{BASE}/assets/images/hero/dubai-skyline-hero.jpg",
            "telephone": SITE["phone"], "email": SITE["email"],
            "address": {"@type": "PostalAddress", "streetAddress": "Al Saqr Business Tower, Sheikh Zayed Road",
                        "addressLocality": "Dubai", "addressCountry": "AE"},
            "geo": {"@type": "GeoCoordinates", "latitude": SITE["geo"][0], "longitude": SITE["geo"][1]},
            "foundingDate": str(SITE["founded"]), "sameAs": sameas}


def build_home():
    featured = "".join(card(p) for p in PROPS[:6])
    comm_cards = "".join(
        f"""<a class="comm" href="/properties/?community={e(c)}">{img('properties/' + ps[0]['image'], '', 'comm__img')}
<span class="comm__label"><strong>{e(c)}</strong><span>{len(ps)} listing{'s' if len(ps) != 1 else ''}</span></span></a>"""
        for c, ps in sorted(COMMUNITIES.items(), key=lambda kv: -len(kv[1])))
    dev_logos = "".join(
        f'<li>{img("developers/" + f, n, "dev__logo")}</li>'
        for f, n in [("logo-01.png", "Arada"), ("logo-02.png", "Dubai Properties"), ("logo-03.png", "DAMAC"),
                     ("logo-04.png", "Samana Developers"), ("logo-05.png", "Danube Properties"),
                     ("logo-06.png", "Binghatti"), ("logo-07.png", "Azizi"),
                     ("logo-09.png", "Empire Developments"), ("logo-10.png", "Sobha Realty")])
    services = [("Buying & Selling", "Off-plan and secondary-market guidance from shortlist to Oqood or title-deed transfer."),
                ("Investment Advisory", "Data-led yield and appreciation analysis to choose the right community, developer and payment plan."),
                ("Property Management", "Tenant sourcing, rent collection, maintenance and Ejari renewals."),
                ("Mortgage Assistance", "Bank-agnostic mortgage structuring for residents and non-residents."),
                ("Legal & Documentation", "DLD registration, SPA review, POA setup and Golden Visa eligibility checks."),
                ("Interior & Fit-out", "Furnishing and fit-out packages for handover-ready units.")]
    svc = "".join(f'<li class="svc"><h3>{e(t)}</h3><p>{e(d)}</p></li>' for t, d in services)
    gallery = "".join(f'<li>{img(f"gallery/image{i}.jpg", "", "gal__img")}</li>' for i in range(1, 13))
    body = f"""<section class="hero">
{img('hero/city-sparkles-static.jpg', 'Dubai skyline at night', 'hero__img', eager=True)}
<div class="hero__shade"></div>
<div class="wrap hero__inner">
<p class="eyebrow eyebrow--light">Your trusted UAE real estate partner</p>
<h1>Experience luxury living in the UAE</h1>
<p class="lead lead--light">Off-plan and ready homes across Dubai and Abu Dhabi, with buying, mortgage and management support from one team.</p>
<form class="search" action="/properties/" method="get" role="search" aria-label="Search properties">{filter_fields('s')}<button class="btn btn--gold" type="submit">Search</button></form>
</div></section>
<section class="section"><div class="wrap"><div class="section__head"><div><p class="eyebrow">Featured</p><h2>Featured listings</h2></div><a class="btn btn--line" href="/properties/">View all {len(PROPS)} properties</a></div>
<div class="grid grid--cards">{featured}</div></div></section>
<section class="section section--tint"><div class="wrap"><p class="eyebrow">Where to live</p><h2>Explore our communities</h2><p class="lead">Listings are grouped by community, with counts that reflect what is currently available.</p>
<div class="grid grid--comm">{comm_cards}</div></div></section>
<section class="section"><div class="wrap"><p class="eyebrow">Trusted partners</p><h2>Developers we work with</h2>
<p class="lead">Current listings include projects from {', '.join(e(d) for d in DEVELOPERS)}.</p>
<ul class="dev">{dev_logos}</ul></div></section>
<section class="section section--tint"><div class="wrap"><p class="eyebrow">How we help</p><h2>Full-service, start to handover</h2>
<ul class="grid grid--svc">{svc}</ul><p><a class="btn btn--line" href="/services/">All services</a></p></div></section>
<section class="section"><div class="wrap"><p class="eyebrow">Plan your purchase</p><h2>Estimate your monthly mortgage</h2>
<p class="lead">Adjust the figures for an instant estimate, or see the full guide on our mortgage page.</p>{calculator()}</div></section>
<section class="section section--tint"><div class="wrap"><p class="eyebrow">Gallery</p><h2>Dubai living, up close</h2>
<ul class="gal" role="list">{gallery}</ul></div></section>
<section class="section"><div class="wrap"><div class="section__head"><div><p class="eyebrow">Insights</p><h2>From the SWK journal</h2></div><a class="btn btn--line" href="/blog/">Read all articles</a></div>
<div class="grid grid--posts">{''.join(post_card(p) for p in POSTS)}</div></div></section>
{cta_band()}"""
    write("/", page("/", "SWK Properties | Off-Plan & Ready Homes in Dubai and Abu Dhabi",
                    "SWK Properties is a UAE real estate agency — off-plan and ready homes across Dubai and Abu Dhabi, with buying, mortgage and property management support.",
                    body, ld=[org_ld()]))


def build_properties():
    cards = "".join(card(p) for p in PROPS)
    body = f"""{hero_banner('Properties for sale in the UAE', "Off-plan and ready homes in Dubai and Abu Dhabi. Filter by community, type, budget and status.")}
<section class="section"><div class="wrap">
<form class="filters" id="filters" aria-label="Filter properties">{filter_fields('f')}<button class="btn btn--line" type="reset" id="filters-reset">Reset</button></form>
<p class="count" id="count" role="status" aria-live="polite"><span id="count-n">{len(PROPS)}</span> properties found</p>
<div class="grid grid--cards" id="results">{cards}</div>
<p class="empty" id="empty" hidden>No properties match those filters yet. Try widening your search, or <a href="{wa("Hi, I couldn't find a property matching my search — could you help me find something similar?")}" target="_blank" rel="noopener">ask a consultant on WhatsApp</a>.</p>
</div></section>
<section class="cta"><div class="wrap cta__inner"><div><h2>Can't find exactly what you're after?</h2><p>Tell us your budget, community and must-haves and we'll send a shortlist within 24 hours, including options that aren't listed here.</p></div>
<div class="cta__btns"><a class="btn btn--gold" href="/contact/">Request a Shortlist</a></div></div></section>"""
    ld = {"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "url": f"{BASE}/properties/{p['id']}/", "name": p["name"]}
        for i, p in enumerate(PROPS)]}
    write("/properties/", page("/properties/", "Properties for Sale in Dubai & Abu Dhabi | SWK Properties",
                               f"Browse {len(PROPS)} off-plan and ready homes across the UAE. Filter by community, type, budget and status.",
                               body, ld=[ld]))


def build_property(p):
    gallery = p.get("gallery") or [p["image"]]
    gal = "".join(
        f'<li>{img("properties/" + g, f"{p['name']} — photo {i + 1}", "pd__img", eager=(i == 0))}</li>'
        for i, g in enumerate(gallery))
    facts = [("Starting price", money(p["price"])), ("Type", p["type"]), ("Developer", p["developer"]),
             ("Community", location(p)), ("Bedrooms", p.get("bedrooms")), ("Area", p.get("area")),
             ("Payment plan", p["plan"]), ("Handover", p["handover"]),
             ("Est. gross yield", f"{p['yield']:g}%" if p.get("yield") else None)]
    facts_html = "".join(f"<div><dt>{k}</dt><dd>{e(str(v))}</dd></div>" for k, v in facts if v)
    amen = ""
    if p.get("amenities"):
        amen = "<h2>Amenities</h2><ul class=\"amen\">" + "".join(f"<li>{e(a)}</li>" for a in p["amenities"]) + "</ul>"
    permit = f'<p class="permit">Advertising permit no. {e(p["permit"])}</p>' if p.get("permit") else ""
    similar = sorted((q for q in PROPS if q["id"] != p["id"]),
                     key=lambda q: (q["emirate"] != p["emirate"], q["status"] != p["status"]))[:3]
    note = ("Estimated gross yield is based on market rents for comparable units and is indicative only."
            if p.get("yield") else "")
    body = f"""<section class="section section--tight"><div class="wrap">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/properties/">Properties</a> / <span aria-current="page">{e(p['name'])}</span></nav>
<p class="badge badge--{'ready' if p['status'] == 'Ready' else 'off'}">{e(p['status'])}</p>
<h1>{e(p['name'])}</h1><p class="lead">{e(location(p))} · by {e(p['developer'])}</p>
<ul class="pd__gallery" role="list">{gal}</ul>
<div class="pd__cols"><div>
<h2>Overview</h2><p>{e(overview(p))}</p>{amen}
<p class="fine">Prices, availability and payment plans are indicative and may change without notice. {note} Contact us for the current price list, floor plans and payment schedule.</p>{permit}
</div>
<aside class="pd__side" aria-label="Key facts"><dl class="facts">{facts_html}</dl>
<a class="btn btn--gold btn--block" href="/contact/?property={p['id']}">Request details</a>
<a class="btn btn--line btn--block" href="{wa(f"Hello SWK Properties, I'd like details on {p['name']}.")}" target="_blank" rel="noopener">Ask on WhatsApp</a></aside></div>
</div></section>
<section class="section section--tint"><div class="wrap"><h2>Similar properties</h2><div class="grid grid--cards">{''.join(card(q) for q in similar)}</div></div></section>"""
    ld = {"@context": "https://schema.org", "@type": "RealEstateListing", "name": p["name"],
          "description": overview(p), "url": f"{BASE}/properties/{p['id']}/",
          "image": f"{BASE}/assets/images/properties/{p['image']}",
          "offers": {"@type": "Offer", "price": p["price"], "priceCurrency": "AED"}}
    write(f"/properties/{p['id']}/", page(
        f"/properties/{p['id']}/", f"{p['name']} — {location(p)} | SWK Properties",
        f"{p['name']} in {location(p)} by {p['developer']}. From {money(p['price'])}. {p['status']}, {p['plan']} payment plan, handover {p['handover']}.",
        body, image="properties/" + p["image"], ld=[ld]))


def build_about():
    team = [("Fahad Khan", "Senior Property Consultant · Downtown & Marina"),
            ("Usman Khan", "Investment Advisor · Palm & Ultra-Prime"),
            ("Junaid Ahmad", "Property Consultant · Off-Plan & Creek Harbour"),
            ("Megha Nair", "Senior Sales Manager · Business Bay & JVC")]
    people = "".join(
        f'<li class="person"><span class="person__av" aria-hidden="true">{"".join(w[0] for w in n.split()[:2])}</span><h3>{e(n)}</h3><p>{e(r)}</p></li>'
        for n, r in team)
    values = [("Radical Transparency", "Every fee, commission and clause disclosed upfront — no surprises at signing."),
              ("Data Over Hype", "Yield and appreciation estimates built on transaction data, not developer marketing."),
              ("One Point of Contact", "The consultant who takes your first call sees your deal through to handover."),
              ("Long-Term Relationships", "We measure ourselves on repeat clients and referrals, not one-off transactions.")]
    vals = "".join(f'<li class="val"><span class="val__n">{i + 1:02d}</span><h3>{e(t)}</h3><p>{e(d)}</p></li>'
                   for i, (t, d) in enumerate(values))
    years = TODAY.year - SITE["founded"]
    body = f"""{hero_banner(f'{years} years of getting UAE property right', 'Buying a home in the UAE — whether you live down the road or on the other side of the world — should feel transparent, not transactional.')}
<section class="section"><div class="wrap two-col"><div>{img('about/swk-office.jpg', 'SWK Properties office on Sheikh Zayed Road', 'about__img')}</div>
<div><p class="eyebrow">Our story</p><h2>Built by agents, run for clients</h2>
<p>SWK Properties was started in {SITE['founded']} by a small team of agents frustrated with how opaque property buying could feel for outsiders. Today we are a full-service brokerage with {SITE['consultantCount']} consultants, and the founding principle hasn't changed: every fee, payment-plan clause and yield figure gets explained in plain language before you sign anything.</p>
<p>We work across off-plan and secondary sales, mortgage arrangement and long-term property management, so the relationship doesn't end at handover.</p>
<a class="btn btn--gold" href="/contact/">Talk to our team</a></div></div></section>
<section class="section section--tint"><div class="wrap"><p class="eyebrow">Our values</p><h2>What guides every deal we close</h2><ul class="grid grid--vals">{vals}</ul></div></section>
<section class="section"><div class="wrap"><ul class="stats"><li><strong>{years}+</strong><span>Years in the UAE</span></li><li><strong>{SITE['consultantCount']}</strong><span>Consultants</span></li><li><strong>{len(PROPS)}</strong><span>Current listings</span></li></ul></div></section>
<section class="section section--tint"><div class="wrap"><p class="eyebrow">Our people</p><h2>Meet a few of our consultants</h2><p class="lead">Every client is paired with a dedicated consultant for the life of their purchase.</p><ul class="grid grid--people">{people}</ul></div></section>
{cta_band("Let's find your next UAE address", "Book a no-obligation consultation and we'll come prepared with listings matched to your budget.")}"""
    ld = [org_ld()]
    write("/about/", page("/about/", "About Us | SWK Properties",
                          "SWK Properties is a UAE real estate agency built on a decade of local market expertise, transparent advice and full-service support for buyers and investors.",
                          body, image="about/swk-office.jpg", ld=ld))


def build_services():
    items = [("Buying & Selling", "End-to-end guidance across the off-plan and secondary market, from shortlisting to Oqood or title-deed transfer."),
             ("Investment Advisory", "Data-led yield and capital-appreciation analysis to help you choose the right community, developer and payment plan."),
             ("Property Management", "Tenant sourcing, rent collection, maintenance and Ejari renewals — a fully managed rental experience."),
             ("Mortgage Assistance", "Bank-agnostic mortgage structuring for residents and non-residents, with rates compared across lending partners."),
             ("Legal & Documentation", "DLD registration, SPA review, POA setup and Golden Visa eligibility checks handled with our legal partners."),
             ("Interior & Fit-out", "Design and fit-out for handover-ready units, including furnishing packages for rental-ready returns.")]
    steps = [("Discovery Call", "We learn your budget, must-haves, and whether you're buying to live or to invest."),
             ("Curated Shortlist", "A shortlist matched to your brief within 24 hours."),
             ("Viewings & Offer", "In-person or virtual viewings, followed by negotiation on your behalf."),
             ("Handover & Beyond", "Legal transfer, mortgage coordination, and ongoing management if you choose to let.")]
    body = f"""{hero_banner('Full-service support, start to handover', 'Buying, selling, financing or managing a UAE property — one team handles every step, with a single consultant as your point of contact.')}
<section class="section"><div class="wrap"><ul class="grid grid--svc">{''.join(f'<li class="svc"><h2>{e(t)}</h2><p>{e(d)}</p></li>' for t, d in items)}</ul></div></section>
<section class="section section--tint"><div class="wrap"><p class="eyebrow">How it works</p><h2>Our process</h2><ol class="grid grid--vals steps">{''.join(f'<li class="val"><span class="val__n">{i + 1:02d}</span><h3>{e(t)}</h3><p>{e(d)}</p></li>' for i, (t, d) in enumerate(steps))}</ol></div></section>
{cta_band('Not sure which service you need?', "Start with a free consultation — we'll recommend the right path for your goals.")}"""
    write("/services/", page("/services/", "Our Services | SWK Properties",
                             "From buying and selling to mortgage arrangement, legal documentation and property management — SWK Properties supports UAE real estate clients end to end.",
                             body))


FAQ = [
    ("Can foreigners buy property in Dubai?", "Yes. Non-UAE nationals can buy freehold property with full ownership rights in designated freehold areas. Your consultant will confirm that a specific project is in a freehold zone before you reserve."),
    ("What are the total costs of buying a property?", "Beyond the price, budget for the 4% Dubai Land Department (DLD) transfer fee, a DLD administration fee (AED 4,000 for properties of AED 500,000 and above; AED 2,000 below), agency commission (commonly 2%), and for mortgaged purchases a 0.25% mortgage registration fee plus bank arrangement and valuation fees. We provide a full cost breakdown before you commit."),
    ("How do off-plan payment plans work?", "Most developers offer staged plans such as 60/40 or 70/30 (percentage due during construction versus on handover), and some offer post-handover plans that extend payments after completion. Each listing page shows the specific plan."),
    ("Does buying property qualify me for a Golden Visa?", "A property investment of AED 2 million or more can qualify you for a 10-year renewable Golden Visa, subject to current immigration rules. Conditions have changed over time, so we check eligibility for your specific purchase before you buy."),
    ("What financing is available to overseas buyers?", "Non-residents can typically borrow up to about 50% of the property value, while UAE residents can typically borrow up to about 80% on a first property, subject to bank policy. We compare several banks for you."),
    ("What ongoing costs should I expect as an owner?", "Annual service charges (billed per square foot for community and building maintenance) and, if you let the property, a property management fee, typically a percentage of annual rent. Note that the 5% municipality housing fee on rented homes is normally paid by the tenant through their DEWA bill."),
    ("How is the estimated yield on your listings calculated?", "Where we show a yield, it is an estimated gross figure: annual rent for comparable units in the same building or community divided by the purchase price. It is not net of service charges, fees or vacancy. We show yields only for ready properties, where rents can be benchmarked. Our advisors can prepare a tailored net projection."),
    ("Can SWK Properties manage my property after I buy it?", "Yes. Our property management team handles tenant sourcing, Ejari registration, rent collection, maintenance coordination and renewals."),
]


def build_mortgage():
    steps = [("Pre-Approval", "Passport, six months of bank statements and proof of income. Typically takes 5–10 working days."),
             ("Property Valuation", "The bank commissions an independent valuation once you've signed a reservation form."),
             ("Final Offer", "A formal offer letter outlines rate, tenure and conditions for your signature."),
             ("Mortgage Registration", "A 0.25% registration fee is paid to DLD and the mortgage is registered against the title deed.")]
    faq = "".join(f'<details class="faq"><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in FAQ)
    body = f"""{hero_banner('Mortgage calculator', 'Get an instant estimate of your monthly payment, then let our lending partners look for the best rate available to you.')}
<section class="section"><div class="wrap">{calculator()}</div></section>
<section class="section section--tint"><div class="wrap"><p class="eyebrow">Getting approved</p><h2>What you'll need for a UAE mortgage</h2>
<ol class="grid grid--vals steps">{''.join(f'<li class="val"><span class="val__n">{i + 1:02d}</span><h3>{e(t)}</h3><p>{e(d)}</p></li>' for i, (t, d) in enumerate(steps))}</ol></div></section>
<section class="section"><div class="wrap narrow"><p class="eyebrow">Questions</p><h2>Mortgage &amp; buying costs FAQ</h2>{faq}</div></section>
{cta_band('Want a personalised rate comparison?', 'Share your details and a consultant will compare lenders for you.')}"""
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ]}
    write("/mortgage/", page("/mortgage/", "Mortgage Calculator & Buying Costs | SWK Properties",
                             "Estimate your UAE mortgage and one-off buying costs instantly, then get a personalised rate comparison from SWK Properties' lending partners.",
                             body, ld=[ld]))


def build_contact():
    gl = f"https://maps.google.com/maps?q={SITE['geo'][0]},{SITE['geo'][1]}&z=16&output=embed"
    interests = ["Buying a property", "Selling a property", "Renting", "Property management", "Mortgage advice", "General enquiry"]
    opts = "".join(f"<option>{i}</option>" for i in interests)
    body = f"""{hero_banner("Let's talk about your next move", "Whether you're buying, selling, or just exploring the market — a consultant will get back to you within one business day.")}
<section class="section"><div class="wrap two-col two-col--form">
<form class="form" id="contact-form" data-form="contact" data-endpoint="{e(SITE['formEndpoint'])}" novalidate>
<h2>Tell us what you're looking for</h2>
<div class="field"><label for="cf-name">Full name</label><input id="cf-name" name="name" autocomplete="name" required></div>
<div class="field"><label for="cf-email">Email</label><input id="cf-email" name="email" type="email" autocomplete="email" required></div>
<div class="field"><label for="cf-phone">Phone <span class="opt">(optional)</span></label><input id="cf-phone" name="phone" type="tel" autocomplete="tel"></div>
<div class="field"><label for="cf-interest">I'm interested in</label><select id="cf-interest" name="interest">{opts}</select></div>
<div class="field"><label for="cf-message">Message</label><textarea id="cf-message" name="message" rows="5" required></textarea></div>
<label class="check"><input type="checkbox" name="consent" required> <span>I agree that SWK Properties may contact me about my enquiry and I accept the <a href="/privacy/">Privacy Policy</a>.</span></label>
<input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<button class="btn btn--gold" type="submit">Send message</button>
<p class="form-status" role="status" aria-live="polite" hidden></p>
</form>
<div class="contact-info"><h2>Other ways to connect</h2>
<h3>Call or WhatsApp</h3><p><a href="tel:{SITE['phone']}">{SITE['phoneDisplay']}</a><br><a href="{wa("Hello, I'd like to get in touch.")}" target="_blank" rel="noopener">Message us on WhatsApp →</a></p>
<h3>Email</h3><p><a href="mailto:{SITE['email']}">{SITE['email']}</a></p>
<h3>Office</h3><p>{e(SITE['address'])}</p>
<h3>Office hours</h3><p>{e(SITE['hours'])}</p>
<iframe class="map" title="Map showing the SWK Properties office on Sheikh Zayed Road, Dubai" src="{gl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
</div></div></section>"""
    write("/contact/", page("/contact/", "Contact Us | SWK Properties",
                            "Get in touch with SWK Properties — book a consultation, ask about a listing, or reach us on WhatsApp, phone or email.", body))


def build_blog():
    body = f"""{hero_banner('The SWK Journal', 'Market insight, buyer guides and community spotlights from our consultants on the ground in the UAE.')}
<section class="section"><div class="wrap"><div class="grid grid--posts">{''.join(post_card(p) for p in POSTS)}</div></div></section>
<section class="section section--tint"><div class="wrap narrow"><h2>Want market updates in your inbox?</h2><p>Subscribe for monthly insight on pricing trends, new launches and yield opportunities.</p>{newsletter_form().replace('id="nl-email"', 'id="nl-email-2"').replace('for="nl-email"', 'for="nl-email-2"')}</div></section>"""
    write("/blog/", page("/blog/", "Journal | SWK Properties",
                         "Market insights, buyer guides and community spotlights from SWK Properties — everything you need to know about buying and investing in UAE real estate.", body))
    for p in POSTS:
        parts = "".join(f"<h2>{e(t)}</h2>" if k == "h2" else f"<p>{e(t)}</p>" for k, t in p["body"])
        words = sum(len(t.split()) for _, t in p["body"])
        mins = max(1, round(words / 200))
        others = [q for q in POSTS if q["slug"] != p["slug"]]
        b = f"""<article class="section"><div class="wrap narrow article">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/blog/">Journal</a></nav>
<p class="eyebrow">{e(p['category'])}</p><h1>{e(p['title'])}</h1>
<p class="meta">By the SWK Properties team · <time datetime="{p['date']}">{nice_date(p['date'])}</time> · {mins} min read</p>
{img('blog/' + p['image'], '', 'article__img', eager=True)}
{parts}
<p class="fine">This article is general information, not financial, legal or investment advice. Market conditions and regulations change; speak to a consultant before making a decision.</p>
</div></article>
<section class="section section--tint"><div class="wrap"><h2>More from the journal</h2><div class="grid grid--posts">{''.join(post_card(q) for q in others)}</div></div></section>
{cta_band()}"""
        ld = {"@context": "https://schema.org", "@type": "Article", "headline": p["title"],
              "datePublished": p["date"], "dateModified": p["date"], "description": p["excerpt"],
              "image": f"{BASE}/assets/images/blog/{p['image']}",
              "author": {"@type": "Organization", "name": SITE["name"]},
              "publisher": {"@type": "Organization", "name": SITE["name"],
                            "logo": {"@type": "ImageObject", "url": f"{BASE}/assets/images/brand/swk-logo.png"}},
              "mainEntityOfPage": f"{BASE}/blog/{p['slug']}/"}
        write(f"/blog/{p['slug']}/", page(f"/blog/{p['slug']}/", f"{p['title']} | SWK Properties",
                                         p["excerpt"], b, image="blog/" + p["image"], ld=[ld], og_type="article"))


def legal_page(path, title, desc, sections):
    parts = "".join(f"<h2>{e(h)}</h2>" + "".join(f"<p>{e(t)}</p>" for t in ps) for h, ps in sections)
    body = f"""<article class="section"><div class="wrap narrow legal"><h1>{e(title)}</h1><p class="meta">Last updated {nice_date(TODAY.isoformat())}</p>{parts}</div></article>"""
    write(path, page(path, f"{title} | SWK Properties", desc, body))


def build_legal():
    n, em = SITE["name"], SITE["email"]
    legal_page("/privacy/", "Privacy Policy", "How SWK Properties collects, uses and protects your personal data.", [
        ("Who we are", [f"{n} ('we', 'us') is a real estate brokerage at {SITE['address']}. You can reach us at {em} or {SITE['phoneDisplay']}."]),
        ("What we collect", ["Information you give us through our contact form, newsletter sign-up, email, phone or WhatsApp: your name, email address, phone number, enquiry details and property preferences.",
                             "This website does not currently use advertising or analytics cookies. The contact page embeds a Google map, which may load content from Google when displayed."]),
        ("Why we use it", ["To respond to your enquiry, arrange viewings, prepare shortlists and mortgage or legal introductions you ask for, and, if you opt in, to send market updates. We rely on your consent and on our legitimate interest in running our business."]),
        ("Who we share it with", ["Only with partners needed to deliver what you asked for, such as developers, banks and legal partners, and with service providers who help us run our systems. We do not sell your personal data."]),
        ("How long we keep it", ["For as long as needed to deal with your enquiry and meet our legal and regulatory record-keeping duties. Newsletter data is kept until you unsubscribe."]),
        ("Your rights", ["Under UAE data-protection law (Federal Decree-Law No. 45 of 2021) you may request access to, correction or deletion of your data, and you may withdraw consent at any time. Email us at " + em + " to make a request."]),
        ("Changes", ["We may update this policy and will change the date above when we do."]),
    ])
    legal_page("/terms/", "Terms of Use", "The terms that apply when you use the SWK Properties website.", [
        ("Information only", ["Content on this website is general information, not an offer, valuation, or financial, legal or investment advice. Listings, prices, availability, payment plans and handover dates are indicative, supplied by developers or owners, and may change without notice."]),
        ("Estimates and calculators", ["Mortgage, cost and yield figures are illustrative estimates. They do not guarantee returns, loan approval or specific terms. Verify all figures with your bank, the developer and your advisers before committing funds."]),
        ("Third-party links and content", ["We link to third-party sites such as WhatsApp, Instagram, LinkedIn and Google Maps. We are not responsible for their content or practices."]),
        ("Intellectual property", ["Text, logos and images on this site belong to " + n + " or its licensors. Do not copy or reuse them without written permission."]),
        ("Liability", ["To the extent permitted by law, we are not liable for loss arising from reliance on this website. Nothing here limits liability that cannot be limited by law."]),
        ("Governing law", ["These terms are governed by the laws of the United Arab Emirates as applied in the Emirate of Dubai."]),
        ("Contact", [f"Questions about these terms: {em}."]),
    ])


def build_404():
    body = """<section class="section"><div class="wrap narrow center"><h1>Page not found</h1><p class="lead">That page doesn't exist or has moved.</p>
<p><a class="btn btn--gold" href="/">Back to home</a> <a class="btn btn--line" href="/properties/">Browse properties</a></p></div></section>"""
    (OUT / "404.html").write_text(page("/404.html", "Page not found | SWK Properties", "Page not found.", body, robots="noindex"), encoding="utf-8")


def build_meta_files():
    urls = ["/", "/properties/", "/about/", "/services/", "/mortgage/", "/blog/", "/contact/", "/privacy/", "/terms/"]
    urls += [f"/properties/{p['id']}/" for p in PROPS] + [f"/blog/{p['slug']}/" for p in POSTS]
    lm = TODAY.isoformat()
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    xml += [f"<url><loc>{BASE}{u}</loc><lastmod>{lm}</lastmod></url>" for u in urls]
    xml.append("</urlset>")
    (OUT / "sitemap.xml").write_text("\n".join(xml) + "\n", encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n", encoding="utf-8")


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    shutil.copytree(ROOT / "static", OUT / "assets", ignore=shutil.ignore_patterns(".gitkeep"))
    shutil.copy(ROOT / "static_root/.htaccess", OUT / ".htaccess")
    build_home(); build_properties(); build_about(); build_services(); build_mortgage()
    build_contact(); build_blog(); build_legal(); build_404(); build_meta_files()
    for p in PROPS:
        build_property(p)
    print(f"Built {sum(1 for _ in OUT.rglob('*.html'))} pages into {OUT}")


if __name__ == "__main__":
    main()

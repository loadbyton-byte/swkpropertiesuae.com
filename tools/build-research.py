"""Reproduce 416 area/year reports from a licensed DLD-derived snapshot.
Usage: PYTHONPATH=/tmp/swk-analysis python3 tools/build-research.py /path/to/snapshot.parquet
Requires pandas + pyarrow only for research regeneration; website builds stay stdlib-only.
"""
import hashlib,json,re,sys,gzip
from pathlib import Path
import pandas as pd
ROOT=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1]);digest=hashlib.sha256(source.read_bytes()).hexdigest()
manifest_path=ROOT/'data/research-source.json'
if manifest_path.exists() and '--refresh' not in sys.argv:
    assert digest==json.loads(manifest_path.read_text())['sha256'], 'Snapshot changed; inspect and use --refresh explicitly to update the source manifest'
df=pd.read_parquet(source)
assert df.transaction_id.is_unique,'Duplicate transaction IDs'
df['date']=pd.to_datetime(df.instance_date,errors='coerce');df['year']=df.date.dt.year
clean=df[(df.quality_flags==0)&df.property_type_label.isin(['Unit','Villa'])&(df.usage_label=='Residential')&df.year.between(2011,2026)&(df.price_psf>0)].copy()
assert clean.date.max()<=pd.Timestamp('2026-10-05')
reports=[]
fmt=lambda n:f'{n:,.0f}'
for year in range(2011,2027):
    y=clean[clean.year==year]
    names=y.groupby('area_name_en').size().loc[lambda s:s>=50].nlargest(26).index
    assert len(names)==26,f'Not enough areas for {year}'
    for area in names:
        g=y[y.area_name_en==area];n=len(g);median=float(g.price_psf.median());q1=float(g.price_psf.quantile(.25));q3=float(g.price_psf.quantile(.75));ticket=float(g.price_aed.median());total=int(g.price_aed.sum());off=int((g.reg_type_label=='Off-Plan').sum());ready=n-off;villa=int((g.property_type_label=='Villa').sum());unit=n-villa
        quarterly=[]
        for quarter in range(1,5):
            h=g[g.date.dt.quarter==quarter]
            if len(h):quarterly.append(dict(quarter=quarter,count=len(h),median=round(float(h.price_psf.median()),2)))
        rooms=[]
        for room,h in g.dropna(subset=['rooms_bucket']).groupby('rooms_bucket'):
            rooms.append(dict(label='Studio' if room==0 else f'{int(room)}'+('+' if room==5 else '')+' bedrooms',count=len(h),median=round(float(h.price_psf.median()),2)))
        known=sum(r['count'] for r in rooms)
        split=[]
        for label,h in g.groupby('reg_type_label'):
            split.append(dict(label=label,count=len(h),median=round(float(h.price_psf.median()),2)))
        yearlabel=f'{year} through 5 October' if year==2026 else str(year)
        dominant='off-plan' if off>ready else 'ready-property' if ready>off else 'evenly split off-plan and ready-property'
        gap=(q3/q1-1)*100
        intro=f'{area} recorded {fmt(n)} qualifying residential sales in this snapshot for {yearlabel}. The median registered price was AED {fmt(median)} per sq ft, with the middle half between AED {fmt(q1)} and AED {fmt(q3)}. These figures describe the selected registrations, not an asking-price index or a valuation of a particular home.'
        sections=[dict(title='The price range matters more than one headline',text=f'The gap between the 25th- and 75th-percentile prices was {gap:.1f}% of the lower quartile. In practical terms, half of the qualifying records sit inside the AED {fmt(q1)}–{fmt(q3)} per sq ft band; the rest sit outside it. A listing above that range is not automatically overpriced, just as one below it is not automatically a bargain. Check its building, size, condition and registration type before using this area-level benchmark.'),dict(title='What actually changed hands',text=f'The sample contains {fmt(unit)} residential unit registrations and {fmt(villa)} villa registrations. Their combined registered consideration was AED {fmt(total)}, while the median individual ticket was AED {fmt(ticket)}. Total value and median ticket answer different questions: a small number of large deals can move the total without moving the middle sale by the same amount. Land, whole buildings, commercial units and upstream-flagged records are excluded from every number in this report.'),dict(title='Separate off-plan from ready transactions',text=f'{fmt(off)} records were classified as Off-Plan and {fmt(ready)} as Ready, making off-plan {off/n*100:.1f}% of this sample. The registration mix was {dominant}-led.' if off!=ready else f'The sample divides equally between {fmt(off)} Off-Plan and {fmt(ready)} Ready registrations.')]
        if len(split)==2 and all(r["count"] >= 10 for r in split):
            aa,bb=split
            sections[-1]['text']+=f' The group medians were AED {fmt(aa["median"])} per sq ft for {aa["label"]} and AED {fmt(bb["median"])} for {bb["label"]}. This is a comparison of different homes and contracts, not the gain an owner earned between purchase and handover.'
        else:sections[-1]['text']+=' A comparison of registration-type price medians is withheld when a group is absent or has fewer than 10 records. That avoids presenting a tiny group as a reliable price benchmark.'
        if len(quarterly)>1:
            first,last=quarterly[0],quarterly[-1];change=(last['median']/first['median']-1)*100
            quarterlytext=f'Quarter {first["quarter"]} had {fmt(first["count"])} qualifying records at a median of AED {fmt(first["median"])} per sq ft; quarter {last["quarter"]} had {fmt(last["count"])} at AED {fmt(last["median"])}. The difference between those medians is {change:+.1f}%. Different homes can sell in each quarter, so this is not a repeat-sales measure or proof that a particular home appreciated.'
            if first['count']<10 or last['count']<10:quarterlytext=f'Quarter {first["quarter"]} has {fmt(first["count"])} qualifying records and quarter {last["quarter"]} has {fmt(last["count"])}. A first-to-last median comparison is withheld because at least one endpoint has fewer than 10 observations. See the table for the coverage of each quarter.'
            if year==2026:quarterlytext+=' The final quarter is incomplete: this snapshot stops on 5 October 2026. Do not compare its count with a complete quarter as a growth rate.'
        else:quarterlytext='The selected sample appears in only one quarter. This report does not infer an annual price trend from that limited time coverage.'
        sections.append(dict(title='Read the quarterly pattern with the sample size',text=quarterlytext))
        if rooms and max(r['count'] for r in rooms) >= 10:
            largest=max(rooms,key=lambda r:r['count']);text=f'Bedroom information is recorded for {fmt(known)} of the {fmt(n)} qualifying sales. The largest disclosed group is {largest["label"]}, with {fmt(largest["count"])} records and a median of AED {fmt(largest["median"])} per sq ft. The table keeps the other disclosed groups separate. Missing bedroom fields are left unknown, not imputed; this is especially relevant when comparing older records with recent ones.'
        else:text='Bedroom information is absent or too sparse to support a reliable group-specific comparison in this area and period. Cells with fewer than 10 records are labelled small sample. A studio-to-family-apartment price comparison would therefore be speculation. Request a unit-level comparable rather than treating the pooled area median as a bedroom-specific price.'
        sections.append(dict(title='Bedroom evidence and its limits',text=text))
        sections.append(dict(title='How to use this report in a property search',text=f'Use this {year} report as historical context, then build a current shortlist from comparable homes in the same registered area. Record the date and size basis of each comparison and separate asking prices from completed registrations. The cadastral name “{area}” is preserved from the source; it is not silently replaced with a marketing-community name. This analysis does not establish today’s rent, rental yield, financing terms or a guaranteed return.'))
        reports.append(dict(slug=re.sub('[^a-z0-9]+','-',f'{area}-{year}-residential-sales'.lower()).strip('-'),title=f'{area}: {year} residential sales',seoTitle=f'{area[:35]} {year}: Sales & Prices | SWK',category='Historical Research',date='2026-10-24',updated='2026-10-24',period=year,area=area,readTime='4 min read',excerpt=f'{fmt(n)} qualifying residential sales in {area}, {yearlabel}: price medians, quartiles, transaction mix and the limits of the evidence.',content=intro,sections=sections,metrics=dict(count=n,median=round(median,2),q1=round(q1,2),q3=round(q3,2),ticket=round(ticket,2),total=total,offplan=off,ready=ready,units=unit,villas=villa,bedroomsKnown=known),quarters=quarterly,rooms=rooms,registration=split,sources=[dict(title='DLD: original open-data gateway',url='https://dubailand.gov.ae/en/open-data/real-estate-data/'),dict(title='Dubai Real Estate Data: licensed snapshot and methodology',url='https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions')]))
assert len(reports)==416 and len({r['slug'] for r in reports})==416
(ROOT/'data/research.json').write_text(json.dumps(reports,ensure_ascii=False,indent=1)+'\n')
(ROOT/'data/research.json.gz').write_bytes(gzip.compress((ROOT/'data/research.json').read_bytes(),mtime=0))
(ROOT/'data/research-statistics.json').write_text(json.dumps([{k:r[k] for k in ['area','period','metrics','quarters','rooms','registration']} for r in reports],ensure_ascii=False,indent=1)+'\n')
manifest=dict(name='Dubai Real Estate Data, based on Dubai Land Department open data',url='https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions',download='https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions/resolve/main/dld_sales_transactions.parquet',license='CC BY 4.0',sha256=digest,rows=len(df),cutoff='2026-10-05',generated='2026-10-24',method='quality_flags == 0; property_type_label in Unit,Villa; usage_label == Residential; positive price_psf; years 2011–2026; top 26 areas by qualifying count per year with at least 50 records. Medians of per-registration price_psf, not aggregate price divided by aggregate area. All totals are for this filtered sample, not all Dubai sales. Quarterly and bedroom cells under 10 records are not interpreted as reliable benchmarks.',reports=len(reports),disclosure='Programmatic statistical analysis by SWK; source is an independent licensed mirror of DLD data, not a direct official data connection. Not independently reconciled to a complete DLD extract. Source coverage ends 5 October 2026; this is not a live feed. No historical publication dates are implied.')
(ROOT/'data/research-source.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
print(f'Generated {len(reports)} distinct reports, {sum(len(r["content"].split())+sum(len(s["text"].split()) for s in r["sections"]) for r in reports):,} words. Source SHA256 {digest}')

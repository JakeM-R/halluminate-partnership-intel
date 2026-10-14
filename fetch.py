"""Partnership Intelligence: which organisations are building on finance and knowledge-work
agent benchmarks, and which are warming up right now.

Runs daily from .github/workflows/refresh.yml. Source: OpenAlex (free, no key).
A paper counts toward a benchmark if it cites the benchmark's paper or names it in its
title or abstract. Organisations come from OpenAlex institution-level authorships.
"""
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, "site")
API = "https://api.openalex.org/works"
SELECT = "id,doi,title,publication_date,authorships,primary_location,abstract_inverted_index"

RECENT_DAYS = 90
BASELINE_MONTHS = 12

# Halluminate's own benchmarks, from halluminate.ai/research. Checked on 14 Oct 2026:
# none is indexed in OpenAlex yet (every "Westworld" hit is about the TV series).
HALLUMINATE = [
    {"name": "Westworld Finance Diligence Bench", "date": "2026-08-11", "url": "https://halluminate.ai/blog/due-diligence-bench"},
    {"name": "DealTrace Bench", "date": "2026-05-15", "url": "https://halluminate.ai/blog/dealtrace"},
    {"name": "Web Bench", "date": "2025-05-30", "url": "https://halluminate.ai/blog/benchmark"},
    {"name": "BrowserBench", "date": "2025-11-22", "url": "https://halluminate.ai/blog/browserbench"},
    {"name": "Westworld v1", "date": "2025-11-23", "url": "https://halluminate.ai/blog/westworld"},
]

# Adjacent benchmarks. `cites`: OpenAlex IDs of the benchmark paper(s). `terms`: names searched
# in title and abstract. `strict`: name is ambiguous, so the abstract must also mention agents/LLMs.
SEEDS = [
    {"key": "financebench", "name": "FinanceBench", "group": "Finance", "terms": ["FinanceBench"], "cites": ["W4388926382"]},
    {"key": "finqa", "name": "FinQA", "group": "Finance", "terms": ["FinQA"], "cites": []},
    {"key": "finagent", "name": "Finance Agent Benchmark", "group": "Finance", "terms": ["Finance Agent Benchmark"], "cites": ["W4417160709"]},
    {"key": "spreadsheetbench", "name": "SpreadsheetBench", "group": "Finance", "terms": ["SpreadsheetBench"], "cites": ["W4415796311"]},
    {"key": "gdpval", "name": "GDPval", "group": "Knowledge work", "terms": ["GDPval"], "cites": ["W7125508931"]},
    {"key": "theagentcompany", "name": "TheAgentCompany", "group": "Knowledge work", "terms": ["TheAgentCompany"], "cites": ["W4405627213"]},
    {"key": "workarena", "name": "WorkArena", "group": "Knowledge work", "terms": ["WorkArena"], "cites": ["W4392781346", "W4415798926"]},
    {"key": "officebench", "name": "OfficeBench", "group": "Knowledge work", "terms": ["OfficeBench"], "cites": ["W4401201100"]},
    {"key": "taubench", "name": "τ-bench", "group": "Knowledge work", "terms": ["tau-bench", "τ-bench", "tau2-bench"], "cites": [], "strict": True},
    {"key": "appworld", "name": "AppWorld", "group": "Knowledge work", "terms": ["AppWorld"], "cites": [], "strict": True},
    {"key": "gaia", "name": "GAIA", "group": "Knowledge work", "terms": ["GAIA benchmark"], "cites": ["W4388964563"], "strict": True},
    {"key": "webarena", "name": "WebArena", "group": "Web & computer use", "terms": ["WebArena"], "cites": []},
    {"key": "osworld", "name": "OSWorld", "group": "Web & computer use", "terms": ["OSWorld"], "cites": ["W4415797693"]},
    {"key": "mind2web", "name": "Mind2Web", "group": "Web & computer use", "terms": ["Mind2Web"], "cites": ["W7133215859"]},
    {"key": "webvoyager", "name": "WebVoyager", "group": "Web & computer use", "terms": ["WebVoyager"], "cites": ["W4402671629", "W4391272423"]},
    {"key": "browsecomp", "name": "BrowseComp", "group": "Web & computer use", "terms": ["BrowseComp"], "cites": ["W4417089504"]},
]
AGENTY = re.compile(r"\b(agent|agents|agentic|LLM|LLMs|language models?|tool[- ]use)\b", re.I)

with open(os.path.join(ROOT, "overrides.json")) as f:
    OVERRIDES = json.load(f)


def get(params):
    url = f"{API}?{urllib.parse.urlencode(params)}"
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "partnership-intel (github.com/JakeM-R)"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if attempt == 5:
                raise
            wait = 30 if getattr(e, "code", None) == 429 else 2 ** attempt
            print(f"retry in {wait}s: {e}", file=sys.stderr)
            time.sleep(wait)


def fetch_all(filt):
    out, cursor = [], "*"
    while cursor:
        d = get({"filter": filt, "per_page": 200, "cursor": cursor, "select": SELECT})
        out.extend(d["results"])
        cursor = d["meta"].get("next_cursor")
        if not d["results"]:
            break
        time.sleep(0.15)
    return out


def abstract(w):
    inv = w.get("abstract_inverted_index") or {}
    pos = [(i, word) for word, idxs in inv.items() for i in idxs]
    return " ".join(word for _, word in sorted(pos))


def org_name(inst):
    raw = inst["display_name"]
    if raw in OVERRIDES["merge"]:
        return OVERRIDES["merge"][raw]
    return re.sub(r"\s*\((United States|United Kingdom|China|Canada|France|Germany|India|Japan|Singapore|"
                  r"Switzerland|Israel|South Korea|Hong Kong|Netherlands|Australia|Taiwan|Spain|Italy)\)$", "", raw)


def org_type(name, inst_type):
    if name in OVERRIDES["type"]:
        return OVERRIDES["type"][name]
    if inst_type == "education":
        return "University"
    if inst_type == "company":
        return "Startup / other company"
    return "Research institute"


def main():
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=RECENT_DAYS + BASELINE_MONTHS * 30)
    recent_from = today - timedelta(days=RECENT_DAYS)

    works = {}
    hits = defaultdict(set)  # work id -> benchmark keys
    via = defaultdict(set)   # work id -> "cites" / "mentions"
    for s in SEEDS:
        found = []
        if s["cites"]:
            found += [(w, "cites") for w in fetch_all(f"cites:{'|'.join(s['cites'])},from_publication_date:{start}")]
        for term in s["terms"]:
            found += [(w, "mentions") for w in fetch_all(f'title_and_abstract.search:"{term}",from_publication_date:{start}')]
        kept = 0
        for w, how in found:
            if not w.get("publication_date") or w["id"].split("/")[-1] in s["cites"]:
                continue
            if s.get("strict") and how == "mentions" and not AGENTY.search(f'{w.get("title") or ""} {abstract(w)}'):
                continue
            works[w["id"]] = w
            hits[w["id"]].add(s["key"])
            via[w["id"]].add(how)
            kept += 1
        print(f'{s["name"]}: {kept}', file=sys.stderr)

    # Organisation x benchmark x time.
    orgs = {}
    n_with_inst = 0
    for wid, w in works.items():
        insts = {}
        for a in w.get("authorships") or []:
            for inst in a.get("institutions") or []:
                if inst.get("display_name"):
                    insts[org_name(inst)] = inst
        if insts:
            n_with_inst += 1
        d = date.fromisoformat(w["publication_date"])
        loc = w.get("primary_location") or {}
        paper = {"id": wid.split("/")[-1], "title": w.get("title"), "date": w["publication_date"],
                 "url": loc.get("landing_page_url") or w.get("doi") or wid, "benchmarks": sorted(hits[wid]),
                 "venue": ((loc.get("source") or {}).get("display_name"))}
        for name, inst in insts.items():
            o = orgs.setdefault(name, {"name": name, "type": org_type(name, inst.get("type")),
                                       "country": inst.get("country_code"), "ror": inst.get("ror"),
                                       "recent": 0, "baseline": 0, "bench": Counter(), "benchRecent": Counter(),
                                       "papers": []})
            if d >= recent_from:
                o["recent"] += 1
                o["benchRecent"].update(hits[wid])
            elif d >= start:
                o["baseline"] += 1
            o["bench"].update(hits[wid])
            o["papers"].append(paper)

    leads = []
    for o in orgs.values():
        base_monthly = o["baseline"] / BASELINE_MONTHS
        expected = base_monthly * RECENT_DAYS / 30
        # Poisson-style surprise: how far this org's last 90 days sit above its own norm.
        z = (o["recent"] - expected) / math.sqrt(expected + 1)
        rising = o["recent"] >= 2 and o["recent"] >= 1.5 * expected and z >= 1.0
        papers = sorted(o["papers"], key=lambda p: p["date"], reverse=True)
        leads.append({
            "name": o["name"], "type": o["type"], "country": o["country"], "ror": o["ror"],
            "recent": o["recent"], "baseline": o["baseline"], "baseMonthly": round(base_monthly, 2),
            "recentMonthly": round(o["recent"] / (RECENT_DAYS / 30), 2),
            "z": round(z, 2), "rising": rising, "new": rising and o["baseline"] == 0,
            "bench": dict(o["bench"].most_common()), "benchRecent": dict(o["benchRecent"]),
            "latest": papers[0], "nPapers": len(papers),
        })
    leads.sort(key=lambda l: (-l["rising"], -l["z"], -l["recent"]))

    active = [l for l in leads if l["recent"] > 0]
    bench_stats = []
    for s in SEEDS:
        ws = [w for wid, w in works.items() if s["key"] in hits[wid]]
        rec = sum(1 for w in ws if date.fromisoformat(w["publication_date"]) >= recent_from)
        bench_stats.append({"key": s["key"], "name": s["name"], "group": s["group"], "papers": len(ws), "recent": rec,
                            "orgsRecent": sum(1 for l in active if s["key"] in l["benchRecent"])})

    data = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "window": {"start": start.isoformat(), "recentFrom": recent_from.isoformat(), "today": today.isoformat()},
        "halluminate": HALLUMINATE,
        "benchmarks": bench_stats,
        "stats": {
            "papers": len(works), "papersWithInstitution": n_with_inst,
            "papersRecent": sum(1 for w in works.values() if date.fromisoformat(w["publication_date"]) >= recent_from),
            "orgs": len(orgs), "orgsRecent": len(active), "rising": sum(l["rising"] for l in leads),
            "viaCites": sum(1 for v in via.values() if "cites" in v), "viaMentions": sum(1 for v in via.values() if "mentions" in v),
        },
        # Keep the page light: every org active in the last 90 days, plus the 150 largest otherwise.
        "leads": active + [l for l in leads if l["recent"] == 0][:150],
    }
    os.makedirs(SITE, exist_ok=True)
    with open(os.path.join(SITE, "data.json"), "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(json.dumps(data["stats"]), file=sys.stderr)
    for l in leads[:30]:
        print(f'{l["z"]:>6} {"R" if l["rising"] else " "} {l["recent"]:>3}/{l["baseline"]:<3} {l["type"]:<18} {l["name"]}', file=sys.stderr)


if __name__ == "__main__":
    main()

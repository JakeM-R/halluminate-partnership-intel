# Partnership Intelligence

Which organisations are already building on finance and knowledge-work agent benchmarks, and who is warming up right now.

**Live:** https://jakem-r.github.io/halluminate-partnership-intel/

Built by Jake Makking-Robinson. Real data only, from OpenAlex.

## v1: Benchmark adoption

- **Headline:** how many organisations published on these benchmarks in the last 90 days, and how many are above their own usual rate.
- **Adoption graph (d3):** benchmarks on a ring, grouped as Finance, Knowledge work and Web & computer use; organisations placed between the benchmarks they use. Rising organisations are highlighted.
- **Warm leads:** sorted by how unusual each organisation's last 90 days are against its trailing 12 months, not by raw volume, with the latest paper linked.

A paper counts toward a benchmark if it cites the benchmark paper or names it in its title or abstract. Ambiguous names (τ-bench, AppWorld, GAIA) also need an agent or LLM mention. Organisation types come from OpenAlex plus `overrides.json`. Organisations only: no individual is named.

Halluminate's own benchmarks (Westworld Finance Diligence Bench, DealTrace Bench, Web Bench, BrowserBench, Westworld) aren't indexed in OpenAlex yet, so v1 is built on their neighbours.

## v2: Post-training radar (next)

Hugging Face releases and arXiv agent, RL and post-training papers per lab, last 30 days against a 12-month cadence, cross-referenced with the warm leads.

## How it runs

`.github/workflows/refresh.yml` runs `fetch.py` daily (standard library only, no key), writes `site/data.json`, commits and redeploys GitHub Pages.

```bash
python fetch.py
python -m http.server -d site
```

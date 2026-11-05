"""Builds the two data files used by the charts.

  python3 data/build_data.py

* data/cckp_cru_ts410_annual_tas.json (input snapshot, annual mean temperature in °C per country)
    Refresh with, for example (the API takes up to ~40 comma separated ISO3 codes per call, merge the `data` objects):
    curl "https://cckpapi.worldbank.org/cckp/v1/cru-x0.5_timeseries_tas_timeseries_annual_1901-2025_mean_historical_cru_ts4.10_mean/AGO,BDI,...?_format=json"
* public/assets/data/data.json
    Country level annual temperature anomalies (°C, relative to 1951–1980), 1901–2025, used by the sunburst.
    Source: World Bank Climate Change Knowledge Portal (CCKP) API, CRU TS 4.10 annual mean temperature.
    anomaly = annual mean temperature – mean of 1951–1980, rounded to one decimal.
    Country order, continent grouping and the `empty_*` spacer entries come from data/country_order.json.
* public/assets/data/global_temperature.json
    Global mean temperature anomaly (°C, relative to 1850–1900), 1850–2025, used by the bar chart and the
    small line chart inside the sunburst. Source: WMO, see data/global_temperature.csv.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / 'public' / 'assets' / 'data'
BASE_START, BASE_END = 1951, 1980
FIRST_YEAR, LAST_YEAR = 1901, 2025

order = json.loads((ROOT / 'country_order.json').read_text())
ids = [i for i in order if not i.startswith('empty')]

series = json.loads((ROOT / 'cckp_cru_ts410_annual_tas.json').read_text())

missing = [i for i in ids if not series.get(i)]
if missing:
    raise SystemExit(f'No data returned for: {missing}')

anomalies = {}
for country, values in series.items():
    by_year = {int(k[:4]): v for k, v in values.items()}
    base = sum(by_year[y] for y in range(BASE_START, BASE_END + 1)) / (BASE_END - BASE_START + 1)
    anomalies[country] = {y: round(by_year[y] - base, 1) + 0.0 for y in range(FIRST_YEAR, LAST_YEAR + 1)}

data = {
    str(year): [{'id': i, 'temp': anomalies[i][year] if i in anomalies else None} for i in order]
    for year in range(FIRST_YEAR, LAST_YEAR + 1)
}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'data.json').write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False))

with open(ROOT / 'global_temperature.csv', newline='') as f:
    glob = {row['year']: float(row['anomaly']) for row in csv.DictReader(f)}
(OUT / 'global_temperature.json').write_text(json.dumps(glob, separators=(',', ':')))

print(f'data.json: {len(data)} years x {len(order)} entries; global_temperature.json: {len(glob)} years')

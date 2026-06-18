# moon-venus-orientation

Interactive visualization showing why Venus appears **above** the Moon when seen
from Heidelberg (Germany) but **below** the Moon when seen from Jericó (Colombia)
on the evening of 17 June 2026.

The key insight: both observers see the same absolute positions of Moon and Venus
in space, but their local "up" direction differs because the two cities are at very
different latitudes. This rotates the apparent Moon–Venus line relative to the
horizon at each location.

## Live demo

Deploy to GitHub Pages (see below) or run locally.

## Local development

```bash
# 1. Clone / enter the repo
git clone <your-repo-url>
cd moon-venus-orientation

# 2. Create and activate a Python virtual environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Generate the sky data (downloads de421.bsp ~17 MB on first run)
python scripts/generate_data.py

# 5. Serve locally
python -m http.server 8000
```

Open http://localhost:8000 in your browser.

> The ephemeris file `de421.bsp` is downloaded by Skyfield into
> `~/.skyfield/` (your home directory) on first run. Subsequent runs
> use the cached file.

## GitHub Pages deployment

1. Push the repository to GitHub (make sure `data/graph_data.json` is committed).
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose:
   - Source: **Deploy from a branch**
   - Branch: `main` / root
4. Click **Save**. The site will be live at
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.

No build step is needed — it is a fully static site.

## Regenerating data

If you want to recompute with different times or locations, edit
`scripts/generate_data.py`, run it again, and commit the updated
`data/graph_data.json`.

## Project structure

```
moon-venus-orientation/
├── index.html              Main page
├── style.css               Dark-sky theme
├── app.js                  Plotly visualization logic
├── data/
│   └── graph_data.json     Pre-computed sky positions (committed)
├── scripts/
│   └── generate_data.py    Python/Skyfield data generator
├── requirements.txt        Python dependencies
└── README.md               This file
```

## How the visualization works

### Data computation (`generate_data.py`)

For each location and each 10-minute step from 18:00 to 02:00 UTC:

- **Topocentric apparent Alt/Az** for Moon, Venus, and Sun via Skyfield + DE421.
- **Venus relative to Moon** (Moon-centered frame):
  - `dx = wrap(venus_az − moon_az) × cos(moon_alt)` — east offset in degrees
  - `dy = venus_alt − moon_alt` — altitude offset in degrees
  - `angle_from_up = atan2(dx, dy)` — 0° = Venus straight up from Moon
- Same calculation for the Sun (used to orient the crescent glyph).
- **Moon illumination** via `skyfield.almanac.fraction_illuminated`.

### Frontend (`app.js`)

- Two side-by-side Plotly subplots, one per location.
- Time slider scrubs through the 49 samples.
- Each panel shows:
  - Moon (gold) and Venus (cyan) at their actual azimuth/altitude.
  - Dotted line Moon → Venus.
  - Dashed vertical = local **up** from the Moon.
  - Cyan wedge line = direction of Venus from Moon.
  - Angle label and ABOVE/BELOW status.
  - SVG crescent glyph rotated by `sun_angle_from_up`.
- x-axis auto-expands to include both bodies (max spread 30°).

## Dependencies

| Package   | Purpose                              |
|-----------|--------------------------------------|
| skyfield  | High-accuracy ephemeris computations |
| numpy     | Numerical utilities                  |
| pytz      | Timezone conversion                  |

Frontend: [Plotly.js](https://plotly.com/javascript/) loaded from CDN.

## License

MIT

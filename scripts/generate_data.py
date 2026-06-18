"""
generate_data.py
Precompute Moon, Venus, and Sun topocentric Alt-Az for Heidelberg and Jericó
on 2026-06-17 evening, then write data/graph_data.json.

Usage:
    python scripts/generate_data.py
"""

import json
import math
import os
from datetime import datetime, timezone

import numpy as np
import pytz
from skyfield import almanac
from skyfield.api import N, W, E, wgs84, load

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def wrap(deg):
    """Wrap angle difference to [-180, 180]."""
    return ((deg + 180) % 360) - 180


def fraction_illuminated(eph, t):
    """Return Moon illuminated fraction [0..1] at time t."""
    # Use almanac helper if available, otherwise compute from phase angle.
    try:
        return float(almanac.fraction_illuminated(eph, "moon", t))
    except Exception:
        # Fallback: phase angle via elongation
        earth = eph["earth"]
        moon = eph["moon"]
        sun = eph["sun"]
        e = earth.at(t)
        m_pos = e.observe(moon).apparent().ecliptic_latlon()
        s_pos = e.observe(sun).apparent().ecliptic_latlon()
        phase_angle = abs(float(m_pos[1].degrees) - float(s_pos[1].degrees)) % 360
        if phase_angle > 180:
            phase_angle = 360 - phase_angle
        return (1 + math.cos(math.radians(phase_angle))) / 2


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

LOCATIONS = [
    {
        "id": "heidelberg",
        "name": "Heidelberg, Germany",
        "lat": 49.3988,
        "lon": 8.6724,
        "timezone": "Europe/Berlin",
    },
    {
        "id": "jerico",
        "name": "Jericó, Colombia",
        "lat": 5.79146,
        "lon": -75.78621,
        "timezone": "America/Bogota",
    },
]

# UTC time range: 2026-06-17 18:00 → 2026-06-18 02:00, step 10 min
START_UTC = datetime(2026, 6, 17, 18, 0, 0, tzinfo=timezone.utc)
END_UTC   = datetime(2026, 6, 18,  2, 0, 0, tzinfo=timezone.utc)
STEP_MIN  = 10

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # Skyfield setup
    ts  = load.timescale()
    eph = load("de421.bsp")

    earth = eph["earth"]
    moon  = eph["moon"]
    venus = eph["venus"]
    sun   = eph["sun"]

    # Build UTC datetime list using timestamp arithmetic (avoids minute-overflow)
    utc_times = []
    ts_start = START_UTC.timestamp()
    ts_end   = END_UTC.timestamp()
    t_cur    = ts_start
    while t_cur <= ts_end + 1:
        utc_times.append(datetime.fromtimestamp(t_cur, tz=timezone.utc))
        t_cur += STEP_MIN * 60

    print(f"Time samples: {len(utc_times)}  ({utc_times[0].isoformat()} → {utc_times[-1].isoformat()})")

    output = {"locations": []}

    for loc in LOCATIONS:
        tz_obj   = pytz.timezone(loc["timezone"])
        observer = earth + wgs84.latlon(loc["lat"], loc["lon"])

        samples = []
        for utc_dt in utc_times:
            # Skyfield time object
            t = ts.from_datetime(utc_dt)

            # Apparent topocentric positions
            moon_app  = observer.at(t).observe(moon).apparent()
            venus_app = observer.at(t).observe(venus).apparent()
            sun_app   = observer.at(t).observe(sun).apparent()

            moon_alt_obj,  moon_az_obj,  _ = moon_app.altaz()
            venus_alt_obj, venus_az_obj, _ = venus_app.altaz()
            sun_alt_obj,   sun_az_obj,   _ = sun_app.altaz()

            moon_alt  = float(moon_alt_obj.degrees)
            moon_az   = float(moon_az_obj.degrees)
            venus_alt = float(venus_alt_obj.degrees)
            venus_az  = float(venus_az_obj.degrees)
            sun_alt   = float(sun_alt_obj.degrees)
            sun_az    = float(sun_az_obj.degrees)

            # Venus relative to Moon
            venus_dx = wrap(venus_az - moon_az) * math.cos(math.radians(moon_alt))
            venus_dy = venus_alt - moon_alt
            venus_angle_from_up = math.degrees(math.atan2(venus_dx, venus_dy))

            # Sun relative to Moon
            sun_dx = wrap(sun_az - moon_az) * math.cos(math.radians(moon_alt))
            sun_dy = sun_alt - moon_alt
            sun_angle_from_up = math.degrees(math.atan2(sun_dx, sun_dy))

            # Moon illumination
            illum = fraction_illuminated(eph, t)

            # Local time string
            local_dt = utc_dt.astimezone(tz_obj)
            tz_abbr  = local_dt.strftime("%Z")
            local_str = local_dt.strftime(f"%Y-%m-%d %H:%M {tz_abbr}")

            samples.append({
                "utc": utc_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "local_time": local_str,
                "moon":  {"alt": round(moon_alt, 4),  "az": round(moon_az, 4)},
                "venus": {"alt": round(venus_alt, 4), "az": round(venus_az, 4)},
                "sun":   {"alt": round(sun_alt, 4),   "az": round(sun_az, 4)},
                "relative": {
                    "venus_dx":            round(venus_dx, 4),
                    "venus_dy":            round(venus_dy, 4),
                    "venus_angle_from_up": round(venus_angle_from_up, 2),
                    "sun_dx":              round(sun_dx, 4),
                    "sun_dy":              round(sun_dy, 4),
                    "sun_angle_from_up":   round(sun_angle_from_up, 2),
                    "moon_illumination":   round(illum, 4),
                },
            })

        output["locations"].append({
            "id":       loc["id"],
            "name":     loc["name"],
            "lat":      loc["lat"],
            "lon":      loc["lon"],
            "timezone": loc["timezone"],
            "samples":  samples,
        })

        print(f"  {loc['name']}: {len(samples)} samples done.")

    # Write output
    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "graph_data.json")
    out_path = os.path.normpath(out_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()

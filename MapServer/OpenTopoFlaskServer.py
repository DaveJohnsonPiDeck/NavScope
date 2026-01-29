import os
import math
import time
import random
import requests
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import logging
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)  # or logging.CRITICAL to suppress almost everything

# Flask setup
app = Flask(__name__)
CORS(app)

# Configurable parameters
LAT_RANGE = (24.396308, 49.384358)  # Mainland USA: South to North
LON_RANGE = (-125.0, -66.93457)     # Mainland USA: West to East
ZOOM_LEVELS = [12]
TILE_SERVER_URLS = [
    "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
    "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
    "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
]
MAX_WORKERS = 2
MAX_RETRIES = 5
BATCH_SIZE = 20
PAUSE_BETWEEN_BATCHES = 2  # seconds
# Set this to your local tiles folder path.
TILE_FOLDER = "/home/pideck/OpenTopoMaps/tiles"

@app.route('/tiles/<int:z>/<int:x>/<int:y>.png')
def serve_tile(z, x, y):
    tile_path = os.path.join(TILE_FOLDER, str(z), str(x), f"{y}.png")

    if os.path.isfile(tile_path):
        tqdm.write(f"[CACHE] Serving cached tile {z}/{x}/{y}")
        return send_file(tile_path, mimetype="image/png")

    try:
        tqdm.write(f"[FETCH] Attempting to fetch tile {z}/{x}/{y} from upstream")
        download_tile(z, x, y)
        if os.path.isfile(tile_path):
            #tqdm.write(f"[DOWNLOADED] Tile {z}/{x}/{y} downloaded and served")
            return send_file(tile_path, mimetype="image/png")
        else:
            tqdm.write(f"[FAILED] Tile {z}/{x}/{y} could not be fetched")
    except Exception as e:
        tqdm.write(f"Error serving tile {z}/{x}/{y}: {e}")

    return "Tile not found", 404

@app.route('/download', methods=['POST'])
def handle_download_request():
    data = request.json
    zooms = data['zoom_levels']
    bounds = data['bounds']  # {north, south, east, west}

    results = {}
    for z in zooms:
        x_start, y_start = deg2num(bounds['north'], bounds['west'], z)
        x_end, y_end = deg2num(bounds['south'], bounds['east'], z)

        jobs = []
        for x in range(min(x_start, x_end), max(x_start, x_end)+1):
            for y in range(min(y_start, y_end), max(y_start, y_end)+1):
                jobs.append((z, x, y))

        pending = [job for job in jobs if not os.path.exists(
            os.path.join(TILE_FOLDER, str(job[0]), str(job[1]), f"{job[2]}.png"))]

        results[z] = {
            "total_tiles": len(jobs),
            "already_downloaded": len(jobs) - len(pending),
            "to_download": len(pending),
        }

        tqdm.write(f"\nZoom level {z} - Total: {len(jobs)}, Cached: {len(jobs) - len(pending)}, To Download: {len(pending)}")

        total_batches = math.ceil(len(pending) / BATCH_SIZE)

        for i in range(0, len(pending), BATCH_SIZE):
            batch_number = (i // BATCH_SIZE) + 1
            tqdm.write(f"\nStarting Batch {batch_number} of {total_batches}...")
            batch = pending[i:i+BATCH_SIZE]
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                list(tqdm(executor.map(lambda args: download_tile(*args), batch), total=len(batch)))
            time.sleep(PAUSE_BETWEEN_BATCHES)

    return jsonify(results)

def deg2num(lat_deg, lon_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.log(math.tan(lat_rad) + (1 / math.cos(lat_rad))) / math.pi) / 2.0 * n)
    return xtile, ytile

def num2deg(xtile, ytile, zoom):
    n = 2.0 ** zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)
    return lat_deg, lon_deg

def download_tile(z, x, y):
    tile_path = os.path.join(TILE_FOLDER, str(z), str(x), f"{y}.png")
    if os.path.exists(tile_path):
        tqdm.write(f"[SKIP] Already cached {z}/{x}/{y}")
        return

    os.makedirs(os.path.dirname(tile_path), exist_ok=True)

    for attempt in range(1, MAX_RETRIES + 1):
        url = random.choice(TILE_SERVER_URLS).format(z=z, x=x, y=y)
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                with open(tile_path, 'wb') as f:
                    f.write(response.content)
                tqdm.write(f"[DOWNLOADED/SERVED] {z}/{x}/{y} from {url}")
                return
            else:
                tqdm.write(f"[{response.status_code}] Error fetching {url} (retry {attempt})")
        except Exception as e:
            tqdm.write(f"[ERROR] {e} fetching {url} (retry {attempt})")
        time.sleep(2.0 * attempt)
    tqdm.write(f"[FAILED] Exhausted retries for {z}/{x}/{y} from {url}")

if __name__ == '__main__':
    debug = os.environ.get("NAVSCOPE_TILE_DEBUG", "0") in {"1", "true", "True", "yes", "YES"}
    app.run(debug=debug, use_reloader=debug)

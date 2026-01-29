"""
Web UI server for NavScope.

Serves static assets and streams GNSS state over WebSocket. Supports dummy data
for UI testing or live NMEA input via the shared reader/tracker.
"""

import argparse
import asyncio
import contextlib
import json
import math
import random
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional

from aiohttp import web

from .nmea_reader import NmeaReader
from .tracker import GnssTracker, SatInfo


@dataclass
class DummySat:
    gnssid: str
    prn: int
    az: float
    el: float
    snr: int
    used: bool
    trail: List[List[float]] = field(default_factory=list)


class DummyGnss:
    def __init__(self) -> None:
        prns = [
            ("GPS", 1),
            ("GPS", 2),
            ("GPS", 4),
            ("GPS", 7),
            ("GLONASS", 66),
            ("GLONASS", 67),
            ("GALILEO", 11),
            ("GALILEO", 12),
            ("BEIDOU", 21),
            ("BEIDOU", 22),
            ("SBAS", 133),
            ("SBAS", 135),
        ]
        self.sats: List[DummySat] = []
        for i, (gnssid, prn) in enumerate(prns):
            self.sats.append(
                DummySat(
                    gnssid=gnssid,
                    prn=prn,
                    az=(i * 28.0) % 360,
                    el=15 + (i * 5) % 70,
                    snr=20 + (i * 3) % 25,
                    used=prn in {1, 2, 4, 7, 66, 11, 21},
                )
            )
        self.start = time.monotonic()
        self.last_tick = 0.0

    def next_state(self) -> Dict[str, object]:
        # Produce a GNSS-like payload that exercises all UI states.
        now = time.monotonic()
        t = now - self.start
        if now - self.last_tick >= 1.0:
            self.last_tick = now
            for sat in self.sats:
                sat.az = (sat.az + 2.5 + random.uniform(-1.0, 1.0)) % 360
                sat.el = max(5, min(85, sat.el + math.sin(t / 6.0 + sat.prn) * 0.2))
                if sat.prn in {67, 135}:
                    sat.snr = 0
                else:
                    sat.snr = max(5, min(50, sat.snr + int(random.uniform(-2, 2))))
                sat.trail.append([round(sat.az, 1), round(sat.el, 1)])
                if len(sat.trail) > 90:
                    sat.trail = sat.trail[-90:]

        sats_payload = [
            {
                "id": f"{sat.gnssid}-{sat.prn:02d}",
                "gnssid": sat.gnssid,
                "prn": sat.prn,
                "az": round(sat.az, 1),
                "el": round(sat.el, 1),
                "snr": sat.snr,
                "used": sat.used,
                "trail": sat.trail[-30:],
            }
            for sat in self.sats
        ]
        # Simulate speed/COG behavior, including occasional low-speed invalid COG.
        cycle = int(t) % 20
        if cycle < 4:
            speed_knots = 0.2
        else:
            speed_knots = 18.0 + 12.0 * math.sin(t / 4.0) + 6.0 * math.sin(t / 11.0)
            speed_knots = max(0.0, speed_knots)
        cog_deg = (120 + t * 6 + math.sin(t / 7.0) * 10) % 360

        return {
            "t_utc": time.strftime("%H%M%S", time.gmtime()),
            "health": {
                "age_ms": 200,
                "avg_dt_ms": 980,
                "status": "LIVE",
            },
            "fix": {
                "status": "A",
                "mode": 3,
                "quality": 1,
                "lat": 21.143671,
                "lon": -86.822661,
                "alt_m": 24.0 + math.sin(t / 8.0) * 2.4,
                "speed_knots": speed_knots,
                "cog_deg": cog_deg,
            },
            "dop": {"pdop": 3.04, "hdop": 0.89, "vdop": 2.91},
            "counts": {
                "used": len([s for s in self.sats if s.used]),
                "in_view": len(self.sats),
            },
            "sats": sats_payload,
        }


class LiveGnss:
    def __init__(self, port: Optional[str], baud: int, file_path: Optional[str], replay_rate: float) -> None:
        self.reader = NmeaReader(port, baud, file_path, replay_rate)
        self.tracker = GnssTracker()
        self.last_line_time: Optional[float] = None
        self.dt_samples: Deque[float] = deque(maxlen=50)
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1.0)

    def _run(self) -> None:
        # Reader thread: parse lines and update the shared tracker state.
        for line, t_mono in self.reader.iter_lines():
            if self._stop.is_set():
                break
            with self._lock:
                if self.last_line_time is not None:
                    self.dt_samples.append((t_mono - self.last_line_time) * 1000)
                self.last_line_time = t_mono
                self.tracker.update_from_line(line)

    def next_state(self) -> Dict[str, object]:
        # Snapshot the current tracker state into the web payload shape.
        now = time.monotonic()
        with self._lock:
            state = self.tracker.state
            last_line_time = self.last_line_time
            dt_samples = list(self.dt_samples)

        age_ms = (now - last_line_time) * 1000 if last_line_time else 99999.0
        avg_dt = sum(dt_samples) / len(dt_samples) if dt_samples else 0.0
        status = "LIVE" if age_ms < 1500 else "STALE" if age_ms < 5000 else "DEAD"
        used = len(state.used_prns) if state.used_prns else (state.used_count or 0)
        sats_payload = [_sat_to_payload(sat) for sat in state.sats]

        return {
            "t_utc": state.t_utc,
            "health": {
                "age_ms": int(age_ms),
                "avg_dt_ms": int(avg_dt),
                "status": status,
            },
            "fix": {
                "status": state.fix_status,
                "mode": state.fix_mode,
                "quality": state.quality,
                "lat": state.lat,
                "lon": state.lon,
                "alt_m": state.alt_m,
                "speed_knots": state.speed_knots,
                "cog_deg": state.cog_deg,
            },
            "dop": {"pdop": state.pdop, "hdop": state.hdop, "vdop": state.vdop},
            "counts": {"used": used, "in_view": state.in_view_count},
            "sats": sats_payload,
        }


def _sat_to_payload(sat: SatInfo) -> Dict[str, object]:
    return {
        "id": f"GPS-{sat.prn:02d}",
        "gnssid": sat.gnssid,
        "prn": sat.prn,
        "az": sat.az,
        "el": sat.el,
        "snr": sat.snr,
        "used": sat.used,
        "trail": [],
    }


async def handle_index(request: web.Request) -> web.FileResponse:
    web_dir = request.app["web_dir"]
    return web.FileResponse(web_dir / "index.html")


async def handle_ws(request: web.Request) -> web.WebSocketResponse:
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    request.app["clients"].add(ws)

    try:
        async for _ in ws:
            pass
    finally:
        request.app["clients"].discard(ws)
    return ws


async def broadcaster(app: web.Application) -> None:
    # Broadcast current state to all connected websocket clients.
    source = app["source"]
    while True:
        payload = source.next_state()
        msg = json.dumps(payload)
        dead = []
        for ws in app["clients"]:
            if ws.closed:
                dead.append(ws)
                continue
            await ws.send_str(msg)
        for ws in dead:
            app["clients"].discard(ws)
        await asyncio.sleep(0.5)


async def on_startup(app: web.Application) -> None:
    # Start the periodic broadcaster task.
    app["broadcaster"] = asyncio.create_task(broadcaster(app))


async def on_cleanup(app: web.Application) -> None:
    # Stop background tasks and reader thread.
    task = app.get("broadcaster")
    if task:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
    source = app.get("source")
    if isinstance(source, LiveGnss):
        source.stop()


def create_app() -> web.Application:
    import pathlib

    web_dir = pathlib.Path(__file__).resolve().parents[1] / "web"
    app = web.Application()
    app["web_dir"] = web_dir
    app["clients"] = set()
    app.router.add_get("/", handle_index)
    app.router.add_get("/ws", handle_ws)
    app.router.add_static("/static/", web_dir)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="NavScope web UI")
    parser.add_argument("--port", help="Serial port (e.g., COM3)")
    parser.add_argument("--baud", type=int, default=9600)
    parser.add_argument("--file", dest="file_path", help="Replay NMEA log file")
    parser.add_argument("--replay-rate", type=float, default=1.0)
    parser.add_argument("--dummy", action="store_true", help="Use dummy GNSS data")
    return parser.parse_args()


async def run_server(app: web.Application, host: str, port: int) -> None:
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host=host, port=port)
    await site.start()
    print(f"======== Running on http://{host}:{port} ========")
    print("(Press CTRL+C to quit)")
    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await runner.cleanup()


def main() -> None:
    args = parse_args()
    app = create_app()
    if args.dummy:
        app["source"] = DummyGnss()
    else:
        app["source"] = LiveGnss(args.port, args.baud, args.file_path, args.replay_rate)
        app["source"].start()
    try:
        asyncio.run(run_server(app, "127.0.0.1", 8000))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

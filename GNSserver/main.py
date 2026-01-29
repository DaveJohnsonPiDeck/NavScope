"""
NavScope Stage 0 terminal monitor.

Reads NMEA from serial or replay file, parses core sentences, and renders a
fixed-layout table in the console for verification against u-center.
"""

import argparse
import atexit
import os
import shutil
import sys
import time
from collections import deque
from typing import Deque, Optional

from .nmea_reader import NmeaReader
from .tracker import GnssTracker, SatInfo


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="NavScope Stage 0 NMEA monitor")
    parser.add_argument("--port", help="Serial port (e.g., COM7)")
    parser.add_argument("--baud", type=int, default=9600)
    parser.add_argument("--file", dest="file_path", help="Replay NMEA log file")
    parser.add_argument("--replay-rate", type=float, default=1.0)
    return parser.parse_args()


def health_status(age_ms: float) -> str:
    if age_ms < 1500:
        return "LIVE"
    if age_ms < 5000:
        return "STALE"
    return "DEAD"


def fmt_opt(value: Optional[float], fmt: str = "{:.3f}") -> str:
    if value is None:
        return "--"
    return fmt.format(value)


def fmt_int(value: Optional[int]) -> str:
    if value is None:
        return "--"
    return str(value)


def render(
    state,
    now: float,
    last_line_time: Optional[float],
    dt_samples: Deque[float],
    last_line_count: int,
    use_ansi: bool,
) -> int:
    # Compose a full screen of lines, then repaint in-place.
    age_ms = (now - last_line_time) * 1000 if last_line_time else 0.0
    avg_dt = sum(dt_samples) / len(dt_samples) if dt_samples else 0.0
    status = health_status(age_ms)

    lines = []
    lines.append("NavScope Stage 0 - NMEA Monitor")
    lines.append("=" * 64)
    lines.append(
        f"UTC: {state.t_utc or '--'} | Health: {status} | age_ms={age_ms:.0f} | avg_dt_ms={avg_dt:.0f}"
    )
    lines.append(
        "Fix: status={status} mode={mode} quality={qual} used={used} in_view={in_view}".format(
            status=state.fix_status or "--",
            mode=fmt_int(state.fix_mode),
            qual=fmt_int(state.quality),
            used=fmt_int(len(state.used_prns) if state.used_prns else state.used_count),
            in_view=fmt_int(state.in_view_count),
        )
    )
    lines.append(
        "Lat/Lon: {lat}, {lon} | Alt: {alt} m".format(
            lat=fmt_opt(state.lat, "{:.6f}"),
            lon=fmt_opt(state.lon, "{:.6f}"),
            alt=fmt_opt(state.alt_m, "{:.2f}"),
        )
    )
    lines.append(
        "DOP: PDOP={pdop} HDOP={hdop} VDOP={vdop}".format(
            pdop=fmt_opt(state.pdop, "{:.2f}"),
            hdop=fmt_opt(state.hdop, "{:.2f}"),
            vdop=fmt_opt(state.vdop, "{:.2f}"),
        )
    )
    lines.append("-")
    lines.append("PRN | El | Az | SNR | Used")
    lines.append("----+----+----+-----+------")

    sats_sorted = sorted(state.sats, key=_snr_sort_key, reverse=True)
    term_height = shutil.get_terminal_size((80, 24)).lines
    base_lines = len(lines)
    available = max(0, term_height - base_lines)
    trunc_line = None
    if available < len(sats_sorted):
        if available >= 1:
            keep = max(0, available - 1)
            trunc_line = f"... ({len(sats_sorted) - keep} more)"
            sats_sorted = sats_sorted[:keep]
        else:
            trunc_line = f"... ({len(sats_sorted)} more)"
            sats_sorted = []

    for sat in sats_sorted:
        lines.append(
            "{prn:>3} | {el:>2} | {az:>3} | {snr:>3} | {used}".format(
                prn=sat.prn,
                el=fmt_int(sat.el),
                az=fmt_int(sat.az),
                snr=fmt_int(sat.snr),
                used="Y" if sat.used else "N",
            )
        )
    if trunc_line:
        lines.append(trunc_line)

    if use_ansi:
        if last_line_count > 0:
            sys.stdout.write(f"\x1b[{last_line_count}F")
        else:
            sys.stdout.write("\x1b[H")
        sys.stdout.write("\x1b[J")
    else:
        # Fallback for terminals without ANSI cursor support.
        os.system("cls" if sys.platform == "win32" else "clear")
    sys.stdout.write("\n".join(lines))
    sys.stdout.write("\n")
    sys.stdout.flush()
    return len(lines)


def _snr_sort_key(sat: SatInfo) -> int:
    return sat.snr if sat.snr is not None else -1


def enable_vt_mode() -> bool:
    # Enable ANSI cursor control on Windows consoles when possible.
    if sys.platform != "win32":
        return True
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-11)  # STD_OUTPUT_HANDLE
        mode = ctypes.c_uint32()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)) == 0:
            return False
        new_mode = mode.value | 0x0004  # ENABLE_VIRTUAL_TERMINAL_PROCESSING
        if kernel32.SetConsoleMode(handle, new_mode) == 0:
            return False
        return True
    except Exception:
        return False


def enter_alt_screen(use_ansi: bool) -> None:
    if not use_ansi:
        return
    sys.stdout.write("\x1b[?1049h\x1b[H")
    sys.stdout.flush()


def exit_alt_screen(use_ansi: bool) -> None:
    if not use_ansi:
        return
    sys.stdout.write("\x1b[?1049l")
    sys.stdout.flush()


def main() -> int:
    args = parse_args()
    use_ansi = enable_vt_mode()
    if use_ansi:
        enter_alt_screen(use_ansi)
        atexit.register(exit_alt_screen, use_ansi)
    reader = NmeaReader(args.port, args.baud, args.file_path, args.replay_rate)
    tracker = GnssTracker()
    last_render = 0.0
    last_line_count = 0
    last_line_time: Optional[float] = None
    dt_samples: Deque[float] = deque(maxlen=50)
    gsv_updated = False

    try:
        for line, t_mono in reader.iter_lines():
            if last_line_time is not None:
                dt_samples.append((t_mono - last_line_time) * 1000)
            last_line_time = t_mono
            gsv_updated = tracker.update_from_line(line) or gsv_updated
            now = t_mono
            if now - last_render >= 1.0 or gsv_updated:
                last_line_count = render(
                    tracker.state, now, last_line_time, dt_samples, last_line_count, use_ansi
                )
                last_render = now
                gsv_updated = False
    except KeyboardInterrupt:
        return 0
    except Exception as exc:
        sys.stderr.write(f"Error: {exc}\n")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

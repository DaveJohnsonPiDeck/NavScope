"""
NMEA input reader.

Supports live serial input via pyserial or replay from a log file with timing.
"""

import time
from typing import Generator, Optional, Tuple

import serial

from .nmea_parser import parse_time_from_line


class NmeaReader:
    def __init__(self, port: Optional[str], baud: int, file_path: Optional[str], replay_rate: float) -> None:
        self.port = port
        self.baud = baud
        self.file_path = file_path
        self.replay_rate = replay_rate

    def iter_lines(self) -> Generator[Tuple[str, float], None, None]:
        if self.file_path:
            yield from self._iter_file()
        else:
            if not self.port:
                raise ValueError("--port is required for live serial mode")
            yield from self._iter_serial()

    def _iter_serial(self) -> Generator[Tuple[str, float], None, None]:
        # Read line-by-line from a serial port using a short timeout.
        # If the device disappears, keep retrying until it returns.
        backoff = 1.0
        warned = False
        while True:
            try:
                with serial.Serial(self.port, self.baud, timeout=1) as ser:
                    if warned:
                        print(f"[NmeaReader] Serial restored on {self.port}.")
                    warned = False
                    backoff = 1.0
                    while True:
                        raw = ser.readline()
                        if not raw:
                            continue
                        line = raw.decode("ascii", errors="ignore").strip()
                        if not line:
                            continue
                        yield line, time.monotonic()
            except serial.SerialException as exc:
                if not warned:
                    print(f"[NmeaReader] Serial lost on {self.port}. Waiting for GPS...")
                    warned = True
                time.sleep(backoff)
                backoff = min(backoff * 1.5, 5.0)

    def _iter_file(self) -> Generator[Tuple[str, float], None, None]:
        # Replay a log file and approximate timing based on NMEA timestamps.
        last_t_utc = None
        with open(self.file_path, "r", encoding="ascii", errors="ignore") as f:
            for raw in f:
                line = raw.strip()
                if not line:
                    continue
                t_utc = parse_time_from_line(line)
                delay = self._compute_delay(last_t_utc, t_utc)
                if delay > 0:
                    time.sleep(delay)
                last_t_utc = t_utc if t_utc is not None else last_t_utc
                yield line, time.monotonic()

    def _compute_delay(self, last_t_utc: Optional[float], t_utc: Optional[float]) -> float:
        # Compute a small replay delay even when timestamps are missing or invalid.
        if t_utc is None or last_t_utc is None:
            return 0.1 / max(self.replay_rate, 0.01)
        dt = t_utc - last_t_utc
        if dt < 0:
            dt += 24 * 3600
        if dt <= 0 or dt > 10:
            return 0.1 / max(self.replay_rate, 0.01)
        return dt / max(self.replay_rate, 0.01)

"""
NMEA parsing helpers.

Lightweight parsing for sentence splitting, time fields, and coordinate conversion.
"""

import re
from typing import List, Optional, Tuple

_NMEA_RE = re.compile(r"^\$(?P<type>[A-Z0-9]{5}),(?P<body>.*)")


def split_nmea(line: str) -> Optional[Tuple[str, str, List[str]]]:
    # Strip checksum and split into talker/sentence and field list.
    line = line.strip()
    if not line.startswith("$"):
        return None
    if "*" in line:
        line = line.split("*", 1)[0]
    m = _NMEA_RE.match(line)
    if not m:
        return None
    msg_type = m.group("type")
    talker = msg_type[:2]
    sentence = msg_type[2:]
    fields = m.group("body").split(",")
    return talker, sentence, fields


def parse_time_field(t_str: str) -> Optional[float]:
    # Convert HHMMSS.SS to seconds since midnight.
    if not t_str:
        return None
    try:
        # HHMMSS.SS
        hh = int(t_str[0:2])
        mm = int(t_str[2:4])
        ss = float(t_str[4:])
        return hh * 3600 + mm * 60 + ss
    except (ValueError, IndexError):
        return None


def parse_time_from_line(line: str) -> Optional[float]:
    # Extract time from common RMC/GGA sentences for replay timing.
    parts = split_nmea(line)
    if not parts:
        return None
    _, sentence, fields = parts
    if sentence == "RMC" and len(fields) > 1:
        return parse_time_field(fields[0])
    if sentence == "GGA" and len(fields) > 1:
        return parse_time_field(fields[0])
    return None


def parse_lat_lon(lat_str: str, lat_hemi: str, lon_str: str, lon_hemi: str) -> Tuple[Optional[float], Optional[float]]:
    # Parse NMEA lat/lon pairs in DDMM.MMMM and DDDMM.MMMM formats.
    lat = _parse_coord(lat_str, lat_hemi)
    lon = _parse_coord(lon_str, lon_hemi)
    return lat, lon


def _parse_coord(value: str, hemi: str) -> Optional[float]:
    # Convert NMEA coordinate to signed decimal degrees.
    if not value or not hemi:
        return None
    try:
        v = float(value)
    except ValueError:
        return None
    deg = int(v // 100)
    minutes = v - deg * 100
    dec = deg + minutes / 60.0
    if hemi in ("S", "W"):
        dec = -dec
    return dec


def safe_int(value: str) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def safe_float(value: str) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

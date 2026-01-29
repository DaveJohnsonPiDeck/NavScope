"""
GNSS state tracker.

Parses NMEA sentences into a rolling state model and handles GSV burst assembly.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from .nmea_parser import parse_lat_lon, safe_float, safe_int, split_nmea


@dataclass
class SatInfo:
    gnssid: str
    prn: int
    el: Optional[int]
    az: Optional[int]
    snr: Optional[int]
    used: bool = False


@dataclass
class GnssState:
    t_utc: Optional[str] = None
    fix_status: Optional[str] = None
    fix_mode: Optional[int] = None
    quality: Optional[int] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    alt_m: Optional[float] = None
    speed_knots: Optional[float] = None
    cog_deg: Optional[float] = None
    pdop: Optional[float] = None
    hdop: Optional[float] = None
    vdop: Optional[float] = None
    used_count: Optional[int] = None
    in_view_count: Optional[int] = None
    sats: List[SatInfo] = field(default_factory=list)
    used_prns: Set[int] = field(default_factory=set)


class GnssTracker:
    def __init__(self) -> None:
        self.state = GnssState()
        self._gsv_buffers: Dict[str, Dict[str, object]] = {}
        self._gsv_frames: Dict[str, Dict[str, object]] = {}

    def update_from_line(self, line: str) -> bool:
        # Returns True when a complete GSV burst has been assembled.
        parts = split_nmea(line)
        if not parts:
            return False
        talker, sentence, fields = parts
        if sentence == "RMC":
            self._update_rmc(fields)
        elif sentence == "GGA":
            self._update_gga(fields)
        elif sentence == "GSA":
            self._update_gsa(fields)
        elif sentence == "GSV":
            return self._update_gsv(talker, fields)
        return False

    def _update_rmc(self, fields: List[str]) -> None:
        # fields: time, status, lat, N/S, lon, E/W, speed, track, date, ...
        if len(fields) < 2:
            return
        if fields[0]:
            self.state.t_utc = fields[0]
        if fields[1]:
            self.state.fix_status = fields[1]
        if len(fields) >= 6:
            lat, lon = parse_lat_lon(fields[2], fields[3], fields[4], fields[5])
            if lat is not None:
                self.state.lat = lat
            if lon is not None:
                self.state.lon = lon
        if len(fields) > 6:
            speed = safe_float(fields[6])
            if speed is not None:
                self.state.speed_knots = speed
        if len(fields) > 7:
            track = safe_float(fields[7])
            if track is not None:
                self.state.cog_deg = track

    def _update_gga(self, fields: List[str]) -> None:
        # fields: time, lat, N/S, lon, E/W, quality, num_sats, hdop, alt, ...
        if len(fields) < 6:
            return
        if fields[0]:
            self.state.t_utc = fields[0]
        lat, lon = parse_lat_lon(fields[1], fields[2], fields[3], fields[4])
        if lat is not None:
            self.state.lat = lat
        if lon is not None:
            self.state.lon = lon
        quality = safe_int(fields[5])
        if quality is not None:
            self.state.quality = quality
        if len(fields) > 6:
            used = safe_int(fields[6])
            if used is not None:
                self.state.used_count = used
        if len(fields) > 8:
            alt = safe_float(fields[8])
            if alt is not None:
                self.state.alt_m = alt

    def _update_gsa(self, fields: List[str]) -> None:
        # fields: mode1, mode2, prn1..prn12, pdop, hdop, vdop
        if len(fields) < 2:
            return
        mode = safe_int(fields[1])
        if mode is not None:
            self.state.fix_mode = mode
        prn_fields = fields[2:14]
        used: Set[int] = set()
        for prn in prn_fields:
            prn_val = safe_int(prn)
            if prn_val is not None:
                used.add(prn_val)
        self.state.used_prns = used
        if len(fields) >= 17:
            pdop = safe_float(fields[14])
            hdop = safe_float(fields[15])
            vdop = safe_float(fields[16])
            if pdop is not None:
                self.state.pdop = pdop
            if hdop is not None:
                self.state.hdop = hdop
            if vdop is not None:
                self.state.vdop = vdop

    def _update_gsv(self, talker: str, fields: List[str]) -> bool:
        # fields: total_msgs, msg_index, total_sats, sat1..sat4*4
        if len(fields) < 3:
            return False
        total_msgs = safe_int(fields[0])
        msg_index = safe_int(fields[1])
        total_sats = safe_int(fields[2])
        if total_msgs is None or msg_index is None:
            return False
        buffer = self._gsv_buffers.get(talker)
        if msg_index == 1 or buffer is None or buffer.get("total_msgs") != total_msgs:
            buffer = {
                "total_msgs": total_msgs,
                "total_sats": total_sats,
                "msg_map": {},
            }
            self._gsv_buffers[talker] = buffer

        gnssid = _gnssid_from_talker(talker)
        sats = self._parse_gsv_sats(fields[3:], gnssid)
        buffer["msg_map"][msg_index] = sats
        buffer["total_sats"] = total_sats if total_sats is not None else buffer.get("total_sats")

        if msg_index == total_msgs and len(buffer["msg_map"]) == total_msgs:
            # Only publish a new satellite frame when the burst is complete.
            merged: List[SatInfo] = []
            for idx in sorted(buffer["msg_map"].keys()):
                merged.extend(buffer["msg_map"][idx])
            for sat in merged:
                sat.used = sat.prn in self.state.used_prns
            self._gsv_frames[talker] = {
                "sats": merged,
                "total_sats": buffer.get("total_sats"),
            }
            all_sats: List[SatInfo] = []
            in_view_total = 0
            for frame in self._gsv_frames.values():
                frame_sats = frame.get("sats", [])
                all_sats.extend(frame_sats)
                frame_count = frame.get("total_sats")
                if isinstance(frame_count, int):
                    in_view_total += frame_count
            self.state.sats = all_sats
            self.state.in_view_count = in_view_total if in_view_total > 0 else None
            return True
        return False

    def _parse_gsv_sats(self, fields: List[str], gnssid: str) -> List[SatInfo]:
        sats: List[SatInfo] = []
        for i in range(0, len(fields), 4):
            chunk = fields[i : i + 4]
            if len(chunk) < 4:
                continue
            prn = safe_int(chunk[0])
            if prn is None:
                continue
            el = safe_int(chunk[1])
            az = safe_int(chunk[2])
            snr = safe_int(chunk[3])
            sats.append(SatInfo(gnssid=gnssid, prn=prn, el=el, az=az, snr=snr))
        return sats


def _gnssid_from_talker(talker: str) -> str:
    # Map NMEA talker IDs to constellation names for display.
    mapping = {
        "GP": "GPS",
        "GL": "GLONASS",
        "GA": "GALILEO",
        "GB": "BEIDOU",
        "BD": "BEIDOU",
        "SB": "SBAS",
        "GN": "GNSS",
    }
    return mapping.get(talker, "GNSS")

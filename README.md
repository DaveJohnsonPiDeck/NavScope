# NavScope

Lightweight GNSS monitor inspired by u-center.

## Stage 0: Terminal NMEA monitor

Requirements:
- Python 3.10+
- pyserial (Windows: `pip install pyserial`)
- aiohttp (Windows: `pip install aiohttp`) for the web UI

Run with a live serial port:

```bash
python .\GNSserver\main.py --port COM3 --baud 9600
```

Run with a replay file:

```bash
python .\GNSserver\main.py --file path\to\log.nmea --replay-rate 1.0
```

Controls:
- Ctrl+C to quit.


Notes:
- Stage 0 renders a fixed terminal table for verification against u-center.
- Web UI is planned in later stages.

## Stage 1/2: Web UI

### PC Quick Start (Windows)

Windows / PC quick start (recommended):

```bat
start_navscope.bat --port COM3 --baud 9600
```

This starts the tile server on port 5000 (if needed), the GNSS web server on
port 8000, and opens your browser to the UI.

Windows setup (one-time):

1) Install Python 3.10+ from python.org (check "Add python.exe to PATH").
2) Install dependencies:

```bat
python -m pip install aiohttp flask flask-cors requests tqdm pyserial
```

3) Plug in the GPS and find the COM port in Device Manager
   (Ports (COM & LPT) → USB Serial/ACM device).
4) Run the quick start command above with that COM port.

Run the web server directly (advanced):

```bash
python -m GNSserver.web_main --port COM3 --baud 9600
```

Note: NavScope is primarily targeted at Raspberry Pi; Windows support is
mainly for convenience and testing.

Pass args to the GNSS web server (examples). Args are forwarded to
`python -m GNSserver.web_main`:

```bat
start_navscope.bat --dummy
start_navscope.bat --port COM3 --baud 9600
```

## Offline map tiles

The tile server caches map tiles on demand. Set your tiles folder in:

`MapServer/OpenTopoFlaskServer.py`

```python
TILE_FOLDER = "C:/path/to/tiles"
```

If the folder is empty, the tile server will begin building the offline cache as you pan/zoom.

## Raspberry Pi / Linux setup

### Pi Quick Start

Install system packages:

```bash
sudo apt-get update
sudo apt-get install -y python3
```

Install Python dependencies:

```bash
sudo apt-get update
sudo apt-get install -y python3-aiohttp python3-flask python3-flask-cors python3-requests python3-tqdm python3-serial
```

Quick start (Pi / Linux):

```bash
./start_navscope.sh --port /dev/ttyACM0 --baud 9600
```

This starts the tile server + web server and opens a browser; if a GUI terminal
is available it opens each server in its own window.

Note: if you're not sure about the device path, see "Finding the serial device"
below.

Start servers manually (two terminals):

```bash
python MapServer/OpenTopoFlaskServer.py
python -m GNSserver.web_main --port /dev/ttyACM0 --baud 9600
```

Stop with Ctrl+C in each terminal.

Open `http://127.0.0.1:8000` in your browser (same machine). For LAN access:

```bash
python -m GNSserver.web_main --port /dev/ttyACM0 --baud 9600 --host 0.0.0.0
```

Finding the serial device (Pi / Linux):

```bash
# In one terminal
sudo dmesg -w
```

Unplug the GPS, plug it back in, and look for lines like:
`ttyACM0: USB ACM device` or `ttyUSB0: USB Serial device`.

Eample output seen when plugging in my GPS on my Pi CM5

    [27074.821071] usb 4-1.2: USB disconnect, device number 4
    [27091.310213] usb 2-1: new full-speed USB device number 2 using xhci-hcd
    [27091.466790] usb 2-1: New USB device found, idVendor=1546, idProduct=01a7, bcdDevice= 1.00
    [27091.466800] usb 2-1: New USB device strings: Mfr=1, Product=2, SerialNumber=0
    [27091.466803] usb 2-1: Product: u-blox 7 - GPS/GNSS Receiver
    [27091.466806] usb 2-1: Manufacturer: u-blox AG - www.u-blox.com
    [27091.719868] cdc_acm 2-1:1.0: ttyACM0: USB ACM device

Use that `/dev/ttyACM0` or `/dev/ttyUSB0` path in the commands above.

Viewing raw NMEA output (Pi / Linux):

```bash
sudo cat /dev/ttyACM0
```

Or with baud control:

```bash
screen /dev/ttyACM0 9600
```

Press Ctrl+C (cat) or Ctrl+A then K (screen) to exit.

Use dummy data:

```bash
python -m GNSserver.web_main --dummy
```

Notes:
- Leaflet and the rotation plugin are vendored under `web/vendor` so the UI works fully offline.
- If you ever update those libraries, replace the files in `web/vendor` and hard-refresh the browser cache.

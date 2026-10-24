"""Read only known firmware diagnostics; never save arbitrary serial bodies.

Usage: python nodemcu-serial.py COM8 60
Uses pyserial from ESP8266 Arduino core 3.1.2 when not installed globally.
"""
import os
import sys
import time
import json
from datetime import datetime, timezone
from pathlib import Path

try:
    import serial
except ImportError:
    sys.path.insert(0, os.path.join(os.environ['LOCALAPPDATA'], 'Arduino15', 'packages',
                                  'esp8266', 'hardware', 'esp8266', '3.1.2', 'tools', 'pyserial'))
    import serial

allowed = ('API ', 'API:', 'Wi-Fi ', 'Corte Wi-Fi', 'Sesion', 'Sin sesion', 'Medicion ',
           'Config ', 'Confirmacion ', 'Node MSU 01', 'MAX30102:', 'DS18B20:', 'TEMP=',
           'bootId=', 'No llegan muestras', 'Se interrumpieron', 'Secuencia ', 'Esperando hora')
rows = []
port = serial.Serial()
port.port = sys.argv[1]
port.baudrate = 115200
port.timeout = 0.5
port.dtr = False
port.rts = False
try:
    port.open()
    deadline = time.monotonic() + int(sys.argv[2] if len(sys.argv) > 2 else 60)
    while time.monotonic() < deadline:
        line = port.readline(1024).decode('utf-8', 'replace').strip()
        if line.startswith(allowed):
            row = {'utc': datetime.now(timezone.utc).isoformat(), 'message': line[:512]}
            rows.append(row)
            print(json.dumps(row, ensure_ascii=True), flush=True)
except serial.SerialException:
    print('Serial port unavailable; no raw device output saved.', file=sys.stderr)
    sys.exit(1)
finally:
    if port.is_open:
        port.close()
    out = Path(__file__).resolve().parents[2] / '.cache' / 'nodemcu-tests'
    out.mkdir(parents=True, exist_ok=True)
    name = datetime.now(timezone.utc).strftime('serial-%Y%m%dT%H%M%SZ.json')
    (out / name).write_text(json.dumps(rows, indent=2) + '\n', encoding='utf-8')

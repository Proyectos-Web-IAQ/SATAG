"""Genera fixtures/firma-prueba.png: un PNG RGBA de 1200x400 (canvas de 600x200 a
DPR 2, como el SignaturePad en un telefono) con trazos parecidos a una firma.

Sin dependencias (solo zlib/struct). Si el resultado queda por debajo de ~15 KB,
se rellena con un chunk tEXt para que el cuerpo subido a Storage pese lo mismo
que una firma real (E-02 midio 15,113 bytes). El contenido del relleno no
importa: lo que se mide es la subida.

    python pruebas-carga/fixtures/generar-firma.py
"""
import math
import random
import struct
import zlib
from pathlib import Path

W, H = 1200, 400
OBJETIVO = 15_000
random.seed(20260828)

px = bytearray(W * H * 4)  # RGBA, transparente

def punto(x, y, a):
    if 0 <= x < W and 0 <= y < H:
        i = (y * W + x) * 4
        px[i] = 20; px[i + 1] = 30; px[i + 2] = 60
        px[i + 3] = max(px[i + 3], int(255 * a))

def trazo(pts, grosor=3.0):
    for k in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[k], pts[k + 1]
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for s in range(n + 1):
            t = s / n
            cx, cy = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            r = int(grosor) + 1
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    d = math.hypot(dx, dy)
                    if d <= grosor:
                        punto(int(cx) + dx, int(cy) + dy, min(1.0, grosor - d + 0.5))

# Tres "palabras" onduladas y una rubrica, con temblor de mano.
for base in (200, 620, 900):
    pts = []
    for i in range(0, 260, 3):
        x = base + i
        y = 200 + 60 * math.sin(i / 18) * math.sin(i / 53 + base) + random.uniform(-2, 2)
        pts.append((x, y))
    trazo(pts, grosor=random.uniform(2.5, 4))
rubrica = [(150 + i * 4, 300 - 40 * math.sin(i / 9) + random.uniform(-1.5, 1.5)) for i in range(0, 260)]
trazo(rubrica, grosor=2.5)

def chunk(tipo, datos):
    c = tipo + datos
    return struct.pack(">I", len(datos)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

raw = b"".join(b"\x00" + bytes(px[y * W * 4:(y + 1) * W * 4]) for y in range(H))
idat = zlib.compress(raw, 9)
partes = [b"\x89PNG\r\n\x1a\n", chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0)), chunk(b"IDAT", idat)]
tam = sum(len(p) for p in partes) + 12
if tam < OBJETIVO:
    relleno = b"Comment\x00" + bytes(random.getrandbits(8) for _ in range(OBJETIVO - tam - 12 - 8))
    partes.append(chunk(b"tEXt", relleno))
partes.append(chunk(b"IEND", b""))
salida = Path(__file__).with_name("firma-prueba.png")
salida.write_bytes(b"".join(partes))
print(f"{salida.name}: {salida.stat().st_size} bytes ({W}x{H} RGBA, IDAT {len(idat)} bytes)")

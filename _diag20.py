"""Multi-scale cue table: texture/coherence at 39 cm up to 2.6 m windows.

The first cue table used 15-px (39 cm) windows, which turned out not to
discriminate: 37-45% of the frame is "smooth" at that scale (graded dirt and
asphalt are smooth when looked at through 39 cm), so seeds covered 62-68% of
the image and roofs could not be separated from paved ground at all.
This measures the same surfaces at metre scale.
"""
import importlib.util
import os
import sys

import numpy as np
import cv2
from PIL import Image

ROOT = r"c:\Users\vinod\Desktop\map\map"
spec = importlib.util.spec_from_file_location("tp", os.path.join(ROOT, "_test_pipeline.py"))
tp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tp)

img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
GSD = 0.0259
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)


def lstd(win):
    m1 = cv2.boxFilter(gray, -1, (win, win))
    m2 = cv2.boxFilter(gray * gray, -1, (win, win))
    return np.sqrt(np.maximum(m2 - m1 * m1, 0))


def coherence(win):
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    j11 = cv2.boxFilter(gx * gx, -1, (win, win))
    j22 = cv2.boxFilter(gy * gy, -1, (win, win))
    j12 = cv2.boxFilter(gx * gy, -1, (win, win))
    return np.sqrt((j11 - j22) ** 2 + 4 * j12 * j12) / (j11 + j22 + 1e-6)


WINDOWS = [15, 31, 61, 101, 151]
L = {w: lstd(w) for w in WINDOWS}
C = {w: coherence(w) for w in (61, 101, 151)}

print("window px -> metres:", ", ".join(f"{w}={w * GSD:.2f}m" for w in WINDOWS))
hdr = "surface".ljust(17) + "".join(f"{'L' + str(w):>8}" for w in WINDOWS) \
      + "".join(f"{'C' + str(w):>8}" for w in (61, 101, 151)) + f"{'C101>0.6':>9}"
print(hdr)
for tag, rois in (("ROOF", tp.ROI_ROOFS), ("bg", tp.ROI_BG)):
    for name, (y0, y1, x0, x1) in rois.items():
        s = (slice(y0, y1), slice(x0, x1))
        row = f"{name:17s}" + "".join(f"{L[w][s].mean():8.1f}" for w in WINDOWS)
        row += "".join(f"{C[w][s].mean():8.2f}" for w in (61, 101, 151))
        row += f"{(C[101][s] > 0.6).mean() * 100:8.0f}%"
        print(row)

for w in WINDOWS:
    print(f"[*] frame frac L{w} < 15: {(L[w] < 15).mean() * 100:5.1f}%   "
          f"frac L{w} < 8: {(L[w] < 8).mean() * 100:5.1f}%")
for w in (61, 101, 151):
    print(f"[*] frame frac C{w} > 0.6: {(C[w] > 0.6).mean() * 100:5.1f}%   "
          f"> 0.75: {(C[w] > 0.75).mean() * 100:5.1f}%")

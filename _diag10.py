"""Quantitative evaluation of optical mask strategies over known surface ROIs.

Prints per-ROI coverage (%% of ROI pixels inside the mask). Roofs should be high,
backgrounds (road/dirt/trees/shadow) low. No image inspection required.
"""
import os

import numpy as np
import cv2
from PIL import Image

ROOT = r"c:\Users\vinod\Desktop\map\map"
img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
h, w = img.shape[:2]
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).astype(np.float32)
rf, gf, bf = (img[:, :, i].astype(np.float32) for i in range(3))
exg = 2.0 * gf - rf - bf
nature = (exg > 14.0).astype(np.uint8) * 255

ROIS = {  # y0, y1, x0, x1  (True = should be masked)
    "green roof":      (True, (80, 420, 120, 780)),
    "rust roof":       (True, (800, 1060, 220, 780)),
    "dark green roof": (True, (1380, 1530, 320, 860)),
    "gray roof":       (True, (1750, 2350, 300, 1100)),
    "road (right)":    (False, (500, 2800, 1020, 1140)),
    "dirt yard":       (False, (600, 720, 1180, 1270)),
    "dirt left strip": (False, (1800, 2400, 30, 90)),
    "trees":           (False, (550, 750, 30, 180)),
    "shadow edge":     (False, (2450, 2550, 1160, 1230)),
}

f = gray.astype(np.float32)


def ring_solid(k, T, close_k):
    mu = cv2.blur(lab, (k, k))
    d = np.sqrt(((lab - mu) ** 2).sum(axis=2))
    m = ((d > T) * 255).astype(np.uint8)
    if close_k:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE,
                             cv2.getStructuringElement(cv2.MORPH_RECT, (close_k, close_k)))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN,
                         cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))
    return m


def adaptive_pair(c1, c2):
    t1 = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                               cv2.THRESH_BINARY, 45, c1)
    t2 = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                               cv2.THRESH_BINARY, 91, c2)
    return cv2.bitwise_or(t1, t2)


def apply_nature(m):
    return cv2.bitwise_and(m, cv2.bitwise_not(nature))


STRATS = {}
STRATS["A cur(-2,-3)"] = apply_nature(adaptive_pair(-2, -3))
STRATS["B pos(+2,+3)"] = apply_nature(adaptive_pair(2, 3))
STRATS["C ring41/15"] = apply_nature(ring_solid(41, 15, 0))
STRATS["C41/15 cl15"] = apply_nature(ring_solid(41, 15, 15))
STRATS["C61/12 cl15"] = apply_nature(ring_solid(61, 12, 15))
STRATS["C31/12 cl9"] = apply_nature(ring_solid(31, 12, 9))
STRATS["A|C41/15cl15"] = cv2.bitwise_or(STRATS["A cur(-2,-3)"], STRATS["C41/15 cl15"])

names = list(ROIS)
hdr = f"{'ROI':17s}" + "".join(f"{n[:11]:>12s}" for n in STRATS)
print(hdr)
for name, (want, (y0, y1, x0, x1)) in ROIS.items():
    row = f"{name:17s}"
    for m in STRATS.values():
        row += f"{m[y0:y1, x0:x1].mean() / 255 * 100:11.1f}%"
    print(row)
print(f"{'(want roof=hi)':17s}" + " ".join([""] * (len(STRATS) - 1)))
print(f"{'global cover':17s}" +
      "".join(f"{m.mean() / 255 * 100:11.1f}%" for m in STRATS.values()))

"""Measure saturation + local texture per surface type (roof vs dirt vs road)."""
import os

import numpy as np
import cv2
from PIL import Image

ROOT = r"c:\Users\vinod\Desktop\map\map"
img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)

# local texture: std in 15x15 window via box filter
f = gray.astype(np.float32)
m1 = cv2.boxFilter(f, -1, (15, 15))
m2 = cv2.boxFilter(f * f, -1, (15, 15))
lstd = np.sqrt(np.maximum(m2 - m1 * m1, 0))

ROIS = {
    "green roof":      (80, 420, 120, 780),
    "rust roof":       (800, 1060, 220, 780),
    "dark green roof": (1380, 1530, 320, 860),
    "gray roof":       (1750, 2350, 300, 1100),
    "road (right)":    (500, 2800, 1020, 1140),
    "dirt yard":       (600, 720, 1180, 1270),
    "dirt left strip": (1800, 2400, 30, 90),
    "trees":           (550, 750, 30, 180),
    "shadow edge":     (2450, 2550, 1160, 1230),
}
print(f"{'surface':17s} {'S mean':>7} {'S p90':>6} {'V mean':>7} {'lstd':>6} {'hue':>5}")
for name, (y0, y1, x0, x1) in ROIS.items():
    s = hsv[y0:y1, x0:x1, 0]; sa = hsv[y0:y1, x0:x1, 1]; v = hsv[y0:y1, x0:x1, 2]
    print(f"{name:17s} {sa.mean():7.1f} {np.percentile(sa, 90):6.1f} "
          f"{v.mean():7.1f} {lstd[y0:y1, x0:x1].mean():6.1f} {s.mean():5.1f}")

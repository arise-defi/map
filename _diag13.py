"""ASCII surface-class map so the scene layout can be read as text.

Cell classes (mean over ~26x26 px block):
  G vegetation (exg high)      # dark & smooth (dark roof / shadow)
  + bright & smooth (metal/pavement/glare)   ~ textured mid-tone (dirt/rough)
  . mid-tone smooth            o water/very dark saturated
"""
import os

import numpy as np
import cv2
from PIL import Image

ROOT = r"c:\Users\vinod\Desktop\map\map"
img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
H, W = img.shape[:2]
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
rf, gf, bf = (img[:, :, i].astype(np.float32) for i in range(3))
exg = 2.0 * gf - rf - bf
f = gray.astype(np.float32)
m1 = cv2.boxFilter(f, -1, (15, 15))
m2 = cv2.boxFilter(f * f, -1, (15, 15))
lstd = np.sqrt(np.maximum(m2 - m1 * m1, 0))

CELL = 26
nh, nw = H // CELL, W // CELL
print(f"image {W}x{H} px, cell {CELL}px = {CELL * 0.025:.2f} m; grid {nw}x{nh}")
print("legend: G=veg  #=dark-smooth  +=bright-smooth  .=mid-smooth  ~=rough  o=very dark")
print("     " + "".join(str((x * CELL // 100) % 10) for x in range(nw)) + "   (x/100 px)")
for r in range(nh):
    y0, y1 = r * CELL, (r + 1) * CELL
    line = ""
    for c in range(nw):
        x0, x1 = c * CELL, (c + 1) * CELL
        e = exg[y0:y1, x0:x1].mean()
        s = hsv[y0:y1, x0:x1, 1].mean()
        v = hsv[y0:y1, x0:x1, 2].mean()
        t = lstd[y0:y1, x0:x1].mean()
        if e > 14:
            ch = "G"
        elif v < 45 and s > 120:
            ch = "o"
        elif t < 11:
            ch = "#" if v < 80 else ("+" if v > 175 else ".")
        elif t < 20:
            ch = "-" if v < 80 else ("=" if v > 175 else ":")
        else:
            ch = "~"
        line += ch
    print(f"{r * CELL:5d} {line}")

"""Structure-tensor coherence: corrugated/ribbed metal is orientationally
coherent; dirt and vegetation are isotropic. Also per-ROI colour-dispersion.
"""
import os

import numpy as np
import cv2
from PIL import Image

ROOT = r"c:\Users\vinod\Desktop\map\map"
img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).astype(np.float32)
f = gray.astype(np.float32)

ROOFS = {"green roof": (80, 420, 120, 780), "rust roof": (800, 1060, 220, 780),
         "dark green roof": (1380, 1530, 320, 860), "gray roof": (1750, 2350, 300, 1100)}
BGS = {"road (right)": (500, 2800, 1020, 1140), "dirt yard": (600, 720, 1180, 1270),
       "dirt left strip": (1800, 2400, 30, 90), "trees": (550, 750, 30, 180),
       "rough mid-right": (1800, 2300, 850, 1000)}

gx = cv2.Sobel(f, cv2.CV_32F, 1, 0, ksize=3)
gy = cv2.Sobel(f, cv2.CV_32F, 0, 1, ksize=3)
gmag = np.sqrt(gx * gx + gy * gy)


def coherence(win):
    j11 = cv2.boxFilter(gx * gx, -1, (win, win))
    j22 = cv2.boxFilter(gy * gy, -1, (win, win))
    j12 = cv2.boxFilter(gx * gy, -1, (win, win))
    return np.sqrt((j11 - j22) ** 2 + 4 * j12 * j12) / (j11 + j22 + 1e-6)


def lab_disp(win):
    return np.stack([cv2.boxFilter(lab[:, :, c], -1, (win, win)) for c in range(3)])


coh31 = coherence(31)
coh15 = coherence(15)
m1 = cv2.boxFilter(f, -1, (15, 15))
m2 = cv2.boxFilter(f * f, -1, (15, 15))
l15 = np.sqrt(np.maximum(m2 - m1 * m1, 0))
lab31 = np.sqrt(sum((lab[:, :, c] - cv2.boxFilter(lab[:, :, c], -1, (31, 31))) ** 2
                    for c in range(3)))

print(f"{'ROI':17s}{'coh15':>7}{'coh31':>7}{'gmag':>7}{'l15':>6}{'lab31':>7}")
for name, (y0, y1, x0, x1) in {**ROOFS, **BGS}.items():
    sl = (slice(y0, y1), slice(x0, x1))
    print(f"{name:17s}{coh15[sl].mean():7.2f}{coh31[sl].mean():7.2f}"
          f"{gmag[sl].mean():7.1f}{l15[sl].mean():6.1f}{lab31[sl].mean():7.1f}")

print("\ncoh31 percentiles (p10/p50/p90) per ROI")
for name, (y0, y1, x0, x1) in {**ROOFS, **BGS}.items():
    v = coh31[y0:y1, x0:x1]
    q = np.percentile(v, [10, 50, 90])
    print(f"{name:17s}{q[0]:7.2f}{q[1]:7.2f}{q[2]:7.2f}   frac coh>0.6: "
          f"{(v > 0.6).mean() * 100:5.1f}%")

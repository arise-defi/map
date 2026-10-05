"""Diagnose the optical rooftop stages on Test.tif (prints stage stats + masks)."""
import math
import os

import numpy as np
import cv2
from PIL import Image

ROOT = r"c:\Users\vinod\Desktop\map\map"
img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
h, w = img.shape[:2]
gsd = math.sqrt(33.0483984 * 81.35190 / (w * h))
min_px = max(60, int(4.0 / (gsd * gsd)))
print(f"{w}x{h} gsd={gsd:.4f} min_area_px={min_px}")

rf = img[:, :, 0].astype(np.float32)
gf = img[:, :, 1].astype(np.float32)
bf = img[:, :, 2].astype(np.float32)
nature = (2.0 * gf - rf - bf) > 14.0
nature_u8 = nature.astype(np.uint8) * 255


def stage_stats(name, mask):
    n, labels = cv2.connectedComponents(mask)
    if n <= 1:
        print(f"  {name}: EMPTY")
        return []
    sizes = np.bincount(labels.ravel())[1:]
    big = np.sort(sizes)[::-1][:10]
    ok = int((sizes >= min_px).sum())
    print(f"  {name}: {n-1} comps, >=min: {ok}, top sizes: {big.tolist()}")
    return sizes.tolist()


lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB)
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
clahe_l = clahe.apply(lab[:, :, 0])
filtered = cv2.bilateralFilter(clahe_l, d=7, sigmaColor=50, sigmaSpace=50)

k3 = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
grad = cv2.morphologyEx(filtered, cv2.MORPH_GRADIENT, k3)
edges = cv2.bitwise_or(cv2.Canny(filtered, 30, 95), cv2.Canny(grad, 20, 70))

th_fine = cv2.adaptiveThreshold(filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 21, -2)
th_coarse = cv2.adaptiveThreshold(filtered, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 45, -3)
roof = cv2.bitwise_or(th_fine, th_coarse)
roof[nature_u8 > 0] = 0
stage_stats("adaptive roof", roof)

k5 = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
roof_open = cv2.morphologyEx(roof, cv2.MORPH_OPEN, k5, iterations=1)
stage_stats("after open5", roof_open)

roof_close = cv2.morphologyEx(roof_open, cv2.MORPH_CLOSE, k5, iterations=2)
stage_stats("after close5x2", roof_close)

edges_d = cv2.dilate(edges, k3, iterations=1)
cut = roof_close.copy()
cut[edges_d > 0] = 0
stage_stats("after edge cut", cut)
cut_close = cv2.morphologyEx(cut, cv2.MORPH_CLOSE, k5, iterations=2)
stage_stats("cut + close5x2", cut_close)

k9 = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
big_close = cv2.morphologyEx(cut, cv2.MORPH_CLOSE, k9, iterations=2)
stage_stats("cut + close9x2", big_close)

# save intermediate masks for inspection (downscaled)
for name, m in [("adaptive", roof), ("edgecut", cut), ("cutclose9", big_close)]:
    small = cv2.resize(m, (int(w * 0.22), int(h * 0.22)), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(ROOT, f"_diag_{name}.png"), small)
print("wrote _diag_*.png")

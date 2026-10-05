"""Feature metrics of semantic components: roof vs tree vs road discrimination."""
import math
import os
import sys
from collections import Counter

import numpy as np
import cv2
from PIL import Image

sys.path.insert(0, r"c:\Users\vinod\Desktop\map\map")
from _test_pipeline import load_funcs  # noqa: E402

ROOT = r"c:\Users\vinod\Desktop\map\map"
from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation
proc = SegformerImageProcessor.from_pretrained("nvidia/segformer-b0-finetuned-ade-512-512")
model = SegformerForSemanticSegmentation.from_pretrained("nvidia/segformer-b0-finetuned-ade-512-512")
model.eval()
g = load_funcs({"seg_processor": proc, "seg_model": model})

img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
h, w = img.shape[:2]
gsd = math.sqrt(33.0483984 * 81.35190 / (w * h))
min_px = max(60, int(4.0 / (gsd * gsd)))

sem = g["segformer_semantic_maps"](img, pixel_scale=3)
cls_map = sem["cls"]
is_build = np.isin(cls_map, list(g["ADE_BUILDING_IDS"]))

hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
rf, gf, bf = (img[:, :, i].astype(np.float32) for i in range(3))
exg = 2.0 * gf - rf - bf

sm = np.uint8(is_build) * 255
sm = cv2.morphologyEx(sm, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
sm = cv2.morphologyEx(sm, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))
n_cc, lab_cc = cv2.connectedComponents(sm)

ROIS = [
    ("green roof", (60, 480, 100, 750)), ("rust roof", (780, 1080, 200, 800)),
    ("dark green roof", (1360, 1550, 300, 880)), ("gray roof", (1750, 2400, 300, 1150)),
    ("road", (400, 3000, 1000, 1150)), ("trees", (350, 700, 20, 200)),
    ("trees2", (1150, 1500, 0, 180)), ("yard", (2950, 3130, 350, 700)),
]


def identify(cx, cy):
    for name, (y0, y1, x0, x1) in ROIS:
        if x0 <= cx <= x1 and y0 <= cy <= y1:
            return name
    return "?"


rows = []
for cid in range(1, n_cc):
    m = np.uint8(lab_cc == cid) * 255
    area = int(np.count_nonzero(m))
    if area < min_px:
        continue
    sel = m > 0
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnt = max(cnts, key=cv2.contourArea)
    (_c, _), (rw, rh), _a = cv2.minAreaRect(cnt)
    if min(rw, rh) < 1:
        continue
    rect = cv2.contourArea(cnt) / max(1e-6, rw * rh)
    aspect = max(rw, rh) / min(rw, rh)
    M = cv2.moments(m)
    cx, cy = M["m10"] / M["m00"], M["m01"] / M["m00"]
    hue_std = float(hsv[:, :, 0][sel].std())
    gray_std = float(gray[sel].std())
    sat_std = float(hsv[:, :, 1][sel].std())
    exg_frac = float((exg[sel] > 14).mean())
    # boundary sharpness: mean gradient magnitude along contour pixels
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    mag = cv2.magnitude(gx, gy)
    bmask = np.zeros_like(m)
    cv2.drawContours(bmask, [cnt], -1, 255, 5)
    bsharp = float(mag[bmask > 0].mean()) if (bmask > 0).any() else 0.0
    rows.append((area * gsd * gsd, cx, cy, rect, aspect, hue_std, gray_std,
                 sat_std, exg_frac, bsharp, identify(cx, cy)))

rows.sort(key=lambda r: -r[0])
print(f"{'m2':>8} {'cx,cy':>13} {'rect':>5} {'aspt':>5} {'hueSD':>6} {'gySD':>6} "
      f"{'satSD':>6} {'exgF':>5} {'sharp':>6}  what")
for a, cx, cy, rc, asp, hs, gs, ss, ef, bs, name in rows:
    print(f"{a:8.1f} {cx:6.0f},{cy:6.0f} {rc:5.2f} {asp:5.1f} {hs:6.1f} {gs:6.1f} "
          f"{ss:6.1f} {ef:5.2f} {bs:6.1f}  {name}")

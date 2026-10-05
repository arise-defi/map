"""Why are roofs rejected? ROI class histograms + per-check rejection tally."""
import ast
import math
import os
import sys
from collections import Counter
from typing import Any, Dict, List, Optional

import numpy as np
import cv2
import torch
from PIL import Image

sys.path.insert(0, r"c:\Users\vinod\Desktop\map\map")
from _test_pipeline import load_funcs  # noqa: E402

ROOT = r"c:\Users\vinod\Desktop\map\map"

from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation
proc = SegformerImageProcessor.from_pretrained("nvidia/segformer-b0-finetuned-ade-512-512")
model = SegformerForSemanticSegmentation.from_pretrained("nvidia/segformer-b0-finetuned-ade-512-512")
model.eval()
id2label = {int(k): v for k, v in model.config.id2label.items()}

g = load_funcs({"seg_processor": proc, "seg_model": model})
img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
h, w = img.shape[:2]
gsd = math.sqrt(33.0483984 * 81.35190 / (w * h))
min_px = max(60, int(4.0 / (gsd * gsd)))

sem = g["segformer_semantic_maps"](img)
cls_map, bprob = sem["cls"], sem["build_prob"]

ROIS = {
    "green roof (top)":      (60, 480, 100, 750),
    "rust roof":             (780, 1080, 200, 800),
    "dark green roof":       (1360, 1550, 300, 880),
    "gray roof (known)":     (1750, 2400, 300, 1150),
    "road (right)":          (400, 3000, 1000, 1150),
    "trees (left)":          (350, 700, 20, 200),
}
print("=== SegFormer class histogram per ROI ===")
for name, (y0, y1, x0, x1) in ROIS.items():
    sub = cls_map[y0:y1, x0:x1].ravel()
    cnt = Counter(sub.tolist())
    top = ", ".join(f"{id2label.get(k, k)}={v * 100 // sub.size}%" for k, v in cnt.most_common(4))
    bp = float(bprob[y0:y1, x0:x1].mean())
    print(f"  {name:22s} build_prob={bp:.2f} | {top}")

rf = img[:, :, 0].astype(np.float32)
gf = img[:, :, 1].astype(np.float32)
bf = img[:, :, 2].astype(np.float32)
exg = 2.0 * gf - rf - bf
nature = (exg > 14.0) | np.isin(cls_map, list(g["ADE_NATURE_IDS"]))
nature_u8 = nature.astype(np.uint8) * 255
print("\n=== ExG/nature veto per ROI ===")
for name, (y0, y1, x0, x1) in ROIS.items():
    print(f"  {name:22s} nature_veto={float(nature[y0:y1, x0:x1].mean()):.2f}")

is_road = np.isin(cls_map, list(g["ADE_ROAD_IDS"]))
is_build = np.isin(cls_map, list(g["ADE_BUILDING_IDS"]))

optical_masks = g["optical_roof_instances"](img, nature_u8)
sem_masks = []
sm = np.uint8(is_build) * 255
sm = cv2.morphologyEx(sm, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
sm = cv2.morphologyEx(sm, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))
n_cc, lab_cc = cv2.connectedComponents(sm)
for cid in range(1, n_cc):
    comp = np.uint8(lab_cc == cid) * 255
    if np.count_nonzero(comp) >= 60:
        sem_masks.extend(g["_split_into_instances"](comp))

def check(mask, tag, reasons):
    """Run each _eval_instance check separately and tally the first failure."""
    sel = mask > 0
    n_px = int(np.count_nonzero(sel))
    if n_px == 0:
        return
    if n_px < min_px:
        reasons["too small area"] += 1
        return
    if n_px > int(0.35 * w * h):
        reasons["too large"] += 1
        return
    nature_frac = float(nature_u8[sel].mean())
    road_frac = float(is_road[sel].mean())
    build_frac = float(is_build[sel].mean())
    if nature_frac >= 0.40:
        reasons[f"nature_frac {nature_frac:.2f}>=0.40"] += 1
        return
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        reasons["no contour"] += 1
        return
    cnt = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(cnt) < 1.0:
        reasons["empty contour"] += 1
        return
    (_c, _), (rw, rh), _a = cv2.minAreaRect(cnt)
    if min(rw, rh) < 2.0:
        reasons["too thin"] += 1
        return
    aspect = max(rw, rh) / min(rw, rh)
    if aspect > 7.0:
        reasons["aspect>7"] += 1
        return
    if road_frac >= 0.75 or (road_frac >= 0.50 and aspect >= 1.8):
        reasons["road veto"] += 1
        return
    reasons["PASSED"] += 1
    print(f"  PASS[{tag}] {n_px * gsd * gsd:8.1f} m2 centroid={g['_eval_instance']}"
          if False else
          f"  PASS[{tag}] {n_px * gsd * gsd:8.1f} m2 nature={nature_frac:.2f} "
          f"road={road_frac:.2f} build={build_frac:.2f} aspect={aspect:.1f}")


print("\n=== rejection tally ===")
r_opt, r_sem = Counter(), Counter()
for m in optical_masks:
    check(m, "optical", r_opt)
for m in sem_masks:
    check(m, "semantic", r_sem)
print("  optical:", dict(r_opt))
print("  semantic:", dict(r_sem))

print("\n=== semantic instances >= min area (what SegFormer wants as buildings) ===")
big = [(int(np.count_nonzero(m > 0)), m) for m in sem_masks if np.count_nonzero(m > 0) >= min_px]
big.sort(key=lambda t: -t[0])
for n_px, m in big[:15]:
    M = cv2.moments(m)
    cx, cy = M["m10"] / M["m00"], M["m01"] / M["m00"]
    sel = m > 0
    print(f"  {n_px * gsd * gsd:8.1f} m2 centroid=({cx:.0f},{cy:.0f}) "
          f"nature={float(nature_u8[sel].mean()):.2f} road={float(is_road[sel].mean()):.2f} "
          f"build={float(is_build[sel].mean()):.2f}")

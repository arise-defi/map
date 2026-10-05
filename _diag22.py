"""Coverage of every labelled surface at EACH pipeline stage.

Growth caps (2.5 / 3.5 / 4.5 m) and the strip elongation (4.5 / 6.0) produced
byte-identical coverage numbers, so the last footprints of roof are being lost
somewhere after growth.  This measures the same ROIs at every stage of the
pipeline - gate, grown regions, watershed instances, accepted candidates - to
show which stage eats the rest of a roof.
"""
import importlib.util
import math
import os
import sys

import numpy as np
import cv2
from PIL import Image

ROOT = r"c:\Users\vinod\Desktop\map\map"
sys.path.insert(0, ROOT)
spec = importlib.util.spec_from_file_location("tp", os.path.join(ROOT, "_test_pipeline.py"))
tp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tp)

g = tp.load_funcs({})
img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
H, W = img.shape[:2]
GSD = 0.0259

cues = g["_roof_surface_cues"](img)
veg = ((cues["exg"] > 14.0) & (cues["L31"] > 18.0))
veg_u8 = veg.astype(np.uint8) * 255

# --- stage 1: the gate, stage 2: closed seeds, stage 3: grown regions ---------
FLAT, COH_T, RIB = 20.0, 0.62, 0.6
grow_px = int(2.5 / GSD)
gate = (((cues["L61"] < FLAT) | (cues["COH"] > COH_T)) & ~veg).astype(np.uint8) * 255
rib_px = max(9, int(RIB / GSD) | 1)
seeds = cv2.morphologyEx(gate, cv2.MORPH_CLOSE,
                         cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (rib_px, rib_px)))
seeds = cv2.morphologyEx(seeds, cv2.MORPH_OPEN,
                         cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
regions = np.zeros((H, W), np.uint8)
n, labels = cv2.connectedComponents(seeds)
for cid in range(1, n):
    comp = np.uint8(labels == cid) * 255
    if np.count_nonzero(comp) < 60:
        continue
    regions = cv2.bitwise_or(regions, g["_grow_roof_region"](comp, gate, grow_px))
regions = cv2.morphologyEx(regions, cv2.MORPH_OPEN,
                           cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
regions[veg_u8 > 0] = 0

# --- stage 3b: regions that survive the linear-feature veto, stage 4: instances
strip_w_px, strip_len_px = 8.0 / GSD, 12.0 / GSD
kept = np.zeros((H, W), np.uint8)
inst_mask = np.zeros((H, W), np.uint8)
insts = []
n_reg, reg_labels = cv2.connectedComponents(regions)
for rid in range(1, n_reg):
    reg = np.uint8(reg_labels == rid) * 255
    if np.count_nonzero(reg) < 60:
        continue
    cnts, _ = cv2.findContours(reg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnt = max(cnts, key=cv2.contourArea)
    (_cx, _cy), (rw, rh), _a = cv2.minAreaRect(cnt)
    long_px, short_px = max(rw, rh), min(rw, rh)
    spans = long_px >= 0.55 * max(H, W) and short_px <= strip_w_px
    rope = short_px <= strip_w_px and long_px >= strip_len_px and long_px / short_px >= 6.0
    if (spans or rope) and np.count_nonzero(reg) < 0.05 * H * W:
        continue
    kept = cv2.bitwise_or(kept, reg)
    for im in g["_split_into_instances"](reg):
        insts.append(im)
        inst_mask = cv2.bitwise_or(inst_mask, im)

# --- stage 5: what _eval_instance accepts -------------------------------------
min_area = int(4.0 / (GSD * GSD))
max_area = int(0.25 * H * W)
acc = np.zeros((H, W), np.uint8)
for im in insts:
    cand = g["_eval_instance"](im, veg_u8, None, None, min_area, max_area)
    if cand is not None:
        acc = cv2.bitwise_or(acc, im)


stages = [("1 gate", gate), ("2 seeds", seeds), ("3 regions", regions),
          ("3b veto-kept", kept), ("4 instances", inst_mask), ("5 accepted", acc)]
print(f"[*] watershed instances: {len(insts)}")
print("surface".ljust(18) + "".join(f"{n:>13}" for n, _ in stages))
for tag, rois in (("ROOF", tp.ROI_ROOFS), ("bg", tp.ROI_BG)):
    for name, (y0, y1, x0, x1) in rois.items():
        s = (slice(y0, y1), slice(x0, x1))
        row = f"{name[:17]:18s}"
        for _, m in stages:
            row += f"{np.count_nonzero(m[s]) / m[s].size * 100:12.1f}%"
        print(row)

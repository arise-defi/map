"""Region-level geometry of the roof regions produced by optical_roof_instances.

Prints minAreaRect length/width/elongation for every region and which measured
surface patch it overlaps, so the strip (road/curb) veto can be tuned on numbers
instead of eyeballed on images.
"""
import importlib.util
import os
import sys

import numpy as np
import cv2

ROOT = r"c:\Users\vinod\Desktop\map\map"
sys.path.insert(0, ROOT)
spec = importlib.util.spec_from_file_location("tp", os.path.join(ROOT, "_test_pipeline.py"))
tp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tp)

g = tp.load_funcs({})
img = tp.read_image(os.path.join(ROOT, "Test.tif")) if hasattr(tp, "read_image") else None
if img is None:
    from PIL import Image
    img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
H, W = img.shape[:2]
GSD = 0.0259
SQM_PX = GSD * GSD

FLAT, COH_T = 20.0, 0.62
GROW = int(2.5 / GSD)

cues = g["_roof_surface_cues"](img)
veg = (cues["exg"] > 14.0) & (cues["L31"] > 18.0)
veg_u8 = veg.astype(np.uint8) * 255

gate = (((cues["L61"] < FLAT) | (cues["COH"] > COH_T)) & ~veg).astype(np.uint8) * 255
seeds = cv2.morphologyEx(gate, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)))
seeds = cv2.morphologyEx(seeds, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))

regions = np.zeros((H, W), np.uint8)
n, labels = cv2.connectedComponents(seeds)
for cid in range(1, n):
    comp = np.uint8(labels == cid) * 255
    if np.count_nonzero(comp) < 60:
        continue
    regions = cv2.bitwise_or(regions, g["_grow_roof_region"](comp, gate, GROW))
regions = cv2.morphologyEx(regions, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
regions[veg_u8 > 0] = 0
print(f"[*] gate {(gate > 0).mean() * 100:.1f}% of frame, seeds comps={n - 1}, "
      f"region px={np.count_nonzero(regions)}")


n_reg, reg_labels = cv2.connectedComponents(regions)
rows = []
for rid in range(1, n_reg):
    reg = np.uint8(reg_labels == rid) * 255
    a = int(np.count_nonzero(reg))
    if a < 60:
        continue
    cnts, _ = cv2.findContours(reg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnt = max(cnts, key=cv2.contourArea)
    (_cx, _cy), (rw, rh), ang = cv2.minAreaRect(cnt)
    L, Wd = max(rw, rh), min(rw, rh)
    hits = []
    for name, (y0, y1, x0, x1) in {**tp.ROI_ROOFS, **tp.ROI_BG}.items():
        sub = reg[y0:y1, x0:x1]
        tot = np.count_nonzero(reg)
        if tot and sub.size and sub.mean() > 0:
            frac = np.count_nonzero(sub) / tot
            if frac > 0.15:
                hits.append(f"{name}:{frac * 100:.0f}%")
    # How does the watershed split this region, and would a strip veto applied
    # per INSTANCE catch the road fragments that a region-level veto misses?
    insts = g["_split_into_instances"](reg)
    strip_inst = 0
    for im in insts:
        icnts, _ = cv2.findContours(im, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not icnts:
            continue
        icnt = max(icnts, key=cv2.contourArea)
        (_ix, _iy), (irw, irh), _ia = cv2.minAreaRect(icnt)
        iL, iW = max(irw, irh), min(irw, irh)
        if iW <= int(8.0 / GSD) and iL >= int(12.0 / GSD) and iL / max(iW, 1.0) >= 4.0:
            strip_inst += 1
    rows.append((a, L * GSD, Wd * GSD, L / max(Wd, 1.0), ang,
                 f"{len(insts)}inst/{strip_inst}strip", "|".join(hits) or "-"))

rows.sort(key=lambda r: -r[0])
print(f"[*] {len(rows)} regions >= 60px  (frame {W}x{H}, strip_span={0.55 * max(H, W) * GSD:.0f}m)")
print(f"{'a_m2':>8} {'len_m':>7} {'wid_m':>6} {'elong':>6} {'ang':>7}  {'split':>14}  overlaps")
for a, Lm, Wm, el, ang, sp, hits in rows[:45]:
    print(f"{a * SQM_PX:8.1f} {Lm:7.1f} {Wm:6.1f} {el:6.2f} {ang:7.1f}  {sp:>14}  {hits}")


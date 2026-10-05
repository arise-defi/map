"""Texture-aware nature veto + roof candidate generation, scored on known ROIs.

Veg = ExG high AND locally rough (canopies are bumpy); flat green-painted metal
roofs (lstd 2-15) therefore survive the veto. Candidates = locally smooth regions
plus Lab-deviation solids, cleaned, filtered by shape (compactness/elongation).
"""
import os
import sys

import numpy as np
import cv2
from PIL import Image

ROOT = r"c:\Users\vinod\Desktop\map\map"
img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
H, W = img.shape[:2]
GSD = 0.025
SQM_PX = GSD * GSD
MIN_PX = int(4.0 / SQM_PX)

gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).astype(np.float32)
v_mean = hsv[:, :, 2].astype(np.float32)
rf, gf, bf = (img[:, :, i].astype(np.float32) for i in range(3))
exg = 2.0 * gf - rf - bf
f = gray.astype(np.float32)


def lstd_at(win):
    m1 = cv2.boxFilter(f, -1, (win, win))
    m2 = cv2.boxFilter(f * f, -1, (win, win))
    return np.sqrt(np.maximum(m2 - m1 * m1, 0))


L15, L31 = lstd_at(15), lstd_at(31)

ROOFS = {"green roof": (80, 420, 120, 780), "rust roof": (800, 1060, 220, 780),
         "dark green roof": (1380, 1530, 320, 860), "gray roof": (1750, 2350, 300, 1100)}
BGS = {"road (right)": (500, 2800, 1020, 1140), "dirt yard": (600, 720, 1180, 1270),
       "dirt left strip": (1800, 2400, 30, 90), "trees": (550, 750, 30, 180)}


def run(veg_lstd, smooth_thr, ring_T, close_k, max_elong, min_rect, verbose=True,
        tag=""):
    veg = (exg > 14.0) & (L31 > veg_lstd)
    veg_u8 = veg.astype(np.uint8) * 255

    smooth = ((L15 < smooth_thr) & ~veg).astype(np.uint8) * 255
    if ring_T < 1e8:
        mu = cv2.blur(lab, (41, 41))
        d = np.sqrt(((lab - mu) ** 2).sum(axis=2)).astype(np.float32)
        ring = (((d > ring_T) & ~veg) * 255).astype(np.uint8)
        cand = cv2.bitwise_or(smooth, ring)
    else:
        cand = smooth
    cand = cv2.morphologyEx(cand, cv2.MORPH_CLOSE,
                            cv2.getStructuringElement(cv2.MORPH_RECT, (close_k, close_k)))
    cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))

    n, lab_map = cv2.connectedComponents(cand)
    keep = np.zeros((H, W), np.uint8)
    rows = []
    for cid in range(1, n):
        comp = lab_map == cid
        area = int(comp.sum())
        if area < MIN_PX or area > 0.35 * H * W:
            continue
        comp_u8 = comp.astype(np.uint8) * 255
        cnts, _ = cv2.findContours(comp_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        c = max(cnts, key=cv2.contourArea)
        x, y, bw, bh = cv2.boundingRect(c)
        (_, _), (rw, rh), ang = cv2.minAreaRect(c)
        elong = max(rw, rh) / max(4.0, min(rw, rh))
        rect = cv2.contourArea(c) / max(1.0, float(rw * rh))
        if elong > max_elong or rect < min_rect:
            continue
        keep[comp] = 255
        rows.append((area * SQM_PX, elong, rect, float(L15[comp].mean()),
                     float(v_mean[comp].mean()), ang, (y, y + bh, x, x + bw)))
    rows.sort(key=lambda r: -r[0])

    if verbose:
        print(f"\n=== {tag}  veg_lstd>{veg_lstd} smooth<{smooth_thr} ringT>{ring_T} "
              f"close{close_k} elong<={max_elong} rect>={min_rect}")
        print(f"{'coverage':17s}{'kept area':>10}")
        for name, (y0, y1, x0, x1) in {**ROOFS, **BGS}.items():
            cov = keep[y0:y1, x0:x1].mean() / 255 * 100
            print(f"{name:17s}{cov:9.1f}%")
        print(f"{'kept components':17s} {len(rows)}")
        print(f"{'a_m2':>7} {'elong':>6} {'rect':>5} {'lstd':>5} {'V':>6} {'ang':>6}  bbox")
        for a, e, r, l, v, ang, bb in rows[:12]:
            print(f"{a:7.1f} {e:6.2f} {r:5.2f} {l:5.1f} {v:6.1f} {ang:6.1f}  {bb}")
    return keep, rows


print("per-ROI texture / vegetation stats (L15,L31 = local std 15/31 px, exg = 2G-R-B)")
print(f"{'ROI':17s}{'L15':>7}{'L31':>7}{'exg':>7}{'V':>7}")
for name, (y0, y1, x0, x1) in {**ROOFS, **BGS}.items():
    print(f"{name:17s}{L15[y0:y1, x0:x1].mean():7.1f}{L31[y0:y1, x0:x1].mean():7.1f}"
          f"{exg[y0:y1, x0:x1].mean():7.1f}{v_mean[y0:y1, x0:x1].mean():7.1f}")

VARIANTS = {
    "W1 veg18/sm12/cl9": dict(veg_lstd=18, smooth_thr=12, ring_T=1e9, close_k=9, max_elong=4.0, min_rect=0.40),
    "W2 veg18/sm15/cl15": dict(veg_lstd=18, smooth_thr=15, ring_T=1e9, close_k=15, max_elong=4.0, min_rect=0.40),
    "W3 veg22/sm15/cl21": dict(veg_lstd=22, smooth_thr=15, ring_T=1e9, close_k=21, max_elong=4.0, min_rect=0.40),
    "W4 veg25/sm18/cl21": dict(veg_lstd=25, smooth_thr=18, ring_T=1e9, close_k=21, max_elong=4.0, min_rect=0.40),
    "W5 blanketVeg/sm15": dict(veg_lstd=-1, smooth_thr=15, ring_T=1e9, close_k=15, max_elong=4.0, min_rect=0.40),
}
for tag, kw in VARIANTS.items():
    run(tag=tag, **kw)


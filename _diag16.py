"""Roof detector: (locally smooth OR orientationally coherent) minus
texture-aware vegetation veto, then shape-filtered components.
Scored on known ROIs and shown as an ASCII overlay for spatial verification.
"""
import os

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
v_mean = hsv[:, :, 2].astype(np.float32)
rf, gf, bf = (img[:, :, i].astype(np.float32) for i in range(3))
exg = 2.0 * gf - rf - bf
f = gray.astype(np.float32)

m1 = cv2.boxFilter(f, -1, (15, 15))
m2 = cv2.boxFilter(f * f, -1, (15, 15))
L15 = np.sqrt(np.maximum(m2 - m1 * m1, 0))
m1 = cv2.boxFilter(f, -1, (31, 31))
m2 = cv2.boxFilter(f * f, -1, (31, 31))
L31 = np.sqrt(np.maximum(m2 - m1 * m1, 0))
gx = cv2.Sobel(f, cv2.CV_32F, 1, 0, ksize=3)
gy = cv2.Sobel(f, cv2.CV_32F, 0, 1, ksize=3)
j11 = cv2.boxFilter(gx * gx, -1, (31, 31))
j22 = cv2.boxFilter(gy * gy, -1, (31, 31))
j12 = cv2.boxFilter(gx * gy, -1, (31, 31))
COH = np.sqrt((j11 - j22) ** 2 + 4 * j12 * j12) / (j11 + j22 + 1e-6)

ROOFS = {"green roof": (80, 420, 120, 780), "rust roof": (800, 1060, 220, 780),
         "dark green roof": (1380, 1530, 320, 860), "gray roof": (1750, 2350, 300, 1100)}
BGS = {"road (right)": (500, 2800, 1020, 1140), "dirt yard": (600, 720, 1180, 1270),
       "dirt left strip": (1800, 2400, 30, 90), "trees": (550, 750, 30, 180)}


def detect(veg_lstd=18.0, smooth_thr=12.0, coh_thr=0.6, close_k=9,
           max_elong=4.0, min_rect=0.40):
    veg = (exg > 14.0) & (L31 > veg_lstd)
    cand = (((L15 < smooth_thr) | (COH > coh_thr)) & ~veg).astype(np.uint8) * 255
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
        rows.append((area * SQM_PX, elong, rect, float(COH[comp].mean()),
                     float(L15[comp].mean()), float(v_mean[comp].mean()), ang,
                     (y, y + bh, x, x + bw)))
    rows.sort(key=lambda r: -r[0])
    return keep, rows


def ascii_overlay(mask):
    cell = 26
    nh, nw = H // cell, W // cell
    print("     " + "".join(str((x * cell // 100) % 10) for x in range(nw)))
    for r in range(nh):
        y0, y1 = r * cell, (r + 1) * cell
        line = ""
        for cc in range(nw):
            x0, x1 = cc * cell, (cc + 1) * cell
            hit = mask[y0:y1, x0:x1].mean() / 255
            line += "X" if hit > 0.5 else ("x" if hit > 0.15 else ".")
        print(f"{y0:5d} {line}")


for tag, kw in {
    "X1 coh0.60 close9": dict(),
    "X2 coh0.55 close9": dict(coh_thr=0.55),
    "X3 coh0.65 close15": dict(coh_thr=0.65, close_k=15),
    "X4 coh0.60 close9 elong3 rect0.5": dict(max_elong=3.0, min_rect=0.5),
}.items():
    keep, rows = detect(**kw)
    print(f"\n=== {tag}: {len(rows)} components")
    for name, (y0, y1, x0, x1) in {**ROOFS, **BGS}.items():
        print(f"{name:17s}{keep[y0:y1, x0:x1].mean() / 255 * 100:9.1f}%")
    print(f"{'a_m2':>7} {'elong':>6} {'rect':>5} {'coh':>5} {'l15':>6} {'V':>6} {'ang':>6}  bbox")
    for a, e, r, ch, l, v, ang, bb in rows[:14]:
        print(f"{a:7.1f} {e:6.2f} {r:5.2f} {ch:5.2f} {l:6.1f} {v:6.1f} {ang:6.1f}  {bb}")

best, brows = detect()
print("\n=== ASCII overlay of X1 (X = covered >50%, x = >15%) ===")
ascii_overlay(best)
print(f"kept cells: {(best[::13, ::13] > 0).sum()} of "
      f"{best[::13, ::13].size} sampled px")

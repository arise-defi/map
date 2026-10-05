"""Feature table per candidate component with roof/background labels.

For several mask strategies, list every component >= 4 m2 with measurable
features and an R/. label (centroid inside one of the known roof ROIs or not).
Read the table to pick features/filters that really separate the two groups.
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
MIN_PX = int(4.0 / SQM_PX)          # 4 m2

gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).astype(np.float32)
rf, gf, bf = (img[:, :, i].astype(np.float32) for i in range(3))
exg = 2.0 * gf - rf - bf
nature = exg > 14.0
s_mean, v_mean = hsv[:, :, 1].astype(np.float32), hsv[:, :, 2].astype(np.float32)

f = gray.astype(np.float32)
m1 = cv2.boxFilter(f, -1, (15, 15))
m2 = cv2.boxFilter(f * f, -1, (15, 15))
lstd = np.sqrt(np.maximum(m2 - m1 * m1, 0)).astype(np.float32)
canny = cv2.Canny(gray, 50, 150)
canny3 = cv2.dilate(canny, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))

ROOF_ROIS = [(80, 420, 120, 780), (800, 1060, 220, 780),
             (1380, 1530, 320, 860), (1750, 2350, 300, 1100)]


def in_roof(y, x):
    return any(y0 <= y < y1 and x0 <= x < x1 for y0, y1, x0, x1 in ROOF_ROIS)


def adaptive_pair(c1, c2):
    t1 = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                               cv2.THRESH_BINARY, 45, c1)
    t2 = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                               cv2.THRESH_BINARY, 91, c2)
    return cv2.bitwise_or(t1, t2)


def ring(k, T, close_k):
    mu = cv2.blur(lab, (k, k))
    d = np.sqrt(((lab - mu) ** 2).sum(axis=2)).astype(np.float32)
    m = ((d > T) * 255).astype(np.uint8)
    if close_k:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE,
                             cv2.getStructuringElement(cv2.MORPH_RECT, (close_k, close_k)))
    return m


smooth = ((lstd < 12) * 255).astype(np.uint8)
smooth = cv2.morphologyEx(smooth, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))

edge_closed = cv2.morphologyEx(cv2.dilate(canny, np.ones((5, 5), np.uint8)), cv2.MORPH_CLOSE,
                               cv2.getStructuringElement(cv2.MORPH_RECT, (21, 21)))

STRATS = {
    "S1 adaptive": adaptive_pair(-2, -3),
    "S2 ring41/15c21": ring(41, 15, 21),
    "S3 smooth<lstd12": smooth,
    "S4 ring|smooth": cv2.bitwise_or(ring(41, 15, 21), smooth),
    "S5 edgeclosed": edge_closed,
}

for name, m in STRATS.items():
    m = cv2.bitwise_and(m, cv2.bitwise_not(nature.astype(np.uint8) * 255))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7)))
    n, lab_map = cv2.connectedComponents(m)
    rows = []
    for cid in range(1, n):
        comp = lab_map == cid
        area = int(comp.sum())
        if area < MIN_PX or area > 0.35 * H * W:
            continue
        ys, xs = np.nonzero(comp)
        cy, cx = int(ys.mean()), int(xs.mean())
        comp_u8 = comp.astype(np.uint8) * 255
        cnts, _ = cv2.findContours(comp_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        c = max(cnts, key=cv2.contourArea)
        rect = cv2.contourArea(c) / max(1, cv2.boundingRect(c)[2] * cv2.boundingRect(c)[3])
        (_, _), (bw, bh), _ = cv2.minAreaRect(c)
        elong = max(bw, bh) / max(4.0, min(bw, bh))
        cm = np.zeros_like(gray)
        cv2.drawContours(cm, [c], -1, 255, 1)
        gsup = float(canny3[cm > 0].mean()) / 255.0
        fill = np.zeros_like(gray)
        cv2.drawContours(fill, [c], -1, 255, -1)
        out_band = cv2.dilate(fill, np.ones((9, 9), np.uint8)) - fill
        shadow = float((v_mean[out_band > 0] < v_mean[fill > 0].mean() - 25).mean())
        rows.append((area, in_roof(cy, cx), area * SQM_PX, rect, elong, gsup, shadow,
                     float(lstd[comp].mean()), float(s_mean[comp].mean()),
                     float(v_mean[comp].mean()), float(exg[comp].mean()),
                     (int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max()))))
    rows.sort(key=lambda r: -r[0])
    print(f"\n### {name}: {len(rows)} components >= 4m2   "
          f"(R = centroid in a known roof ROI)")
    print(f"{'L':>2} {'a_m2':>7} {'rect':>5} {'elong':>5} {'gsup':>5} {'shad':>5} "
          f"{'lstd':>5} {'S':>5} {'V':>5} {'exg':>6}  bbox y0,y1,x0,x1")
    for i, (area, R, m2a, rect, elong, gsup, shadow, l, s, v, e, bb) in enumerate(rows[:14]):
        print(f"{'R' if R else '.':>2} {m2a:7.1f} {rect:5.2f} {elong:5.2f} {gsup:5.2f} "
              f"{shadow:5.2f} {l:5.1f} {s:5.1f} {v:5.1f} {e:6.1f}  {bb}")

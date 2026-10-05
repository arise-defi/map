"""Experiment: distinct-region detection via Lab distance from local background."""
import os

import numpy as np
import cv2
from PIL import Image

ROOT = r"c:\Users\vinod\Desktop\map\map"
img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
h, w = img.shape[:2]
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)


def fill_holes(m):
    inv = cv2.bitwise_not(m)
    ff = inv.copy()
    mask = np.zeros((inv.shape[0] + 2, inv.shape[1] + 2), np.uint8)
    cv2.floodFill(ff, mask, (0, 0), 0)
    return cv2.bitwise_or(m, ff)


lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).astype(np.float32)
rf, gf, bf = (img[:, :, i].astype(np.float32) for i in range(3))
exg = 2.0 * gf - rf - bf
nature = (exg > 14.0)
nature_u8 = nature.astype(np.uint8) * 255

variants = [(41, 12), (41, 18), (61, 15)]
outs = []
for k, T in variants:
    mu = cv2.blur(lab, (k, k))
    d = np.sqrt(((lab - mu) ** 2).sum(axis=2))
    ring = ((d > T) * 255).astype(np.uint8)
    solid = fill_holes(ring)
    solid = cv2.morphologyEx(solid, cv2.MORPH_OPEN,
                             cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))
    solid[nature_u8 > 0] = 0
    n, s2 = cv2.connectedComponents(solid)
    sizes = np.bincount(s2.ravel())[1:]
    big = int((sizes >= 5962).sum()) if n > 1 else 0
    print(f"k={k} T={T}: cover={solid.mean()*100:.1f}% comps={n-1} >=4m2: {big}")
    vis = img.copy()
    vis[solid > 0] = (vis[solid > 0] * 0.5 + np.array([255, 40, 200]) * 0.5).astype(np.uint8)
    outs.append(cv2.resize(vis, (int(w * 0.22), int(h * 0.22)), interpolation=cv2.INTER_AREA))
    cv2.imwrite(os.path.join(ROOT, f"_diag9_k{k}_t{T}.png"), outs[-1])

strip = np.concatenate(outs, axis=1)
cv2.imwrite(os.path.join(ROOT, "_diag9_all.png"), strip)
print("wrote _diag9_all.png")

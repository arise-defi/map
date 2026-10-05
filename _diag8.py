"""Visualise optical instances with the NEW semantic-aware nature veto."""
import math
import os
import sys

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
is_nature = np.isin(cls_map, list(g["ADE_NATURE_IDS"]))
rf, gf, bf = (img[:, :, i].astype(np.float32) for i in range(3))
exg_green = (2.0 * gf - rf - bf) > 14.0
nature = is_nature | (exg_green & ~is_build)
nature_u8 = nature.astype(np.uint8) * 255
print(f"nature veto coverage: {nature.mean():.2f}")

masks = g["optical_roof_instances"](img, nature_u8)
union = np.zeros((h, w), np.uint8)
for m in masks:
    union = cv2.bitwise_or(union, m)
print(f"instances: {len(masks)}, union px: {int((union>0).sum())} ({(union>0).mean()*100:.1f}%)")

# component stats for the big ones
n, lab = cv2.connectedComponents(union)
sizes = np.bincount(lab.ravel())
order = np.argsort(sizes[1:])[::-1] + 1
print("biggest components (px / m2 / bbox):")
for cid in order[1:12]:
    if sizes[cid] < min_px:
        break
    ys, xs = np.where(lab == cid)
    print(f"  {sizes[cid]:8d} px {sizes[cid]*gsd*gsd:7.1f} m2 "
          f"bbox=({xs.min()},{ys.min()},{xs.max()-xs.min()},{ys.max()-ys.min()})")

vis = img.copy()
vis[union > 0] = (vis[union > 0] * 0.45 + np.array([255, 40, 200]) * 0.55).astype(np.uint8)
# contour outlines of components >= min area
for cid in order[1:]:
    if sizes[cid] < min_px:
        break
    cm = np.uint8(lab == cid) * 255
    cnts, _ = cv2.findContours(cm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(vis, cnts, -1, (255, 255, 0), 4)

scale = 0.22
cv2.imwrite(os.path.join(ROOT, "_diag8_instances.png"),
            cv2.resize(vis, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA))
cv2.imwrite(os.path.join(ROOT, "_diag8_union.png"),
            cv2.resize(union, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA))
cv2.imwrite(os.path.join(ROOT, "_diag8_nature.png"),
            cv2.resize(nature_u8, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA))
print("wrote _diag8_*.png")

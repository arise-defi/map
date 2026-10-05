"""Save visualisations of semantic (scale 3) and optical masks."""
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
sem = g["segformer_semantic_maps"](img, pixel_scale=3)
cls_map = sem["cls"]
is_build = np.isin(cls_map, list(g["ADE_BUILDING_IDS"]))

rf, gf, bf = (img[:, :, i].astype(np.float32) for i in range(3))
exg = 2.0 * gf - rf - bf
nature = (exg > 14.0) | np.isin(cls_map, list(g["ADE_NATURE_IDS"]))
optical = g["optical_roof_instances"](img, nature.astype(np.uint8) * 255)
opt_union = np.zeros((h, w), np.uint8)
for m in optical:
    opt_union = cv2.bitwise_or(opt_union, m)

vis = img.copy()
vis[is_build] = (vis[is_build] * 0.45 + np.array([60, 90, 255]) * 0.55).astype(np.uint8)
vis[opt_union > 0] = (vis[opt_union > 0] * 0.45 + np.array([255, 40, 200]) * 0.55).astype(np.uint8)
print(f"semantic build px: {int(is_build.sum())} ({is_build.mean()*100:.1f}%)  "
      f"optical px: {int((opt_union>0).sum())} ({(opt_union>0).mean()*100:.1f}%)")
n_cc, lab = cv2.connectedComponents(np.uint8(is_build) * 255)
sizes = np.bincount(lab.ravel())[1:]
print(f"semantic components: {n_cc-1}, biggest: {np.sort(sizes)[::-1][:6].tolist()}")

scale = 0.22
cv2.imwrite(os.path.join(ROOT, "_diag_masks.png"),
            cv2.resize(vis, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA))
cv2.imwrite(os.path.join(ROOT, "_diag_sem.png"),
            cv2.resize(np.uint8(is_build) * 255, (int(w * scale), int(h * scale)),
                       interpolation=cv2.INTER_AREA))
cv2.imwrite(os.path.join(ROOT, "_diag_opt.png"),
            cv2.resize(opt_union, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA))
print("wrote _diag_masks.png, _diag_sem.png, _diag_opt.png")

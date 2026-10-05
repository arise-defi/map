"""Per-ROI SegFormer class distribution on Test.tif.

Optical texture/coherence cues turned out NOT to separate roofs from pavement
(a smooth asphalt road is as smooth as a painted metal roof: the grown regions
covered 57% of the frame).  This measures what the semantic prior actually says
for each known surface, to decide whether proposals should be semantics-led.
"""
import importlib.util
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

from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation

print("[*] loading nvidia/segformer-b0-finetuned-ade-512-512 ...")
model = SegformerForSemanticSegmentation.from_pretrained(
    "nvidia/segformer-b0-finetuned-ade-512-512")
model.eval()
names = {int(k): str(v) for k, v in model.config.id2label.items()}
g = tp.load_funcs({"seg_model": model,
                   "seg_processor": SegformerImageProcessor.from_pretrained(
                       "nvidia/segformer-b0-finetuned-ade-512-512")})

img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
h, w = img.shape[:2]
gsd = 0.0259
sem = g["segformer_semantic_maps"](img, pixel_scale=3)
cls = sem["cls"]
print(f"[*] cls map {cls.shape}, build_prob mean {sem['build_prob'].mean():.3f}")

for tag, rois in (("ROOF", tp.ROI_ROOFS), ("bg  ", tp.ROI_BG)):
    for name, (y0, y1, x0, x1) in rois.items():
        sub = cls[y0:y1, x0:x1].ravel()
        ids, counts = np.unique(sub, return_counts=True)
        order = np.argsort(-counts)[:4]
        tot = max(1, sub.size)
        txt = ", ".join(f"{names.get(int(i), i)}({int(i)})={counts[j] * 100 / tot:.0f}%"
                        for j, i in zip(order, ids[order]))
        print(f"  [{tag}] {name:17s} {txt}")

# How separable is building from road for the whole frame?
b = np.isin(cls, list(g["ADE_BUILDING_IDS"]))
r = np.isin(cls, list(g["ADE_ROAD_IDS"]))
print(f"[*] frame: building {b.mean() * 100:.1f}%, road/street/sidewalk/earth "
      f"{r.mean() * 100:.1f}%")
for tag, rois in (("ROOF", tp.ROI_ROOFS), ("bg  ", tp.ROI_BG)):
    for name, (y0, y1, x0, x1) in rois.items():
        sb, sr = b[y0:y1, x0:x1], r[y0:y1, x0:x1]
        print(f"  [{tag}] {name:17s} build={sb.mean() * 100:5.1f}%  road={sr.mean() * 100:5.1f}%")

vis = np.zeros(cls.shape, np.uint8)
vis[b] = 255
cv2.imwrite(os.path.join(ROOT, "_diag18_build.png"),
            cv2.resize(vis, (int(w / 3), int(h / 3)), interpolation=cv2.INTER_NEAREST))
print("[+] wrote _diag18_build.png (white = building class)")

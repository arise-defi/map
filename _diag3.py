"""Test SegFormer at reduced scales (building-scale context) on Test.tif."""
import math
import os
import sys
from collections import Counter

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
id2label = {int(k): v for k, v in model.config.id2label.items()}
g = load_funcs({"seg_processor": proc, "seg_model": model})

img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
h, w = img.shape[:2]

ROIS = {
    "green roof (top)":  (60, 480, 100, 750),
    "rust roof":         (780, 1080, 200, 800),
    "dark green roof":   (1360, 1550, 300, 880),
    "gray roof":         (1750, 2400, 300, 1150),
    "road (right)":      (400, 3000, 1000, 1150),
    "trees (left)":      (350, 700, 20, 200),
    "yard/open (btm)":   (2950, 3130, 350, 700),
}
NATURE = {4, 9, 16, 17, 21, 26, 34, 46, 60, 91}
BUILD = {0, 1, 25, 48, 84}
ROAD = {6, 11, 13, 52}

for scale in (2, 3, 4):
    small = cv2.resize(img, (w // scale, h // scale), interpolation=cv2.INTER_AREA)
    sem = g["segformer_semantic_maps"](small)
    cls = cv2.resize(sem["cls"].astype(np.uint8), (w, h), interpolation=cv2.INTER_NEAREST)
    print(f"\n=== scale 1/{scale} (tile = {512 * scale}m*0.0259 = {512 * scale * 0.0259:.0f} m context) ===")
    for name, (y0, y1, x0, x1) in ROIS.items():
        sub = cls[y0:y1, x0:x1].ravel()
        cnt = Counter(sub.tolist())
        top = ", ".join(f"{id2label.get(k, k)}={v * 100 // sub.size}%" for k, v in cnt.most_common(4))
        nat = float(np.isin(sub, list(NATURE)).mean())
        bld = float(np.isin(sub, list(BUILD)).mean())
        rdc = float(np.isin(sub, list(ROAD)).mean())
        print(f"  {name:20s} nat={nat:.2f} bld={bld:.2f} road={rdc:.2f} | {top}")

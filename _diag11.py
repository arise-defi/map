"""Per-ROI SegFormer coverage at several context scales (numeric only).

For every known surface ROI: mean P(building), P(road), P(nature). Tells us the
ceiling of the semantic prior before we decide which source should lead.
"""
import os

import numpy as np
import cv2
import torch
from PIL import Image
from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation

ROOT = r"c:\Users\vinod\Desktop\map\map"
img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))

BUILD = [0, 1, 25, 48, 84]
ROAD = [6, 11, 13, 52]
NATURE = [4, 9, 16, 17, 21, 26, 34, 46, 60, 91]

proc = SegformerImageProcessor.from_pretrained("nvidia/segformer-b0-finetuned-ade-512-512")
model = SegformerForSemanticSegmentation.from_pretrained(
    "nvidia/segformer-b0-finetuned-ade-512-512")
model.eval()

ROIS = {  # y0, y1, x0, x1
    "green roof":      (80, 420, 120, 780),
    "rust roof":       (800, 1060, 220, 780),
    "dark green roof": (1380, 1530, 320, 860),
    "gray roof":       (1750, 2350, 300, 1100),
    "road (right)":    (500, 2800, 1020, 1140),
    "dirt yard":       (600, 720, 1180, 1270),
    "dirt left strip": (1800, 2400, 30, 90),
    "trees":           (550, 750, 30, 180),
    "shadow edge":     (2450, 2550, 1160, 1230),
}


def prob_maps(work):
    """Overlap-averaged P(build), P(road), P(nature) at the working resolution."""
    h, w = work.shape[:2]
    tile, stride = 512, 416
    ys = list(range(0, max(1, h - tile + 1), stride))
    if ys and ys[-1] + tile < h:
        ys.append(h - tile)
    xs = list(range(0, max(1, w - tile + 1), stride))
    if xs and xs[-1] + tile < w:
        xs.append(w - tile)
    acc = np.zeros((3, h, w), np.float32)
    cnt = np.zeros((h, w), np.float32)
    groups = np.zeros(len(model.config.id2label), bool)
    groups[BUILD] = True
    ids = {1: BUILD, 2: ROAD, 3: NATURE}
    n_done = 0
    for sy in ys:
        for sx in xs:
            crop = work[sy:sy + tile, sx:sx + tile]
            if crop.shape[0] < tile or crop.shape[1] < tile:
                crop = cv2.copyMakeBorder(crop, 0, tile - crop.shape[0], 0,
                                          tile - crop.shape[1], cv2.BORDER_REPLICATE)
            inp = proc(images=Image.fromarray(crop), return_tensors="pt")
            with torch.no_grad():
                out = model(**inp)
            p = torch.nn.functional.interpolate(out.logits, size=(tile, tile),
                                                mode="bilinear", align_corners=False)
            p = torch.softmax(p, dim=1)[0].numpy()
            for gi, gids in ids.items():
                m = p[gids, :, :].sum(axis=0).astype(np.float32)
                acc[gi - 1, sy:sy + tile, sx:sx + tile] += m[:h - sy, :w - sx]
            cnt[sy:sy + tile, sx:sx + tile] += 1.0
            n_done += 1
            print(f"  tile {n_done}/{len(ys) * len(xs)} @({sx},{sy})", flush=True)
    cnt = np.maximum(cnt, 1e-6)
    return acc / cnt


for scale in (1, 2, 3):
    hs, ws = img.shape[0] // scale, img.shape[1] // scale
    work = cv2.resize(img, (ws, hs), interpolation=cv2.INTER_AREA) if scale > 1 else img
    print(f"=== scale 1/{scale}  work={work.shape[:2]}", flush=True)
    maps = prob_maps(work)
    if scale > 1:
        maps = np.stack([cv2.resize(m, (img.shape[1], img.shape[0]),
                                    interpolation=cv2.INTER_LINEAR) for m in maps])
    print(f"{'ROI':17s}{'P(bld)':>8}{'P(road)':>9}{'P(nat)':>8}   P(b)>=0.5")
    for name, (y0, y1, x0, x1) in ROIS.items():
        b = maps[0, y0:y1, x0:x1]
        r = maps[1, y0:y1, x0:x1]
        n = maps[2, y0:y1, x0:x1]
        print(f"{name:17s}{b.mean():8.2f}{r.mean():9.2f}{n.mean():8.2f}"
              f"   {(b >= 0.5).mean() * 100:5.1f}%")

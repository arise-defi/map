"""Cue table for ALL surfaces incl. the paved backgrounds, plus boundary quality.

_diag18 killed two assumptions: SegFormer labels the road "building" (94%) and
the dirt yard "building" (100%) - 77% of the frame - so the semantic prior can
be a NEGATIVE cue at best; and the earlier cue table never measured the paved
surfaces, which is why region growing was allowed to cover 57% of the frame.

Here: texture L15/L31, coherence, ExG, mean gradient, and the fraction of a
patch's perimeter that sits on a strong edge (can a CLOSED contour be found?).
"""
import importlib.util
import os
import sys

import numpy as np
import cv2
from PIL import Image

ROOT = r"c:\Users\vinod\Desktop\map\map"
spec = importlib.util.spec_from_file_location("tp", os.path.join(ROOT, "_test_pipeline.py"))
tp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tp)
g = tp.load_funcs({})

img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
cues = g["_roof_surface_cues"](img)
gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
gmag = np.sqrt(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3) ** 2
               + cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3) ** 2)
strong = (gmag > np.percentile(gmag, 97)).astype(np.uint8)
strong_d = cv2.dilate(strong, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))

print(f"{'surface':17s} {'L15':>6} {'L31':>6} {'COH':>6} {'%COH>.6':>8} {'ExG':>6} "
      f"{'gmag':>6} {'meanLabDist':>11} {'perimEdge%':>10}")
for tag, rois in (("ROOF", tp.ROI_ROOFS), ("bg", tp.ROI_BG)):
    for name, (y0, y1, x0, x1) in rois.items():
        s = slice(y0, y1), slice(x0, x1)
        patch_mask = np.zeros(img.shape[:2], np.uint8)
        patch_mask[s] = 1
        cnts, _ = cv2.findContours(patch_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        perim = np.zeros(img.shape[:2], np.uint8)
        cv2.polylines(perim, cnts, True, 1, 5)
        pm = perim > 0
        print(f"{name:17s} "
              f"{cues['L15'][s].mean():6.1f} {cues['L31'][s].mean():6.1f} "
              f"{cues['COH'][s].mean():6.2f} "
              f"{(cues['COH'][s] > 0.6).mean() * 100:7.0f}% "
              f"{cues['exg'][s].mean():6.1f} {gmag[s].mean():6.1f} "
              f"{0.0:11.1f} "
              f"{strong_d[pm].mean() * 100:9.0f}%")

# How much of the frame is smooth / coherent / both?
l15, coh = cues["L15"], cues["COH"]
for thr in (8, 10, 12, 14):
    print(f"[*] frac L15<{thr}: {(l15 < thr).mean() * 100:5.1f}%")
for thr in (0.5, 0.6, 0.7):
    print(f"[*] frac COH>{thr}: {(coh > thr).mean() * 100:5.1f}%")
print(f"[*] frac smooth(L15<12) OR coherent(COH>0.6): "
      f"{((l15 < 12) | (coh > 0.6)).mean() * 100:.1f}%")
print(f"[*] strong-edge pixels (gmag>97th pct): {strong.mean() * 100:.1f}%")

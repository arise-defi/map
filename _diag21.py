"""Lab separability: within-surface spread vs between-surface distance.

Growth of one roof seed must stop at the wall/shadow/ground next to it, so the
colour tolerance has to sit ABOVE the internal spread of a roof and BELOW the
smallest distance to any neighbouring surface.  This measures both numbers.
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

img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB).astype(np.float32)

names, medians, p95 = [], [], []
for tag, rois in (("ROOF", tp.ROI_ROOFS), ("bg", tp.ROI_BG)):
    for name, (y0, y1, x0, x1) in rois.items():
        patch = lab[y0:y1, x0:x1].reshape(-1, 3)
        med = np.median(patch, axis=0)
        d = np.sqrt(((patch - med) ** 2).sum(axis=1))
        names.append(name)
        medians.append(med)
        p95.append((np.percentile(d, 50), np.percentile(d, 95)))
        print(f"  [{tag}] {name:17s} Lab=({med[0]:5.1f},{med[1]:5.1f},{med[2]:5.1f}) "
              f"spread p50={p95[-1][0]:5.1f} p95={p95[-1][1]:5.1f}")

print("\npairwise Lab distance between surface medians:")
print("                    " + "".join(f"{n[:9]:>10}" for n in names))
for i, n in enumerate(names):
    row = f"{n[:19]:20s}"
    for j in range(len(names)):
        d = float(np.sqrt(((medians[i] - medians[j]) ** 2).sum()))
        row += f"{d:10.1f}"
    print(row)

gaps = [(float(np.sqrt(((medians[i] - medians[j]) ** 2).sum())), names[i], names[j])
        for i in range(len(names)) for j in range(i + 1, len(names))]
gaps.sort()
print("\nsmallest separations (tolerance must stay below these):")
for d, a, b in gaps[:8]:
    print(f"  {a} <-> {b}: {d:.1f}")
print(f"\nlargest internal spread (p95): {max(p[1] for p in p95):.1f}")

"""Validate the redesigned building-footprint pipeline on Test.tif.

Extracts the REAL functions from colab_server.py via AST (no server deps) and
runs them on the user's GeoTIFF, then writes overlay PNGs for inspection.

Usage:  python _test_pipeline.py             # optical-only (SegFormer stubbed)
        python _test_pipeline.py --segformer # with real SegFormer-B0 prior
"""
import ast
import json
import math
import os
import sys
from typing import Any, Dict, List, Optional

import numpy as np
import cv2
import torch
from PIL import Image

ROOT = r"c:\Users\vinod\Desktop\map\map"
SERVER = os.path.join(ROOT, "colab_server.py")

# Surface patches measured by _diag7/_diag14 (y0, y1, x0, x1) - used as a
# numeric check: roofs should be covered, backgrounds should not.
ROI_ROOFS = {"green roof": (80, 420, 120, 780), "rust roof": (800, 1060, 220, 780),
             "dark green roof": (1380, 1530, 320, 860),
             "gray roof": (1750, 2350, 300, 1100)}
ROI_BG = {"road (right)": (500, 2800, 1020, 1140), "dirt yard": (600, 720, 1180, 1270),
          "dirt left strip": (1800, 2400, 30, 90), "trees": (550, 750, 30, 180)}

WANTED = {
    "_tile_starts", "_crop_pad", "segformer_semantic_maps",
    "_split_into_instances", "_split_crop",
    "_roof_surface_cues", "semantic_and_nature_masks", "_grow_roof_region",
    "optical_roof_instances",
    "_dominant_street_angle", "_regularize_polygon", "_eval_instance",
    "_candidate_confidence", "_dedupe_candidates",
    "calculate_polygon_area_sqm", "classify_building_by_area",
}


def load_funcs(extra_globals: dict) -> dict:
    src = open(SERVER, encoding="utf-8").read()
    tree = ast.parse(src)
    nodes = [n for n in tree.body
             if isinstance(n, ast.FunctionDef) and n.name in WANTED]
    missing = WANTED - {n.name for n in nodes}
    if missing:
        raise SystemExit(f"MISSING FUNCTIONS in server: {sorted(missing)}")
    ns = {
        "np": np, "cv2": cv2, "math": math, "Image": Image,
        "List": List, "Optional": Optional, "Dict": Dict, "Any": Any,
        "ADE_BUILDING_IDS": {0, 1, 25, 48, 84},
        "ADE_ROAD_IDS": {6, 11, 13, 52},
        "ADE_NATURE_IDS": {4, 9, 16, 17, 21, 26, 34, 46, 60, 91},
        "SEM_BATCH_SIZE": 1,
        "SAM2_AVAILABLE": False, "SAMGEO_MODEL": None,
        "seg_model": None, "seg_processor": None, "device": "cpu",
        "torch": torch,
    }
    ns.update(extra_globals)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), SERVER, "exec"), ns)
    return ns


def collect(ns, masks, nature_u8, is_road, is_build, min_area_px, max_area_px,
            optical_union, sem_union, require_agree=False):
    """Mirror of the endpoint's _collect() closure."""
    out = []
    agree = optical_union if sem_union is None else cv2.bitwise_or(optical_union, sem_union)
    for m in masks:
        sel = m > 0
        n_px = int(np.count_nonzero(sel))
        if n_px == 0:
            continue
        if require_agree:
            inter = int(np.count_nonzero(sel & (agree > 0)))
            if inter / n_px < 0.20:
                continue
        cand = ns["_eval_instance"](m, nature_u8, is_road, is_build, min_area_px, max_area_px)
        if cand is None:
            continue
        area_i = max(1.0, float(n_px))
        in_o = float(np.count_nonzero(sel & (optical_union > 0))) / area_i >= 0.30
        in_s = (sem_union is not None) and float(np.count_nonzero(sel & (sem_union > 0))) / area_i >= 0.30
        source = "both" if (in_o and in_s) else ("optical" if in_o else ("semantic" if in_s else "sam2"))
        ns["_candidate_confidence"](cand, source)
        out.append(cand)
    return out


def run(use_segformer: bool) -> None:
    extra = {}
    if use_segformer:
        from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation
        print("[*] loading nvidia/segformer-b0-finetuned-ade-512-512 ...")
        extra["seg_processor"] = SegformerImageProcessor.from_pretrained(
            "nvidia/segformer-b0-finetuned-ade-512-512")
        model = SegformerForSemanticSegmentation.from_pretrained(
            "nvidia/segformer-b0-finetuned-ade-512-512")
        model.eval()
        extra["seg_model"] = model
    g = load_funcs(extra)

    img = np.array(Image.open(os.path.join(ROOT, "Test.tif")).convert("RGB"))
    h, w = img.shape[:2]
    gsd = math.sqrt(33.0483984 * 81.35190 / (w * h))       # from GeoTIFF bbox
    print(f"[*] Test.tif {w}x{h}, GSD {gsd:.4f} m/px")

    # Semantic prior + texture-gated nature veto: call the production helper
    # itself, so the numbers below describe the endpoint and not a copy of it.
    sem_scale = int(max(1, min(8, round(0.075 / gsd)))) if gsd else 1
    sem = g["segformer_semantic_maps"](img, pixel_scale=sem_scale) \
        if use_segformer else None
    ctx = g["semantic_and_nature_masks"](img, sem)
    sem_cls = ctx["sem_cls"]
    is_road, is_build = ctx["is_road"], ctx["is_build"]
    nature_u8 = ctx["nature_u8"]
    print(f"[*] SegFormer prior in use: {'ON' if sem_cls is not None else 'OFF'} "
          f"(tile scale 1/{sem_scale})")

    # Sweep parameters without editing the code:  MAP_OPTS="{\"grow_m\":1.5}"
    opts = json.loads(os.environ.get("MAP_OPTS", "{}"))
    if opts:
        print(f"[*] parameter overrides: {opts}")
    optical_masks = g["optical_roof_instances"](img, nature_u8, gsd_m=gsd, **opts)

    optical_union = np.zeros((h, w), np.uint8)
    for m in optical_masks:
        optical_union = cv2.bitwise_or(optical_union, m)

    sem_masks: List[np.ndarray] = []
    sem_union = None
    if sem_cls is not None:
        sm = np.uint8(is_build) * 255
        sm = cv2.morphologyEx(sm, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
        sm = cv2.morphologyEx(sm, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))
        n_cc, labels_cc = cv2.connectedComponents(sm)
        for cid in range(1, n_cc):
            comp = np.uint8(labels_cc == cid) * 255
            if np.count_nonzero(comp) >= 60:
                sem_masks.extend(g["_split_into_instances"](comp))
        sem_union = np.uint8(is_build) * 255

    print(f"[*] optical instances: {len(optical_masks)}, semantic instances: {len(sem_masks)}")

    sqm_per_px = gsd * gsd
    min_area_px = max(60, int(4.0 / sqm_per_px))
    max_area_px = int(0.35 * w * h)
    min_area_px = min(min_area_px, max(49, max_area_px))
    print(f"[*] area filter: {min_area_px}..{max_area_px} px "
          f"({min_area_px * sqm_per_px:.1f} m2 min)")

    cands = collect(g, optical_masks, nature_u8, is_road, is_build,
                    min_area_px, max_area_px, optical_union, sem_union)
    # SEM_MASK_COLLECTION_DISABLED_FOR_EXPERIMENT
    cands = g["_dedupe_candidates"](cands)
    dominant = g["_dominant_street_angle"]([c["contour"] for c in cands])
    print(f"[*] dominant street angle: {dominant}")

    final = []
    for c in cands:
        poly = g["_regularize_polygon"](c["contour"], c["rectangularity"], dominant)
        if len(poly) >= 3:
            c["poly"] = poly
            final.append(c)

    report(img, final, gsd, use_segformer)


def report(img: np.ndarray, final: List[dict], gsd: float, used_seg: bool) -> None:
    """Print per-building stats and write the overlay PNG."""
    h, w = img.shape[:2]
    vis = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    layer = np.zeros_like(vis)   # magenta fill layer (transparent outside)

    print(f"\n=== {len(final)} building footprints "
          f"({'SegFormer+Optical' if used_seg else 'Optical-only'}) ===")
    total = 0.0
    for i, c in enumerate(final, 1):
        area_m2 = c["area_px"] * gsd * gsd
        total += area_m2
        cx, cy = c["centroid"]
        bx0, by0, bw, bh = cv2.boundingRect(c["poly"].astype(np.int32))
        print(f"  #{i}: {area_m2:8.1f} m2  centroid=({cx:.0f},{cy:.0f}) "
              f"bbox=({bx0},{by0},{bw},{bh}) "
              f"rect={c['rectangularity']:.2f} aspect={c['aspect']:.1f} "
              f"road={c['road_frac']:.2f} build={c['build_frac']:.2f} "
              f"nature={c['nature_frac']:.2f} src={c['source']} conf={c['confidence']}")
        cv2.fillPoly(layer, [c["poly"]], (255, 0, 255))
    print(f"  total roof area: {total:.1f} m2")

    # Numeric accuracy check against the measured surface patches: roofs should
    # read high, the backgrounds low (no image inspection needed).
    cover = np.zeros(img.shape[:2], np.uint8)
    for c in final:
        cv2.fillPoly(cover, [c["poly"].astype(np.int32)], 255)
    print("\n=== coverage of measured surface patches ===")
    for name, (y0, y1, x0, x1) in {**ROI_ROOFS, **ROI_BG}.items():
        tag = "ROOF" if name in ROI_ROOFS else "bg  "
        print(f"  [{tag}] {name:17s}{cover[y0:y1, x0:x1].mean() / 255 * 100:7.1f}%")

    cv2.addWeighted(layer, 0.35, vis, 0.65, 0, vis)
    for i, c in enumerate(final, 1):
        pts = c["poly"].reshape(-1, 1, 2)
        cv2.polylines(vis, [pts], True, (255, 0, 255), 3, cv2.LINE_AA)
        cx, cy = c["centroid"]
        cv2.circle(vis, (int(cx), int(cy)), 8, (0, 255, 255), -1, cv2.LINE_AA)
        cv2.putText(vis, f"#{i}", (int(cx) + 10, int(cy) - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.6, (255, 0, 255), 3, cv2.LINE_AA)

    suffix = "segformer" if used_seg else "optical"
    out_full = os.path.join(ROOT, f"_overlay_{suffix}.png")
    cv2.imwrite(out_full, vis)

    scale = 700.0 / max(h, w)
    small = cv2.resize(vis, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    out_small = os.path.join(ROOT, f"_overlay_{suffix}_small.png")
    cv2.imwrite(out_small, small)
    # Zoom crops (native res) around detected areas for accuracy inspection
    for name, (y0, y1, x0, x1) in {
        "top": (0, 1000, 0, 1276), "mid": (1000, 2000, 0, 1276),
        "btm": (2000, 3141, 0, 1276),
    }.items():
        crop = vis[max(0, y0):min(h, y1), max(0, x0):min(w, x1)]
        cv2.imwrite(os.path.join(ROOT, f"_crop_{suffix}_{name}.png"), crop)
    print(f"[+] wrote {out_full}")
    print(f"[+] wrote {out_small}")


if __name__ == "__main__":
    run("--segformer" in sys.argv)


# @@CHUNK_END@@

# ---------------------------------------------------------------------------
# Optional: SAM2 / segment-geospatial (auto-segmentation refinement)
# ---------------------------------------------------------------------------
SAM2_AVAILABLE = False
SAMGEO_MODEL = None
try:
    from samgeo import SamGeo
    SAM2_AVAILABLE = True
    print("[+] segment-geospatial (SAM2) is available")
except ImportError:
    print("[!] segment-geospatial not installed. Install with: pip install segment-geospatial")


# ---------------------------------------------------------------------------
# Raster Upload Building Detection Endpoint — REDESIGNED for accurate footprints
#
# Why the old pipeline produced wrong footprints:
#   * this route was registered TWICE, so only the legacy handler ever ran;
#   * its CV stage turned EVERY Canny contour into a min-area RECTANGLE with an
#     area-only filter -> roads, shadows, vehicles and open yards became
#     "buildings" (the misplaced rectangle seen over the TIF);
#   * the image was squeezed to 1024px, destroying roof boundaries;
#   * no semantic model was consulted for uploaded rasters.
#
# The redesigned pipeline:
#   1. rasterio loads the GeoTIFF (affine transform + CRS kept for exact georef)
#   2. SegFormer-B0 (ADE-20K) semantic prior at NATIVE resolution, tiled
#      -> building/wall/house/skyscraper/tower vs road/sidewalk vs nature
#   3. optical rooftop segmentation -> CLAHE + bilateral, ExG vegetation veto,
#      adaptive thresholds, morphology, connected components and a
#      distance-transform watershed that splits touching roofs
#   4. component filters: nature/road veto, GSD-scaled area, aspect, solidity
#   5. regularization: street-angle aligned rectangles for compact roofs,
#      approxPolyDP polygons for irregular roofs, centroid de-duplication
#   6. optional SAM2 candidates (reprojected correctly, same filters applied)
#   7. pixel -> CRS -> WGS84 via the raster affine + per-vertex transform
# ---------------------------------------------------------------------------

class RasterUploadRequest(BaseModel):
    image_base64: str  # Base64 encoded image data (GeoTIFF, PNG, JPEG)
    filename: Optional[str] = "upload.tif"
    # Optional geo-bounds — used only when the raster carries no CRS
    west: Optional[float] = None
    south: Optional[float] = None
    east: Optional[float] = None
    north: Optional[float] = None


# ADE-20K class ids predicted by SegFormer-B0 (nvidia/segformer-b0-finetuned-ade-512-512)
ADE_BUILDING_IDS = {0, 1, 25, 48, 84}                        # wall, building, house, skyscraper, tower
ADE_ROAD_IDS = {6, 11, 13, 52}                               # road, sidewalk, earth, land
ADE_NATURE_IDS = {4, 9, 16, 17, 21, 26, 34, 46, 60, 91}      # tree, grass, mountain, plant, water, sea, rock, sand, lake, barren

SEM_BATCH_SIZE = 1  # SegFormer forward passes per batch (512x512 tiles)


# ---------------------------------------------------------------------------
# Tiled SegFormer semantic inference (native resolution)
# ---------------------------------------------------------------------------
def _tile_starts(dim: int, tile: int, stride: int):
    """Start offsets covering [0, dim) with `tile`-sized windows of `stride`."""
    if dim <= tile:
        return [0]
    starts = list(range(0, dim - tile + 1, stride))
    if starts[-1] != dim - tile:
        starts.append(dim - tile)
    return starts


def _crop_pad(img: np.ndarray, sx: int, sy: int, tile: int) -> np.ndarray:
    """Crop a tile at (sx, sy), edge-padding when the image is smaller than `tile`."""
    h, w = img.shape[:2]
    crop = img[sy:sy + tile, sx:sx + tile]
    if crop.shape[0] == tile and crop.shape[1] == tile:
        return crop
    out = np.empty((tile, tile, img.shape[2]), dtype=img.dtype)
    ch, cw = crop.shape[0], crop.shape[1]
    out[:ch, :cw] = crop
    if ch < tile:
        out[ch:, :cw] = crop[ch - 1:ch, :]
    if cw < tile:
        out[:, cw:] = out[:, cw - 1:cw]
    return out


def segformer_semantic_maps(img_rgb: np.ndarray, tile_size: int = 512, overlap: int = 96):
    """Run SegFormer-B0 over `img_rgb` in overlapping 512px tiles.

    Returns {"cls": int32 (H,W) ADE class ids,
             "build_prob": float32 (H,W) probability of building-side classes}
    or None when the model is unavailable / inference fails.
    """
    if seg_model is None or seg_processor is None:
        return None
    try:
        h, w = img_rgb.shape[:2]
        tile = int(tile_size)
        stride = tile - int(overlap)
        xs = _tile_starts(w, tile, stride)
        ys = _tile_starts(h, tile, stride)

        cls_map = np.zeros((h, w), dtype=np.int32)
        build_prob = np.zeros((h, w), dtype=np.float32)
        build_ids = sorted(ADE_BUILDING_IDS)
        ox, oy = (tile - stride) // 2, (tile - stride) // 2

        jobs = []
        for yi, sy in enumerate(ys):
            for xi, sx in enumerate(xs):
                jobs.append((xi, yi, sx, sy))

        for start in range(0, len(jobs), SEM_BATCH_SIZE):
            batch = jobs[start:start + SEM_BATCH_SIZE]
            pil_tiles = [Image.fromarray(_crop_pad(img_rgb, sx, sy, tile)) for _, _, sx, sy in batch]
            inputs = seg_processor(images=pil_tiles, return_tensors="pt").to(device)
            with torch.no_grad():
                outputs = seg_model(**inputs)
            logits = torch.nn.functional.interpolate(
                outputs.logits, size=(tile, tile), mode="bilinear", align_corners=False
            )
            probs = torch.softmax(logits, dim=1)
            batch_cls = probs.argmax(dim=1).cpu().numpy().astype(np.int32)
            batch_bp = probs[:, build_ids, :, :].sum(dim=1).cpu().numpy().astype(np.float32)

            for bi, (xi, yi, sx, sy) in enumerate(batch):
                # Core region owned by this tile -> seamless mosaic, no seams
                x0 = 0 if xi == 0 else sx + ox
                x1 = w if xi == len(xs) - 1 else xs[xi + 1] + ox
                y0 = 0 if yi == 0 else sy + oy
                y1 = h if yi == len(ys) - 1 else ys[yi + 1] + oy
                lx0, ly0 = x0 - sx, y0 - sy
                lx1, ly1 = x1 - sx, y1 - sy
                cls_map[y0:y1, x0:x1] = batch_cls[bi, ly0:ly1, lx0:lx1]
                build_prob[y0:y1, x0:x1] = batch_bp[bi, ly0:ly1, lx0:lx1]

        return {"cls": cls_map, "build_prob": build_prob}
    except Exception as e:
        print(f"[Upload] SegFormer inference failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Optical rooftop segmentation + watershed instance splitting
# ---------------------------------------------------------------------------
def _split_into_instances(comp_mask: np.ndarray) -> List[np.ndarray]:
    """Split one connected roof region into instances with a distance-transform
    watershed (h-maxima seeds). Returns a list of uint8 masks."""
    comp_bin = comp_mask > 0
    area = int(np.count_nonzero(comp_bin))
    if area < 500:
        return [comp_mask]

    dist = cv2.distanceTransform(comp_mask, cv2.DIST_L2, 5)
    dist_s = cv2.GaussianBlur(dist, (5, 5), 0)
    d_max = float(dist_s.max())
    if d_max < 4.0:
        return [comp_mask]

    # Regional maxima (h-maxima) = one seed per roof plateau
    ksize = max(5, int(round(0.20 * math.sqrt(area))) | 1)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksize, ksize))
    h = max(2.0, 0.10 * d_max)
    peaks = np.uint8((dist_s >= (cv2.dilate(dist_s, k) - h)) & (dist_s > 0.45 * d_max)) * 255
    n_seeds, seed_labels = cv2.connectedComponents(peaks)
    if n_seeds < 2:
        return [comp_mask]

    # Elevation map: strong optical boundaries stop the flood
    edges = cv2.Canny(cv2.GaussianBlur(comp_mask, (3, 3), 0), 40, 120)
    elevation = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)

    markers = np.zeros(comp_mask.shape, dtype=np.int32)
    markers[~comp_bin] = 1                              # background label
    seed_inside = (seed_labels > 0) & comp_bin
    markers[seed_inside] = seed_labels[seed_inside] + 1  # seeds are >= 2
    markers = cv2.watershed(elevation, markers)

    instances = []
    for sl in range(2, int(seed_labels.max()) + 2):
        inst = np.uint8((markers == sl) & comp_bin) * 255
        if np.count_nonzero(inst) >= 30:
            instances.append(inst)
    return instances if instances else [comp_mask]


def optical_roof_instances(img_rgb: np.ndarray, nature_veto: np.ndarray) -> List[np.ndarray]:
    """Classical optical rooftop extraction.

    nature_veto: uint8 (H,W) 255 where vegetation/water/etc. must be ignored.
    Returns a list of uint8 instance masks.
    """
    lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    clahe_l = clahe.apply(lab[:, :, 0])
    # Bilateral removes roof-surface speckle (A/C units, gravel) but keeps edges
    filtered = cv2.bilateralFilter(clahe_l, d=7, sigmaColor=50, sigmaSpace=50)

    k3 = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    grad = cv2.morphologyEx(filtered, cv2.MORPH_GRADIENT, k3)
    edges = cv2.bitwise_or(cv2.Canny(filtered, 30, 95), cv2.Canny(grad, 20, 70))

    # Bright rooftop planes (fine + coarse neighbourhoods)
    th_fine = cv2.adaptiveThreshold(filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 21, -2)
    th_coarse = cv2.adaptiveThreshold(filtered, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 45, -3)
    roof = cv2.bitwise_or(th_fine, th_coarse)
    roof[nature_veto > 0] = 0

    # Cut along strong boundaries (building-to-road curbs, roof-to-roof gaps)
    edges_d = cv2.dilate(edges, k3, iterations=1)
    roof[edges_d > 0] = 0

    k5 = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    roof = cv2.morphologyEx(roof, cv2.MORPH_OPEN, k5, iterations=1)
    roof = cv2.morphologyEx(roof, cv2.MORPH_CLOSE, k5, iterations=2)
    roof[nature_veto > 0] = 0

    n, labels = cv2.connectedComponents(roof)
    instances = []
    for comp_id in range(1, n):
        comp = np.uint8(labels == comp_id) * 255
        if np.count_nonzero(comp) < 60:
            continue
        instances.extend(_split_into_instances(comp))
    return instances


# ---------------------------------------------------------------------------
# Candidate evaluation: semantic vetoes, shape filters, confidence
# ---------------------------------------------------------------------------
def _dominant_street_angle(contours) -> Optional[float]:
    """Dominant building orientation (0..90 deg) across all candidate contours."""
    angles = []
    for c in contours:
        if cv2.contourArea(c) <= 0:
            continue
        angles.append(cv2.minAreaRect(c)[2] % 90.0)
    if len(angles) < 5:
        return None
    hist, edges = np.histogram(angles, bins=18, range=(0, 90))
    i = int(np.argmax(hist))
    return float((edges[i] + edges[i + 1]) / 2.0)


def _regularize_polygon(cnt: np.ndarray, rectangularity: float, dominant_angle: Optional[float]) -> np.ndarray:
    """Emit a clean footprint polygon: an oriented rectangle snapped to the
    street grid for compact rectangular roofs, approxPolyDP otherwise."""
    rect = cv2.minAreaRect(cnt)
    (cx, cy), (rw, rh), angle = rect
    if rectangularity >= 0.75:
        adj = angle
        if dominant_angle is not None:
            norm_angle = angle % 90.0
            diff = (norm_angle - dominant_angle + 45) % 90 - 45
            if abs(diff) <= 14.0:
                adj = angle - diff          # snap to the neighbourhood grid
        return np.round(cv2.boxPoints(((cx, cy), (rw, rh), adj))).astype(np.int32)
    eps = max(1.0, 0.012 * cv2.arcLength(cnt, True))
    approx = cv2.approxPolyDP(cnt, eps, True)
    if len(approx) >= 3:
        return approx.reshape(-1, 2).astype(np.int32)
    return np.round(cv2.boxPoints(rect)).astype(np.int32)


def _eval_instance(mask: np.ndarray, nature_veto: np.ndarray, is_road, is_build,
                   min_area_px: int, max_area_px: int) -> Optional[dict]:
    """Score one candidate instance; return metrics or None when rejected."""
    sel = mask > 0
    area_px = int(np.count_nonzero(sel))
    if area_px < min_area_px or area_px > max_area_px:
        return None

    nature_frac = float(nature_veto[sel].mean())
    road_frac = float(is_road[sel].mean()) if is_road is not None else 0.0
    build_frac = float(is_build[sel].mean()) if is_build is not None else 0.0
    if nature_frac >= 0.40:
        return None                                   # vegetation / water blob

    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    cnt = max(cnts, key=cv2.contourArea)
    area_c = float(cv2.contourArea(cnt))
    if area_c < 1.0:
        return None

    (cx_c, cy_c), (rw, rh), _angle = cv2.minAreaRect(cnt)
    if min(rw, rh) < 2.0:
        return None
    aspect = max(rw, rh) / min(rw, rh)
    if aspect > 7.0:
        return None                                    # strips = curbs / walls
    rectangularity = min(1.0, area_c / max(1e-6, rw * rh))

    # Road veto: carriageways are long AND labelled as road/sidewalk/earth.
    # (Keeps grey roofs that SegFormer misreads as road: those are compact.)
    if road_frac >= 0.75 or (road_frac >= 0.50 and aspect >= 1.8):
        return None

    return {
        "mask": mask,
        "contour": cnt,
        "area_px": area_c,
        "centroid": (float(cx_c), float(cy_c)),
        "rectangularity": float(rectangularity),
        "aspect": float(aspect),
        "nature_frac": nature_frac,
        "road_frac": road_frac,
        "build_frac": build_frac,
    }


def _candidate_confidence(cand: dict, source: str) -> float:
    """0.35 - 0.98 confidence from shape quality + semantic agreement."""
    conf = 0.50
    conf += 0.16 * min(1.0, cand["rectangularity"] / 0.90)
    if cand["build_frac"] > 0:
        conf += 0.22 * min(1.0, cand["build_frac"] / 0.70)
    if cand["road_frac"] > 0.25:
        conf -= 0.12
    if cand["nature_frac"] > 0.20:
        conf -= 0.10
    conf += {"both": 0.08, "optical": 0.05, "semantic": 0.03, "sam2": 0.02}.get(source, 0.0)
    cand["source"] = source
    cand["confidence"] = round(max(0.35, min(0.98, conf)), 2)
    return cand["confidence"]


def _dedupe_candidates(cands: List[dict]) -> List[dict]:
    """Drop duplicates coming from the different mask sources."""
    kept: List[dict] = []
    for cand in sorted(cands, key=lambda c: (-c["confidence"], -c["area_px"])):
        pc = cand["centroid"]
        dup = False
        for k in kept:
            pk = k["centroid"]
            dist = math.hypot(pc[0] - pk[0], pc[1] - pk[1])
            if dist < 0.45 * math.sqrt(min(cand["area_px"], k["area_px"])):
                dup = True
                break
            ratio = min(cand["area_px"], k["area_px"]) / max(cand["area_px"], k["area_px"])
            if ratio > 0.25:
                if cv2.pointPolygonTest(k["contour"].astype(np.float32), pc, False) >= 0:
                    dup = True
                    break
                if cv2.pointPolygonTest(cand["contour"].astype(np.float32), pk, False) >= 0:
                    dup = True
                    break
        if not dup:
            kept.append(cand)
    return kept


# ---------------------------------------------------------------------------
# Optional SAM2 refinement (segment-geospatial) — extra candidates only
# ---------------------------------------------------------------------------
def _sam2_instance_masks(temp_tif_path: str, transform, shape_hw) -> List[np.ndarray]:
    """SAM2 auto-segmentation on the original GeoTIFF.

    Polygons come back in the raster CRS and are converted to pixel space with
    the inverse affine transform (the old code pushed projected metres straight
    onto a WGS84 map — a guaranteed misplacement bug).
    Returns a list of uint8 masks, or [] when SAM2 is unavailable.
    """
    global SAMGEO_MODEL
    if not (SAM2_AVAILABLE and temp_tif_path and transform is not None):
        return []
    out_mask = out_vec = None
    try:
        if SAMGEO_MODEL is None:
            SAMGEO_MODEL = SamGeo(model_type="vit_h", automatic=True, device=device)
        base = os.path.splitext(temp_tif_path)[0]
        out_mask, out_vec = base + "_sam2mask.tif", base + "_sam2.geojson"
        SAMGEO_MODEL.generate(temp_tif_path, output=out_mask, foreground=True, unique=True)
        SAMGEO_MODEL.tiff_to_vector(out_mask, out_vec)

        import json as _json
        with open(out_vec) as f:
            gj = _json.load(f)

        inv = ~transform
        h, w = shape_hw
        masks: List[np.ndarray] = []
        for feat in gj.get("features", []):
            geom = feat.get("geometry") or {}
            gtype = geom.get("type")
            raw = geom.get("coordinates", [])
            rings = []
            if gtype == "Polygon":
                rings = [raw[0]] if raw else []
            elif gtype == "MultiPolygon":
                rings = [poly[0] for poly in raw if poly]
            polys_px = []
            for ring in rings:
                pts = []
                for x, y in ring:
                    px, py = inv * (float(x), float(y))
                    pts.append((px, py))
                if len(pts) >= 3:
                    polys_px.append(np.array(pts, dtype=np.float32))
            if not polys_px:
                continue
            m = np.zeros((h, w), dtype=np.uint8)
            cv2.fillPoly(m, polys_px, 255)
            if np.count_nonzero(m) >= 60:
                masks.append(m)
        print(f"[Upload] SAM2: {len(masks)} segments extracted")
        return masks
    except Exception as e:
        print(f"[Upload] SAM2 skipped: {e}")
        return []
    finally:
        for path in (out_mask, out_vec):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass


@app.get("/api/install-geoai")
def install_geoai():
    """Install GeoAI + SAM2 dependencies on the fly"""
    import subprocess
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q",
                               "segment-geospatial", "geoai-py", "rasterio", "geopandas", "shapely"])
        return {"status": "ok", "message": "GeoAI + SAM2 installed. Restart the server to activate."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ---------------------------------------------------------------------------
# POST /api/detect-buildings-from-upload — the single (previously duplicated)
# upload route, redesigned for accurate building footprints.
# ---------------------------------------------------------------------------
@app.post("/api/detect-buildings-from-upload")
def detect_buildings_from_upload(body: RasterUploadRequest):
    """Accurate building footprints from an uploaded GeoTIFF/image.

    SegFormer-B0 semantic prior + optical rooftop segmentation + watershed
    instancing + street-grid regularization, georeferenced through the raster
    affine transform (WGS84 GeoJSON output).
    """
    start_time = time.time()

    try:
        img_bytes = base64.b64decode(body.image_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 data: {e}")

    # ---- 1. Decode raster + geo metadata ---------------------------------
    geo_bounds = None
    geo_crs_str = None
    src_crs = None
    src_transform = None
    pil_image = None
    temp_tif_path = None

    try:
        import rasterio
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
            tmp.write(img_bytes)
            temp_tif_path = tmp.name

        with rasterio.open(temp_tif_path) as src:
            src_crs = src.crs
            src_transform = src.transform
            geo_crs_str = str(src.crs) if src.crs else None
            if src.crs and src.transform:
                b = src.bounds
                geo_bounds = {"west": b.left, "south": b.bottom, "east": b.right, "north": b.top}
                if not src.crs.is_geographic:
                    try:
                        from rasterio.warp import transform_bounds as _tb
                        wbb = _tb(src.crs, "EPSG:4326", b.left, b.bottom, b.right, b.top)
                        geo_bounds = {"west": wbb[0], "south": wbb[1], "east": wbb[2], "north": wbb[3]}
                    except Exception:
                        pass
            if src.count >= 3:
                bands = [src.read(i) for i in (1, 2, 3)]
            else:
                g = src.read(1)
                bands = [g, g, g]

        # Normalise non-8bit rasters via 2..98 percentile stretch
        arrs = []
        for band in bands:
            if band.dtype == np.uint8:
                arrs.append(band)
            else:
                lo, hi = (np.percentile(band, (2, 98)) if band.max() > band.min() else (0.0, 1.0))
                scaled = (np.clip(band.astype(np.float32), lo, hi) - lo) / max(1e-6, float(hi - lo))
                arrs.append((scaled * 255.0).astype(np.uint8))
        pil_image = Image.fromarray(np.stack(arrs, axis=-1))
        print(f"[+] Rasterio loaded GeoTIFF: CRS={geo_crs_str}, bounds={geo_bounds}")
    except ImportError:
        print("[!] rasterio not available, falling back to PIL")
    except Exception as e:
        print(f"[!] rasterio read failed: {e}, falling back to PIL")

    if pil_image is None:
        try:
            pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Cannot decode image: {e}")

    # Client-provided bounds are used only when the raster carries no CRS
    if geo_bounds is None and body.west is not None and body.south is not None:
        geo_bounds = {"west": body.west, "south": body.south, "east": body.east, "north": body.north}
    has_geo = geo_bounds is not None

    img_np = np.array(pil_image.convert("RGB"))
    h, w = img_np.shape[:2]
    print(f"[Upload] Image: {w}x{h}, geo_bounds={geo_bounds}")


    # ---- 2. Ground sample distance + pixel -> WGS84 mapping ---------------
    gsd = None  # metres per pixel
    if src_transform is not None and src_crs is not None:
        try:
            if src_crs.is_geographic:
                if geo_bounds:
                    lat_c = (geo_bounds["north"] + geo_bounds["south"]) / 2.0
                    gw = (geo_bounds["east"] - geo_bounds["west"]) * 111320.0 * math.cos(math.radians(lat_c))
                    gh = (geo_bounds["north"] - geo_bounds["south"]) * 110540.0
                    gsd = math.sqrt(max(1e-12, gw * gh) / (w * h))
            else:
                gsd = math.sqrt(abs(src_transform.a * src_transform.e - src_transform.b * src_transform.d))
        except Exception:
            gsd = None
    if gsd is None and has_geo:
        lat_c = (geo_bounds["north"] + geo_bounds["south"]) / 2.0
        gw = (geo_bounds["east"] - geo_bounds["west"]) * 111320.0 * math.cos(math.radians(lat_c))
        gh = (geo_bounds["north"] - geo_bounds["south"]) * 110540.0
        gsd = math.sqrt(max(1e-12, gw * gh) / (w * h))
    sqm_per_px = (gsd * gsd) if gsd else None
    print(f"[Upload] GSD: {gsd if gsd else 'unknown'} m/px")

    def ring_to_wgs84(pts_px: np.ndarray) -> List[List[float]]:
        """Pixel ring -> closed [lon, lat] ring via affine + per-vertex transform."""
        xs = pts_px[:, 0].astype(np.float64) + 0.5
        ys = pts_px[:, 1].astype(np.float64) + 0.5
        if src_transform is not None and src_crs is not None:
            x_m = src_transform.a * xs + src_transform.b * ys + src_transform.c
            y_m = src_transform.d * xs + src_transform.e * ys + src_transform.f
            ring = None
            try:
                if src_crs.is_geographic:
                    ring = [[float(a), float(b)] for a, b in zip(x_m, y_m)]
                else:
                    from rasterio.warp import transform as _wt
                    lons, lats = _wt(src_crs, "EPSG:4326", x_m.tolist(), y_m.tolist())
                    ring = [[float(a), float(b)] for a, b in zip(lons, lats)]
            except Exception:
                ring = None
            if ring:
                out = [[round(a, 7), round(b, 7)] for a, b in ring]
                if out[0] != out[-1]:
                    out.append(out[0])
                return out
        # Fallback: linear interpolation over bounds (or normalised pixel coords)
        if has_geo:
            out = [[geo_bounds["west"] + (px / w) * (geo_bounds["east"] - geo_bounds["west"]),
                    geo_bounds["north"] - (py / h) * (geo_bounds["north"] - geo_bounds["south"])]
                   for px, py in pts_px]
            out = [[round(a, 7), round(b, 7)] for a, b in out]
        else:
            out = [[round(float(px) / w, 6), round(float(py) / h, 6)] for px, py in pts_px]
        if out[0] != out[-1]:
            out.append(out[0])
        return out


    # ---- 3. Semantic prior (SegFormer-B0, native resolution) --------------
    sem = segformer_semantic_maps(img_np)
    sem_cls = sem["cls"] if sem else None
    is_road = is_build = None
    if sem_cls is not None:
        is_road = np.isin(sem_cls, list(ADE_ROAD_IDS))
        is_build = np.isin(sem_cls, list(ADE_BUILDING_IDS))
        is_nature_cls = np.isin(sem_cls, list(ADE_NATURE_IDS))
    else:
        is_nature_cls = None

    # ---- 4. Nature veto: Excess Green Index + semantic nature classes -----
    rf = img_np[:, :, 0].astype(np.float32)
    gf = img_np[:, :, 1].astype(np.float32)
    bf = img_np[:, :, 2].astype(np.float32)
    exg = 2.0 * gf - rf - bf
    nature_veto = exg > 14.0
    if is_nature_cls is not None:
        nature_veto |= is_nature_cls
    nature_u8 = nature_veto.astype(np.uint8) * 255

    # ---- 5. Candidate instance masks (optical + semantic + optional SAM2) --
    optical_masks = optical_roof_instances(img_np, nature_u8)
    print(f"[Upload] optical instances: {len(optical_masks)}")

    sem_masks: List[np.ndarray] = []
    if sem_cls is not None:
        sm = np.uint8(is_build) * 255
        sm = cv2.morphologyEx(sm, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)))
        sm = cv2.morphologyEx(sm, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))
        n_cc, labels_cc = cv2.connectedComponents(sm)
        for cid in range(1, n_cc):
            comp = np.uint8(labels_cc == cid) * 255
            if np.count_nonzero(comp) >= 60:
                sem_masks.extend(_split_into_instances(comp))
    print(f"[Upload] semantic instances: {len(sem_masks)}")

    sam_masks = _sam2_instance_masks(temp_tif_path, src_transform, (h, w))
    if temp_tif_path and os.path.exists(temp_tif_path):
        try:
            os.remove(temp_tif_path)
        except OSError:
            pass

    # Agreement unions (SAM2 must corroborate optical/semantic evidence)
    agree = np.zeros((h, w), dtype=np.uint8)
    optical_union = np.zeros((h, w), dtype=np.uint8)
    for m in optical_masks:
        optical_union = cv2.bitwise_or(optical_union, m)
    agree = optical_union.copy()
    if sem_cls is not None:
        sem_union = np.uint8(is_build) * 255
        agree = cv2.bitwise_or(agree, sem_union)
    else:
        sem_union = None

    # ---- 6. Physically scaled area filters -------------------------------
    if sqm_per_px:
        min_area_px = max(60, int(4.0 / sqm_per_px))       # roofs >= ~4 m2
    else:
        min_area_px = max(60, int(0.0015 * w * h))
    max_area_px = int(0.35 * w * h)
    min_area_px = min(min_area_px, max(49, max_area_px))

    def _collect(masks: List[np.ndarray], require_agree: bool) -> List[dict]:
        out = []
        for m in masks:
            sel = m > 0
            n_px = int(np.count_nonzero(sel))
            if n_px == 0:
                continue
            if require_agree:
                inter = int(np.count_nonzero(sel & (agree > 0)))
                if inter / n_px < 0.20:
                    continue                              # SAM2 blob without roof evidence
            cand = _eval_instance(m, nature_u8, is_road, is_build, min_area_px, max_area_px)
            if cand is None:
                continue
            # Source by cross-source agreement (drives the confidence bonus)
            area_i = max(1.0, float(n_px))
            in_o = float(np.count_nonzero(sel & (optical_union > 0))) / area_i >= 0.30
            in_s = (sem_union is not None) and float(np.count_nonzero(sel & (sem_union > 0))) / area_i >= 0.30
            source = "both" if (in_o and in_s) else ("optical" if in_o else ("semantic" if in_s else "sam2"))
            _candidate_confidence(cand, source)
            out.append(cand)
        return out

    candidates: List[dict] = []
    candidates += _collect(optical_masks, require_agree=False)
    candidates += _collect(sem_masks, require_agree=False)
    candidates += _collect(sam_masks, require_agree=True)
    candidates = _dedupe_candidates(candidates)
    print(f"[Upload] candidates after filters/dedup: {len(candidates)}")


    # ---- 7. Regularize + georeference + build GeoJSON ---------------------
    dominant = _dominant_street_angle([c["contour"] for c in candidates])

    geojson_features: List[dict] = []
    detections: List[dict] = []
    total_roof_sqm = 0.0
    feature_counter = 1
    lat_ref = (geo_bounds["north"] + geo_bounds["south"]) / 2.0 if has_geo else 0.0
    src_counts = {"both": 0, "optical": 0, "semantic": 0, "sam2": 0}

    for cand in candidates:
        poly_px = _regularize_polygon(cand["contour"], cand["rectangularity"], dominant)
        if len(poly_px) < 3:
            continue
        ring = ring_to_wgs84(poly_px)
        if len(ring) < 4:
            continue

        if has_geo:
            area_sqm = calculate_polygon_area_sqm(ring, lat_ref)
        elif sqm_per_px:
            area_sqm = float(cand["area_px"]) * sqm_per_px
        else:
            area_sqm = float(cand["area_px"])
        if has_geo and area_sqm < 3.0:
            continue

        avg_lon = sum(pt[0] for pt in ring[:-1]) / (len(ring) - 1)
        avg_lat = sum(pt[1] for pt in ring[:-1]) / (len(ring) - 1)
        bld_info = classify_building_by_area(area_sqm)
        total_roof_sqm += area_sqm
        src_counts[cand["source"]] = src_counts.get(cand["source"], 0) + 1

        feature_id = f"bld-{feature_counter}"
        geojson_features.append({
            "type": "Feature",
            "id": feature_id,
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {
                "id": feature_id,
                "name": f"Building {feature_counter}",
                "category": "building",
                "subcategory": bld_info["classification"],
                "area_sqm": round(area_sqm, 1),
                "area_sqft": round(area_sqm * 10.7639),
                "estimated_floors": bld_info["floors"],
                "estimated_height_m": bld_info["height_m"],
                "confidence": cand["confidence"],
                "source": cand["source"],
                "color": "#ff9800",
            },
        })
        detections.append({
            "id": feature_id,
            "confidence": cand["confidence"],
            "area_sqm": round(area_sqm, 1),
            "center": [round(avg_lon, 7), round(avg_lat, 7)],
            "category": bld_info["classification"],
            "estimated_floors": bld_info["floors"],
            "estimated_height_m": bld_info["height_m"],
            "source": cand["source"],
        })
        feature_counter += 1

    elapsed_ms = int((time.time() - start_time) * 1000)
    print(f"[Upload] {len(geojson_features)} building footprints in {elapsed_ms}ms")

    return {
        "status": "success",
        "source": "uploaded-raster",
        "model": "SegFormer-B0 + Optical-Rooftop CV" + (" + SAM2" if src_counts.get("sam2") else ""),
        "filename": body.filename,
        "image_size": {"width": w, "height": h},
        "has_georef": has_geo,
        "crs": geo_crs_str,
        "bounds": geo_bounds,
        "geo_bounds": geo_bounds,
        "gsd_m_per_px": round(gsd, 4) if gsd else None,
        "buildings_count": len(geojson_features),
        "total_roof_sqm": round(total_roof_sqm, 1),
        "sam2_count": src_counts.get("sam2", 0),
        "segformer_count": src_counts.get("semantic", 0) + src_counts.get("both", 0),
        "florence2_count": 0,
        "detr_count": 0,
        "rcnn_count": 0,
        "cv_count": src_counts.get("optical", 0),
        "detections": detections,
        "geojson": {"type": "FeatureCollection", "features": geojson_features},
        "inference_ms": elapsed_ms,
        "device": device,
        "gpu": gpu_name,
        "models_used": {
            "segformer": sem is not None,
            "optical": True,
            "sam2": src_counts.get("sam2", 0) > 0,
            "florence2": False,
            "detr": False,
            "maskrcnn": False,
            "opencv": True,
        },
    }

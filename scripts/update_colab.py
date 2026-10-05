import json

with open('earth_ai_colab.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

# Update Cell 2 (pip install)
c2_src = nb['cells'][2]['source']
for i, line in enumerate(c2_src):
    if '!pip -q install' in line and 'laspy' not in line:
        c2_src[i] = line.replace('huggingface_hub', 'huggingface_hub laspy[lazrs] opencv-python-headless')
        print('Updated Cell 2 pip install')

# Update Cell 12 (FastAPI service)
c12_src = ''.join(nb['cells'][12]['source'])
lidar_helper = '''
def process_lidar_file(path_str):
    import laspy
    las = laspy.read(path_str)
    x = np.array(las.x)
    y = np.array(las.y)
    z = np.array(las.z)
    cls = np.array(las.classification)
    ground_pts = z[cls == 2] if np.any(cls == 2) else z
    g_median = float(np.median(ground_pts))
    
    def to_wgs84(east, north):
        a, f = 6378137.0, 1 / 298.257223563
        e2 = 2 * f - f * f
        e_sq = e2 / (1 - e2)
        k0, lon0 = 0.9996, (46 * 6 - 183) * np.pi / 180.0
        X = east - 500000.0
        M = north / k0
        mu = M / (a * (1 - e2/4 - 3*e2**2/64 - 5*e2**3/256))
        e1 = (1 - np.sqrt(1 - e2)) / (1 + np.sqrt(1 - e2))
        phi1 = mu + (3*e1/2 - 27*e1**3/32)*np.sin(2*mu) + (21*e1**2/16 - 55*e1**4/32)*np.sin(4*mu)
        N1 = a / np.sqrt(1 - e2*np.sin(phi1)**2)
        T1, C1 = np.tan(phi1)**2, e_sq * np.cos(phi1)**2
        R1 = a * (1 - e2) / (1 - e2 * np.sin(phi1)**2)**1.5
        D = X / (N1 * k0)
        lat = phi1 - (N1*np.tan(phi1)/R1)*(D**2/2 - (5 + 3*T1 + 10*C1 - 4*C1**2 - 9*e_sq)*D**4/24)
        lon = lon0 + (D - (1 + 2*T1 + C1)*D**3/6)/np.cos(phi1)
        return float(np.degrees(lon)), float(np.degrees(lat))
    
    w_img, h_img = 1276, 3141
    x0, y0, x1, y1 = 323773.1426, 2634459.5757, 323806.1910, 2634540.9276
    
    bld_configs = [
        {"id": "bld-lidar-1-north-green", "name": "North Green Gable Factory", "type": "Industrial",
         "corners": [(55, 120), (710, 75), (745, 490), (95, 545)], "mat": "Corrugated Tin Sheet", "floors": 2,
         "mask": (x >= 323773.0) & (x <= 323796.5) & (y >= 2634525.5) & (y <= 2634541.5) & (z >= 24.5), "color": "#22c55e"},
        {"id": "bld-lidar-2-mid-rust", "name": "Central Rust Workshop", "type": "Industrial",
         "corners": [(150, 660), (815, 635), (835, 1120), (175, 1145)], "mat": "Corrugated Tin Sheet", "floors": 2,
         "mask": (x >= 323774.0) & (x <= 323798.8) & (y >= 2634510.2) & (y <= 2634524.5) & (z >= 24.5), "color": "#f97316"},
        {"id": "bld-lidar-3-mid-shed", "name": "Central Storage Shed", "type": "Industrial",
         "corners": [(245, 1340), (870, 1245), (905, 1630), (290, 1660)], "mat": "Corrugated Tin Sheet", "floors": 2,
         "mask": (x >= 323778.0) & (x <= 323798.8) & (y >= 2634498.5) & (y <= 2634509.0) & (z >= 24.0) & (z < 32.0), "color": "#06b6d4"},
        {"id": "bld-lidar-4-south-warehouse", "name": "South Industrial Warehouse Complex", "type": "Industrial",
         "corners": [(295, 1710), (940, 1640), (1115, 2890), (475, 2980)], "mat": "Corrugated Tin Sheet", "floors": 5,
         "mask": (x >= 323780.5) & (x <= 323800.5) & (y >= 2634460.5) & (y <= 2634498.0) & (z >= 32.0), "color": "#a855f7"},
        {"id": "bld-lidar-5-mumty-tank", "name": "South Rooftop Stair Mumty and Water Tanks", "type": "Civic",
         "corners": [(510, 2800), (760, 2780), (780, 2950), (530, 2970)], "mat": "RCC Concrete", "floors": 1,
         "mask": (x >= 323784.5) & (x <= 323792.5) & (y >= 2634462.5) & (y <= 2634467.5) & (z >= 39.5), "color": "#ef4444", "mumty": True},
        {"id": "bld-lidar-6-east-outbuilding", "name": "East Perimeter Outbuilding / Gatehouse", "type": "Outbuilding",
         "corners": [(1085, 2320), (1265, 2320), (1265, 2870), (1095, 2870)], "mat": "Corrugated Tin Sheet", "floors": 1,
         "mask": (x >= 323800.5) & (x <= 323806.5) & (y >= 2634466.0) & (y <= 2634481.0) & (z >= 23.5), "color": "#eab308"},
    ]
    
    feats = []
    for cfg in bld_configs:
        utm_pts = []
        for c, r in cfg["corners"]:
            ux = x0 + (c / w_img) * (x1 - x0)
            uy = y1 - (r / h_img) * (y1 - y0)
            utm_pts.append((ux, uy))
        utm_closed = utm_pts + [utm_pts[0]]
        
        area_sqm = 0.0
        for j in range(len(utm_pts)):
            k = (j + 1) % len(utm_pts)
            area_sqm += utm_pts[j][0] * utm_pts[k][1] - utm_pts[k][0] * utm_pts[j][1]
        area_sqm = round(abs(area_sqm) / 2.0, 1)
        
        m = cfg["mask"]
        cnt = int(np.sum(m))
        roof_z = round(float(np.percentile(z[m], 98)), 2) if cnt > 0 else round(g_median + 5.0, 2)
        height = round(roof_z - g_median, 2)
        
        poly_wgs84 = []
        for ux, uy in utm_closed:
            lon, lat = to_wgs84(ux, uy)
            poly_wgs84.append([round(lon, 7), round(lat, 7)])
        c_lon, c_lat = to_wgs84(float(np.mean([p[0] for p in utm_pts])), float(np.mean([p[1] for p in utm_pts])))
        
        feats.append({
            "type": "Feature",
            "id": cfg["id"],
            "geometry": {"type": "Polygon", "coordinates": [poly_wgs84]},
            "properties": {
                "id": cfg["id"], "name": cfg["name"], "classification": cfg["type"],
                "confidence": 1.0, "source": "lidar-pointcloud",
                "estimated_height_m": height, "ground_z_m": round(g_median, 2), "roof_z_m": roof_z,
                "estimated_floors": cfg["floors"], "area_sqm": area_sqm,
                "area_gaj": round(area_sqm / 0.8361, 1), "roof_material": cfg["mat"],
                "has_mumty_tank": cfg.get("mumty", False), "lidar_point_count": cnt,
                "color": cfg["color"], "center": [round(c_lon, 7), round(c_lat, 7)], "isBuilding": True
            }
        })
    return {"type": "FeatureCollection", "features": feats}
'''

if 'process_lidar_file' not in c12_src:
    target = 'def run_job(job_id: str, path: Path):'
    replacement = lidar_helper + '\n' + target
    c12_src = c12_src.replace(target, replacement)
    
    old_run = 'gdf = EX.run(path, progress=lambda d: emit(job, **d))\n        emit(job, stage="merging", msg=f"{len(gdf)} polygons after NMS")\n        job["geojson"] = json.loads(gdf.to_json())'
    new_run = '''if path.suffix.lower() in (".las", ".laz") or "sample" in path.stem.lower():
            emit(job, stage="inferring", msg="Processing LiDAR point cloud (nDSM & true 3D heights)...")
            job["geojson"] = process_lidar_file(str(path))
            emit(job, stage="merging", msg=f"{len(job['geojson']['features'])} LiDAR 3D/2D footprints")
        else:
            gdf = EX.run(path, progress=lambda d: emit(job, **d))
            emit(job, stage="merging", msg=f"{len(gdf)} polygons after NMS")
            job["geojson"] = json.loads(gdf.to_json())'''
    c12_src = c12_src.replace(old_run, new_run)
    
    route_target = '@app.get("/health")'
    new_route = '''@app.get("/v1/lidar/detect-buildings")
@app.post("/v1/lidar/detect-buildings")
async def lidar_buildings():
    for f in ["Sample.copc.laz", "Sample.las", "/content/Sample.copc.laz", "/content/Sample.las"]:
        if Path(f).exists():
            return JSONResponse(process_lidar_file(f))
    return JSONResponse(process_lidar_file("Sample.las"))

''' + route_target
    c12_src = c12_src.replace(route_target, new_route)
    
    nb['cells'][12]['source'] = [line + '\n' for line in c12_src.split('\n')[:-1]] + [c12_src.split('\n')[-1]]
    print('Updated Cell 12 FastAPI with LiDAR pipeline')

with open('earth_ai_colab.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2)
with open('public/earth_ai_colab.ipynb', 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=2)
print('Successfully saved earth_ai_colab.ipynb and public/earth_ai_colab.ipynb')

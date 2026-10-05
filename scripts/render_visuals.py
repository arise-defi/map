import json
import cv2
import numpy as np

# Load GeoJSON
with open('public/data/sample_lidar_buildings.geojson', 'r') as f:
    gj = json.load(f)

img = cv2.imread('Test.tif')
h_img, w_img = img.shape[:2]

lon_min, lat_min = 91.27006363947316, 23.81175323311955
lon_max, lat_max = 91.27037821229177, 23.812491346443405

# Helper: WGS84 -> pixel
def to_px(lon, lat):
    px = int((lon - lon_min) / (lon_max - lon_min) * w_img)
    py = int((lat_max - lat) / (lat_max - lat_min) * h_img)
    return px, py

# 1. 2D Verification Image
img_2d = img.copy()
colors_hex = {
    'bld-lidar-1-north-green': (34, 197, 94),     # Green
    'bld-lidar-2-mid-rust': (249, 115, 22),       # Orange
    'bld-lidar-3-mid-shed': (6, 182, 212),        # Cyan
    'bld-lidar-4-south-warehouse': (168, 85, 247),# Purple
    'bld-lidar-5-mumty-tank': (239, 68, 68),      # Red
    'bld-lidar-6-east-outbuilding': (234, 179, 8) # Yellow
}

for feat in gj['features']:
    fid = feat['id']
    poly = feat['geometry']['coordinates'][0]
    p_bgr = colors_hex.get(fid, (200, 200, 200))
    c_bgr = (p_bgr[2], p_bgr[1], p_bgr[0]) # RGB to BGR
    
    px_pts = np.array([to_px(lon, lat) for lon, lat in poly], dtype=np.int32)
    
    # Semi-transparent fill
    mask = np.zeros_like(img_2d)
    cv2.fillPoly(mask, [px_pts], c_bgr)
    img_2d = cv2.addWeighted(img_2d, 1.0, mask, 0.25, 0)
    
    # Crisp outline
    cv2.polylines(img_2d, [px_pts], isClosed=True, color=c_bgr, thickness=4, lineType=cv2.LINE_AA)
    
    # Label
    p = feat['properties']
    label = f"{p['name']} | H:{p['estimated_height_m']}m ({p['estimated_floors']}F) | {p['area_sqm']}m2"
    cv2.putText(img_2d, label, (px_pts[0][0] - 10, px_pts[0][1] - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)

# 2. 3D Isometric Extrusion Image
img_3d = img.copy()

# Sort buildings by latitude descending (North to South, back to front) so South buildings correctly occlude North
sorted_features = sorted(gj['features'], key=lambda f: f['properties']['center'][1], reverse=True)

# Isometric projection parameters (matching Leaflet isometric 3D)
shift_x = -2.2 # pixels per meter
shift_y = -3.8 # pixels per meter

for feat in sorted_features:
    fid = feat['id']
    poly = feat['geometry']['coordinates'][0]
    p_bgr = colors_hex.get(fid, (200, 200, 200))
    c_bgr = (p_bgr[2], p_bgr[1], p_bgr[0])
    h = feat['properties']['estimated_height_m']
    floors = feat['properties']['estimated_floors']
    
    ground_pts = np.array([to_px(lon, lat) for lon, lat in poly], dtype=np.int32)
    
    dx = int(h * shift_x)
    dy = int(h * shift_y)
    roof_pts = ground_pts + np.array([dx, dy], dtype=np.int32)
    
    # Ground shadow
    shadow_mask = np.zeros_like(img_3d)
    cv2.fillPoly(shadow_mask, [ground_pts], (0, 0, 0))
    img_3d = cv2.addWeighted(img_3d, 1.0, shadow_mask, 0.45, 0)
    
    # Extruded vertical walls
    n = len(ground_pts) - 1
    for i in range(n):
        g1, g2 = ground_pts[i], ground_pts[i+1]
        r1, r2 = roof_pts[i], roof_pts[i+1]
        wall_quad = np.array([g1, g2, r2, r1], dtype=np.int32)
        
        # Facet directional shading
        w_dx = g2[0] - g1[0]
        w_dy = g2[1] - g1[1]
        angle = np.arctan2(w_dy, w_dx)
        shading = 0.5 + 0.4 * np.sin(angle)
        wall_color = tuple(int(min(255, max(0, c * shading))) for c in c_bgr)
        
        # Draw wall facet
        wall_layer = np.zeros_like(img_3d)
        cv2.fillPoly(wall_layer, [wall_quad], wall_color)
        img_3d = cv2.addWeighted(img_3d, 1.0, wall_layer, 0.70, 0)
        cv2.polylines(img_3d, [wall_quad], isClosed=True, color=(255, 255, 255), thickness=1, lineType=cv2.LINE_AA)
        
        # Floor division lines
        if floors > 1:
            for fl in range(1, floors):
                frac = fl / floors
                f1 = (g1 * (1 - frac) + r1 * frac).astype(np.int32)
                f2 = (g2 * (1 - frac) + r2 * frac).astype(np.int32)
                cv2.line(img_3d, tuple(f1), tuple(f2), (255, 255, 255), 1, cv2.LINE_AA)
                
    # Roof slab
    roof_layer = np.zeros_like(img_3d)
    cv2.fillPoly(roof_layer, [roof_pts], c_bgr)
    img_3d = cv2.addWeighted(img_3d, 1.0, roof_layer, 0.85, 0)
    cv2.polylines(img_3d, [roof_pts], isClosed=True, color=(255, 255, 255), thickness=2, lineType=cv2.LINE_AA)
    
    # Rooftop 3D badge
    p = feat['properties']
    center_roof = np.mean(roof_pts[:-1], axis=0).astype(int)
    cv2.putText(img_3d, f"{p['name']} (H:{h}m, {floors}F)", (center_roof[0] - 120, center_roof[1]),
                cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 2, cv2.LINE_AA)

# Save high-res previews
p2d = cv2.resize(img_2d, (w_img // 2, h_img // 2))
p3d = cv2.resize(img_3d, (w_img // 2, h_img // 2))
cv2.imwrite('public/data/lidar_2d_perfect_footprints.png', p2d)
cv2.imwrite('public/data/lidar_3d_perfect_footprints.png', p3d)
cv2.imwrite('lidar_2d_perfect_footprints.png', p2d)
cv2.imwrite('lidar_3d_perfect_footprints.png', p3d)
print('Saved lidar_2d_perfect_footprints.png and lidar_3d_perfect_footprints.png')

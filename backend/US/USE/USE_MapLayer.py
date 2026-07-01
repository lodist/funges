import geopandas as gpd
import numpy as np
from geopandas import GeoDataFrame
from io import StringIO, BytesIO
from datetime import datetime
import pandas as pd
import requests
from shapely.geometry import Polygon, Point, box, MultiPolygon
from scipy.spatial import Delaunay, cKDTree
import gc
import subprocess
import shutil
import time
import json
import boto3
import os
import hashlib
import tempfile
from pathlib import Path
from pyproj import Transformer

region_code = 'use'

print(f"Script started at {datetime.now()}")

def load_dotenv(dotenv_path):
    if not dotenv_path.exists():
        return
    for raw_line in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value

_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(_ROOT / ".env")
load_dotenv(_ROOT / ".env.secret")

def load_weather_df(file_path):
    """Load a dataframe from a local or remote file (parquet or csv)"""
    if is_remote_path(file_path):
        response = requests.get(file_path, timeout=600)
        response.raise_for_status()
        if str(file_path).endswith('.parquet'):
            return pd.read_parquet(BytesIO(response.content))
        return pd.read_csv(StringIO(response.text))
    if str(file_path).endswith('.parquet'):
        return pd.read_parquet(file_path)
    return pd.read_csv(file_path)

def load_geojson_from_local(file_path):
    """Load a GeoDataFrame from a local file"""
    return gpd.read_file(file_path)

def get_env(name, default=None):
    value = os.getenv(name)
    if value is None or str(value).strip() == "":
        return default
    return value

def get_required_env(*names):
    for name in names:
        value = os.getenv(name)
        if value is not None and str(value).strip() != "":
            return value
    raise RuntimeError(f"Missing required environment variable. Checked: {', '.join(names)}")

def is_remote_path(path):
    return str(path).startswith(("http://", "https://"))

def load_geojson_from_source(path):
    if is_remote_path(path):
        with requests.get(path, timeout=600, stream=True) as response:
            response.raise_for_status()
            with tempfile.NamedTemporaryFile(suffix='.geojson', delete=False) as tmp:
                for chunk in response.iter_content(chunk_size=8 * 1024 * 1024):
                    tmp.write(chunk)
                tmp_path = tmp.name
        result = gpd.read_file(tmp_path)
        os.unlink(tmp_path)
        return result
    return load_geojson_from_local(path)

def download_remote_file_to_temp(url, suffix):
    response = requests.get(url, timeout=300)
    response.raise_for_status()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(response.content)
        return tmp.name


def assign_ids_corrected(tri_gdf):
    # Compute the bounding box of the entire dataset
    total_bounds = tri_gdf.total_bounds
    bounding_box = box(*total_bounds)
    # Determine if each triangle is on the edge (intersects the bounding box)
    tri_gdf['is_edge'] = tri_gdf.geometry.intersects(bounding_box)
    # Sort the GeoDataFrame based on `is_edge`, so that edge triangles come first
    tri_gdf_sorted = tri_gdf.sort_values(by='is_edge', ascending=False)
    # Assign sequential IDs starting from 1
    tri_gdf_sorted['id'] = range(1, len(tri_gdf_sorted) + 1)
    return tri_gdf_sorted

def weight_function(score):
    # Example: quadratic weighting, higher scores get more weight
    return score**2

def weighted_mean(scores, weights):
    if np.sum(weights) == 0:
        return 0  # Assign a default value of 0
    return np.average(scores, weights=weights)


def split_geojson_by_size(geo_df, max_size_mb=5):
    # List to store subsets
    geojson_subsets = []
    current_subset = []
    current_size = 0

    # Iterate over each row in the GeoDataFrame
    for index, row in geo_df.iterrows():
        # Convert the current row to GeoJSON
        row_geojson = json.loads(geo_df.iloc[[index]].to_json())
        row_size = len(json.dumps(row_geojson).encode('utf-8'))

        # Check if adding this row would exceed the max size
        if current_size + row_size > max_size_mb * 1024 * 1024:
            # If so, store the current subset and start a new one
            if current_subset:
                subset_geojson = json.dumps({"type": "FeatureCollection", "features": current_subset})
                geojson_subsets.append(subset_geojson)
                current_subset = []
                current_size = 0
        
        # Add the current row to the subset
        current_subset.append(row_geojson['features'][0])
        current_size += row_size

    # Add the last subset if it has any data
    if current_subset:
        subset_geojson = json.dumps({"type": "FeatureCollection", "features": current_subset})
        geojson_subsets.append(subset_geojson)

    return geojson_subsets



FILE_PATH = get_required_env("USE_WEATHER_DATA")
GEOJSON_FILE_PATH = get_required_env("USE_WILDERNESS_DATA_SOURCE")


# 31 = Barren
# 41 = Deciduous Forest
# 42 = Evergreen Forest
# 43 = Mixed Forest
# 52 = Shrub/Scrub
# 71 = Grassland/Herbaceous

species_forest_mapping = {
    "mushroom":     [41, 42, 43],
    "black_chant":  [41, 43],
    "lingonb":      [42, 52],
    "garlic":       [41],
    "truffle_b":    [41],
    "chestnut":     [41],
    "parasol":      [41, 52],
    "asparagus":    [52],
    "strawberry":   [41, 43, 52],
    "walnut":       [41],
    "amaranth":     [31, 41, 42, 43, 52, 71],
    "masterwort":   [71, 52],
    "nettle":       [31, 41, 42, 43, 52, 71],
    "morel":        [41, 43, 52],
    "sorrel":       [71, 52],
    "raspberry":    [41, 52],
    "dandelion":    [31, 41, 42, 43, 52, 71],
    "chickweed":    [31, 41, 42, 43, 52, 71],
    "chant":        [41, 43, 52],
    "st_george":    [71, 52],
    "artichoke":    [71, 52]
}

print(f"Fetching weather data from {'R2' if is_remote_path(FILE_PATH) else 'local'}...")
df = load_weather_df(FILE_PATH)
print("Weather data fetched successfully!")

df['Date'] = pd.to_datetime(df['Date'])
full_df = df.copy()  # forward window (today..+6) for the forecast tileset; today path collapses df below

# Select TODAY's scores for each coordinate. The master now holds a 7-day forward
# window (today..today+6); the map shows a single day, so we drop the future and take
# the most recent remaining row per coordinate -> today's row after a normal run, or
# the latest available date if today's scoring hasn't landed yet (map never blanks).
today = pd.Timestamp(datetime.now()).normalize()
df = df[df['Date'] <= today]
df_sorted = df.sort_values(by="Date", ascending=False)
df = df_sorted.groupby(['Latitude', 'Longitude']).first().reset_index()

# Convert DataFrame to GeoDataFrame
geometry = gpd.points_from_xy(df.Longitude, df.Latitude)
gdf = GeoDataFrame(df, geometry=geometry)


# Delaunay Triangulation
points = np.array(gdf.geometry.apply(lambda geom: (geom.x, geom.y)).to_list())
tri = Delaunay(points)
triangles = [Polygon(points[simplex]) for simplex in tri.simplices]
tri_gdf = gpd.GeoDataFrame(geometry=triangles)
tri_gdf['tri_id'] = range(len(tri_gdf))
tri_gdf = tri_gdf.set_crs("EPSG:4326")

print("Fetching wilderness GeoJSON from configured source...")
clipped_triangles_geojson = load_geojson_from_source(GEOJSON_FILE_PATH)
print("GeoJSON fetched and loaded into GeoDataFrame successfully!")


tri_gdf['geometry'] = tri_gdf.geometry.buffer(0)  # Clean geometries
clipped_triangles_geojson['geometry'] = clipped_triangles_geojson.geometry.buffer(0)  # Clean geometries

# Validate geometries and remove invalid ones
tri_gdf = tri_gdf[tri_gdf.is_valid]
clipped_triangles_geojson = clipped_triangles_geojson[clipped_triangles_geojson.is_valid]

print("start Set CRS and clip")
CLIPPED_TRIANGLES_PATH = get_required_env("USE_CLIPPED_GPKG")
if is_remote_path(CLIPPED_TRIANGLES_PATH):
    print("Loading clipped triangles from remote GPKG cache...")
    remote_gpkg_path = download_remote_file_to_temp(CLIPPED_TRIANGLES_PATH, ".gpkg")
    clipped_tri_gdf = gpd.read_file(remote_gpkg_path)[['raster_val', 'geometry']]
elif os.path.exists(CLIPPED_TRIANGLES_PATH):
    print("🔄 Loading cached clipped triangles...")
    clipped_tri_gdf = gpd.read_file(CLIPPED_TRIANGLES_PATH)[['raster_val', 'geometry']]
else:
    print("🛠 Clipping triangles to forest and saving...")
    tri_gdf = tri_gdf.set_crs(clipped_triangles_geojson.crs)
    clipped_tri_gdf = gpd.clip(tri_gdf, clipped_triangles_geojson)
    clipped_tri_gdf = gpd.sjoin(clipped_tri_gdf, clipped_triangles_geojson[['raster_val', 'geometry']], how="left", predicate="intersects").drop(columns='index_right')
    clipped_tri_gdf.to_file(CLIPPED_TRIANGLES_PATH, driver="GPKG")

# Always reassign clean tri_id
clipped_tri_gdf = clipped_tri_gdf.drop_duplicates(subset=['geometry']).reset_index(drop=True)
clipped_tri_gdf['tri_id'] = clipped_tri_gdf.index

# Perform a spatial join to get the IDs of matched triangles
matched_triangles = gpd.sjoin(clipped_tri_gdf, tri_gdf[['tri_id', 'geometry']], how="inner", predicate="intersects")

for specie, valid_rasters in species_forest_mapping.items():
    score_col = f'{specie}_score'
    details_col = f'{specie}_details'

    clipped_tri_gdf[score_col] = clipped_tri_gdf['raster_val'].apply(
        lambda val: np.nan if pd.notna(val) and val in valid_rasters else 0.0
    )

    clipped_tri_gdf[details_col] = None
print("Assigning species scores (dominant-habitat, optimized)...")

# --- 0) Compute DOMINANT raster per triangle (area-weighted in EPSG:5070) ---
_proj = "EPSG:5070"
_clipped_proj = clipped_tri_gdf.to_crs(_proj).copy()
_clipped_proj["__area_m2"] = _clipped_proj.geometry.area

_dom = (_clipped_proj.dropna(subset=["raster_val"])
        .groupby(["tri_id", "raster_val"], as_index=False)["__area_m2"].sum())
_dom = _dom.sort_values(["tri_id", "__area_m2"], ascending=[True, False])
_dominant = _dom.drop_duplicates(subset=["tri_id"], keep="first")

# Map tri_id -> dominant raster
tri_id_to_raster = dict(zip(_dominant["tri_id"], _dominant["raster_val"]))

# Keep only dominant row per triangle (ensures 1 row per tri_id)
clipped_tri_gdf = clipped_tri_gdf.merge(
    _dominant[["tri_id", "raster_val"]].rename(columns={"raster_val": "raster_val_dominant"}),
    on="tri_id", how="left"
)
clipped_tri_gdf = clipped_tri_gdf[
    clipped_tri_gdf["raster_val"].eq(clipped_tri_gdf["raster_val_dominant"])
].copy()
clipped_tri_gdf.drop(columns=["raster_val_dominant"], inplace=True)

# --- 1) Rebuild spatial match AFTER filtering, to keep valid_tris consistent ---
matched_triangles = gpd.sjoin(
    clipped_tri_gdf[["tri_id", "geometry"]],
    tri_gdf[["tri_id", "geometry"]],
    how="inner",
    predicate="intersects"
)
_tri_cols = [c for c in ['tri_id_left', 'tri_id', 'tri_id_right'] if c in matched_triangles.columns]
assert _tri_cols, f"No tri_id column found in matched_triangles: {matched_triangles.columns}"
_tri_col = _tri_cols[0]
valid_tris = set(matched_triangles[_tri_col].values)

# --- 2) KDTree in meters using projected CRS (_proj) ---
transformer = Transformer.from_crs("EPSG:4326", _proj, always_xy=True)
_xy_lonlat = np.array([(geom.x, geom.y) for geom in gdf.geometry], dtype=float)
xy_m       = np.array([transformer.transform(x, y) for (x, y) in _xy_lonlat], dtype=float)
tree       = cKDTree(xy_m)
_canon_latlon = list(zip(gdf['Latitude'].round(3).to_numpy(), gdf['Longitude'].round(3).to_numpy()))  # forecast: align per-day point scores to xy_m order

# --- 3) Precompute triangle centroids in meters (avoid repeated transforms) ---
clipped_unique = clipped_tri_gdf.drop_duplicates(subset=["tri_id"])[["tri_id", "geometry"]]
tri_centroids_m = {
    int(row.tri_id): np.array(
        transformer.transform(row.geometry.centroid.x, row.geometry.centroid.y),
        dtype=float
    )
    for _, row in clipped_unique.iterrows()
}

# --- 4) Parameters (tune if needed) ---
base_radius_km = 4    # start radius
max_radius_km  = 30    # expand up to
min_neighbors  = 2     # need at least this many
use_gaussian   = True
sigma_m        = 10000.0   # 10 km Gaussian sigma (update comment/value together)
p_idw          = 1.5       # used if use_gaussian=False

# --- 5) Faster combine: vectorized weights once, top-k median path for large N ---
def _combine(values: np.ndarray, dists_m: np.ndarray) -> float:
    n = values.size
    if n == 0:
        return np.nan
    if use_gaussian:
        w = np.exp(-(dists_m**2) / (2.0 * sigma_m**2))
    else:
        w = 1.0 / np.maximum(dists_m, 1.0)**p_idw
    if n >= 20:
        k = max(5, int(0.3 * n))
        top = np.argpartition(-w, k-1)[:k]   # O(n) selection
        return float(np.median(values[top]))
    s = w.sum()
    return float(np.dot(values, w) / s) if s > 0 else np.nan

# --- 6) Prep: species vectors (np arrays) for fast neighbor slicing ---
species_list = list(species_forest_mapping.keys())
score_cols   = [f"{s}_score" for s in species_list]
# Ensure columns exist on gdf (some pipelines create them earlier; else create NaN)
for sc in score_cols:
    if sc not in gdf.columns:
        gdf[sc] = np.nan

species_to_array = {s: gdf[f"{s}_score"].to_numpy(dtype=float) for s in species_list}
species_validsets = {s: set(species_forest_mapping[s]) for s in species_list}

# Initialize clipped scores to NaN (valid habitat triangles get filled; others remain NaN)
for s in species_list:
    sc = f"{s}_score"
    if sc not in clipped_tri_gdf.columns:
        clipped_tri_gdf[sc] = np.nan

# --- 7) Main loop: one neighbor search per triangle, reuse dists/weights across species ---
tri_ids = np.array(list(tri_centroids_m.keys()), dtype=int)
for tri_id in tri_ids:
    if tri_id not in valid_tris:
        continue

    centroid_m = tri_centroids_m[tri_id]
    r_m   = base_radius_km * 1000.0
    r_max = max_radius_km  * 1000.0

    idxs = tree.query_ball_point(centroid_m, r_m)
    while (len(idxs) < min_neighbors) and (r_m < r_max):
        r_m *= 1.6
        idxs = tree.query_ball_point(centroid_m, r_m)
    if not idxs:
        continue

    idxs = np.asarray(idxs, dtype=int)
    dists_m = np.linalg.norm(xy_m[idxs] - centroid_m, axis=1)

    tri_rv = tri_id_to_raster.get(tri_id, None)
    if tri_rv is None:
        continue

    mask_tri = (clipped_tri_gdf['tri_id'].values == tri_id)
    # Compute once per triangle the neighbor weights (not specie-specific)
    if use_gaussian:
        neigh_w = np.exp(-(dists_m**2) / (2.0 * sigma_m**2))
    else:
        neigh_w = 1.0 / np.maximum(dists_m, 1.0)**p_idw

    # For each species, only compute if habitat valid; slice neighbor values vectorized
    for s in species_list:
        if tri_rv not in species_validsets[s]:
            continue
        vals = species_to_array[s][idxs]
        # mask finite (exclude NaN)
        m = np.isfinite(vals)
        if not np.any(m):
            v = np.nan
        else:
            # Reuse precomputed weights but only where values are finite
            if vals[m].size >= 20:
                # median of top 30% by weight (using neigh_w[m])
                w = neigh_w[m]
                k = max(5, int(0.3 * w.size))
                top = np.argpartition(-w, k-1)[:k]
                v = float(np.median(vals[m][top]))
            else:
                w = neigh_w[m]
                ssum = w.sum()
                v = float(np.dot(vals[m], w) / ssum) if ssum > 0 else np.nan

        clipped_tri_gdf.loc[mask_tri, f"{s}_score"] = v

print("Finished optimized score calculation for all triangles.")

# --- 8) Fill remaining NaNs with 0.0 (no neighbor backfill) ---
score_columns = [c for c in clipped_tri_gdf.columns if c.endswith('_score')]
clipped_tri_gdf[score_columns] = clipped_tri_gdf[score_columns].fillna(0.0)

print("All NaN scores replaced with 0.0 — backfill skipped.")

clipped_tri_gdf = clipped_tri_gdf.drop_duplicates(subset=['geometry'])

gdf_full = clipped_tri_gdf.copy().reset_index(drop=True)

# Function to remove Z coordinates
def drop_z(geometry):
    """Remove the Z coordinate from geometries."""
    if geometry.is_empty:
        return geometry
    if geometry.geom_type == 'Polygon':
        # Handle exterior and interiors
        exterior = [(x, y) for x, y, *_ in geometry.exterior.coords]
        interiors = [[(x, y) for x, y, *_ in interior.coords] for interior in geometry.interiors]
        return Polygon(shell=exterior, holes=interiors)
    elif geometry.geom_type == 'MultiPolygon':
        return MultiPolygon([drop_z(polygon) for polygon in geometry.geoms])
    return geometry

# Apply the function to remove Z
gdf_full['geometry'] = gdf_full['geometry'].apply(drop_z)
_tri_geom = clipped_tri_gdf.drop_duplicates(subset=['tri_id']).set_index('tri_id')['geometry'].apply(drop_z)  # forecast: tri_id -> clean geometry


# ---------- FORECAST SCORING (day-6 endpoint + unified keep-set) ----------
# Anchored to the production "today" score so day 0 of the slider == the today tile
# exactly; only the day-6 *delta* comes from the forward weather scoring. The union
# keep-rule (max(today, d6) >= threshold for some species) drives BOTH tiles, so a
# kept polygon is present in today AND forecast and never pops in/out.
import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # repo backend/
from maplayer_forecast import score_days, interp_props

_score_cols_full = [c for c in gdf_full.columns if c.endswith('_score')]
today_by_tri = gdf_full.set_index('tri_id')[_score_cols_full].to_dict('index')

fwd_days = 7
today_norm = pd.Timestamp(datetime.now()).normalize()
full_df['Date'] = pd.to_datetime(full_df['Date'])
fwd_dates = sorted(d for d in full_df['Date'].dt.normalize().unique() if d >= today_norm)[:fwd_days]
if len(fwd_dates) < 2:
    fwd_dates = sorted(full_df['Date'].dt.normalize().unique())[-fwd_days:]  # stale-master fallback
print(f"Forecast window: {[str(pd.Timestamp(d).date()) for d in fwd_dates]}")

# Per-day species arrays aligned to the points' order; only the two endpoints needed.
canon_keys = _canon_latlon
fwd = full_df.copy(); fwd['Date'] = fwd['Date'].dt.normalize()
fwd['_lat'] = fwd['Latitude'].round(3); fwd['_lon'] = fwd['Longitude'].round(3)
species_arrays_by_day = []
for d in (fwd_dates[0], fwd_dates[-1]):
    day_df = (fwd[fwd['Date'] == d]
              .drop_duplicates(['_lat', '_lon'], keep='last')
              .set_index(['_lat', '_lon']))
    arrays = {}
    for s in species_list:
        col = f'{s}_score'
        series = day_df[col] if col in day_df.columns else pd.Series(dtype=float)
        arrays[s] = series.reindex(canon_keys).to_numpy(dtype=float)
    species_arrays_by_day.append(arrays)

per_tri = score_days(tree, xy_m, tri_centroids_m, valid_tris,
                     tri_id_to_raster, species_validsets, species_arrays_by_day)

# d0 = production today; d6 = today + (sd6 - sd0) (real forward delta, clamped 0..10).
fc_props_by_tri, keep_ids = {}, set()
for tid, today_row in today_by_tri.items():
    today = {s: float(today_row.get(f'{s}_score', 0.0) or 0.0) for s in species_list}
    sd = per_tri.get(tid)
    if sd:
        sd0, sd6 = sd[0], sd[-1]
        d6 = {s: min(10.0, max(0.0, today[s] + (float(sd6.get(s, 0.0)) - float(sd0.get(s, 0.0)))))
              for s in species_list}
    else:
        d6 = today  # un-forecastable triangle -> flat (stays put, never fades out)
    props = interp_props(today, d6)
    if props:
        keep_ids.add(tid)
        fc_props_by_tri[tid] = props
print(f"Unified keep-set (today == forecast): {len(keep_ids)} triangles")

def handle_geometry_collection(geometry):
    """Convert GeometryCollection into individual supported geometries."""
    if geometry.is_empty:
        return None
    if geometry.geom_type == "GeometryCollection":
        # Flatten the GeometryCollection and keep only supported geometries
        supported_geometries = []
        for geom in geometry.geoms:
            if geom.geom_type in ["Polygon", "MultiPolygon"]:
                supported_geometries.append(geom)
            elif geom.geom_type == "LineString":
                # Optionally handle LineString (e.g., buffer to create polygons)
                buffered = geom.buffer(0.001)  # Create a small buffer around the line
                supported_geometries.append(buffered)
        # Combine supported geometries into MultiPolygon if needed
        if len(supported_geometries) == 1:
            return supported_geometries[0]  # Return a single geometry
        elif len(supported_geometries) > 1:
            return MultiPolygon(supported_geometries)  # Combine into a MultiPolygon
        return None  # If no supported geometries, return None
    return geometry

# Apply the function to handle GeometryCollection
gdf_full['geometry'] = gdf_full['geometry'].apply(handle_geometry_collection)

# Remove any rows with empty or unsupported geometries
gdf_full = gdf_full[~gdf_full['geometry'].isnull()]

# Ensure GeoJSON structure compliance
# Retain all species score columns
score_columns = [col for col in gdf_full.columns if col.endswith('_score')]
gdf_full = gdf_full[['geometry', 'tri_id'] + score_columns]  # tri_id kept to apply the unified keep-set

# Calculate the bounding box of the entire dataset
minx, miny, maxx, maxy = gdf_full.total_bounds

# Step 1: Keep the unified set (today OR day-6 >= threshold); identical to the forecast tile.
score_columns = [col for col in gdf_full.columns if col.endswith('_score')]
filtered_gdf = gdf_full[gdf_full['tri_id'].isin(keep_ids)].drop(columns=['tri_id'])

# Step 2: Add dummy triangles for min/max color scale
dummy_triangles = [
    {'geometry': Polygon([(minx, -89.99), (maxx, -89.99), ((minx + maxx) / 2, -89.99)])},
    {'geometry': Polygon([(minx, 89.99), (maxx, 89.99), ((minx + maxx) / 2, 89.99)])}
]
for col in score_columns:
    dummy_triangles[0][col] = 0
    dummy_triangles[1][col] = 10
dummy_gdf = gpd.GeoDataFrame(dummy_triangles, crs=gdf_full.crs)

# Step 3: Concatenate dummy features
enhanced_gdf = pd.concat([filtered_gdf, dummy_gdf], ignore_index=True)

# Convert to GeoJSON after filtering
geojson_full = json.loads(enhanced_gdf.to_json())
geojson_size = len(json.dumps(geojson_full).encode('utf-8')) / (1024 * 1024)  # MB
print(f"💾 Final GeoJSON size after filtering: {geojson_size:.2f} MB")

# Validate GeoJSON structure
if geojson_full['type'] != 'FeatureCollection':
    raise ValueError("GeoJSON is not a valid FeatureCollection.")

for feature in geojson_full['features']:
    if 'geometry' not in feature or 'properties' not in feature:
        raise ValueError("Each feature must have 'geometry' and 'properties'.")
    if feature['geometry']['type'] not in ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon']:
        raise ValueError(f"Invalid geometry type: {feature['geometry']['type']}")

def round_coords(geom, p=6):
    def r(x): return round(x, p)
    def recurse(c): return list(map(r, c)) if isinstance(c[0], (float, int)) else [recurse(i) for i in c]
    geom['coordinates'] = recurse(geom['coordinates'])
    return geom

def round_scores(props, score_keys, p=1):
    for k in score_keys:
        if k in props and isinstance(props[k], (float, int)):
            props[k] = round(props[k], p)
    return props

# Get all score keys from first feature (or define them manually if needed)
score_keys = [k for k in geojson_full['features'][0]['properties'] if k.endswith('_score')]

# Apply rounding
for f in geojson_full['features']:
    f['geometry'] = round_coords(f['geometry'], p=6)
    f['properties'] = round_scores(f['properties'], score_keys, p=1)

# Check GeoJSON size
geojson_size = len(json.dumps(geojson_full).encode('utf-8')) / (1024 * 1024)
print(f"Size of the complete GeoJSON file: {geojson_size:.2f} MB")


# ---------- BUILD MBTILES & UPLOAD TO R2 ----------
gdf = gpd.GeoDataFrame.from_features(geojson_full["features"])
score_columns = [col for col in gdf.columns if col.endswith('_score')]
gdf = gdf[['geometry'] + score_columns]

print("Simplifying geometries...")
gdf['geometry'] = gdf['geometry'].simplify(tolerance=0.01, preserve_topology=True)

def remove_duplicate_coordinates(geometry):
    try:
        if geometry.geom_type == 'Polygon':
            return Polygon(list(dict.fromkeys(geometry.exterior.coords)))
        elif geometry.geom_type == 'MultiPolygon':
            return MultiPolygon([Polygon(list(dict.fromkeys(p.exterior.coords))) for p in geometry.geoms])
        return geometry
    except ValueError:
        return None

print("Removing redundant vertices...")
gdf['geometry'] = gdf['geometry'].apply(remove_duplicate_coordinates)
gdf = gdf[~gdf['geometry'].isnull()]

def round_coordinates(geometry, precision=5):
    if geometry.geom_type == 'Point':
        return Point(round(geometry.x, precision), round(geometry.y, precision))
    elif geometry.geom_type in ['Polygon', 'MultiPolygon']:
        return geometry.simplify(0.0005, preserve_topology=True)
    return geometry

print("Rounding coordinate precision...")
gdf['geometry'] = gdf['geometry'].apply(round_coordinates)
gdf = gdf[gdf.is_valid]

geojson_local = json.loads(gdf.to_json())

def build_mbtiles_from_geojson(geojson_path: Path, mbtiles_path: Path, layer_name: str,
                               keep_all: bool = False) -> None:
    tippecanoe_path = shutil.which("tippecanoe")
    if tippecanoe_path is None:
        print("tippecanoe not found. MBTiles generation skipped.")
        return
    # keep_all (forecast): never drop features, so forecast coverage >= today and a
    # polygon can't vanish when sliding. Today keeps drop-densest to stay small.
    cmd = [
        tippecanoe_path,
        "-o", str(mbtiles_path),
        "-z6",
        "--force",
        "--no-tile-size-limit" if keep_all else "--drop-densest-as-needed",
        "--simplification=4",
        "-d9",  # ~1.2km coord grid at z6: ~half the vertices of -d10 again; drops the smallest slivers. today+forecast use the same detail so the slider stays consistent
        "-l", layer_name,
        str(geojson_path),
    ]
    print("Running tippecanoe...")
    subprocess.run(cmd, check=True)
    print(f"MBTiles saved to: {mbtiles_path}")

def convert_mbtiles_to_pmtiles(mbtiles_path: Path, pmtiles_path: Path) -> bool:
    pmtiles_bin = shutil.which("pmtiles")
    if pmtiles_bin is None:
        print("pmtiles CLI not found. PMTiles conversion skipped.")
        return False
    print("Converting MBTiles -> PMTiles...")
    subprocess.run([pmtiles_bin, "convert", str(mbtiles_path), str(pmtiles_path)], check=True)
    print(f"PMTiles saved to: {pmtiles_path}")
    return True

# ponytail: reused for .pmtiles too — it's a generic put_object, no need for a second uploader
def upload_mbtiles_to_r2(mbtiles_path: Path, r2_key: str) -> None:
    client = boto3.client(
        's3',
        endpoint_url=get_required_env("R2_ENDPOINT_URL"),
        aws_access_key_id=get_required_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=get_required_env("R2_SECRET_ACCESS_KEY")
    )
    print(f"Uploading {mbtiles_path.name} to R2: {r2_key}...")
    with open(mbtiles_path, 'rb') as f:
        client.put_object(
            Bucket=get_required_env("R2_BUCKET_NAME"),
            Key=r2_key,
            Body=f.read(),
            ContentType="application/octet-stream"
        )
    print(f"✅ Uploaded to R2: {r2_key}")

with tempfile.TemporaryDirectory() as tmpdir:
    geojson_path = Path(tmpdir) / f"{region_code}_mushroom_data.geojson"
    mbtiles_path = Path(tmpdir) / f"{region_code}_mushroom_data.mbtiles"

    with open(geojson_path, 'w', encoding='utf-8') as f:
        json.dump(geojson_local, f, ensure_ascii=False)

    build_mbtiles_from_geojson(geojson_path, mbtiles_path, f"{region_code}_scores")

    if mbtiles_path.exists():
        upload_mbtiles_to_r2(mbtiles_path, f"USA/USE/{region_code}_mushroom_data.mbtiles")
        pmtiles_path = Path(tmpdir) / f"{region_code}_mushroom_data.pmtiles"
        if convert_mbtiles_to_pmtiles(mbtiles_path, pmtiles_path):
            upload_mbtiles_to_r2(pmtiles_path, f"USA/USE/{region_code}_mushroom_data.pmtiles")

    # ---------- FORECAST TILESET (two-point interp, same keep-set as today) ----------
    # fc_props_by_tri was computed up front (production-today d0 + forward-delta d6);
    # here we just attach geometry. Same triangles as the today tile -> never pops.
    tri_geom = _tri_geom
    fc_features, emitted_keys = [], set()
    for tri_id, props in fc_props_by_tri.items():
        if tri_id not in tri_geom.index:
            continue
        emitted_keys.update(props)
        fc_features.append({'geometry': tri_geom.loc[tri_id], **props})

    if fc_features:
        fc_gdf = gpd.GeoDataFrame(fc_features, crs=gdf_full.crs)
        # 0/10 colour-scale anchors per emitted key (mirror the today dummies)
        minx, miny, maxx, maxy = fc_gdf.total_bounds
        anchors = [
            {'geometry': Polygon([(minx, -89.99), (maxx, -89.99), ((minx + maxx) / 2, -89.99)])},
            {'geometry': Polygon([(minx, 89.99), (maxx, 89.99), ((minx + maxx) / 2, 89.99)])},
        ]
        for k in emitted_keys:
            anchors[0][k] = 0
            anchors[1][k] = 10
        fc_gdf = pd.concat([fc_gdf, gpd.GeoDataFrame(anchors, crs=gdf_full.crs)], ignore_index=True)
        fc_gdf['geometry'] = fc_gdf['geometry'].simplify(0.01, preserve_topology=True)  # match the today tile
        fc_gdf = fc_gdf[fc_gdf.is_valid]

        fc_geojson_path = Path(tmpdir) / f"{region_code}_forecast.geojson"
        fc_mbtiles_path = Path(tmpdir) / f"{region_code}_forecast.mbtiles"
        with open(fc_geojson_path, 'w', encoding='utf-8') as f:
            json.dump(json.loads(fc_gdf.to_json()), f, ensure_ascii=False)
        build_mbtiles_from_geojson(fc_geojson_path, fc_mbtiles_path, f"{region_code}_forecast", keep_all=True)
        if fc_mbtiles_path.exists():
            print(f"Forecast mbtiles: {fc_mbtiles_path.stat().st_size/1048576:.1f} MB "
                  f"(today: {mbtiles_path.stat().st_size/1048576:.1f} MB)")
            upload_mbtiles_to_r2(fc_mbtiles_path, f"USA/USE/{region_code}_forecast.mbtiles")
            fc_pmtiles_path = Path(tmpdir) / f"{region_code}_forecast.pmtiles"
            if convert_mbtiles_to_pmtiles(fc_mbtiles_path, fc_pmtiles_path):
                upload_mbtiles_to_r2(fc_pmtiles_path, f"USA/USE/{region_code}_forecast.pmtiles")
    else:
        print("No forecast deltas above threshold — forecast tileset skipped this run.")

print(f"✅ Processing & Upload Completed at {datetime.now()}")
print(f"Script ended at {datetime.now()}")

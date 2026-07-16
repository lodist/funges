"""Repository for the deduped lat/lon coordinate grid and static geo attributes.

Replaces two pieces of `forecast_pipeline.py`:

- `_load_or_build_coords`'s shapely point-in-polygon loop, with a single PostGIS
  `ST_Contains` spatial query against a region's stored boundary. Rounding/dedupe
  matches `_dedupe_and_sort_latlon` (round to `NDP` decimals, then sort).
- `_load_static_map`'s CSV-backed lookup, with a `static_geo_attributes` table
  lookup -- including `replace_missing_elevation_with_closest`'s nearest-known-
  elevation fallback, now done via a PostGIS KNN (`<->`) query instead of a
  scipy `cKDTree` over the whole dataset.
"""
import numpy as np
from sqlalchemy import Engine, bindparam, func, select, text
from sqlalchemy.dialects.postgresql import ARRAY, DOUBLE_PRECISION
from sqlalchemy.dialects.postgresql import insert as pg_insert

from funges_backend.geo.tables import coordinates, static_geo_attributes

NDP = 3


def _round(value: float) -> float:
    return round(float(value), NDP)


class CoordinateRepository:
    """Reads/writes the per-region coordinate grid and coordinate-keyed static attributes."""

    def __init__(self, engine: Engine):
        self._engine = engine

    def generate_grid(self, region: str, lat_range: tuple[float, float], lon_range: tuple[float, float], lat_step: float, lon_step: float) -> np.ndarray:
        """Build a candidate lat/lon grid, keep only points inside the region's stored
        boundary (via `ST_Contains`), dedupe/round and persist it, and return it --
        equivalent to `_load_or_build_coords`'s shapely-filtered, deduped grid.
        """
        lat_start, lat_end = lat_range
        lon_start, lon_end = lon_range
        lats = np.arange(lat_start, lat_end, lat_step)
        lons = np.arange(lon_start, lon_end, lon_step)
        candidates = sorted({(_round(lat), _round(lon)) for lat in lats for lon in lons})
        cand_lats = [lat for lat, _ in candidates]
        cand_lons = [lon for _, lon in candidates]

        stmt = text(
            """
            SELECT g.lat, g.lon
            FROM unnest(:lats, :lons) AS g(lat, lon)
            JOIN boundaries b ON b.region = :region
            WHERE ST_Contains(b.geom, ST_SetSRID(ST_MakePoint(g.lon, g.lat), 4326))
            """
        ).bindparams(
            bindparam("lats", value=cand_lats, type_=ARRAY(DOUBLE_PRECISION)),
            bindparam("lons", value=cand_lons, type_=ARRAY(DOUBLE_PRECISION)),
            bindparam("region", value=region),
        )

        with self._engine.begin() as conn:
            rows = conn.execute(stmt).all()
            filtered = sorted({(_round(lat), _round(lon)) for lat, lon in rows})
            if filtered:
                conn.execute(
                    pg_insert(coordinates).on_conflict_do_nothing(),
                    [{"region": region, "lat": lat, "lon": lon} for lat, lon in filtered],
                )
        return np.array(filtered, dtype=float)

    def store_coordinates(self, region: str, coords) -> None:
        """Insert a region's coordinate grid as loaded from a source file, deduping/rounding
        and skipping rows already present. Unlike `generate_grid`, this does not filter
        against the region's stored boundary -- the caller is trusting the source file.
        """
        rounded = sorted({(_round(lat), _round(lon)) for lat, lon in coords})
        if not rounded:
            return
        with self._engine.begin() as conn:
            conn.execute(
                pg_insert(coordinates).on_conflict_do_nothing(),
                [{"region": region, "lat": lat, "lon": lon} for lat, lon in rounded],
            )

    def get_coordinates(self, region: str) -> np.ndarray:
        """Return the persisted, deduped/sorted lat/lon grid for a region."""
        stmt = select(coordinates.c.lat, coordinates.c.lon).where(coordinates.c.region == region).order_by(coordinates.c.lat, coordinates.c.lon)
        with self._engine.connect() as conn:
            rows = conn.execute(stmt).all()
        return np.array(rows, dtype=float)

    def upsert_static_attributes(
        self,
        lat: float,
        lon: float,
        *,
        altitude: float | None,
        dist_m_water: float | None,
        dist_m_sea: float | None,
        climate_zone: str | None,
        ph_level: float | None,
    ) -> None:
        """Insert or update a coordinate's static attributes."""
        lat_r, lon_r = _round(lat), _round(lon)
        geom = func.st_setsrid(func.st_makepoint(lon_r, lat_r), 4326)
        stmt = pg_insert(static_geo_attributes).values(
            lat=lat_r, lon=lon_r, altitude=altitude, dist_m_water=dist_m_water,
            dist_m_sea=dist_m_sea, climate_zone=climate_zone, ph_level=ph_level, geom=geom,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[static_geo_attributes.c.lat, static_geo_attributes.c.lon],
            set_={
                "altitude": stmt.excluded.altitude,
                "dist_m_water": stmt.excluded.dist_m_water,
                "dist_m_sea": stmt.excluded.dist_m_sea,
                "climate_zone": stmt.excluded.climate_zone,
                "ph_level": stmt.excluded.ph_level,
                "geom": stmt.excluded.geom,
            },
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def get_static_attributes(self, lat: float, lon: float) -> dict:
        """Return a coordinate's static attributes, falling back to the nearest
        known-elevation coordinate when this one's altitude is missing (mirrors
        `replace_missing_elevation_with_closest`).
        """
        lat_r, lon_r = _round(lat), _round(lon)
        stmt = select(
            static_geo_attributes.c.altitude,
            static_geo_attributes.c.dist_m_water,
            static_geo_attributes.c.dist_m_sea,
            static_geo_attributes.c.climate_zone,
            static_geo_attributes.c.ph_level,
        ).where(static_geo_attributes.c.lat == lat_r, static_geo_attributes.c.lon == lon_r)
        with self._engine.connect() as conn:
            row = conn.execute(stmt).mappings().one_or_none()

        result = (
            dict(row)
            if row is not None
            else {"altitude": None, "dist_m_water": None, "dist_m_sea": None, "climate_zone": None, "ph_level": None}
        )
        if result["altitude"] is None:
            result["altitude"] = self._nearest_known_altitude(lat_r, lon_r)
        return result

    def _nearest_known_altitude(self, lat: float, lon: float) -> float | None:
        point = func.st_setsrid(func.st_makepoint(lon, lat), 4326)
        stmt = (
            select(static_geo_attributes.c.altitude)
            .where(static_geo_attributes.c.altitude.is_not(None))
            .order_by(static_geo_attributes.c.geom.op("<->")(point))
            .limit(1)
        )
        with self._engine.connect() as conn:
            return conn.execute(stmt).scalar_one_or_none()

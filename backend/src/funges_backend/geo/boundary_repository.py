"""Repository for region boundary geometries.

Replaces the GeoJSON-file loading in `forecast_pipeline._load_or_build_coords`
(parsing a region's GeoJSON `FeatureCollection` and `unary_union`-ing its
features into a single polygon) with reads/writes against the `boundaries`
Postgres/PostGIS table.
"""
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union
from sqlalchemy import Engine, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from funges_backend.geo.tables import boundaries


class BoundaryRepository:
    """Reads/writes region boundary geometries."""

    def __init__(self, engine: Engine):
        self._engine = engine

    def store_boundary_from_geojson(self, region: str, feature_collection: dict) -> None:
        """Union a region's GeoJSON `FeatureCollection` features into a single boundary and store it."""
        shapes = [shape(feature["geometry"]) for feature in feature_collection.get("features", [])]
        self.store_boundary(region, unary_union(shapes))

    def store_boundary(self, region: str, geometry: BaseGeometry) -> None:
        """Insert or update a region's boundary geometry."""
        stmt = pg_insert(boundaries).values(region=region, geom=from_shape(geometry, srid=4326))
        stmt = stmt.on_conflict_do_update(index_elements=[boundaries.c.region], set_={"geom": stmt.excluded.geom})
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def get_boundary(self, region: str) -> BaseGeometry | None:
        """Return a region's boundary geometry, or `None` if it hasn't been stored."""
        stmt = select(boundaries.c.geom).where(boundaries.c.region == region)
        with self._engine.connect() as conn:
            geom = conn.execute(stmt).scalar_one_or_none()
        return to_shape(geom) if geom is not None else None

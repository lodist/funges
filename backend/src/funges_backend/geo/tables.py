"""SQLAlchemy Core table definitions for region boundaries, the coordinate grid,
and static geo attributes.

Mirrors the shapes that `_load_or_build_coords` / `_load_static_map`
(forecast_pipeline.py) currently read from GeoJSON/JSON/CSV files: one polygon
per region, one row per deduped (lat, lon) grid point scoped to the region it
was generated for, and one row per coordinate's static attributes (altitude,
distance to water/sea, climate zone, pH) shared across regions.
"""
from geoalchemy2 import Geometry
from sqlalchemy import Column, Float, ForeignKey, Index, MetaData, Table, Text

metadata = MetaData()

boundaries = Table(
    "boundaries",
    metadata,
    Column("region", Text, primary_key=True),
    Column("geom", Geometry(geometry_type="MULTIPOLYGON", srid=4326), nullable=False),
    Index("ix_boundaries_geom", "geom", postgresql_using="gist"),
)

coordinates = Table(
    "coordinates",
    metadata,
    Column("region", Text, ForeignKey("boundaries.region", ondelete="CASCADE"), primary_key=True),
    Column("lat", Float, primary_key=True),
    Column("lon", Float, primary_key=True),
)

static_geo_attributes = Table(
    "static_geo_attributes",
    metadata,
    Column("lat", Float, primary_key=True),
    Column("lon", Float, primary_key=True),
    Column("altitude", Float, nullable=True),
    Column("dist_m_water", Float, nullable=True),
    Column("dist_m_sea", Float, nullable=True),
    Column("climate_zone", Text, nullable=True),
    Column("ph_level", Float, nullable=True),
    Column("geom", Geometry(geometry_type="POINT", srid=4326), nullable=False),
    Index("ix_static_geo_attributes_geom", "geom", postgresql_using="gist"),
)

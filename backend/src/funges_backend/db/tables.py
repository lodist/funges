"""SQLAlchemy Core table definitions."""

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB

from funges_backend.db.metadata import metadata

species = Table(
    "species",
    metadata,
    Column("id", String(80), primary_key=True),
    Column("scientific_name", Text),
    Column("optimal_temp", Float),
    Column("temp_sigma", Float),
    Column("optimal_alt", Float),
    Column("alt_sigma", Float),
    Column("optimal_humidity", Float),
    Column("humidity_sigma", Float),
    Column("optimal_ph", Float),
    Column("ph_sigma_near", Float),
    Column("ph_sigma_far", Float),
    Column("min_cumulative_rain", Float),
    Column("wind_sensitive", Boolean),
    Column("water_relevance", Boolean),
    Column("sea_relevance", Boolean),
    Column("weather_preference", JSONB),
    Column("climate_zones", JSONB),
    Column("ph_range_near", JSONB),
    Column("season_curve", JSONB),
    Column("season_months", JSONB),
    Column("extra_params", JSONB, nullable=False, server_default="{}"),
)

zone_season_curves = Table(
    "zone_season_curves",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("climate_zone", String(80), nullable=False),
    Column("species_id", String(80), ForeignKey("species.id", ondelete="CASCADE"), nullable=False),
    Column("month", Integer, nullable=False),
    Column("multiplier", Float, nullable=False),
    Column("ratio", Float),
    CheckConstraint("month BETWEEN 1 AND 12", name="ck_zone_curve_month"),
    UniqueConstraint("climate_zone", "species_id", "month", name="uq_zone_species_month"),
)

boundaries = Table(
    "boundaries",
    metadata,
    Column("region_id", String(16), primary_key=True),
    Column("geometry", Geometry("GEOMETRY", srid=4326, spatial_index=False), nullable=False),
)

coordinates = Table(
    "coordinates",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("region_id", String(16), ForeignKey("boundaries.region_id", ondelete="CASCADE"), nullable=False),
    Column("latitude", Float, nullable=False),
    Column("longitude", Float, nullable=False),
    Column("geometry", Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
    UniqueConstraint("region_id", "latitude", "longitude", name="uq_region_coordinate"),
)

static_geo_attributes = Table(
    "static_geo_attributes",
    metadata,
    Column("coordinate_id", Integer, ForeignKey("coordinates.id", ondelete="CASCADE"), primary_key=True),
    Column("altitude", Float),
    Column("dist_m_water", Float),
    Column("dist_m_sea", Float),
    Column("climate_zone", String(80)),
    Column("ph_level", Float),
)

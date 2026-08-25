"""SQLAlchemy Core table definitions."""

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

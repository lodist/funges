"""SQLAlchemy Core table definitions for species scoring params and season curves.

Mirrors the shape of the `.txt`/JSON files that `_load_species_and_curves`
(forecast_pipeline.py) currently loads via `exec()`: one row per species for the
scalar/JSONB scoring params, and one row per (climate zone, species, month) for
the empirical zone season curves.
"""
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Float,
    ForeignKey,
    Integer,
    MetaData,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData()

species = Table(
    "species",
    metadata,
    Column("name", Text, primary_key=True),
    Column("optimal_temp", Float, nullable=False),
    Column("temp_sigma", Float, nullable=False),
    Column("optimal_alt", Float, nullable=False),
    Column("alt_sigma", Float, nullable=False),
    Column("optimal_humidity", Float, nullable=False),
    Column("humidity_sigma", Float, nullable=False),
    Column("optimal_pH", Float, nullable=False),
    Column("pH_sigma_near", Float, nullable=False),
    Column("pH_sigma_far", Float, nullable=False),
    Column("min_cumulative_rain", Float, nullable=False),
    Column("wind_sensitive", Boolean, nullable=False),
    Column("water_relevance", Boolean, nullable=False),
    Column("sea_relevance", Boolean, nullable=False),
    Column("weather_preference", JSONB, nullable=False),
    Column("climate_zones", JSONB, nullable=False),
    Column("pH_range_near", JSONB, nullable=False),
    Column("season_curve", JSONB, nullable=True),
    Column("season_months", JSONB, nullable=True),
    Column("season_factor", Float, nullable=True),
)

zone_season_curves = Table(
    "zone_season_curves",
    metadata,
    Column("climate_zone", Text, primary_key=True),
    Column("species", Text, ForeignKey("species.name", ondelete="CASCADE"), primary_key=True),
    Column("month", Integer, primary_key=True),
    Column("multiplier", Float, nullable=False),
    CheckConstraint("month >= 1 AND month <= 12", name="zone_season_curves_month_range"),
)

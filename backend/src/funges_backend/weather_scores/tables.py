"""SQLAlchemy Core table definition for the rolling weather/score master table.

Replaces the per-region parquet master file (`NE_WEATHER_DATA` etc., see
`forecast_pipeline.py`'s `masterfile_columns`) with one row per (Location_Id,
Date) in Postgres. Per-species scores live in a single JSONB column rather
than one column per species, since the set of scored species is itself
data-driven (the `species` table), not fixed at schema time.
"""
from sqlalchemy import Column, Date, Float, MetaData, Table, Text
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData()

weather_scores = Table(
    "weather_scores",
    metadata,
    Column("location_id", Text, primary_key=True),
    Column("date", Date, primary_key=True),
    Column("latitude", Float, nullable=False),
    Column("longitude", Float, nullable=False),
    Column("elevation_m", Float, nullable=True),
    Column("pressure_hpa", Float, nullable=True),
    Column("total_precipitation_mm", Float, nullable=True),
    Column("humidity_pct", Float, nullable=True),
    Column("wind_speed_ms", Float, nullable=True),
    Column("description", Text, nullable=True),
    Column("temperature_c_max", Float, nullable=True),
    Column("temperature_c_min", Float, nullable=True),
    Column("temperature_c", Float, nullable=True),
    Column("dist_m_water", Float, nullable=True),
    Column("dist_m_sea", Float, nullable=True),
    Column("climate_zone", Text, nullable=True),
    Column("ph_level", Float, nullable=True),
    Column("scores", JSONB, nullable=False, server_default="{}"),
)

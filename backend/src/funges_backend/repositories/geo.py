"""PostGIS repositories for boundaries, coordinate grids, and static attributes."""

from collections.abc import Iterable, Mapping
from typing import Any

import pandas as pd
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry.base import BaseGeometry
from sqlalchemy import Engine, select, text
from sqlalchemy.dialects.postgresql import insert

from funges_backend.db.tables import boundaries, coordinates, static_geo_attributes


class BoundaryRepository:
    def __init__(self, engine: Engine):
        self.engine = engine

    def upsert(self, region_id: str, geometry: BaseGeometry) -> None:
        statement = insert(boundaries).values(
            region_id=region_id,
            geometry=from_shape(geometry, srid=4326),
        )
        statement = statement.on_conflict_do_update(
            index_elements=[boundaries.c.region_id],
            set_={"geometry": statement.excluded.geometry},
        )
        with self.engine.begin() as connection:
            connection.execute(statement)

    def get(self, region_id: str) -> BaseGeometry | None:
        query = select(boundaries.c.geometry).where(boundaries.c.region_id == region_id)
        with self.engine.connect() as connection:
            value = connection.scalar(query)
        return to_shape(value) if value is not None else None


class CoordinateRepository:
    def __init__(self, engine: Engine):
        self.engine = engine

    def generate_grid(
        self,
        region_id: str,
        *,
        lat_range: tuple[float, float],
        lon_range: tuple[float, float],
        lat_step: float,
        lon_step: float,
        ndp: int = 3,
    ) -> list[tuple[float, float]]:
        """Generate candidates and filter them with PostGIS ``ST_Within``."""

        statement = text(
            """
            WITH candidates AS (
                SELECT
                    round(lat_value, :ndp)::double precision AS latitude,
                    round(lon_value, :ndp)::double precision AS longitude
                FROM generate_series(
                    CAST(:lat_min AS numeric),
                    CAST(:lat_max AS numeric) - CAST(:lat_step AS numeric),
                    CAST(:lat_step AS numeric)
                ) AS lat_value
                CROSS JOIN generate_series(
                    CAST(:lon_min AS numeric),
                    CAST(:lon_max AS numeric) - CAST(:lon_step AS numeric),
                    CAST(:lon_step AS numeric)
                ) AS lon_value
            ), points AS (
                SELECT latitude, longitude,
                    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geometry
                FROM candidates
            )
            INSERT INTO coordinates (region_id, latitude, longitude, geometry)
            SELECT :region_id, p.latitude, p.longitude, p.geometry
            FROM points p
            JOIN boundaries b ON b.region_id = :region_id
            WHERE ST_Within(p.geometry, b.geometry)
            ON CONFLICT ON CONSTRAINT uq_region_coordinate DO NOTHING
            """
        )
        params = {
            "region_id": region_id,
            "lat_min": lat_range[0],
            "lat_max": lat_range[1],
            "lon_min": lon_range[0],
            "lon_max": lon_range[1],
            "lat_step": lat_step,
            "lon_step": lon_step,
            "ndp": ndp,
        }
        with self.engine.begin() as connection:
            connection.execute(statement, params)
        return self.list(region_id)

    def list(self, region_id: str) -> list[tuple[float, float]]:
        query = (
            select(coordinates.c.latitude, coordinates.c.longitude)
            .where(coordinates.c.region_id == region_id)
            .order_by(coordinates.c.latitude, coordinates.c.longitude)
        )
        with self.engine.connect() as connection:
            return [
                (float(row.latitude), float(row.longitude)) for row in connection.execute(query)
            ]

    def upsert_static_attributes(
        self,
        region_id: str,
        entries: Iterable[Mapping[str, Any]],
        *,
        ndp: int = 3,
    ) -> None:
        query = select(coordinates.c.id, coordinates.c.latitude, coordinates.c.longitude).where(
            coordinates.c.region_id == region_id
        )
        with self.engine.connect() as connection:
            coordinate_ids = {
                (round(row.latitude, ndp), round(row.longitude, ndp)): row.id
                for row in connection.execute(query)
            }
        rows = []
        missing = []
        for entry in entries:
            key = (round(float(entry["Latitude"]), ndp), round(float(entry["Longitude"]), ndp))
            coordinate_id = coordinate_ids.get(key)
            if coordinate_id is None:
                missing.append(key)
                continue
            rows.append(
                {
                    "coordinate_id": coordinate_id,
                    "altitude": entry.get("Altitude"),
                    "dist_m_water": entry.get("dist_m_water"),
                    "dist_m_sea": entry.get("dist_m_sea"),
                    "climate_zone": entry.get("climate_zone"),
                    "ph_level": entry.get("ph_level"),
                }
            )
        if missing:
            raise ValueError(f"static attributes reference unknown coordinates: {missing[:5]}")
        if not rows:
            return
        statement = insert(static_geo_attributes).values(rows)
        statement = statement.on_conflict_do_update(
            index_elements=[static_geo_attributes.c.coordinate_id],
            set_={
                column: statement.excluded[column]
                for column in (
                    "altitude",
                    "dist_m_water",
                    "dist_m_sea",
                    "climate_zone",
                    "ph_level",
                )
            },
        )
        with self.engine.begin() as connection:
            connection.execute(statement)

    def get_static_attributes(
        self,
        region_id: str,
        latitude: float,
        longitude: float,
    ) -> dict[str, Any] | None:
        query = (
            select(static_geo_attributes)
            .join(coordinates, coordinates.c.id == static_geo_attributes.c.coordinate_id)
            .where(
                coordinates.c.region_id == region_id,
                coordinates.c.latitude == latitude,
                coordinates.c.longitude == longitude,
            )
        )
        with self.engine.connect() as connection:
            row = connection.execute(query).mappings().one_or_none()
            if row is None:
                return None
            altitude = row["altitude"]
            if altitude is None:
                altitude = connection.scalar(
                    text(
                        """
                        SELECT s.altitude
                        FROM static_geo_attributes s
                        JOIN coordinates c ON c.id = s.coordinate_id
                        WHERE c.region_id = :region_id AND s.altitude IS NOT NULL
                        ORDER BY c.geometry <-> ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
                        LIMIT 1
                        """
                    ),
                    {"region_id": region_id, "latitude": latitude, "longitude": longitude},
                )
        return {
            "Altitude": float(altitude) if altitude is not None else None,
            "dist_m_water": row["dist_m_water"],
            "dist_m_sea": row["dist_m_sea"],
            "climate_zone": row["climate_zone"],
            "ph_level": row["ph_level"],
        }

    def static_attribute_frame(self, region_id: str) -> pd.DataFrame:
        query = (
            select(
                coordinates.c.latitude.label("Latitude"),
                coordinates.c.longitude.label("Longitude"),
                static_geo_attributes.c.altitude.label("Altitude"),
                static_geo_attributes.c.dist_m_water,
                static_geo_attributes.c.dist_m_sea,
                static_geo_attributes.c.climate_zone,
                static_geo_attributes.c.ph_level,
            )
            .outerjoin(
                static_geo_attributes, coordinates.c.id == static_geo_attributes.c.coordinate_id
            )
            .where(coordinates.c.region_id == region_id)
        )
        with self.engine.connect() as connection:
            return pd.DataFrame(connection.execute(query).mappings().all())

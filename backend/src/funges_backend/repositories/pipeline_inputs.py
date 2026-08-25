"""Repository-owned base points and habitat geometry for pipeline consumers."""

from collections.abc import Iterable, Mapping
from typing import Any

import geopandas as gpd
import pandas as pd
from geoalchemy2.shape import from_shape, to_shape
from sqlalchemy import Engine, delete, select
from sqlalchemy.dialects.postgresql import insert

from funges_backend.db.tables import base_points, coordinates, habitat_polygons


class PipelineInputRepository:
    def __init__(self, engine: Engine):
        self.engine = engine

    def upsert_base_points(self, region_id: str, records: Iterable[Mapping[str, Any]]) -> None:
        rows = []
        for record in records:
            known = {"Location_Id", "Latitude", "Longitude", "coordinate_id"}
            rows.append(
                {
                    "region_id": region_id,
                    "location_id": str(record["Location_Id"]),
                    "latitude": float(record["Latitude"]),
                    "longitude": float(record["Longitude"]),
                    "coordinate_id": record.get("coordinate_id"),
                    "payload": {key: value for key, value in record.items() if key not in known},
                }
            )
        if not rows:
            return
        statement = insert(base_points).values(rows)
        statement = statement.on_conflict_do_update(
            constraint="uq_base_point_region_location",
            set_={
                "latitude": statement.excluded.latitude,
                "longitude": statement.excluded.longitude,
                "coordinate_id": statement.excluded.coordinate_id,
                "payload": statement.excluded.payload,
            },
        )
        with self.engine.begin() as connection:
            connection.execute(statement)

    def read_base_points(self, region_id: str) -> pd.DataFrame:
        query = (
            select(
                base_points,
                coordinates.c.latitude.label("coord_lat"),
                coordinates.c.longitude.label("coord_lon"),
            )
            .outerjoin(coordinates, coordinates.c.id == base_points.c.coordinate_id)
            .where(base_points.c.region_id == region_id)
            .order_by(base_points.c.location_id)
        )
        with self.engine.connect() as connection:
            rows = connection.execute(query).mappings().all()
        records = []
        for row in rows:
            record = dict(row["payload"] or {})
            record.update(
                {
                    "Location_Id": row["location_id"],
                    "Latitude": row["latitude"],
                    "Longitude": row["longitude"],
                    "coord_lat": row["coord_lat"],
                    "coord_lon": row["coord_lon"],
                }
            )
            records.append(record)
        return pd.DataFrame(records)

    def replace_habitats(self, region_id: str, frame: gpd.GeoDataFrame) -> None:
        rows = [
            {
                "region_id": region_id,
                "raster_val": None if pd.isna(row.get("raster_val")) else int(row["raster_val"]),
                "geometry": from_shape(row.geometry, srid=4326),
            }
            for _, row in frame.to_crs(4326).iterrows()
        ]
        with self.engine.begin() as connection:
            connection.execute(
                delete(habitat_polygons).where(habitat_polygons.c.region_id == region_id)
            )
            if rows:
                connection.execute(insert(habitat_polygons), rows)

    def read_habitats(self, region_id: str) -> gpd.GeoDataFrame:
        query = select(habitat_polygons.c.raster_val, habitat_polygons.c.geometry).where(
            habitat_polygons.c.region_id == region_id
        )
        with self.engine.connect() as connection:
            rows = connection.execute(query).mappings().all()
        return gpd.GeoDataFrame(
            [
                {"raster_val": row["raster_val"], "geometry": to_shape(row["geometry"])}
                for row in rows
            ],
            geometry="geometry",
            crs="EPSG:4326",
        )

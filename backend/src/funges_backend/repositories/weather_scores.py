"""Persistence for the rolling weather history and species score master."""

from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import Engine, select, update
from sqlalchemy.dialects.postgresql import JSONB, insert

from funges_backend.db.tables import weather_scores
from funges_backend.forecast_pipeline import assert_window_contiguous

KEY_COLUMNS = {"Location_Id", "Date", "Latitude", "Longitude"}


def _json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return pd.Timestamp(value).isoformat()
    if bool(pd.isna(value)):
        return None
    return value


class WeatherScoreRepository:
    def __init__(self, engine: Engine):
        self.engine = engine

    def upsert_forecast_rows(self, region_id: str, frame: pd.DataFrame) -> None:
        """Upsert rows so the later/fresher call wins on overlapping dates."""

        rows = []
        for record in frame.to_dict(orient="records"):
            location_id = str(record.get("Location_Id", ""))
            if not location_id:
                continue
            when = pd.Timestamp(record["Date"]).date()
            rows.append(
                {
                    "region_id": region_id,
                    "location_id": location_id,
                    "date": when,
                    "latitude": _json_value(record.get("Latitude")),
                    "longitude": _json_value(record.get("Longitude")),
                    "payload": {
                        key: _json_value(value)
                        for key, value in record.items()
                        if key not in KEY_COLUMNS
                    },
                }
            )
        if not rows:
            return
        statement = insert(weather_scores).values(rows)
        statement = statement.on_conflict_do_update(
            constraint="uq_weather_location_date",
            set_={
                "region_id": statement.excluded.region_id,
                "latitude": statement.excluded.latitude,
                "longitude": statement.excluded.longitude,
                "payload": statement.excluded.payload,
                "updated_at": pd.Timestamp.now(tz="UTC").to_pydatetime(),
            },
        )
        with self.engine.begin() as connection:
            connection.execute(statement)

    def read_all(self, region_id: str | None = None) -> pd.DataFrame:
        query = select(weather_scores).order_by(weather_scores.c.location_id, weather_scores.c.date)
        if region_id is not None:
            query = query.where(weather_scores.c.region_id == region_id)
        with self.engine.connect() as connection:
            rows = connection.execute(query).mappings().all()
        return self._to_frame(rows)

    def read_forward_window(self, today: Any, region_id: str | None = None) -> pd.DataFrame:
        query = select(weather_scores).where(
            weather_scores.c.date >= pd.Timestamp(today).date()
        ).order_by(weather_scores.c.location_id, weather_scores.c.date)
        if region_id is not None:
            query = query.where(weather_scores.c.region_id == region_id)
        with self.engine.connect() as connection:
            rows = connection.execute(query).mappings().all()
        return self._to_frame(rows)

    def read_location_history(self, location_id: str) -> pd.DataFrame:
        query = (
            select(weather_scores)
            .where(weather_scores.c.location_id == location_id)
            .order_by(weather_scores.c.date)
        )
        with self.engine.connect() as connection:
            rows = connection.execute(query).mappings().all()
        return self._to_frame(rows)

    def write_forward_scores(
        self,
        frame: pd.DataFrame,
        *,
        today: Any,
        score_columns: list[str],
    ) -> None:
        cutoff = pd.Timestamp(today).normalize()
        forward = frame[pd.to_datetime(frame["Date"]).dt.normalize() >= cutoff]
        with self.engine.begin() as connection:
            for record in forward.to_dict(orient="records"):
                scores = {
                    column: _json_value(record[column])
                    for column in score_columns
                    if column in record
                }
                if not scores:
                    continue
                connection.execute(
                    update(weather_scores)
                    .where(
                        weather_scores.c.location_id == str(record["Location_Id"]),
                        weather_scores.c.date == pd.Timestamp(record["Date"]).date(),
                    )
                    .values(payload=weather_scores.c.payload.op("||", return_type=JSONB)(scores))
                )

    def assert_contiguous(self, today: Any, *, region_id: str | None = None) -> None:
        assert_window_contiguous(self.read_all(region_id), today)

    @staticmethod
    def _to_frame(rows: list[Any]) -> pd.DataFrame:
        records = []
        for row in rows:
            record = dict(row["payload"])
            record.update(
                {
                    "Location_Id": row["location_id"],
                    "Date": pd.Timestamp(row["date"]),
                    "Latitude": row["latitude"],
                    "Longitude": row["longitude"],
                }
            )
            records.append(record)
        return pd.DataFrame(records)

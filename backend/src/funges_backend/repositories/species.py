"""Persistence for scoring parameters and empirical season curves."""

from collections.abc import Mapping
from typing import Any

from sqlalchemy import Engine, select
from sqlalchemy.dialects.postgresql import insert

from funges_backend.db.tables import species, zone_season_curves
from funges_backend.seasonality import normalize_curve

PARAM_TO_COLUMN = {
    "optimal_temp": "optimal_temp",
    "temp_sigma": "temp_sigma",
    "optimal_alt": "optimal_alt",
    "alt_sigma": "alt_sigma",
    "optimal_humidity": "optimal_humidity",
    "humidity_sigma": "humidity_sigma",
    "optimal_pH": "optimal_ph",
    "pH_sigma_near": "ph_sigma_near",
    "pH_sigma_far": "ph_sigma_far",
    "min_cumulative_rain": "min_cumulative_rain",
    "wind_sensitive": "wind_sensitive",
    "water_relevance": "water_relevance",
    "sea_relevance": "sea_relevance",
    "weather_preference": "weather_preference",
    "climate_zones": "climate_zones",
    "pH_range_near": "ph_range_near",
    "season_curve": "season_curve",
    "season_months": "season_months",
}
COLUMN_TO_PARAM = {column: param for param, column in PARAM_TO_COLUMN.items()}


def _json_month_keys(curve: Any) -> Any:
    if not isinstance(curve, Mapping):
        return curve
    if "multiplier" in curve:
        result = {"multiplier": {int(k): float(v) for k, v in curve["multiplier"].items()}}
        if curve.get("ratio"):
            result["ratio"] = {int(k): float(v) for k, v in curve["ratio"].items()}
        return result
    return {int(k): float(v) for k, v in curve.items()}


class SpeciesRepository:
    def __init__(self, engine: Engine):
        self.engine = engine

    def upsert_species(
        self,
        species_id: str,
        params: Mapping[str, Any],
        *,
        scientific_name: str | None = None,
    ) -> None:
        values: dict[str, Any] = {"id": species_id, "scientific_name": scientific_name}
        for param, column in PARAM_TO_COLUMN.items():
            if param in params:
                values[column] = params[param]
        values["extra_params"] = {
            key: value for key, value in params.items() if key not in PARAM_TO_COLUMN
        }
        statement = insert(species).values(**values)
        updates = {column: statement.excluded[column] for column in values if column != "id"}
        with self.engine.begin() as connection:
            connection.execute(statement.on_conflict_do_update(index_elements=[species.c.id], set_=updates))

    def get_species_params(self, species_id: str) -> dict[str, Any] | None:
        with self.engine.connect() as connection:
            row = connection.execute(select(species).where(species.c.id == species_id)).mappings().one_or_none()
        return self._params_from_row(row) if row else None

    def get_all_species_params(self) -> dict[str, dict[str, Any]]:
        with self.engine.connect() as connection:
            rows = connection.execute(select(species).order_by(species.c.id)).mappings()
            return {row["id"]: self._params_from_row(row) for row in rows}

    def upsert_zone_curves(self, curves: Mapping[str, Mapping[str, Any]]) -> None:
        rows = []
        for climate_zone, species_curves in curves.items():
            for species_id, raw_curve in species_curves.items():
                curve = normalize_curve(raw_curve)
                if not curve:
                    continue
                ratio = curve.get("ratio", {})
                for month, multiplier in curve["multiplier"].items():
                    rows.append(
                        {
                            "climate_zone": climate_zone,
                            "species_id": species_id,
                            "month": month,
                            "multiplier": multiplier,
                            "ratio": ratio.get(month),
                        }
                    )
        if not rows:
            return
        statement = insert(zone_season_curves).values(rows)
        statement = statement.on_conflict_do_update(
            constraint="uq_zone_species_month",
            set_={
                "multiplier": statement.excluded.multiplier,
                "ratio": statement.excluded.ratio,
            },
        )
        with self.engine.begin() as connection:
            connection.execute(statement)

    def get_zone_curves(self, climate_zone: str | None = None) -> dict[str, dict[str, Any]]:
        query = select(zone_season_curves).order_by(
            zone_season_curves.c.climate_zone,
            zone_season_curves.c.species_id,
            zone_season_curves.c.month,
        )
        if climate_zone is not None:
            query = query.where(zone_season_curves.c.climate_zone == climate_zone)
        result: dict[str, dict[str, Any]] = {}
        with self.engine.connect() as connection:
            for row in connection.execute(query).mappings():
                zone = result.setdefault(row["climate_zone"], {})
                curve = zone.setdefault(row["species_id"], {"multiplier": {}})
                curve["multiplier"][row["month"]] = row["multiplier"]
                if row["ratio"] is not None:
                    curve.setdefault("ratio", {})[row["month"]] = row["ratio"]
        return result

    @staticmethod
    def _params_from_row(row: Mapping[str, Any]) -> dict[str, Any]:
        params = dict(row["extra_params"] or {})
        for column, param in COLUMN_TO_PARAM.items():
            value = row[column]
            if value is None:
                continue
            params[param] = _json_month_keys(value) if param == "season_curve" else value
        return params


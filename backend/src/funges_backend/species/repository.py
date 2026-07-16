"""Repository for species scoring params and zone season curves.

Replaces the `exec()`-based loading of `species_params.txt` (see
`forecast_pipeline._load_species_and_curves`) with reads/writes against the
`species` and `zone_season_curves` Postgres tables.
"""
from collections import defaultdict

from sqlalchemy import Engine, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert

from funges_backend.species.tables import species, zone_season_curves

# Always present in a species_params entry today (accessed via `params[key]`,
# with no fallback, in forecast_pipeline.py).
_REQUIRED_COLUMNS = (
    "optimal_temp", "temp_sigma",
    "optimal_alt", "alt_sigma",
    "optimal_humidity", "humidity_sigma",
    "optimal_pH", "pH_sigma_near", "pH_sigma_far", "pH_range_near",
)

# Optional in a species_params entry today (accessed via `params.get(key, default)`
# in forecast_pipeline.py), so stored with that same default when absent.
_OPTIONAL_DEFAULTS = {
    "min_cumulative_rain": 20.0,
    "wind_sensitive": False,
    "water_relevance": False,
    "sea_relevance": False,
    "weather_preference": {},
    "climate_zones": [],
}

# Optional and *meaningfully* absent when not set (no default value stands in for
# "not configured"): season_curve/season_months/season_factor drive the empirical
# vs. ramp vs. flat-1.0 season-multiplier fallback in seasonality.py.
_OPTIONAL_NULLABLE_COLUMNS = ("season_curve", "season_months", "season_factor")


class SpeciesRepository:
    """Reads/writes species scoring params and zone season curves."""

    def __init__(self, engine: Engine):
        self._engine = engine

    def get_all_species_params(self) -> dict[str, dict]:
        """Return `{species_name: params}`, equivalent to the `species_params` dict."""
        with self._engine.connect() as conn:
            rows = conn.execute(species.select()).mappings().all()

        result = {}
        for row in rows:
            params = {col: row[col] for col in (*_REQUIRED_COLUMNS, *_OPTIONAL_DEFAULTS)}
            params["pH_range_near"] = tuple(params["pH_range_near"])
            if row["season_curve"] is not None:
                params["season_curve"] = {int(k): float(v) for k, v in row["season_curve"].items()}
            if row["season_months"] is not None:
                params["season_months"] = list(row["season_months"])
            if row["season_factor"] is not None:
                params["season_factor"] = row["season_factor"]
            result[row["name"]] = params
        return result

    def upsert_species(self, name: str, params: dict) -> None:
        """Insert or update a species' scalar + JSONB scoring params."""
        values = {col: params[col] for col in _REQUIRED_COLUMNS}
        values["name"] = name
        values["pH_range_near"] = list(values["pH_range_near"])
        for col, default in _OPTIONAL_DEFAULTS.items():
            values[col] = params.get(col, default)
        values["season_curve"] = (
            {str(k): float(v) for k, v in params["season_curve"].items()}
            if "season_curve" in params
            else None
        )
        values["season_months"] = params.get("season_months")
        values["season_factor"] = params.get("season_factor")

        stmt = pg_insert(species).values(**values)
        stmt = stmt.on_conflict_do_update(
            index_elements=[species.c.name],
            set_={col: stmt.excluded[col] for col in (*_REQUIRED_COLUMNS, *_OPTIONAL_DEFAULTS, *_OPTIONAL_NULLABLE_COLUMNS)},
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def get_zone_curves(self, climate_zone: str) -> dict[str, dict[int, float]]:
        """Return `{species_name: {month: multiplier}}` for a given climate zone."""
        stmt = zone_season_curves.select().where(zone_season_curves.c.climate_zone == climate_zone)
        with self._engine.connect() as conn:
            rows = conn.execute(stmt).mappings().all()

        result: dict[str, dict[int, float]] = defaultdict(dict)
        for row in rows:
            result[row["species"]][row["month"]] = row["multiplier"]
        return dict(result)

    def get_all_zone_curves(self) -> dict[str, dict[str, dict[int, float]]]:
        """Return `{climate_zone: {species_name: {month: multiplier}}}` for every stored
        zone -- the shape `seasonality.season_multiplier_for_species` expects."""
        with self._engine.connect() as conn:
            rows = conn.execute(zone_season_curves.select()).mappings().all()

        result: dict[str, dict[str, dict[int, float]]] = defaultdict(dict)
        for row in rows:
            result[row["climate_zone"]].setdefault(row["species"], {})[row["month"]] = row["multiplier"]
        return dict(result)

    def upsert_zone_curve(self, climate_zone: str, species_name: str, curve: dict[int, float]) -> None:
        """Insert or update the empirical season curve for a (climate zone, species) pair."""
        with self._engine.begin() as conn:
            conn.execute(
                delete(zone_season_curves).where(
                    zone_season_curves.c.climate_zone == climate_zone,
                    zone_season_curves.c.species == species_name,
                )
            )
            if not curve:
                return
            conn.execute(
                zone_season_curves.insert(),
                [
                    {"climate_zone": climate_zone, "species": species_name, "month": int(month), "multiplier": float(mult)}
                    for month, mult in curve.items()
                ],
            )

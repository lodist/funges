"""Repository for the rolling weather/score master table.

Replaces `forecast_pipeline.py`'s full-file read -> pandas concat/dedupe ->
full-file rewrite (`merge_master` / `apply_forward_scores`) with targeted
Postgres upserts against the `weather_scores` table:

- `upsert_forecast_rows` reproduces `merge_master`'s "concat new after existing,
  keep the LAST row per (Location_Id, Date)" semantics: a fresh forecast row
  always wins over whatever was stored for that (location, date), including
  resetting `scores` to `{}` -- exactly as a `merge_master` row coming from
  `new_df` starts with `pd.NA` scores until the forward-window rescore fills
  them back in.
- `get_forward_window` / `get_history` reproduce reading `Date >= today` and a
  location's full series, respectively.
- `write_forward_scores` reproduces `apply_forward_scores`: only the `scores`
  column of the given (Location_Id, Date) rows is touched, so frozen past rows
  (and every other column of the rows being updated) are left untouched.
"""
from collections.abc import Iterable
from datetime import date

from sqlalchemy import Engine, bindparam, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from funges_backend.weather_scores.tables import weather_scores

_DATA_COLUMNS = [c.name for c in weather_scores.columns if c.name not in ("location_id", "date")]


class WeatherScoreRepository:
    """Reads/writes the rolling per-(Location_Id, Date) weather/score master table."""

    def __init__(self, engine: Engine):
        self._engine = engine

    def upsert_forecast_rows(self, rows: Iterable[dict]) -> None:
        """Insert or overwrite forecast rows, keyed on (location_id, date).

        A row for a (location_id, date) already on file is fully replaced by the
        incoming row -- including resetting `scores` to `{}` -- matching
        `merge_master`'s "fresher forecast wins on overlapping dates" semantics.
        """
        rows = [{**row, "scores": {}} for row in rows]
        if not rows:
            return
        stmt = pg_insert(weather_scores).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=[weather_scores.c.location_id, weather_scores.c.date],
            set_={col: stmt.excluded[col] for col in _DATA_COLUMNS},
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def upsert_historical_rows(self, rows: Iterable[dict]) -> None:
        """Insert or update rows with their `scores` intact.

        Unlike `upsert_forecast_rows` (which always resets `scores` to `{}`, matching a
        fresh forecast fetch), this is for backfilling historical rows whose scores are
        already known and must not be blanked.
        """
        rows = list(rows)
        if not rows:
            return
        stmt = pg_insert(weather_scores).values(rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=[weather_scores.c.location_id, weather_scores.c.date],
            set_={col: stmt.excluded[col] for col in _DATA_COLUMNS},
        )
        with self._engine.begin() as conn:
            conn.execute(stmt)

    def get_forward_window(self, today: date) -> list[dict]:
        """Return every row with `date >= today`, across all locations, for rescoring."""
        stmt = select(weather_scores).where(weather_scores.c.date >= today).order_by(
            weather_scores.c.location_id, weather_scores.c.date
        )
        with self._engine.connect() as conn:
            return [dict(row) for row in conn.execute(stmt).mappings().all()]

    def get_history(self, location_id: str, start_date: date | None = None, end_date: date | None = None) -> list[dict]:
        """Return a location's stored rows, optionally date-bounded, for lag-feature computation."""
        stmt = select(weather_scores).where(weather_scores.c.location_id == location_id)
        if start_date is not None:
            stmt = stmt.where(weather_scores.c.date >= start_date)
        if end_date is not None:
            stmt = stmt.where(weather_scores.c.date <= end_date)
        stmt = stmt.order_by(weather_scores.c.date)
        with self._engine.connect() as conn:
            return [dict(row) for row in conn.execute(stmt).mappings().all()]

    def get_all(self) -> list[dict]:
        """Return every stored row, ordered by (location_id, date)."""
        stmt = select(weather_scores).order_by(weather_scores.c.location_id, weather_scores.c.date)
        with self._engine.connect() as conn:
            return [dict(row) for row in conn.execute(stmt).mappings().all()]

    def write_forward_scores(self, updates: Iterable[dict]) -> None:
        """Overwrite the `scores` column of exactly the given (location_id, date) rows.

        Every other column of those rows, and every row not named here (frozen
        past rows), is left untouched -- matching `apply_forward_scores`.
        """
        updates = list(updates)
        if not updates:
            return
        stmt = (
            weather_scores.update()
            .where(weather_scores.c.location_id == bindparam("b_location_id"))
            .where(weather_scores.c.date == bindparam("b_date"))
            .values(scores=bindparam("b_scores"))
        )
        params = [
            {"b_location_id": u["location_id"], "b_date": u["date"], "b_scores": u["scores"]}
            for u in updates
        ]
        with self._engine.begin() as conn:
            conn.execute(stmt, params)

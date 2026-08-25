"""Persistence repositories used by the forecast pipeline."""

from funges_backend.repositories.geo import BoundaryRepository, CoordinateRepository
from funges_backend.repositories.pipeline_inputs import PipelineInputRepository
from funges_backend.repositories.species import SpeciesRepository
from funges_backend.repositories.weather_scores import WeatherScoreRepository

__all__ = [
    "BoundaryRepository",
    "CoordinateRepository",
    "PipelineInputRepository",
    "SpeciesRepository",
    "WeatherScoreRepository",
]

"""Persistence repositories used by the forecast pipeline."""

from funges_backend.repositories.geo import BoundaryRepository, CoordinateRepository
from funges_backend.repositories.species import SpeciesRepository

__all__ = ["BoundaryRepository", "CoordinateRepository", "SpeciesRepository"]


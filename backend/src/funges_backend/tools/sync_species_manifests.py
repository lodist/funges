"""Synchronize generated manifest scoring parameters into Postgres."""

from funges_backend.db.engine import create_database_engine
from funges_backend.generated_species import SPECIES_PARAMS
from funges_backend.repositories import SpeciesRepository


def main() -> None:
    repository = SpeciesRepository(create_database_engine())
    for species_id, generated in SPECIES_PARAMS.items():
        values = dict(generated)
        scientific_name = values.pop("scientific_name", None)
        repository.upsert_species(species_id, values, scientific_name=scientific_name)
    print(f"synchronized {len(SPECIES_PARAMS)} manifest species")


if __name__ == "__main__":
    main()

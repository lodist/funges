"""Database inputs and output-only R2 client for regional map generation."""

import boto3

from funges_backend.db.engine import create_database_engine
from funges_backend.repositories import PipelineInputRepository, WeatherScoreRepository
from funges_backend.settings import R2Settings


def load_map_inputs(region_id: str):
    engine = create_database_engine()
    weather = WeatherScoreRepository(engine).read_all(region_id)
    habitats = PipelineInputRepository(engine).read_habitats(region_id)
    if weather.empty:
        raise RuntimeError(f"No weather scores found for region {region_id}")
    if habitats.empty:
        raise RuntimeError(f"No habitat polygons found for region {region_id}")
    return weather, habitats


def r2_output_client():
    settings = R2Settings()  # type: ignore[call-arg]
    client = boto3.client(
        "s3",
        endpoint_url=settings.endpoint_url,
        aws_access_key_id=settings.access_key_id,
        aws_secret_access_key=settings.secret_access_key.get_secret_value(),
    )
    return client, settings.bucket_name

"""ml.cache — Redis-backed prediction cache with local fallback."""
from .redis_cache import PredictionCache

__all__ = ["PredictionCache"]

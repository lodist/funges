# LightGBM before anything that loads pandas/pyarrow: pyarrow 17 bundles an old msvcp140.dll
# (14.28) and LightGBM 4.7 crashes on it (access violation) if that one loads first.
import lightgbm  # noqa: F401
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(_BACKEND))
sys.path.insert(0, str(_BACKEND / "tools"))

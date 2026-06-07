from __future__ import annotations

import gzip
import os
from pathlib import Path
import sys
from typing import Any
from urllib.parse import urlparse
from urllib.request import urlretrieve

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.mlPipeline.train_draft_win_predictor import FEATURE_SET_PRESETS, NetworkFeatureStore, build_features

ROLES = ["Top", "Jungle", "Mid", "ADC", "Support"]
DEFAULT_MODEL_PATH = Path("data/ml/models/draft_win_predictor.joblib")
DEFAULT_NETWORK_STATS_PATH = Path("data/ml/training/supabase_network_stats.json")


class DraftPredictor:
    def __init__(self, model_path: Path | None = None):
        self.model_path = model_path or Path(os.environ.get("MODEL_PATH", str(DEFAULT_MODEL_PATH)))
        self.network_stats_path = Path(os.environ.get("NETWORK_STATS_PATH", str(DEFAULT_NETWORK_STATS_PATH)))
        self.bundle: dict[str, Any] | None = None
        self.network_stats = NetworkFeatureStore.from_path(self.network_stats_path)
        self.load_error: str | None = None
        self._load()

    @property
    def ready(self) -> bool:
        return self.bundle is not None

    def _load(self) -> None:
        ensure_artifact(self.model_path, os.environ.get("MODEL_BUNDLE_URL"))
        ensure_artifact(self.network_stats_path, os.environ.get("NETWORK_STATS_URL"))

        if not self.model_path.exists():
            self.load_error = f"Model file not found: {self.model_path}"
            return
        try:
            import joblib

            self.bundle = joblib.load(self.model_path)
            network_stats_path = self.network_stats_path if self.network_stats_path.exists() else Path(str(self.bundle.get("networkStatsPath") or DEFAULT_NETWORK_STATS_PATH))
            self.network_stats = NetworkFeatureStore.from_path(network_stats_path)
            self.load_error = None
        except Exception as error:  # noqa: BLE001 - returned to local caller for diagnostics.
            self.bundle = None
            self.load_error = str(error)

    def status(self) -> dict[str, Any]:
        return {
            "ready": self.ready,
            "modelPath": str(self.model_path),
            "networkStatsPath": str(self.network_stats_path),
            "error": self.load_error,
            "featureSet": self.bundle.get("featureSet") if self.bundle else None,
            "trainingExamples": self.bundle.get("trainingExamples") if self.bundle else 0,
        }

    def predict(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.ready:
            return neutral_response("ML model is not loaded", self.status())

        candidate = payload.get("candidate") or {}
        our_side = clean_side(payload.get("ourSide"))
        blue_current = clean_role_map(payload.get("bluePicks") or {})
        red_current = clean_role_map(payload.get("redPicks") or {})
        blue_after = dict(blue_current)
        red_after = dict(red_current)
        blue_current_signature = str(payload.get("blueCompSignature") or "none")
        red_current_signature = str(payload.get("redCompSignature") or "none")

        role = candidate.get("role")
        champion_id = candidate.get("championId")
        if role not in ROLES or not champion_id:
            return neutral_response("Missing candidate role or championId", self.status())

        if our_side == "blue":
            blue_after[role] = champion_id
        else:
            red_after[role] = champion_id

        blue_after_signature = str(candidate.get("blueCompSignatureAfter") or blue_current_signature)
        red_after_signature = str(candidate.get("redCompSignatureAfter") or red_current_signature)
        current_blue = self._predict_blue_win_chance(payload, blue_current, red_current, blue_current_signature, red_current_signature)
        after_blue = self._predict_blue_win_chance(payload, blue_after, red_after, blue_after_signature, red_after_signature)
        current_our = current_blue if our_side == "blue" else 1 - current_blue
        after_our = after_blue if our_side == "blue" else 1 - after_blue
        win_gain = after_our - current_our
        score = clamp(50 + win_gain * 500)
        return {
            "available": True,
            "neutral": False,
            "score": round(score),
            "currentOurWinChance": round(current_our, 4),
            "withCandidateOurWinChance": round(after_our, 4),
            "winGain": round(win_gain, 4),
            "blueWinChance": round(after_blue, 4),
            "redWinChance": round(1 - after_blue, 4),
            "confidence": 0.55,
            "modelStatus": self.status(),
        }

    def _predict_blue_win_chance(self, payload: dict[str, Any], blue_picks: dict[str, str], red_picks: dict[str, str], blue_signature: str, red_signature: str) -> float:
        assert self.bundle is not None
        feature_set = str(self.bundle.get("featureSet") or "full")
        enabled_groups = FEATURE_SET_PRESETS.get(feature_set, FEATURE_SET_PRESETS["full"])
        example = {
            "matchId": "local-draft",
            "patch": payload.get("patch") or "unknown",
            "region": payload.get("region") or "local",
            "queueId": queue_id_for_format(payload.get("format")),
            "sourceType": payload.get("format") or "local",
            "blueChampions": blue_picks,
            "redChampions": red_picks,
            "blueBans": payload.get("blueBans") or [],
            "redBans": payload.get("redBans") or [],
            "blueCompSignature": blue_signature,
            "redCompSignature": red_signature,
            "blueWin": 0,
        }
        features = build_features(example, self.network_stats, enabled_groups)
        x = self.bundle["vectorizer"].transform([features])
        return float(self.bundle["model"].predict_proba(x)[0][1])


def neutral_response(reason: str, status: dict[str, Any]) -> dict[str, Any]:
    return {
        "available": False,
        "neutral": True,
        "score": 50,
        "currentOurWinChance": 0.5,
        "withCandidateOurWinChance": 0.5,
        "winGain": 0,
        "blueWinChance": 0.5,
        "redWinChance": 0.5,
        "confidence": 0,
        "reason": reason,
        "modelStatus": status,
    }


def ensure_artifact(path: Path, url: str | None) -> None:
    if path.exists() or not url:
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    if urlparse(url).path.endswith(".gz"):
        compressed_path = path.with_suffix(path.suffix + ".gz")
        urlretrieve(url, compressed_path)
        with gzip.open(compressed_path, "rb") as source, path.open("wb") as destination:
            destination.write(source.read())
        compressed_path.unlink(missing_ok=True)
        return

    urlretrieve(url, path)


def clean_role_map(value: dict[str, Any]) -> dict[str, str]:
    return {role: str(value.get(role) or "") for role in ROLES if value.get(role)}


def clean_side(value: Any) -> str:
    return "red" if value == "red" else "blue"


def queue_id_for_format(value: Any) -> int | None:
    if value == "tournament":
        return None
    return 420


def clamp(value: float) -> float:
    return max(0, min(100, value))

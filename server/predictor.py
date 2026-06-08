from __future__ import annotations

import gzip
import math
import os
from pathlib import Path
import sys
from typing import Any
from urllib.parse import urlparse
from urllib.request import urlretrieve
import warnings

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
ML_PIPELINE_ROOT = PROJECT_ROOT / "scripts" / "mlPipeline"
if str(ML_PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ML_PIPELINE_ROOT))

from scripts.mlPipeline.train_draft_win_predictor import FEATURE_SET_PRESETS, NetworkFeatureStore, build_features
import train_candidate_ranker as coach_features

ROLES = ["Top", "Jungle", "Mid", "ADC", "Support"]
DEFAULT_MODEL_PATH = Path("data/ml/models/draft_win_predictor.joblib")
DEFAULT_COACH_MODEL_PATH = Path("data/ml/models/draft_coach.joblib")
DEFAULT_NETWORK_STATS_PATH = Path("data/ml/training/supabase_network_stats.json")

warnings.filterwarnings("ignore", message="X does not have valid feature names.*")


class DraftPredictor:
    def __init__(self, model_path: Path | None = None):
        self.model_path = model_path or Path(os.environ.get("MODEL_PATH", str(DEFAULT_MODEL_PATH)))
        self.coach_model_path = Path(os.environ.get("COACH_MODEL_PATH", str(DEFAULT_COACH_MODEL_PATH)))
        self.network_stats_path = Path(os.environ.get("NETWORK_STATS_PATH", str(DEFAULT_NETWORK_STATS_PATH)))
        self.bundle: dict[str, Any] | None = None
        self.coach_bundle: dict[str, Any] | None = None
        self.network_stats = NetworkFeatureStore.from_path(self.network_stats_path)
        self.coach_network_stats = coach_features.NetworkStats.from_path(self.network_stats_path)
        self.load_error: str | None = None
        self.coach_load_error: str | None = None
        self._load()

    @property
    def ready(self) -> bool:
        return self.bundle is not None

    def _load(self) -> None:
        ensure_artifact(self.model_path, os.environ.get("MODEL_BUNDLE_URL"))
        ensure_artifact(self.coach_model_path, os.environ.get("COACH_MODEL_URL"))
        ensure_artifact(self.network_stats_path, os.environ.get("NETWORK_STATS_URL"))

        if not self.model_path.exists():
            self.load_error = f"Model file not found: {self.model_path}"
        else:
            try:
                import joblib

                self.bundle = joblib.load(self.model_path)
                network_stats_path = self.network_stats_path if self.network_stats_path.exists() else Path(str(self.bundle.get("networkStatsPath") or DEFAULT_NETWORK_STATS_PATH))
                self.network_stats = NetworkFeatureStore.from_path(network_stats_path)
                self.coach_network_stats = coach_features.NetworkStats.from_path(network_stats_path)
                self.load_error = None
            except Exception as error:  # noqa: BLE001 - returned to local caller for diagnostics.
                self.bundle = None
                self.load_error = str(error)

        if not self.coach_model_path.exists():
            self.coach_load_error = f"Draft coach model file not found: {self.coach_model_path}"
        else:
            try:
                import joblib

                self.coach_bundle = joblib.load(self.coach_model_path)
                coach_features.CHAMPION_METADATA = self.coach_bundle.get("championMetadata") or {}
                self.coach_load_error = None
            except Exception as error:  # noqa: BLE001 - returned to local caller for diagnostics.
                self.coach_bundle = None
                self.coach_load_error = str(error)

    def status(self) -> dict[str, Any]:
        return {
            "ready": self.ready,
            "modelPath": str(self.model_path),
            "coachReady": self.coach_bundle is not None,
            "coachModelPath": str(self.coach_model_path),
            "coachError": self.coach_load_error,
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
        win_model_score = clamp(50 + win_gain * 500)
        pick_ranker = self._score_coach_candidate(payload, candidate, our_side, blue_current, red_current, "pickRanker")
        enemy_side = "red" if our_side == "blue" else "blue"
        enemy_intent = self._score_coach_candidate(payload, candidate, enemy_side, blue_current, red_current, "enemyIntent")
        denial_score = enemy_intent["score"] if enemy_intent["available"] else 50
        pick_ranker_score = pick_ranker["score"] if pick_ranker["available"] else 50
        final_score = clamp(win_model_score * 0.55 + pick_ranker_score * 0.3 + denial_score * 0.15)
        explanations = coach_explanations(win_gain, pick_ranker, enemy_intent)
        return {
            "available": True,
            "neutral": False,
            "score": round(final_score),
            "currentOurWinChance": round(current_our, 4),
            "withCandidateOurWinChance": round(after_our, 4),
            "winGain": round(win_gain, 4),
            "blueWinChance": round(after_blue, 4),
            "redWinChance": round(1 - after_blue, 4),
            "confidence": 0.55,
            "winModel": {
                "score": round(win_model_score),
                "winGain": round(win_gain, 4),
                "currentOurWinChance": round(current_our, 4),
                "withCandidateOurWinChance": round(after_our, 4),
            },
            "pickRanker": pick_ranker,
            "enemyIntent": {
                **enemy_intent,
                "denialScore": denial_score,
            },
            "finalMlScore": round(final_score),
            "explanations": explanations,
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

    def _score_coach_candidate(
        self,
        payload: dict[str, Any],
        candidate: dict[str, Any],
        perspective_side: str,
        blue_picks: dict[str, str],
        red_picks: dict[str, str],
        module_key: str,
    ) -> dict[str, Any]:
        if self.coach_bundle is None:
            return {"available": False, "score": 50, "probability": 0, "reason": self.coach_load_error or "Draft coach model is not loaded"}

        role = candidate.get("role")
        champion_id = candidate.get("championId")
        if role not in ROLES or not champion_id:
            return {"available": False, "score": 50, "probability": 0, "reason": "Missing candidate role or championId"}

        allies = blue_picks if perspective_side == "blue" else red_picks
        enemies = red_picks if perspective_side == "blue" else blue_picks
        phase = coach_features.get_phase(len(allies))
        row = {
            "matchId": "local-draft",
            "side": perspective_side,
            "patch": payload.get("patch") or "unknown",
            "region": payload.get("region") or "local",
            "queueId": queue_id_for_format(payload.get("format")),
            "sourceType": payload.get("format") or "local",
            "source": payload.get("format") or "local",
        }
        aggregate_score, aggregate_parts = self.coach_bundle["aggregateStats"].score_candidate(row, role, str(champion_id), allies, enemies)
        network_parts = self.coach_network_stats.score_candidate(role, str(champion_id), allies, enemies)
        module = self.coach_bundle[module_key]
        probability = self._coach_probability(module, row, role, str(champion_id), phase, allies, enemies, aggregate_score, aggregate_parts, network_parts)
        calibrated_score = calibrated_probability_score(probability, float(module.get("positiveRate") or 0.1))
        return {
            "available": True,
            "score": round(clamp(calibrated_score)),
            "probability": round(probability, 4),
            "rankPercentile": round(clamp(calibrated_score) / 100, 4),
            "phase": phase,
            "metrics": module.get("metrics"),
        }

    def _coach_probability(
        self,
        module: dict[str, Any],
        row: dict[str, Any],
        role: str,
        champion_id: str,
        phase: str,
        allies: dict[str, str],
        enemies: dict[str, str],
        aggregate_score: float,
        aggregate_parts: dict[str, float],
        network_parts: dict[str, float],
    ) -> float:
        features = coach_features.candidate_features(
            row,
            role,
            champion_id,
            phase,
            allies,
            enemies,
            aggregate_score,
            aggregate_parts,
            network_parts,
        )
        x = module["vectorizer"].transform([features])
        return float(module["model"].predict_proba(x)[0][1])


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
        "winModel": {"score": 50, "winGain": 0},
        "pickRanker": {"available": False, "score": 50, "probability": 0, "reason": reason},
        "enemyIntent": {"available": False, "score": 50, "probability": 0, "denialScore": 50, "reason": reason},
        "finalMlScore": 50,
        "explanations": [],
        "modelStatus": status,
    }


def coach_explanations(win_gain: float, pick_ranker: dict[str, Any], enemy_intent: dict[str, Any]) -> list[str]:
    explanations: list[str] = []
    if win_gain > 0.01:
        explanations.append(f"Win model likes the pick: +{win_gain * 100:.1f}% projected win chance")
    elif win_gain < -0.01:
        explanations.append(f"Win model is cautious: {win_gain * 100:.1f}% projected win chance")

    if pick_ranker.get("available") and pick_ranker.get("score", 50) >= 65:
        explanations.append("Candidate ranker sees this as a common high-value pick in similar draft states")
    elif pick_ranker.get("available") and pick_ranker.get("score", 50) <= 35:
        explanations.append("Candidate ranker sees this as an uncommon pick for similar draft states")

    if enemy_intent.get("available") and enemy_intent.get("score", 50) >= 65:
        explanations.append("Enemy intent model gives this champion meaningful denial urgency")
    elif enemy_intent.get("available") and enemy_intent.get("score", 50) <= 30:
        explanations.append("Enemy intent model thinks this champion is less likely to be contested soon")

    return explanations[:3]


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


def calibrated_probability_score(probability: float, baseline: float) -> float:
    baseline = max(0.001, min(0.999, baseline))
    probability = max(0.001, min(0.999, probability))
    baseline_logit = math_logit(baseline)
    probability_logit = math_logit(probability)
    return 100 / (1 + pow(2.718281828459045, -(probability_logit - baseline_logit)))


def math_logit(value: float) -> float:
    return math.log(value / (1 - value))

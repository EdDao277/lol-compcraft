from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from typing import Any


ROLES = ["Top", "Jungle", "Mid", "ADC", "Support"]
FEATURE_SET_PRESETS: dict[str, set[str]] = {
    "context": {"context"},
    "champions": {"context", "champions"},
    "matchups": {"context", "champions", "matchups"},
    "bans": {"context", "bans"},
    "champions_bans": {"context", "champions", "bans"},
    "team_comp": {"context", "team_comp"},
    "network": {"context", "network", "team_comp"},
    "network_edges": {"context", "network", "network_edges", "team_comp"},
    "champions_network": {"context", "champions", "network", "network_edges", "team_comp"},
    "draft_full_no_network": {"context", "champions", "matchups", "bans"},
    "full": {"context", "champions", "matchups", "bans", "network", "network_edges", "team_comp"},
}


def main() -> None:
    args = parse_args()
    imports = import_dependencies()
    rows = load_jsonl(args.input)
    examples = build_blue_red_examples(rows)
    if len(examples) < 20:
        raise SystemExit(f"Need at least 20 draft examples. Found {len(examples)} in {args.input}")

    network_stats = NetworkFeatureStore.from_path(args.network_stats)
    labels = imports["np"].array([example["blueWin"] for example in examples], dtype=int)
    train_indexes, validation_indexes = split_indexes(examples, args, imports)
    feature_sets = parse_feature_sets(args.feature_sets)

    reports = []
    print("LightGBM Draft Win Predictor Feature Experiments")
    print(f"Examples: {len(examples)} | Train: {len(train_indexes)} | Validation: {len(validation_indexes)}")
    print(f"Validation: {args.validation_mode} | Supabase network stats: {'yes' if network_stats.enabled else 'no'}")
    for feature_set_name in feature_sets:
        report = run_feature_set(
            feature_set_name,
            examples,
            labels,
            train_indexes,
            validation_indexes,
            network_stats,
            args,
            imports,
        )
        reports.append(report)
        metrics = report["metrics"]
        print(
            f"- {feature_set_name:<22} "
            f"accuracy {metrics['accuracy'] * 100:5.1f}% | "
            f"log loss {metrics['logLoss']:.4f} | "
            f"brier {metrics['brierScore']:.4f} | "
            f"features {report['featureColumns']}"
        )

    best_by_log_loss = min(reports, key=lambda report: report["metrics"]["logLoss"])
    saved_model = None
    if args.save_model:
        saved_model = train_and_save_model(best_by_log_loss["featureSet"], examples, labels, network_stats, args, imports)
    output = {
        "model": "LightGBM Draft Win Predictor",
        "purpose": "Compare feature sets for predicting blue-side win chance from completed draft features. Candidate simulation can later compare win chance before and after a possible pick.",
        "inputRows": len(rows),
        "examples": len(examples),
        "trainExamples": len(train_indexes),
        "validationExamples": len(validation_indexes),
        "validationMode": args.validation_mode,
        "usesSupabaseNetworkStats": network_stats.enabled,
        "featureSets": feature_sets,
        "bestByLogLoss": {
            "featureSet": best_by_log_loss["featureSet"],
            "metrics": best_by_log_loss["metrics"],
        },
        "savedModel": saved_model,
        "reports": reports,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"\nBest log loss: {best_by_log_loss['featureSet']} ({best_by_log_loss['metrics']['logLoss']:.4f})")
    if saved_model:
        print(f"Saved model bundle to {saved_model['path']}")
    print(f"Saved report to {args.output}")


def run_feature_set(
    feature_set_name: str,
    examples: list[dict[str, Any]],
    labels,
    train_indexes: list[int],
    validation_indexes: list[int],
    network_stats: "NetworkFeatureStore",
    args,
    imports: dict[str, Any],
) -> dict[str, Any]:
    feature_dicts = [build_features(example, network_stats, FEATURE_SET_PRESETS[feature_set_name]) for example in examples]
    vectorizer = imports["DictVectorizer"](sparse=True)
    x_train = vectorizer.fit_transform([feature_dicts[index] for index in train_indexes])
    x_validation = vectorizer.transform([feature_dicts[index] for index in validation_indexes])
    y_train = labels[train_indexes]
    y_validation = labels[validation_indexes]

    model = imports["LGBMClassifier"](
        objective="binary",
        n_estimators=args.estimators,
        learning_rate=args.learning_rate,
        num_leaves=args.num_leaves,
        max_depth=args.max_depth,
        min_child_samples=args.min_child_samples,
        random_state=args.seed,
        verbose=-1,
    )
    model.fit(x_train, y_train)
    probabilities = model.predict_proba(x_validation)[:, 1]
    predictions = (probabilities >= 0.5).astype(int)

    return {
        "featureSet": feature_set_name,
        "enabledGroups": sorted(FEATURE_SET_PRESETS[feature_set_name]),
        "featureColumns": len(vectorizer.get_feature_names_out()),
        "metrics": {
            "accuracy": float(imports["accuracy_score"](y_validation, predictions)),
            "logLoss": float(imports["log_loss"](y_validation, probabilities, labels=[0, 1])),
            "brierScore": float(imports["brier_score_loss"](y_validation, probabilities)),
        },
        "featureImportance": top_feature_importance(vectorizer.get_feature_names_out(), model.feature_importances_, args.top_features),
    }


def train_and_save_model(
    feature_set_name: str,
    examples: list[dict[str, Any]],
    labels,
    network_stats: "NetworkFeatureStore",
    args,
    imports: dict[str, Any],
) -> dict[str, Any]:
    feature_dicts = [build_features(example, network_stats, FEATURE_SET_PRESETS[feature_set_name]) for example in examples]
    vectorizer = imports["DictVectorizer"](sparse=True)
    x = vectorizer.fit_transform(feature_dicts)
    model = imports["LGBMClassifier"](
        objective="binary",
        n_estimators=args.estimators,
        learning_rate=args.learning_rate,
        num_leaves=args.num_leaves,
        max_depth=args.max_depth,
        min_child_samples=args.min_child_samples,
        random_state=args.seed,
        verbose=-1,
    )
    model.fit(x, labels)

    bundle = {
        "model": model,
        "vectorizer": vectorizer,
        "featureSet": feature_set_name,
        "enabledGroups": sorted(FEATURE_SET_PRESETS[feature_set_name]),
        "networkStatsPath": str(args.network_stats),
        "trainingExamples": len(examples),
        "modelType": "LightGBM Draft Win Predictor",
    }
    args.save_model.parent.mkdir(parents=True, exist_ok=True)
    imports["joblib"].dump(bundle, args.save_model)
    return {
        "path": str(args.save_model),
        "featureSet": feature_set_name,
        "trainingExamples": len(examples),
        "featureColumns": len(vectorizer.get_feature_names_out()),
    }


def import_dependencies() -> dict[str, Any]:
    try:
        import joblib
        import numpy as np
        from sklearn.feature_extraction import DictVectorizer
        from sklearn.metrics import accuracy_score, brier_score_loss, log_loss
        from sklearn.model_selection import train_test_split
        from lightgbm import LGBMClassifier
    except ImportError as error:
        raise SystemExit(
            "Missing Python ML dependencies. Run:\n"
            "  python -m pip install -r requirements-ml.txt\n\n"
            f"Import error: {error}"
        ) from error

    return {
        "np": np,
        "joblib": joblib,
        "DictVectorizer": DictVectorizer,
        "accuracy_score": accuracy_score,
        "brier_score_loss": brier_score_loss,
        "log_loss": log_loss,
        "train_test_split": train_test_split,
        "LGBMClassifier": LGBMClassifier,
    }


def build_blue_red_examples(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_match: dict[str, dict[str, Any]] = {}
    for row in rows:
        base_id = base_match_id(str(row.get("matchId", "")))
        side = row.get("side")
        if side == "blue":
            example = {
                "matchId": base_id,
                "patch": row.get("patch", "unknown"),
                "region": row.get("region", "unknown"),
                "queueId": row.get("queueId"),
                "sourceType": row.get("sourceType") or row.get("source") or "unknown",
                "blueChampions": row.get("allyChampions", {}),
                "redChampions": row.get("enemyChampions", {}),
                "blueBans": row.get("allyBans", []),
                "redBans": row.get("enemyBans", []),
                "blueCompSignature": row.get("allyCompSignature", "none"),
                "redCompSignature": row.get("enemyCompSignature", "none"),
                "blueWin": int(row.get("label", 0)),
            }
            by_match[base_id] = example
        elif side == "red" and base_id not in by_match:
            example = {
                "matchId": base_id,
                "patch": row.get("patch", "unknown"),
                "region": row.get("region", "unknown"),
                "queueId": row.get("queueId"),
                "sourceType": row.get("sourceType") or row.get("source") or "unknown",
                "blueChampions": row.get("enemyChampions", {}),
                "redChampions": row.get("allyChampions", {}),
                "blueBans": row.get("enemyBans", []),
                "redBans": row.get("allyBans", []),
                "blueCompSignature": row.get("enemyCompSignature", "none"),
                "redCompSignature": row.get("allyCompSignature", "none"),
                "blueWin": 1 - int(row.get("label", 0)),
            }
            by_match[base_id] = example
    return list(by_match.values())


def build_features(example: dict[str, Any], network_stats: "NetworkFeatureStore", enabled_groups: set[str]) -> dict[str, float]:
    features: dict[str, float] = {"bias": 1}
    if "context" in enabled_groups:
        features.update(
            {
                f"patch:{example.get('patch', 'unknown')}": 1,
                f"year:{patch_year(example.get('patch', 'unknown'))}": 1,
                f"region:{example.get('region', 'unknown')}": 1,
                f"source_type:{example.get('sourceType', 'unknown')}": 1,
                f"queue:{example.get('queueId') or 'pro'}": 1,
            }
        )
    blue = role_map(example.get("blueChampions", {}))
    red = role_map(example.get("redChampions", {}))

    for role in ROLES:
        blue_champion = blue.get(role)
        red_champion = red.get(role)
        if "champions" in enabled_groups and blue_champion:
            features[f"blue:{role}:{blue_champion}"] = 1
            features[f"blue_champion:{blue_champion}"] = 1
        if "champions" in enabled_groups and red_champion:
            features[f"red:{role}:{red_champion}"] = 1
            features[f"red_champion:{red_champion}"] = 1
        if "matchups" in enabled_groups and blue_champion and red_champion:
            features[f"lane_matchup:{role}:{blue_champion}:vs:{red_champion}"] = 1

    if "bans" in enabled_groups:
        for ban in example.get("blueBans", []):
            if ban:
                features[f"blue_ban:{ban}"] = 1
        for ban in example.get("redBans", []):
            if ban:
                features[f"red_ban:{ban}"] = 1

    if "network" in enabled_groups or "network_edges" in enabled_groups:
        add_network_features(features, "blue", blue, red, network_stats)
        add_network_features(features, "red", red, blue, network_stats)
    if "team_comp" in enabled_groups:
        add_team_comp_signature_features(features, "blue", str(example.get("blueCompSignature") or "none"), network_stats)
        add_team_comp_signature_features(features, "red", str(example.get("redCompSignature") or "none"), network_stats)
        features["num:team_comp_signature_edge"] = features["num:blue_team_comp_signature_rate"] - features["num:red_team_comp_signature_rate"]
        features["num:team_comp_signature_confidence_edge"] = features["num:blue_team_comp_signature_confidence"] - features["num:red_team_comp_signature_confidence"]
    if "network_edges" in enabled_groups:
        features["num:network_role_edge"] = features["num:blue_role_rate_avg"] - features["num:red_role_rate_avg"]
        features["num:network_synergy_edge"] = features["num:blue_synergy_delta_avg"] - features["num:red_synergy_delta_avg"]
        features["num:network_matchup_edge"] = features["num:blue_matchup_delta_avg"] - features["num:red_matchup_delta_avg"]
    return features


def add_network_features(features: dict[str, float], side: str, champions: dict[str, str], enemies: dict[str, str], network_stats: "NetworkFeatureStore") -> None:
    role_values = []
    role_games = 0
    synergy_values = []
    synergy_games = 0
    matchup_values = []
    matchup_games = 0

    for role, champion in champions.items():
        role_entry = network_stats.role.get((champion, role))
        if role_entry:
            role_values.append(role_entry["value"])
            role_games += role_entry["games"]
        for ally_role, ally in champions.items():
            if ally_role == role:
                continue
            synergy_entry = network_stats.synergy.get((champion, role, ally, ally_role))
            if synergy_entry:
                synergy_values.append(synergy_entry["value"])
                synergy_games += synergy_entry["games"]
        enemy = enemies.get(role)
        if enemy:
            matchup_entry = network_stats.matchup.get((champion, role, enemy, role))
            if matchup_entry:
                matchup_values.append(matchup_entry["value"])
                matchup_games += matchup_entry["games"]

    features[f"num:{side}_role_rate_avg"] = mean(role_values, 0.5)
    features[f"num:{side}_role_games_log"] = math.log1p(role_games)
    features[f"num:{side}_synergy_delta_avg"] = mean(synergy_values, 0)
    features[f"num:{side}_synergy_games_log"] = math.log1p(synergy_games)
    features[f"num:{side}_matchup_delta_avg"] = mean(matchup_values, 0)
    features[f"num:{side}_matchup_games_log"] = math.log1p(matchup_games)


def add_team_comp_signature_features(features: dict[str, float], side: str, signature: str, network_stats: "NetworkFeatureStore") -> None:
    features[f"{side}_team_comp_signature:{signature}"] = 1
    entry = network_stats.team_comp.get(signature)
    features[f"num:{side}_team_comp_signature_rate"] = entry["win_rate"] if entry else 0.5
    features[f"num:{side}_team_comp_signature_games_log"] = math.log1p(entry["games"] if entry else 0)
    features[f"num:{side}_team_comp_signature_confidence"] = entry["confidence"] if entry else 0


class NetworkFeatureStore:
    def __init__(self, payload: dict[str, Any] | None):
        self.enabled = payload is not None
        self.role = self._role_rows(payload.get("roleStats", []) if payload else [])
        self.synergy = self._synergy_rows(payload.get("synergyStats", []) if payload else [])
        self.matchup = self._matchup_rows(payload.get("matchupStats", []) if payload else [])
        self.team_comp = self._team_comp_rows(payload.get("teamCompSignatureStats", []) if payload else [])

    @classmethod
    def from_path(cls, path: Path) -> "NetworkFeatureStore":
        if not path.exists():
            return cls(None)
        return cls(json.loads(path.read_text(encoding="utf-8")))

    def _role_rows(self, rows: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, float]]:
        return {
            (str(row.get("champion_id")), str(row.get("role"))): {
                "value": float(row.get("win_rate") or 0.5),
                "games": float(row.get("games") or 0),
            }
            for row in rows
        }

    def _synergy_rows(self, rows: list[dict[str, Any]]) -> dict[tuple[str, str, str, str], dict[str, float]]:
        return {
            (str(row.get("champion_id")), str(row.get("role")), str(row.get("ally_champion_id")), str(row.get("ally_role"))): {
                "value": float(row.get("delta_vs_average") or 0),
                "games": float(row.get("games") or 0),
            }
            for row in rows
        }

    def _matchup_rows(self, rows: list[dict[str, Any]]) -> dict[tuple[str, str, str, str], dict[str, float]]:
        return {
            (str(row.get("champion_id")), str(row.get("role")), str(row.get("enemy_champion_id")), str(row.get("enemy_role"))): {
                "value": float(row.get("delta_vs_baseline") or 0),
                "games": float(row.get("games") or 0),
            }
            for row in rows
        }

    def _team_comp_rows(self, rows: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
        result: dict[str, dict[str, float]] = {}
        for row in rows:
            signature = str(row.get("signature") or "none")
            current = result.get(signature)
            games = float(row.get("games") or 0)
            confidence = float(row.get("confidence") or 0.15)
            weight = max(1, games) * confidence
            win_rate = float(row.get("win_rate") or 0.5)
            if current:
                total_weight = current["weight"] + weight
                current["win_rate"] = (current["win_rate"] * current["weight"] + win_rate * weight) / total_weight
                current["games"] += games
                current["confidence"] = (current["confidence"] * current["weight"] + confidence * weight) / total_weight
                current["weight"] = total_weight
            else:
                result[signature] = {"win_rate": win_rate, "games": games, "confidence": confidence, "weight": weight}
        return result


def split_indexes(examples: list[dict[str, Any]], args, imports) -> tuple[list[int], list[int]]:
    indexes = list(range(len(examples)))
    if args.validation_mode == "random":
        train, validation = imports["train_test_split"](indexes, test_size=args.validation_fraction, random_state=args.seed)
        return list(train), list(validation)
    if args.validation_mode == "year":
        years = [patch_major(example.get("patch")) for example in examples]
        known_years = [year for year in years if year is not None]
        holdout = max(known_years)
        validation = [index for index, year in zip(indexes, years) if year == holdout]
        train = [index for index in indexes if index not in set(validation)]
        return train, validation
    if args.validation_mode == "patch":
        patches = sorted({str(example.get("patch")) for example in examples if patch_major(example.get("patch")) is not None}, key=patch_sort_key)
        holdout = patches[-1]
        validation = [index for index, example in enumerate(examples) if str(example.get("patch")) == holdout]
        train = [index for index in indexes if index not in set(validation)]
        return train, validation
    raise SystemExit(f"Unknown validation mode: {args.validation_mode}")


def parse_feature_sets(value: str) -> list[str]:
    requested = [item.strip() for item in value.split(",") if item.strip()]
    unknown = [item for item in requested if item not in FEATURE_SET_PRESETS]
    if unknown:
        raise SystemExit(
            "Unknown feature set(s): "
            + ", ".join(unknown)
            + "\nAvailable feature sets: "
            + ", ".join(FEATURE_SET_PRESETS.keys())
        )
    return requested or list(FEATURE_SET_PRESETS.keys())


def top_feature_importance(feature_names, importances, limit: int) -> list[dict[str, Any]]:
    pairs = sorted(zip(feature_names, importances), key=lambda item: item[1], reverse=True)
    return [{"feature": feature, "importance": int(importance)} for feature, importance in pairs[:limit]]


def role_map(value: dict[str, str]) -> dict[str, str]:
    return {role: str(value.get(role) or "") for role in ROLES if value.get(role)}


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def base_match_id(match_id: str) -> str:
    return re.sub(r"-(100|200)$", "", match_id)


def mean(values: list[float], fallback: float) -> float:
    return sum(values) / len(values) if values else fallback


def patch_year(patch: Any) -> str:
    return str(patch).split(".")[0] if patch else "unknown"


def patch_major(patch: Any) -> int | None:
    try:
        return int(str(patch).split(".")[0])
    except (TypeError, ValueError):
        return None


def patch_sort_key(patch: str) -> tuple[int, int]:
    parts = str(patch).split(".")
    try:
        return int(parts[0]), int(parts[1] if len(parts) > 1 else 0)
    except ValueError:
        return -1, -1


def parse_args():
    parser = argparse.ArgumentParser(description="Train a LightGBM pre-match draft win predictor for CompCraft.")
    parser.add_argument("--input", type=Path, default=Path("data/ml/training/draft_feature_rows.jsonl"))
    parser.add_argument("--network-stats", type=Path, default=Path("data/ml/training/supabase_network_stats.json"))
    parser.add_argument("--output", type=Path, default=Path("data/ml/models/draft_win_predictor_report.json"))
    parser.add_argument("--save-model", type=Path, default=None, help="Optional path for a joblib model bundle used by the local prediction backend.")
    parser.add_argument("--feature-sets", default=",".join(FEATURE_SET_PRESETS.keys()), help="Comma-separated feature sets to compare.")
    parser.add_argument("--validation-mode", default="year", choices=["year", "patch", "random"])
    parser.add_argument("--validation-fraction", type=float, default=0.2)
    parser.add_argument("--estimators", type=int, default=320)
    parser.add_argument("--learning-rate", type=float, default=0.035)
    parser.add_argument("--num-leaves", type=int, default=31)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--min-child-samples", type=int, default=60)
    parser.add_argument("--top-features", type=int, default=30)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROLES = ["Top", "Jungle", "Mid", "ADC", "Support"]
BOT_ROLES = {"ADC", "Support"}
DEFAULT_METADATA = {
    "damageType": "Mixed",
    "compTags": [],
    "utilityTags": [],
    "laneTags": [],
    "counterTags": [],
    "threatTags": [],
    "blindPickScore": 5,
    "flexValue": 1,
    "earlyPickValue": 5,
    "latePickValue": 5,
}
CHAMPION_METADATA: dict[str, dict[str, Any]] = {}


def main() -> None:
    args = parse_args()
    load_champion_metadata(args.champion_metadata)
    imports = import_dependencies()
    rows = load_rows(args.input)
    if len(rows) < 20:
        raise SystemExit(f"Need at least 20 exported rows. Found {len(rows)} in {args.input}")
    network_stats = NetworkStats.from_path(args.network_stats)
    if network_stats.enabled:
        print(
            "Loaded Supabase network stats: "
            f"{network_stats.role_rows:,} role rows, "
            f"{network_stats.synergy_rows:,} synergy rows, "
            f"{network_stats.matchup_rows:,} matchup rows"
        )
    else:
        print("No Supabase network stats snapshot found; ranker will use Oracle-only aggregate features.")

    modes = [mode.strip() for mode in args.validation_modes.split(",") if mode.strip()]
    reports = []
    for mode in modes:
        print(f"\n=== Candidate ranking validation: {mode} ===")
        report = run_validation_mode(rows, args, mode, imports, network_stats)
        reports.append(report)
        for result in report["models"]:
            print(
                f"- {result['name']}: top1 {result['top1'] * 100:.1f}%, "
                f"top3 {result['top3'] * 100:.1f}%, ndcg@5 {result['ndcgAt5']:.4f}, "
                f"mrr {result['mrr']:.4f}"
            )

    output = {
        "createdAt": now_iso(),
        "rows": len(rows),
        "validationModes": modes,
        "candidateNegativesPerGroup": args.negatives_per_group,
        "maxTrainGroups": args.max_train_groups,
        "maxValidationGroups": args.max_validation_groups,
        "reports": reports,
        "advisorDesign": {
            "purpose": "General draft advisor score independent of player names, friend accounts, and team comfort.",
            "intendedFrontendUse": "Use as a bounded advisor bonus after hard filters and before/alongside team comfort.",
            "excludedSignals": ["player name", "friend account", "team-specific comfort"],
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"\nSaved candidate ranker comparison to {args.output}")


def run_validation_mode(rows: list[dict[str, Any]], args, mode: str, imports: dict[str, Any], network_stats: "NetworkStats") -> dict[str, Any]:
    train_indexes, validation_indexes = split_indexes(rows, mode, args, imports)
    train_rows = [rows[index] for index in train_indexes]
    validation_rows = [rows[index] for index in validation_indexes]
    stats = CandidateAggregateStats(train_rows, args.aggregate_smoothing)
    role_pools = build_role_pools(train_rows)

    train_groups = build_candidate_groups(
        train_rows,
        role_pools,
        stats,
        args,
        network_stats,
        seed=f"train:{mode}",
        max_groups=args.max_train_groups,
    )
    validation_groups = build_candidate_groups(
        validation_rows,
        role_pools,
        stats,
        args,
        network_stats,
        seed=f"validation:{mode}",
        max_groups=args.max_validation_groups,
    )
    if not train_groups or not validation_groups:
        raise SystemExit(f"Could not build candidate groups for validation mode {mode}")

    print(
        f"Groups: train {len(train_groups)} | validation {len(validation_groups)} | "
        f"candidate rows train {sum(len(group['items']) for group in train_groups)}"
    )

    vectorizer = imports["DictVectorizer"](sparse=True)
    x_train_dicts = [item["features"] for group in train_groups for item in group["items"]]
    y_train = imports["np"].array([item["label"] for group in train_groups for item in group["items"]], dtype=float)
    x_validation_dicts = [item["features"] for group in validation_groups for item in group["items"]]
    y_validation = imports["np"].array([item["label"] for group in validation_groups for item in group["items"]], dtype=float)
    x_train = vectorizer.fit_transform(x_train_dicts)
    x_validation = vectorizer.transform(x_validation_dicts)
    train_group_sizes = [len(group["items"]) for group in train_groups]
    validation_group_sizes = [len(group["items"]) for group in validation_groups]
    print(f"Candidate features: {len(vectorizer.get_feature_names_out())}")

    models = [
        evaluate_precomputed("Rule-Inspired Candidate Score", validation_groups, "ruleScore"),
        evaluate_precomputed("Aggregate Candidate Score", validation_groups, "aggregateScore"),
        evaluate_classifier_as_ranker(imports, x_train, y_train, x_validation, validation_groups, args),
        evaluate_lightgbm_ranker(imports, x_train, y_train, train_group_sizes, x_validation, validation_groups, validation_group_sizes, args),
    ]

    return {
        "validationMode": mode,
        "trainRows": len(train_rows),
        "validationRows": len(validation_rows),
        "trainGroups": len(train_groups),
        "validationGroups": len(validation_groups),
        "candidateFeatures": len(vectorizer.get_feature_names_out()),
        "models": [model for model in models if model],
    }


def import_dependencies() -> dict[str, Any]:
    try:
        import numpy as np
        from sklearn.feature_extraction import DictVectorizer
        from sklearn.metrics import ndcg_score
        from sklearn.model_selection import train_test_split
    except ImportError as error:
        raise SystemExit(
            "Missing Python ML dependencies. Run:\n"
            "  python -m pip install -r requirements-ml.txt\n\n"
            f"Import error: {error}"
        ) from error

    try:
        from lightgbm import LGBMClassifier, LGBMRanker
    except ImportError as error:
        raise SystemExit(
            "Missing LightGBM. Run:\n"
            "  python -m pip install -r requirements-ml.txt\n\n"
            f"Import error: {error}"
        ) from error

    return {
        "np": np,
        "DictVectorizer": DictVectorizer,
        "LGBMClassifier": LGBMClassifier,
        "LGBMRanker": LGBMRanker,
        "ndcg_score": ndcg_score,
        "train_test_split": train_test_split,
    }


def build_candidate_groups(
    rows: list[dict[str, Any]],
    role_pools: dict[str, list[str]],
    stats: "CandidateAggregateStats",
    args,
    network_stats: "NetworkStats",
    seed: str,
    max_groups: int,
) -> list[dict[str, Any]]:
    rng = random.Random(stable_int(seed))
    shuffled_rows = rows[:]
    rng.shuffle(shuffled_rows)
    groups: list[dict[str, Any]] = []

    for row in shuffled_rows:
        if row.get("label") != 1:
            continue
        for role in shuffled_roles(row, seed):
            actual = row.get("allyChampions", {}).get(role)
            if not actual:
                continue
            picked_without_candidate = {
                other_role: champion
                for other_role, champion in row.get("allyChampions", {}).items()
                if other_role != role and champion
            }
            current_allies = reveal_subset(picked_without_candidate, row, role, "ally")
            current_enemies = reveal_subset(row.get("enemyChampions", {}), row, role, "enemy")
            banned = set(row.get("allyBans", [])) | set(row.get("enemyBans", []))
            unavailable = set(current_allies.values()) | set(current_enemies.values()) | banned
            candidates = [actual]
            alternatives = [
                champion
                for champion in role_pools.get(role, [])
                if champion != actual and champion not in unavailable
            ]
            rng.shuffle(alternatives)
            candidates.extend(alternatives[: args.negatives_per_group])
            if len(candidates) < 2:
                continue

            phase = get_phase(len(current_allies))
            items = []
            for candidate in candidates:
                aggregate_score, aggregate_parts = stats.score_candidate(row, role, candidate, current_allies, current_enemies)
                network_parts = network_stats.score_candidate(role, candidate, current_allies, current_enemies)
                rule_score = rule_inspired_score(role, phase, current_allies, current_enemies, aggregate_parts, network_parts)
                label = 3 if candidate == actual else 0
                items.append(
                    {
                        "candidate": candidate,
                        "role": role,
                        "label": label,
                        "aggregateScore": aggregate_score,
                        "ruleScore": rule_score,
                        "features": candidate_features(
                            row,
                            role,
                            candidate,
                            phase,
                            current_allies,
                            current_enemies,
                            aggregate_score,
                            aggregate_parts,
                            network_parts,
                        ),
                    }
                )
            groups.append({"id": f"{row.get('matchId')}:{row.get('side')}:{role}", "items": items})
            if len(groups) >= max_groups:
                return groups

    return groups


def candidate_features(
    row: dict[str, Any],
    role: str,
    candidate: str,
    phase: str,
    allies: dict[str, str],
    enemies: dict[str, str],
    aggregate_score: float,
    aggregate_parts: dict[str, float],
    network_parts: dict[str, float],
) -> dict[str, float]:
    source_type = str(row.get("sourceType") or row.get("source") or "unknown")
    queue_group = queue_group_for(row.get("queueId"))
    draft_format = draft_format_for(source_type, row.get("queueId"))
    ally_summary = summarize_role_map(allies)
    enemy_summary = summarize_role_map(enemies)
    features: dict[str, float] = {
        "bias": 1,
        f"side:{row.get('side', 'unknown')}": 1,
        f"phase:{phase}": 1,
        f"source_type:{source_type}": 1,
        f"draft_format:{draft_format}": 1,
        f"queue_group:{queue_group}": 1,
        f"patch:{row.get('patch', 'unknown')}": 1,
        f"year:{patch_year(row.get('patch', 'unknown'))}": 1,
        f"region:{row.get('region', 'unknown')}": 1,
        f"candidate_role:{role}": 1,
        f"candidate:{role}:{candidate}": 1,
        f"advisor_context:{draft_format}:{phase}:{role}": 1,
        "num:aggregate_score": aggregate_score,
        "num:champion_role_rate": aggregate_parts["championRoleRate"],
        "num:champion_role_games_log": math.log1p(aggregate_parts["championRoleGames"]),
        "num:champion_role_confidence": aggregate_parts["championRoleConfidence"],
        "num:pair_rate_avg": aggregate_parts["pairRate"],
        "num:pair_games_log": math.log1p(aggregate_parts["pairGames"]),
        "num:pair_confidence": aggregate_parts["pairConfidence"],
        "num:matchup_rate": aggregate_parts["matchupRate"],
        "num:matchup_games_log": math.log1p(aggregate_parts["matchupGames"]),
        "num:matchup_confidence": aggregate_parts["matchupConfidence"],
        "num:network_score": network_parts["networkScore"],
        "num:network_role_win_rate": network_parts["roleWinRate"],
        "num:network_role_games_log": math.log1p(network_parts["roleGames"]),
        "num:network_role_confidence": network_parts["roleConfidence"],
        "num:network_synergy_delta_avg": network_parts["synergyDelta"],
        "num:network_synergy_games_log": math.log1p(network_parts["synergyGames"]),
        "num:network_synergy_confidence": network_parts["synergyConfidence"],
        "num:network_matchup_delta_avg": network_parts["matchupDelta"],
        "num:network_matchup_games_log": math.log1p(network_parts["matchupGames"]),
        "num:network_matchup_confidence": network_parts["matchupConfidence"],
        "num:revealed_ally_count": len(allies),
        "num:revealed_enemy_count": len(enemies),
        "num:role_response_value": role_response_value(role, enemies),
        "num:ally_has_frontline": ally_summary["hasFrontline"],
        "num:ally_has_engage": ally_summary["hasEngage"],
        "num:ally_has_peel": ally_summary["hasPeel"],
        "num:ally_has_waveclear": ally_summary["hasWaveclear"],
        "num:ally_ad_count": ally_summary["adCount"],
        "num:ally_ap_count": ally_summary["apCount"],
        "num:enemy_has_frontline": enemy_summary["hasFrontline"],
        "num:enemy_has_engage": enemy_summary["hasEngage"],
        "num:enemy_has_dive": enemy_summary["hasDive"],
        "num:enemy_has_poke": enemy_summary["hasPoke"],
        "num:enemy_ad_count": enemy_summary["adCount"],
        "num:enemy_ap_count": enemy_summary["apCount"],
    }
    add_candidate_metadata_features(features, role, candidate, ally_summary)
    for ally_role, champion in allies.items():
        features[f"state_ally:{ally_role}:{champion}"] = 1
        features[f"candidate_pair:{role}:{candidate}+{ally_role}:{champion}"] = 1
    for enemy_role, champion in enemies.items():
        features[f"state_enemy:{enemy_role}:{champion}"] = 1
        if enemy_role == role:
            features[f"candidate_matchup:{role}:{candidate}:into:{champion}"] = 1
    if role in BOT_ROLES:
        for partner_role in BOT_ROLES - {role}:
            partner = allies.get(partner_role)
            if partner:
                features[f"candidate_bot_pair:{role}:{candidate}+{partner_role}:{partner}"] = 1
    if role == "Jungle" and allies.get("Mid"):
        features[f"candidate_mid_jungle:{candidate}+{allies['Mid']}"] = 1
    if role == "Mid" and allies.get("Jungle"):
        features[f"candidate_mid_jungle:{allies['Jungle']}+{candidate}"] = 1
    if role == "Top" and allies.get("Jungle"):
        features[f"candidate_top_jungle:{candidate}+{allies['Jungle']}"] = 1
    if role == "Jungle" and allies.get("Top"):
        features[f"candidate_top_jungle:{allies['Top']}+{candidate}"] = 1
    return features


def add_candidate_metadata_features(features: dict[str, float], role: str, candidate: str, ally_summary: dict[str, float]) -> None:
    metadata = CHAMPION_METADATA.get(candidate, DEFAULT_METADATA)
    features[f"candidate_damage:{metadata['damageType']}"] = 1
    for tag in metadata["compTags"]:
        features[f"candidate_comp:{tag}"] = 1
    for tag in metadata["utilityTags"]:
        features[f"candidate_utility:{tag}"] = 1
    for tag in metadata["laneTags"]:
        features[f"candidate_lane:{tag}"] = 1
    for tag in metadata["counterTags"]:
        features[f"candidate_counter_tag:{tag}"] = 1
    for tag in metadata["threatTags"]:
        features[f"candidate_threat:{tag}"] = 1
    features["num:candidate_blind_pick_score"] = float(metadata["blindPickScore"]) / 10
    features["num:candidate_flex_value"] = float(metadata["flexValue"]) / 5
    features["num:candidate_early_pick_value"] = float(metadata["earlyPickValue"]) / 10
    features["num:candidate_late_pick_value"] = float(metadata["latePickValue"]) / 10
    if not ally_summary["hasFrontline"] and "Frontline" in metadata["utilityTags"]:
        features["candidate_fills:frontline"] = 1
    if not ally_summary["hasEngage"] and ("Engage" in metadata["utilityTags"] or "HardEngage" in metadata["utilityTags"]):
        features["candidate_fills:engage"] = 1
    if not ally_summary["hasPeel"] and "Peel" in metadata["utilityTags"]:
        features["candidate_fills:peel"] = 1
    if not ally_summary["hasWaveclear"] and "Waveclear" in metadata["utilityTags"]:
        features["candidate_fills:waveclear"] = 1
    if ally_summary["adCount"] >= 3 and metadata["damageType"] == "AP":
        features["candidate_fixes:heavy_ad"] = 1
    if ally_summary["apCount"] >= 3 and metadata["damageType"] == "AD":
        features["candidate_fixes:heavy_ap"] = 1
    if role in BOT_ROLES:
        features["candidate_role_family:bot"] = 1


def queue_group_for(queue_id: Any) -> str:
    if queue_id in (None, "", "pro"):
        return "pro"
    try:
        queue = int(queue_id)
    except (TypeError, ValueError):
        return "unknown"
    if queue == 400:
        return "normal_draft"
    if queue == 420:
        return "ranked_solo"
    if queue == 440:
        return "ranked_flex"
    return f"queue_{queue}"


def draft_format_for(source_type: str, queue_id: Any) -> str:
    if source_type == "pro" or queue_group_for(queue_id) == "pro":
        return "tournament"
    return "rank_normal"


def load_champion_metadata(path: Path) -> None:
    global CHAMPION_METADATA
    if not path.exists():
        CHAMPION_METADATA = {}
        return
    raw = json.loads(path.read_text(encoding="utf-8"))
    CHAMPION_METADATA = {
        champion_id: {**DEFAULT_METADATA, **metadata}
        for champion_id, metadata in raw.items()
        if isinstance(metadata, dict)
    }


def summarize_role_map(champions: dict[str, str]) -> dict[str, float]:
    metas = [CHAMPION_METADATA.get(champion, DEFAULT_METADATA) for champion in champions.values() if champion]
    utility_tags = {tag for metadata in metas for tag in metadata["utilityTags"]}
    comp_tags = {tag for metadata in metas for tag in metadata["compTags"]}
    threat_tags = {tag for metadata in metas for tag in metadata["threatTags"]}
    return {
        "hasFrontline": float("Frontline" in utility_tags),
        "hasEngage": float("Engage" in utility_tags or "HardEngage" in utility_tags),
        "hasPeel": float("Peel" in utility_tags),
        "hasWaveclear": float("Waveclear" in utility_tags),
        "hasDive": float("Dive" in comp_tags or "DiveThreat" in threat_tags or "BacklineAccess" in utility_tags),
        "hasPoke": float("Poke" in comp_tags or "PokeThreat" in threat_tags),
        "adCount": float(sum(1 for metadata in metas if metadata["damageType"] in {"AD", "Mixed", "True"})),
        "apCount": float(sum(1 for metadata in metas if metadata["damageType"] in {"AP", "Mixed", "True"})),
    }


class CandidateAggregateStats:
    def __init__(self, rows: list[dict[str, Any]], smoothing: float):
        self.global_rate = mean([row["label"] for row in rows], 0.5)
        self.smoothing = smoothing
        self.champion_role = grouped_rates(rows, self.global_rate, smoothing, champion_role_keys)
        self.champion_pair = grouped_rates(rows, self.global_rate, smoothing, pair_keys)
        self.matchup = grouped_rates(rows, self.global_rate, smoothing, matchup_keys)
        self.games = {
            "championRole": grouped_counts(rows, champion_role_keys),
            "pair": grouped_counts(rows, pair_keys),
            "matchup": grouped_counts(rows, matchup_keys),
        }

    def score_candidate(
        self,
        row: dict[str, Any],
        role: str,
        candidate: str,
        allies: dict[str, str],
        enemies: dict[str, str],
    ) -> tuple[float, dict[str, float]]:
        champion_role_key = f"{role}:{candidate}"
        pair_keys_for_candidate = [pair_key(role, candidate, ally_role, champion) for ally_role, champion in allies.items()]
        matchup_keys_for_candidate = [
            f"{role}:{candidate}:into:{enemy}"
            for enemy_role, enemy in enemies.items()
            if enemy_role == role
        ]
        champion_role_rate = self.champion_role.get(champion_role_key, self.global_rate)
        champion_role_games = self.games["championRole"].get(champion_role_key, 0)
        pair_rates = [self.champion_pair.get(key, self.global_rate) for key in pair_keys_for_candidate]
        pair_games = sum(self.games["pair"].get(key, 0) for key in pair_keys_for_candidate)
        matchup_rates = [self.matchup.get(key, self.global_rate) for key in matchup_keys_for_candidate]
        matchup_games = sum(self.games["matchup"].get(key, 0) for key in matchup_keys_for_candidate)
        pair_rate = mean(pair_rates, self.global_rate)
        matchup_rate = mean(matchup_rates, self.global_rate)
        response_bonus = role_response_value(role, enemies) * 0.03
        score = clamp01(
            champion_role_rate * 0.42
            + pair_rate * 0.28
            + matchup_rate * 0.22
            + self.global_rate * 0.08
            + response_bonus
        )
        return score, {
            "championRoleRate": champion_role_rate,
            "championRoleGames": champion_role_games,
            "championRoleConfidence": confidence(champion_role_games),
            "pairRate": pair_rate,
            "pairGames": pair_games,
            "pairConfidence": confidence(pair_games),
            "matchupRate": matchup_rate,
            "matchupGames": matchup_games,
            "matchupConfidence": confidence(matchup_games),
        }


class NetworkStats:
    def __init__(self, payload: dict[str, Any] | None):
        self.enabled = payload is not None
        self.role_rows = len(payload.get("roleStats", [])) if payload else 0
        self.synergy_rows = len(payload.get("synergyStats", [])) if payload else 0
        self.matchup_rows = len(payload.get("matchupStats", [])) if payload else 0
        self.role = self._weighted_rows(payload.get("roleStats", []) if payload else [], self._role_key, "win_rate")
        self.synergy = self._weighted_rows(payload.get("synergyStats", []) if payload else [], self._synergy_key, "delta_vs_average")
        self.matchup = self._weighted_rows(payload.get("matchupStats", []) if payload else [], self._matchup_key, "delta_vs_baseline")

    @classmethod
    def from_path(cls, path: Path) -> "NetworkStats":
        if not path.exists():
            return cls(None)
        return cls(json.loads(path.read_text(encoding="utf-8")))

    def score_candidate(self, role: str, candidate: str, allies: dict[str, str], enemies: dict[str, str]) -> dict[str, float]:
        role_entry = self.role.get(self._role_key({"champion_id": candidate, "role": role}), neutral_network_entry(0.5))
        synergy_entries = [
            self.synergy.get(self._synergy_key({"champion_id": candidate, "role": role, "ally_champion_id": ally, "ally_role": ally_role}), neutral_network_entry(0))
            for ally_role, ally in allies.items()
        ]
        matchup_entries = [
            self.matchup.get(
                self._matchup_key({"champion_id": candidate, "role": role, "enemy_champion_id": enemy, "enemy_role": enemy_role}),
                neutral_network_entry(0),
            )
            for enemy_role, enemy in enemies.items()
        ]
        synergy_delta = weighted_mean([entry["value"] for entry in synergy_entries], [entry["confidence"] for entry in synergy_entries], 0)
        synergy_games = sum(entry["games"] for entry in synergy_entries)
        synergy_confidence = mean([entry["confidence"] for entry in synergy_entries], 0)
        matchup_delta = weighted_mean([entry["value"] for entry in matchup_entries], [entry["confidence"] for entry in matchup_entries], 0)
        matchup_games = sum(entry["games"] for entry in matchup_entries)
        matchup_confidence = mean([entry["confidence"] for entry in matchup_entries], 0)
        network_score = clamp01(
            role_entry["value"] * 0.5
            + (0.5 + synergy_delta) * 0.22
            + (0.5 + matchup_delta) * 0.22
            + 0.5 * 0.06
        )
        return {
            "networkScore": network_score if self.enabled else 0.5,
            "roleWinRate": role_entry["value"] if self.enabled else 0.5,
            "roleGames": role_entry["games"] if self.enabled else 0,
            "roleConfidence": role_entry["confidence"] if self.enabled else 0,
            "synergyDelta": synergy_delta if self.enabled else 0,
            "synergyGames": synergy_games if self.enabled else 0,
            "synergyConfidence": synergy_confidence if self.enabled else 0,
            "matchupDelta": matchup_delta if self.enabled else 0,
            "matchupGames": matchup_games if self.enabled else 0,
            "matchupConfidence": matchup_confidence if self.enabled else 0,
        }

    def _weighted_rows(self, rows: list[dict[str, Any]], key_fn, value_column: str) -> dict[str, dict[str, float]]:
        grouped: dict[str, list[float]] = defaultdict(lambda: [0, 0, 0])
        for row in rows:
            key = key_fn(row)
            if not key or row.get("champion_id") is None:
                continue
            games = float(row.get("games") or 0)
            confidence_value = float(row.get("confidence") or min(1, games / 50))
            weight = max(1, games * max(confidence_value, 0.05))
            value = float(row.get(value_column) or 0)
            grouped[key][0] += value * weight
            grouped[key][1] += weight
            grouped[key][2] += games
        return {
            key: {
                "value": total / weight if weight else 0,
                "confidence": min(1, weight / 500),
                "games": games,
            }
            for key, (total, weight, games) in grouped.items()
        }

    def _role_key(self, row: dict[str, Any]) -> str:
        return f"{row.get('champion_id')}|{row.get('role')}"

    def _synergy_key(self, row: dict[str, Any]) -> str:
        return f"{row.get('champion_id')}|{row.get('role')}|{row.get('ally_champion_id')}|{row.get('ally_role')}"

    def _matchup_key(self, row: dict[str, Any]) -> str:
        return f"{row.get('champion_id')}|{row.get('role')}|{row.get('enemy_champion_id')}|{row.get('enemy_role')}"


def neutral_network_entry(value: float) -> dict[str, float]:
    return {"value": value, "confidence": 0, "games": 0}


def evaluate_precomputed(name: str, groups: list[dict[str, Any]], score_key: str) -> dict[str, Any]:
    scores = [[item[score_key] for item in group["items"]] for group in groups]
    return ranking_metrics(name, groups, scores)


def rule_inspired_score(role: str, phase: str, allies: dict[str, str], enemies: dict[str, str], aggregate_parts: dict[str, float], network_parts: dict[str, float]) -> float:
    response = role_response_value(role, enemies)
    phase_weight = {
        "firstPick": 0.25,
        "early": 0.35,
        "middle": 0.45,
        "late": 0.55,
    }.get(phase, 0.4)
    team_context = min(1, len(allies) / 4)
    enemy_context = min(1, len(enemies) / 5)
    score = (
        aggregate_parts["championRoleRate"] * 0.35
        + aggregate_parts["pairRate"] * (0.18 + team_context * 0.17)
        + aggregate_parts["matchupRate"] * (0.12 + enemy_context * phase_weight)
        + response * 0.12
        + aggregate_parts["championRoleConfidence"] * 0.04
        + (network_parts["networkScore"] - 0.5) * 0.12
    )
    return clamp01(score)


def evaluate_classifier_as_ranker(imports, x_train, y_train, x_validation, validation_groups, args) -> dict[str, Any] | None:
    classifier = imports["LGBMClassifier"](
        objective="binary",
        n_estimators=args.classifier_estimators,
        learning_rate=args.learning_rate,
        num_leaves=args.num_leaves,
        max_depth=args.max_depth,
        min_child_samples=args.min_child_samples,
        random_state=args.seed,
        verbose=-1,
    )
    classifier.fit(x_train, (y_train > 0).astype(int))
    probabilities = classifier.predict_proba(x_validation)[:, 1]
    return ranking_metrics("LightGBM Classifier As Ranker", validation_groups, split_scores(probabilities, validation_groups))


def evaluate_lightgbm_ranker(imports, x_train, y_train, train_group_sizes, x_validation, validation_groups, validation_group_sizes, args) -> dict[str, Any] | None:
    ranker = imports["LGBMRanker"](
        objective="lambdarank",
        metric="ndcg",
        n_estimators=args.ranker_estimators,
        learning_rate=args.learning_rate,
        num_leaves=args.num_leaves,
        max_depth=args.max_depth,
        min_child_samples=args.min_child_samples,
        random_state=args.seed,
        verbose=-1,
    )
    ranker.fit(
        x_train,
        y_train,
        group=train_group_sizes,
        eval_set=[(x_validation, flatten_labels(validation_groups))],
        eval_group=[validation_group_sizes],
        eval_at=[1, 3, 5],
    )
    scores = ranker.predict(x_validation)
    return ranking_metrics("LightGBM LambdaMART Ranker", validation_groups, split_scores(scores, validation_groups))


def ranking_metrics(name: str, groups: list[dict[str, Any]], scores_by_group: list[list[float]]) -> dict[str, Any]:
    top1 = 0
    top3 = 0
    reciprocal_ranks = []
    ndcg_values = []
    for group, scores in zip(groups, scores_by_group):
        labels = [item["label"] for item in group["items"]]
        positive_indexes = [index for index, label in enumerate(labels) if label > 0]
        if not positive_indexes:
            continue
        ranked_indexes = sorted(range(len(scores)), key=lambda index: scores[index], reverse=True)
        best_positive_rank = min(ranked_indexes.index(index) + 1 for index in positive_indexes)
        if best_positive_rank == 1:
            top1 += 1
        if best_positive_rank <= 3:
            top3 += 1
        reciprocal_ranks.append(1 / best_positive_rank)
        ndcg_values.append(simple_ndcg(labels, scores, 5))
    evaluated = max(1, len(reciprocal_ranks))
    return {
        "name": name,
        "top1": top1 / evaluated,
        "top3": top3 / evaluated,
        "mrr": mean(reciprocal_ranks, 0),
        "ndcgAt5": mean(ndcg_values, 0),
        "groupsEvaluated": evaluated,
    }


def split_indexes(rows: list[dict[str, Any]], mode: str, args, imports) -> tuple[list[int], list[int]]:
    train_test_split = imports["train_test_split"]
    indexes = list(range(len(rows)))
    if mode == "random":
        train, validation = train_test_split(indexes, test_size=args.validation_fraction, random_state=args.seed)
        return list(train), list(validation)
    if mode == "year":
        years = [patch_major(row.get("patch")) for row in rows]
        known_years = [year for year in years if year is not None]
        holdout_year = max(known_years)
        validation = [index for index, year in zip(indexes, years) if year == holdout_year]
        train = [index for index in indexes if index not in set(validation)]
        return train, validation
    if mode == "patch":
        patches = sorted({str(row.get("patch", "unknown")) for row in rows if patch_major(row.get("patch")) is not None}, key=patch_sort_key)
        holdout_patch = patches[-1]
        validation = [index for index, row in enumerate(rows) if str(row.get("patch")) == holdout_patch]
        train = [index for index in indexes if index not in set(validation)]
        return train, validation
    if mode == "region":
        regions = Counter(str(row.get("region", "unknown")) for row in rows)
        holdout_region = regions.most_common(1)[0][0]
        validation = [index for index, row in enumerate(rows) if str(row.get("region")) == holdout_region]
        train = [index for index in indexes if index not in set(validation)]
        return train, validation
    raise SystemExit(f"Unknown validation mode: {mode}")


def build_role_pools(rows: list[dict[str, Any]]) -> dict[str, list[str]]:
    pools: dict[str, Counter] = {role: Counter() for role in ROLES}
    for row in rows:
        for role, champion in row.get("allyChampions", {}).items():
            if role in pools and champion:
                pools[role][champion] += 1
    return {role: [champion for champion, _ in counter.most_common()] for role, counter in pools.items()}


def grouped_rates(rows: list[dict[str, Any]], fallback: float, smoothing: float, key_fn) -> dict[str, float]:
    totals: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for row in rows:
        for key in key_fn(row):
            totals[key][0] += int(row["label"])
            totals[key][1] += 1
    return {key: (wins + fallback * smoothing) / (games + smoothing) for key, (wins, games) in totals.items()}


def grouped_counts(rows: list[dict[str, Any]], key_fn) -> dict[str, int]:
    counts: Counter = Counter()
    for row in rows:
        counts.update(key_fn(row))
    return dict(counts)


def champion_role_keys(row: dict[str, Any]) -> list[str]:
    return [f"{role}:{champion}" for role, champion in row.get("allyChampions", {}).items() if champion]


def pair_keys(row: dict[str, Any]) -> list[str]:
    champions = row.get("allyChampions", {})
    keys = []
    for left_index, left_role in enumerate(ROLES):
        for right_role in ROLES[left_index + 1 :]:
            left = champions.get(left_role)
            right = champions.get(right_role)
            if left and right:
                keys.append(pair_key(left_role, left, right_role, right))
    return keys


def matchup_keys(row: dict[str, Any]) -> list[str]:
    keys = []
    for role in ROLES:
        ally = row.get("allyChampions", {}).get(role)
        enemy = row.get("enemyChampions", {}).get(role)
        if ally and enemy:
            keys.append(f"{role}:{ally}:into:{enemy}")
    return keys


def pair_key(left_role: str, left: str, right_role: str, right: str) -> str:
    ordered = sorted([(left_role, left), (right_role, right)])
    return f"{ordered[0][0]}:{ordered[0][1]}+{ordered[1][0]}:{ordered[1][1]}"


def reveal_subset(champions: dict[str, str], row: dict[str, Any], role: str, side: str) -> dict[str, str]:
    items = [(item_role, champion) for item_role, champion in champions.items() if champion]
    if not items:
        return {}
    rng = random.Random(stable_int(f"{row.get('matchId')}:{row.get('side')}:{role}:{side}:reveal"))
    rng.shuffle(items)
    max_revealed = len(items)
    reveal_count = rng.randint(0, max_revealed)
    return dict(items[:reveal_count])


def shuffled_roles(row: dict[str, Any], seed: str) -> list[str]:
    roles = ROLES[:]
    random.Random(stable_int(f"{seed}:{row.get('matchId')}:{row.get('side')}")).shuffle(roles)
    return roles


def get_phase(ally_pick_count: int) -> str:
    if ally_pick_count == 0:
        return "firstPick"
    if ally_pick_count <= 2:
        return "early"
    if ally_pick_count == 3:
        return "middle"
    return "late"


def role_response_value(role: str, enemies: dict[str, str]) -> float:
    if role in enemies:
        return 1
    if role in BOT_ROLES and any(enemy_role in BOT_ROLES for enemy_role in enemies):
        return 0.75
    return 0


def split_scores(flat_scores, groups: list[dict[str, Any]]) -> list[list[float]]:
    scores_by_group = []
    cursor = 0
    for group in groups:
        size = len(group["items"])
        scores_by_group.append(list(flat_scores[cursor : cursor + size]))
        cursor += size
    return scores_by_group


def flatten_labels(groups: list[dict[str, Any]]) -> list[float]:
    return [item["label"] for group in groups for item in group["items"]]


def simple_ndcg(labels: list[float], scores: list[float], k: int) -> float:
    ranked = sorted(range(len(scores)), key=lambda index: scores[index], reverse=True)[:k]
    ideal = sorted(range(len(labels)), key=lambda index: labels[index], reverse=True)[:k]
    dcg = sum((2 ** labels[index] - 1) / math.log2(rank + 2) for rank, index in enumerate(ranked))
    idcg = sum((2 ** labels[index] - 1) / math.log2(rank + 2) for rank, index in enumerate(ideal))
    return dcg / idcg if idcg else 0


def confidence(games: float, threshold: float = 50) -> float:
    return min(1, games / threshold)


def mean(values, fallback: float = 0) -> float:
    values = list(values)
    return sum(values) / len(values) if values else fallback


def weighted_mean(values: list[float], weights: list[float], fallback: float = 0) -> float:
    total_weight = sum(weights)
    if not values or total_weight <= 0:
        return fallback
    return sum(value * weight for value, weight in zip(values, weights)) / total_weight


def clamp01(value: float) -> float:
    return max(0, min(1, value))


def stable_int(value: str) -> int:
    return int(hashlib.sha256(value.encode("utf-8")).hexdigest()[:12], 16)


def patch_year(patch: str) -> str:
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


def load_rows(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def parse_args():
    parser = argparse.ArgumentParser(description="Train candidate-level LightGBM rankers for CompCraft recommendations.")
    parser.add_argument("--input", type=Path, default=Path("data/ml/training/draft_feature_rows.jsonl"))
    parser.add_argument("--network-stats", type=Path, default=Path("data/ml/training/supabase_network_stats.json"))
    parser.add_argument("--champion-metadata", type=Path, default=Path("data/ml/training/champion_metadata_for_ranker.json"))
    parser.add_argument("--output", type=Path, default=Path("data/ml/models/candidate_ranker_comparison.json"))
    parser.add_argument("--validation-modes", default="year,random")
    parser.add_argument("--validation-fraction", type=float, default=0.2)
    parser.add_argument("--negatives-per-group", type=int, default=12)
    parser.add_argument("--max-train-groups", type=int, default=18000)
    parser.add_argument("--max-validation-groups", type=int, default=5000)
    parser.add_argument("--aggregate-smoothing", type=float, default=25)
    parser.add_argument("--classifier-estimators", type=int, default=220)
    parser.add_argument("--ranker-estimators", type=int, default=260)
    parser.add_argument("--learning-rate", type=float, default=0.04)
    parser.add_argument("--num-leaves", type=int, default=31)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--min-child-samples", type=int, default=50)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


if __name__ == "__main__":
    main()

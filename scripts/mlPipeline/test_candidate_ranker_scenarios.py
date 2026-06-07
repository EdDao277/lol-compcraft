from __future__ import annotations

import argparse
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from train_candidate_ranker import (
    CandidateAggregateStats,
    NetworkStats,
    build_candidate_groups,
    build_role_pools,
    candidate_features,
    get_phase,
    import_dependencies,
    load_champion_metadata,
    load_rows,
    rule_inspired_score,
)


def main() -> None:
    args = parse_args()
    load_champion_metadata(args.champion_metadata)
    imports = import_dependencies()
    rows = load_rows(args.input)
    scenarios = load_scenarios(args.scenarios)
    if len(rows) < 20:
        raise SystemExit(f"Need exported training rows first. Missing usable rows in {args.input}")
    if not scenarios:
        raise SystemExit(f"No scenarios found in {args.scenarios}")

    stats = CandidateAggregateStats(rows, args.aggregate_smoothing)
    network_stats = NetworkStats.from_path(args.network_stats)
    if network_stats.enabled:
        print(
            "Loaded Supabase network stats: "
            f"{network_stats.role_rows:,} role rows, "
            f"{network_stats.synergy_rows:,} synergy rows, "
            f"{network_stats.matchup_rows:,} matchup rows"
        )

    role_pools = build_role_pools(rows)
    training_args = SimpleNamespace(
        aggregate_smoothing=args.aggregate_smoothing,
        negatives_per_group=args.negatives_per_group,
        max_train_groups=args.max_train_groups,
    )
    training_groups = build_candidate_groups(
        rows,
        role_pools,
        stats,
        training_args,
        network_stats,
        seed="scenario-test:train",
        max_groups=args.max_train_groups,
    )
    if not training_groups:
        raise SystemExit("Could not build candidate training groups.")

    vectorizer = imports["DictVectorizer"](sparse=True)
    x_train_dicts = [item["features"] for group in training_groups for item in group["items"]]
    y_train = imports["np"].array([item["label"] for group in training_groups for item in group["items"]], dtype=float)
    x_train = vectorizer.fit_transform(x_train_dicts)
    group_sizes = [len(group["items"]) for group in training_groups]
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
    ranker.fit(x_train, y_train, group=group_sizes)

    print(f"Trained scenario ranker on {len(training_groups)} groups / {x_train.shape[0]} candidate rows.")
    print(f"Feature columns: {len(vectorizer.get_feature_names_out())}")
    print(f"Loaded {len(scenarios)} curated scenarios from {args.scenarios}")

    reports = []
    for scenario in scenarios:
        report = scenario_report(scenario, role_pools, stats, network_stats, vectorizer, ranker, args)
        reports.append(report)
        print_scenario(report, args)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"scenarios": reports}, indent=2), encoding="utf-8")
    print(f"\nSaved scenario report to {args.output}")


def scenario_report(
    scenario: dict[str, Any],
    role_pools: dict[str, list[str]],
    stats: CandidateAggregateStats,
    network_stats: NetworkStats,
    vectorizer,
    ranker,
    args,
) -> dict[str, Any]:
    results = score_scenario(scenario, role_pools, stats, network_stats, vectorizer, ranker, args)
    expected = set(scenario.get("expectedGoodChampions", []))
    top_champions = [result["champion"] for result in results[: args.top_n]]
    expected_hits = [champion for champion in top_champions if champion in expected]
    return {
        "name": scenario["name"],
        "goal": scenario.get("goal", ""),
        "format": scenario.get("format", "tournament"),
        "ourSide": scenario.get("ourSide", scenario.get("side", "blue")),
        "ally": scenario.get("ally", {}),
        "enemy": scenario.get("enemy", {}),
        "candidateRoles": scenario.get("candidateRoles", []),
        "expectedGoodTraits": scenario.get("expectedGoodTraits", []),
        "expectedGoodChampions": scenario.get("expectedGoodChampions", []),
        "expectedHitsInTopN": expected_hits,
        "results": results[: args.top_n],
    }


def print_scenario(report: dict[str, Any], args) -> None:
    print("\n" + "=" * 88)
    print(report["name"])
    print(report["goal"])
    print(f"Our side: {report['ourSide']} | Format: {report['format']} | Candidate roles: {', '.join(report['candidateRoles'])}")
    print(f"Our picks: {format_picks(report['ally']) or 'none'}")
    print(f"Enemy picks: {format_picks(report['enemy']) or 'none'}")
    print(f"Expected traits: {', '.join(report['expectedGoodTraits']) or 'none'}")
    print(f"Expected champion hits in top {args.top_n}: {', '.join(report['expectedHitsInTopN']) or 'none'}")
    print("-" * 88)
    print(f"{'Rank':<5}{'Champion':<16}{'Role':<9}{'Combined':<10}{'ML':<8}{'Rule':<8}{'Agg':<8}")
    for index, result in enumerate(report["results"], start=1):
        print(
            f"{index:<5}{result['champion']:<16}{result['role']:<9}"
            f"{result['combined']:<10.1f}{result['ml']:<8.1f}"
            f"{result['rule']:<8.1f}{result['aggregate']:<8.1f}"
        )


def score_scenario(
    scenario: dict[str, Any],
    role_pools: dict[str, list[str]],
    stats: CandidateAggregateStats,
    network_stats: NetworkStats,
    vectorizer,
    ranker,
    args,
) -> list[dict[str, Any]]:
    ally = clean_role_map(scenario.get("ally", {}))
    enemy = clean_role_map(scenario.get("enemy", {}))
    phase = get_phase(len(ally))
    picked = set(ally.values()) | set(enemy.values())
    candidate_roles = scenario.get("candidateRoles") or ["Top", "Jungle", "Mid", "ADC", "Support"]
    candidates = [
        {"role": role, "champion": champion}
        for role in candidate_roles
        for champion in role_pools.get(role, [])
        if champion not in picked
    ][: args.max_candidates_per_scenario]
    row = {
        "matchId": f"scenario:{scenario['name']}",
        "side": scenario.get("ourSide", scenario.get("side", "blue")),
        "patch": scenario.get("patch", args.patch),
        "region": "scenario",
        "sourceType": "curated-scenario",
        "queueId": None if scenario.get("format") == "tournament" else 420,
        "allyChampions": ally,
        "enemyChampions": enemy,
        "allyBans": scenario.get("allyBans", []),
        "enemyBans": scenario.get("enemyBans", []),
    }

    feature_dicts = []
    scored = []
    for pick in candidates:
        aggregate_score, aggregate_parts = stats.score_candidate(row, pick["role"], pick["champion"], ally, enemy)
        network_parts = network_stats.score_candidate(pick["role"], pick["champion"], ally, enemy)
        rule_score = rule_inspired_score(pick["role"], phase, ally, enemy, aggregate_parts, network_parts)
        feature_dicts.append(candidate_features(row, pick["role"], pick["champion"], phase, ally, enemy, aggregate_score, aggregate_parts, network_parts))
        scored.append(
            {
                "champion": pick["champion"],
                "role": pick["role"],
                "aggregateRaw": aggregate_score,
                "ruleRaw": rule_score,
            }
        )

    if not scored:
        return []

    ml_scores = list(ranker.predict(vectorizer.transform(feature_dicts)))
    normalized_ml = normalize_scores(ml_scores)
    for result, ml_score in zip(scored, normalized_ml):
        combined = ml_score * 0.55 + result["ruleRaw"] * 0.3 + result["aggregateRaw"] * 0.15
        result["ml"] = round(ml_score * 100, 1)
        result["rule"] = round(result.pop("ruleRaw") * 100, 1)
        result["aggregate"] = round(result.pop("aggregateRaw") * 100, 1)
        result["combined"] = round(combined * 100, 1)
    return sorted(scored, key=lambda result: result["combined"], reverse=True)


def load_scenarios(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    return payload.get("scenarios", [])


def clean_role_map(picks: dict[str, str]) -> dict[str, str]:
    return {role: champion for role, champion in picks.items() if champion}


def normalize_scores(scores: list[float]) -> list[float]:
    low = min(scores)
    high = max(scores)
    if high == low:
        return [0.5 for _ in scores]
    return [(score - low) / (high - low) for score in scores]


def format_picks(picks: dict[str, str]) -> str:
    return ", ".join(f"{role}: {champion}" for role, champion in picks.items() if champion)


def parse_args():
    parser = argparse.ArgumentParser(description="Run curated draft scenarios through the candidate ranker.")
    parser.add_argument("--input", type=Path, default=Path("data/ml/training/draft_feature_rows.jsonl"))
    parser.add_argument("--network-stats", type=Path, default=Path("data/ml/training/supabase_network_stats.json"))
    parser.add_argument("--champion-metadata", type=Path, default=Path("data/ml/training/champion_metadata_for_ranker.json"))
    parser.add_argument("--scenarios", type=Path, default=Path("data/ml/scenarios/draft_scenarios.json"))
    parser.add_argument("--output", type=Path, default=Path("data/ml/models/candidate_ranker_scenarios.json"))
    parser.add_argument("--patch", default="16.11")
    parser.add_argument("--max-train-groups", type=int, default=14000)
    parser.add_argument("--max-candidates-per-scenario", type=int, default=240)
    parser.add_argument("--negatives-per-group", type=int, default=10)
    parser.add_argument("--aggregate-smoothing", type=float, default=25)
    parser.add_argument("--ranker-estimators", type=int, default=260)
    parser.add_argument("--learning-rate", type=float, default=0.04)
    parser.add_argument("--num-leaves", type=int, default=31)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--min-child-samples", type=int, default=50)
    parser.add_argument("--top-n", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


if __name__ == "__main__":
    main()

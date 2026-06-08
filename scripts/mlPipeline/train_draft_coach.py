from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from train_candidate_ranker import (
    CandidateAggregateStats,
    NetworkStats,
    build_candidate_groups,
    build_role_pools,
    flatten_labels,
    import_dependencies,
    load_champion_metadata,
    load_rows,
    ranking_metrics,
    split_scores,
)


def main() -> None:
    args = parse_args()
    load_champion_metadata(args.champion_metadata)
    imports = import_dependencies()
    rows = load_rows(args.input)
    if len(rows) < 20:
        raise SystemExit(f"Need at least 20 exported rows. Found {len(rows)} in {args.input}")

    network_stats = NetworkStats.from_path(args.network_stats)
    aggregate_stats = CandidateAggregateStats(rows, args.aggregate_smoothing)
    role_pools = build_role_pools(rows)

    pick_groups = build_candidate_groups(
        rows,
        role_pools,
        aggregate_stats,
        args,
        network_stats,
        seed="draft-coach:pick-ranker",
        max_groups=args.max_pick_groups,
    )
    intent_groups = build_candidate_groups(
        rows,
        role_pools,
        aggregate_stats,
        args,
        network_stats,
        seed="draft-coach:enemy-intent",
        max_groups=args.max_intent_groups,
    )
    if not pick_groups or not intent_groups:
        raise SystemExit("Could not build enough candidate groups for draft coach training")

    pick_model = train_classifier(imports, pick_groups, args, "pick ranker")
    intent_model = train_classifier(imports, intent_groups, args, "enemy intent")

    bundle = {
        "modelType": "CompCraft Draft Coach",
        "createdAt": now_iso(),
        "trainingRows": len(rows),
        "pickGroups": len(pick_groups),
        "intentGroups": len(intent_groups),
        "aggregateStats": aggregate_stats,
        "rolePools": role_pools,
        "championMetadata": json.loads(args.champion_metadata.read_text(encoding="utf-8")) if args.champion_metadata.exists() else {},
        "pickRanker": pick_model,
        "enemyIntent": intent_model,
        "notes": [
            "Draft win model estimates outcome value.",
            "Pick ranker estimates whether a candidate is draft-like in similar global draft states.",
            "Enemy intent model estimates contest/denial pressure from the opponent perspective.",
        ],
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    imports["joblib"].dump(bundle, args.output)
    print(f"Saved draft coach bundle to {args.output}")
    print(f"Rows: {len(rows):,} | pick groups: {len(pick_groups):,} | enemy intent groups: {len(intent_groups):,}")


def train_classifier(imports: dict[str, Any], groups: list[dict[str, Any]], args, label: str) -> dict[str, Any]:
    vectorizer = imports["DictVectorizer"](sparse=True)
    x_dicts = [item["features"] for group in groups for item in group["items"]]
    y = imports["np"].array([1 if item["label"] > 0 else 0 for group in groups for item in group["items"]], dtype=int)
    x = vectorizer.fit_transform(x_dicts)
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
    model.fit(x, y)
    probabilities = model.predict_proba(x)[:, 1]
    metrics = ranking_metrics(
        f"Draft Coach {label}",
        groups,
        split_scores(probabilities, groups),
    )
    print(
        f"{label}: top1 {metrics['top1'] * 100:.1f}% | "
        f"top3 {metrics['top3'] * 100:.1f}% | "
        f"ndcg@5 {metrics['ndcgAt5']:.4f}"
    )
    return {
        "model": model,
        "vectorizer": vectorizer,
        "metrics": metrics,
        "featureCount": len(vectorizer.get_feature_names_out()),
        "groups": len(groups),
        "positiveRate": float(y.mean()),
    }


def now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def parse_args():
    parser = argparse.ArgumentParser(description="Train the multi-module CompCraft draft coach bundle.")
    parser.add_argument("--input", type=Path, default=Path("data/ml/training/draft_feature_rows.jsonl"))
    parser.add_argument("--network-stats", type=Path, default=Path("data/ml/training/supabase_network_stats.json"))
    parser.add_argument("--champion-metadata", type=Path, default=Path("data/ml/training/champion_metadata_for_ranker.json"))
    parser.add_argument("--output", type=Path, default=Path("data/ml/models/draft_coach.joblib"))
    parser.add_argument("--negatives-per-group", type=int, default=10)
    parser.add_argument("--max-pick-groups", type=int, default=12000)
    parser.add_argument("--max-intent-groups", type=int, default=12000)
    parser.add_argument("--aggregate-smoothing", type=float, default=25)
    parser.add_argument("--estimators", type=int, default=240)
    parser.add_argument("--learning-rate", type=float, default=0.04)
    parser.add_argument("--num-leaves", type=int, default=31)
    parser.add_argument("--max-depth", type=int, default=6)
    parser.add_argument("--min-child-samples", type=int, default=50)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


if __name__ == "__main__":
    main()

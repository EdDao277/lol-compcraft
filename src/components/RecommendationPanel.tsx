import type { Recommendation } from '../types/recommendation';

type Props = {
  picks: Recommendation[];
  bans: Recommendation[];
};

export function RecommendationPanel({ picks, bans }: Props) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">Recommendations</h2>
      <div className="grid gap-4 xl:grid-cols-2">
        <RecommendationGroup title="Pick Recommendations" recommendations={picks} />
        <RecommendationGroup title="Ban Recommendations" recommendations={bans} />
      </div>
    </section>
  );
}

function RecommendationGroup({ title, recommendations }: { title: string; recommendations: Recommendation[] }) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-slate-700">{title}</h3>
      {recommendations.map((recommendation) => (
        <article key={`${recommendation.kind}-${recommendation.id}`} className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-start gap-3">
            <img className="h-12 w-12 rounded" src={recommendation.championIcon} alt={recommendation.championName} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{recommendation.kind}</p>
                  <h4 className="font-semibold">{recommendation.championName}</h4>
                </div>
                <span className="rounded bg-slate-900 px-2 py-1 text-sm font-semibold text-white">{recommendation.score}/100</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {recommendation.playerName} · {recommendation.role}
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Reasons</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {recommendation.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Risks</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {recommendation.risks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

import type { Recommendation } from '../types/recommendation';
import type { RecommendationLogRow } from '../types/database';
import { getSupabaseOrWarn, warnSupabaseError } from './serviceUtils';

export async function logRecommendations(draftSessionId: string, recommendations: Recommendation[]): Promise<RecommendationLogRow[]> {
  const supabase = getSupabaseOrWarn('recommendationLogService.logRecommendations');
  if (!supabase) return [];
  const rows = recommendations.map((recommendation) => ({
    draft_session_id: draftSessionId,
    recommendation_type: recommendation.kind,
    champion_id: recommendation.championId,
    score: recommendation.score,
    reasons: recommendation.reasons,
    risks: recommendation.risks,
  }));
  const { data, error } = await supabase.from('recommendation_logs').insert(rows).select('*');
  if (error) {
    warnSupabaseError('recommendationLogService.logRecommendations', error);
    return [];
  }
  return data ?? [];
}

export async function markRecommendationSelected(id: string): Promise<RecommendationLogRow | null> {
  const supabase = getSupabaseOrWarn('recommendationLogService.markRecommendationSelected');
  if (!supabase) return null;
  const { data, error } = await supabase.from('recommendation_logs').update({ was_selected: true }).eq('id', id).select('*').single();
  if (error) {
    warnSupabaseError('recommendationLogService.markRecommendationSelected', error);
    return null;
  }
  return data;
}

// Future ML note: recommendation logs can later become training/evaluation data for draft model experiments.

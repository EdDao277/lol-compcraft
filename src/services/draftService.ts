import type { DraftActionRow, DraftSessionRow } from '../types/database';
import { getSupabaseOrWarn, warnSupabaseError } from './serviceUtils';

export type CreateDraftSessionInput = Pick<DraftSessionRow, 'team_id' | 'side'> & Partial<Pick<DraftSessionRow, 'mode' | 'result'>>;
export type AddDraftActionInput = Pick<DraftActionRow, 'draft_session_id' | 'team' | 'action_type' | 'champion_id' | 'action_order'> & Partial<Pick<DraftActionRow, 'role'>>;

export async function createDraftSession(data: CreateDraftSessionInput): Promise<DraftSessionRow | null> {
  const supabase = getSupabaseOrWarn('draftService.createDraftSession');
  if (!supabase) return null;
  const { data: row, error } = await supabase.from('draft_sessions').insert(data).select('*').single();
  if (error) {
    warnSupabaseError('draftService.createDraftSession', error);
    return null;
  }
  return row;
}

export async function getDraftSessionsByTeam(teamId: string): Promise<DraftSessionRow[]> {
  const supabase = getSupabaseOrWarn('draftService.getDraftSessionsByTeam');
  if (!supabase) return [];
  const { data, error } = await supabase.from('draft_sessions').select('*').eq('team_id', teamId).order('created_at', { ascending: false });
  if (error) {
    warnSupabaseError('draftService.getDraftSessionsByTeam', error);
    return [];
  }
  return data ?? [];
}

export async function addDraftAction(data: AddDraftActionInput): Promise<DraftActionRow | null> {
  const supabase = getSupabaseOrWarn('draftService.addDraftAction');
  if (!supabase) return null;
  const { data: row, error } = await supabase.from('draft_actions').insert(data).select('*').single();
  if (error) {
    warnSupabaseError('draftService.addDraftAction', error);
    return null;
  }
  return row;
}

export async function getDraftActions(draftSessionId: string): Promise<DraftActionRow[]> {
  const supabase = getSupabaseOrWarn('draftService.getDraftActions');
  if (!supabase) return [];
  const { data, error } = await supabase.from('draft_actions').select('*').eq('draft_session_id', draftSessionId).order('action_order', { ascending: true });
  if (error) {
    warnSupabaseError('draftService.getDraftActions', error);
    return [];
  }
  return data ?? [];
}

export async function deleteDraftAction(id: string): Promise<boolean> {
  const supabase = getSupabaseOrWarn('draftService.deleteDraftAction');
  if (!supabase) return false;
  const { error } = await supabase.from('draft_actions').delete().eq('id', id);
  if (error) {
    warnSupabaseError('draftService.deleteDraftAction', error);
    return false;
  }
  return true;
}

export async function updateDraftResult(draftSessionId: string, result: string): Promise<DraftSessionRow | null> {
  const supabase = getSupabaseOrWarn('draftService.updateDraftResult');
  if (!supabase) return null;
  const { data, error } = await supabase.from('draft_sessions').update({ result }).eq('id', draftSessionId).select('*').single();
  if (error) {
    warnSupabaseError('draftService.updateDraftResult', error);
    return null;
  }
  return data;
}

// Future ML note: saved draft actions and results can later be exported as labeled draft-history data.

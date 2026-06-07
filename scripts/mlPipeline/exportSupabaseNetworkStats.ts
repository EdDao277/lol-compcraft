import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadPipelineEnv, requirePipelineEnv } from '../statsPipeline/env';

loadPipelineEnv();

const outputPath = path.resolve('data/ml/training/supabase_network_stats.json');
const pageSize = 1000;

type SupabaseTable = 'champion_role_stats' | 'champion_synergy_stats' | 'champion_matchup_stats' | 'team_comp_signature_stats';
type SupabaseReadClient = {
  from: (table: string) => {
    select: (columns: string) => {
      range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
    };
  };
};

async function main() {
  const supabase = createClient(requirePipelineEnv('SUPABASE_URL'), requirePipelineEnv('SUPABASE_SERVICE_ROLE_KEY'));

  const [roleStats, synergyStats, matchupStats, teamCompSignatureStats] = await Promise.all([
    fetchAllRows(supabase, 'champion_role_stats'),
    fetchAllRows(supabase, 'champion_synergy_stats'),
    fetchAllRows(supabase, 'champion_matchup_stats'),
    fetchAllRows(supabase, 'team_comp_signature_stats'),
  ]);

  const payload = {
    createdAt: new Date().toISOString(),
    source: 'supabase',
    roleStats,
    synergyStats,
    matchupStats,
    teamCompSignatureStats,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`Exported ${roleStats.length} champion_role_stats rows`);
  console.log(`Exported ${synergyStats.length} champion_synergy_stats rows`);
  console.log(`Exported ${matchupStats.length} champion_matchup_stats rows`);
  console.log(`Exported ${teamCompSignatureStats.length} team_comp_signature_stats rows`);
  console.log(`Saved Supabase network stats to ${outputPath}`);
}

async function fetchAllRows(supabase: SupabaseReadClient, table: SupabaseTable) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(table).select('*').range(from, to);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

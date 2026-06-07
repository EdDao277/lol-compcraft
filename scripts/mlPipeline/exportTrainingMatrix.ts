import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import generatedChampions from '../../src/data/generated/champions.json';
import { getChampionMetadata } from '../../src/data/championDraftMetadata';
import { buildTeamCompSignatureFromRoleMap } from '../../src/logic/teamCompSignature';
import { loadTrainingData } from './loadTrainingData';
import { loadPipelineEnv } from '../statsPipeline/env';

loadPipelineEnv();

const outputRoot = path.resolve('data/ml');

async function main() {
  const { dataset, examples } = await loadTrainingData();
  const featureRows = dataset.rows.map((row) =>
    JSON.stringify({
      matchId: row.example.matchId,
      label: row.label,
      side: row.example.side,
      patch: row.example.patch,
      region: row.example.region,
      source: row.example.source,
      sourceType: row.example.sourceType,
      queueId: row.example.queueId,
      allyChampions: row.example.allyChampions,
      enemyChampions: row.example.enemyChampions,
      allyCompSignature: buildTeamCompSignatureFromRoleMap(row.example.allyChampions).signature,
      enemyCompSignature: buildTeamCompSignatureFromRoleMap(row.example.enemyChampions).signature,
      allyBans: row.example.allyBans,
      enemyBans: row.example.enemyBans,
      features: row.features.map((featureIndex) => dataset.featureNames[featureIndex]).filter((feature): feature is string => Boolean(feature)),
    }),
  );

  await mkdir(path.join(outputRoot, 'training'), { recursive: true });
  await writeFile(path.join(outputRoot, 'training', 'draft_feature_rows.jsonl'), featureRows.join('\n'));
  await writeFile(path.join(outputRoot, 'training', 'feature_names.json'), JSON.stringify(dataset.featureNames, null, 2));
  await writeFile(path.join(outputRoot, 'training', 'champion_metadata_for_ranker.json'), JSON.stringify(getRankerChampionMetadata(), null, 2));

  console.log(`Exported ${examples.length} examples`);
  console.log(`Exported ${dataset.featureNames.length} features`);
  console.log(`Saved rows to ${path.join(outputRoot, 'training', 'draft_feature_rows.jsonl')}`);
  console.log(`Saved feature names to ${path.join(outputRoot, 'training', 'feature_names.json')}`);
  console.log(`Saved champion metadata to ${path.join(outputRoot, 'training', 'champion_metadata_for_ranker.json')}`);
}

function getRankerChampionMetadata() {
  return Object.fromEntries(
    generatedChampions.map((champion) => {
      const metadata = getChampionMetadata(champion.id);
      return [
        champion.id,
        {
          damageType: metadata.damageType,
          compTags: metadata.compTags,
          utilityTags: metadata.utilityTags,
          laneTags: metadata.laneTags,
          counterTags: metadata.counterTags,
          threatTags: metadata.threatTags,
          blindPickScore: metadata.blindPickScore,
          flexValue: metadata.flexValue,
          earlyPickValue: metadata.earlyPickValue,
          latePickValue: metadata.latePickValue,
        },
      ];
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

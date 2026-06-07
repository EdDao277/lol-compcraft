import path from 'node:path';
import { buildDraftTrainingExamples } from './buildTrainingExamples';
import { buildTrainingDataset } from './featureBuilder';
import { importOracleElixirCsvDir } from './oracleElixirImporter';

const outputRoot = path.resolve('data/ml');

export async function loadTrainingData() {
  const oracleCsvDir = process.env.ML_ORACLE_CSV_DIR || path.join(outputRoot, 'oracle');
  const oracleImport = await importOracleElixirCsvDir(oracleCsvDir);
  const oracleExamples = buildDraftTrainingExamples(oracleImport.teams, 'oracle-elixir');
  const examples = oracleExamples;

  if (examples.length < 20) {
    throw new Error(`Need at least 20 draft examples to train the LightGBM ranker. Found ${examples.length}. Add Oracle CSVs to ${oracleCsvDir}.`);
  }

  return {
    oracleImport,
    examples,
    dataset: buildTrainingDataset(examples),
  };
}

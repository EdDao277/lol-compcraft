import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';
import { loadPipelineEnv, requirePipelineEnv } from '../statsPipeline/env';

type ArtifactConfig = {
  artifactKey: string;
  localPath: string;
  storagePath: string;
  contentType: string;
  description: string;
  gzip?: boolean;
};

const bucket = process.env.ML_ARTIFACT_BUCKET || 'compcraft-ml-artifacts';

const artifacts: ArtifactConfig[] = [
  {
    artifactKey: 'draft_win_predictor',
    localPath: process.env.ML_MODEL_PATH || 'data/ml/models/draft_win_predictor.joblib',
    storagePath: process.env.ML_MODEL_STORAGE_PATH || 'models/draft_win_predictor.joblib',
    contentType: 'application/octet-stream',
    description: 'Current CompCraft draft win predictor model bundle',
  },
  {
    artifactKey: 'draft_coach',
    localPath: process.env.ML_COACH_MODEL_PATH || 'data/ml/models/draft_coach.joblib',
    storagePath: process.env.ML_COACH_MODEL_STORAGE_PATH || 'models/draft_coach.joblib',
    contentType: 'application/octet-stream',
    description: 'Current CompCraft draft coach bundle with pick ranker and enemy intent modules',
  },
  {
    artifactKey: 'supabase_network_stats',
    localPath: process.env.ML_NETWORK_STATS_PATH || 'data/ml/training/supabase_network_stats.json',
    storagePath: process.env.ML_NETWORK_STATS_STORAGE_PATH || 'training/supabase_network_stats.json.gz',
    contentType: 'application/gzip',
    description: 'Exported Supabase network stats used by the draft win predictor',
    gzip: process.env.ML_GZIP_NETWORK_STATS !== 'false',
  },
];

async function main() {
  loadPipelineEnv();

  const supabase = createClient(requirePipelineEnv('SUPABASE_URL'), requirePipelineEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const urls: Record<string, string> = {};

  for (const artifact of artifacts) {
    const resolvedPath = path.resolve(artifact.localPath);
    const sourceBody = readFileSync(resolvedPath);
    const body = artifact.gzip ? gzipSync(sourceBody, { level: 9 }) : sourceBody;
    const byteSize = statSync(resolvedPath).size;
    const uploadedByteSize = body.length;
    const sha256 = createHash('sha256').update(sourceBody).digest('hex');

    const { error: uploadError } = await supabase.storage.from(bucket).upload(artifact.storagePath, body, {
      contentType: artifact.contentType,
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(artifact.storagePath);
    const publicUrl = publicUrlData.publicUrl;
    urls[artifact.artifactKey] = publicUrl;

    const { error: metadataError } = await supabase.from('ml_artifacts').upsert(
      {
        artifact_key: artifact.artifactKey,
        storage_bucket: bucket,
        storage_path: artifact.storagePath,
        public_url: publicUrl,
        content_type: artifact.contentType,
        byte_size: uploadedByteSize,
        sha256,
        description: artifact.description,
        is_active: true,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: 'artifact_key' },
    );
    if (metadataError) throw metadataError;

    console.log(`Uploaded ${artifact.artifactKey}: ${uploadedByteSize.toLocaleString()} bytes${artifact.gzip ? ` compressed from ${byteSize.toLocaleString()} bytes` : ''}`);
    console.log(`  ${publicUrl}`);
  }

  console.log('');
  console.log('Use these ML API environment variables on your host:');
  console.log(`MODEL_BUNDLE_URL=${urls.draft_win_predictor}`);
  console.log(`COACH_MODEL_URL=${urls.draft_coach}`);
  console.log(`NETWORK_STATS_URL=${urls.supabase_network_stats}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

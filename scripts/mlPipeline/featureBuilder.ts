import { getChampionMetadata } from '../../src/data/championDraftMetadata';
import type { NormalizedRole } from '../statsPipeline/types';
import type { DraftTrainingExample, TrainingDataset } from './types';

const roles: NormalizedRole[] = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
const compFeatures = ['engage', 'hard_engage', 'frontline', 'peel', 'disengage', 'poke', 'dive', 'scaling', 'pick', 'waveclear'] as const;

export function buildTrainingDataset(examples: DraftTrainingExample[]): TrainingDataset {
  const featureNames: string[] = [];
  const featureIndex = new Map<string, number>();

  const getFeatureIndex = (name: string) => {
    const existing = featureIndex.get(name);
    if (existing !== undefined) return existing;
    const nextIndex = featureNames.length;
    featureNames.push(name);
    featureIndex.set(name, nextIndex);
    return nextIndex;
  };

  const sparseRows = examples.map((example) => {
    const activeFeatures = getActiveFeatures(example).map(getFeatureIndex);
    return {
      example,
      features: activeFeatures,
      label: example.labelWin,
    };
  });

  return { examples, featureNames, rows: sparseRows };
}

function getActiveFeatures(example: DraftTrainingExample) {
  const features = new Set<string>();
  features.add(`bias:source:${example.source}`);
  features.add(`bias:side:${example.side}`);
  features.add(`patch:${example.patch}`);
  features.add(`year:${getPatchYear(example.patch)}`);
  features.add(`region:${example.region}`);
  features.add(`queue:${example.queueId ?? 'pro'}`);

  for (const role of roles) {
    const allyChampion = example.allyChampions[role];
    const enemyChampion = example.enemyChampions[role];
    if (allyChampion) features.add(`ally:${role}:${allyChampion}`);
    if (enemyChampion) features.add(`enemy:${role}:${enemyChampion}`);
    if (allyChampion && enemyChampion) features.add(`matchup:${role}:${allyChampion}:into:${enemyChampion}`);
  }

  for (const [leftRole, rightRole] of rolePairs()) {
    const left = example.allyChampions[leftRole];
    const right = example.allyChampions[rightRole];
    if (left && right) features.add(`ally_pair:${leftRole}:${left}+${rightRole}:${right}`);
  }

  addNamedRolePair(features, example, 'bot_pair', 'ADC', 'Support');
  addNamedRolePair(features, example, 'mid_jungle_pair', 'Jungle', 'Mid');
  addNamedRolePair(features, example, 'top_jungle_pair', 'Top', 'Jungle');
  addBanFeatures(features, 'ally', example.allyBans, example.enemyChampions);
  addBanFeatures(features, 'enemy', example.enemyBans, example.allyChampions);
  addCompFeatures(features, 'ally', Object.values(example.allyChampions).filter(Boolean));
  addCompFeatures(features, 'enemy', Object.values(example.enemyChampions).filter(Boolean));
  addCompComparisonFeatures(features, example);

  return [...features];
}

function addBanFeatures(features: Set<string>, side: 'ally' | 'enemy', bans: string[], opposingChampions: Record<NormalizedRole, string>) {
  const opposingPickedIds = new Set(Object.values(opposingChampions).filter(Boolean));
  for (const ban of bans) {
    features.add(`${side}:ban:${ban}`);
    const metadata = getChampionMetadata(ban);
    metadata.compTags.forEach((tag) => features.add(`${side}:ban_comp:${tag}`));
    metadata.utilityTags.forEach((tag) => features.add(`${side}:ban_utility:${tag}`));
    metadata.counterTags.forEach((tag) => features.add(`${side}:ban_counter:${tag}`));
    if (opposingPickedIds.has(ban)) features.add(`${side}:ban_matches_opposing_pick:${ban}`);
  }
  if (bans.length >= 5) features.add(`${side}:full_ban_set`);
}

function addNamedRolePair(features: Set<string>, example: DraftTrainingExample, featureName: string, leftRole: NormalizedRole, rightRole: NormalizedRole) {
  const left = example.allyChampions[leftRole];
  const right = example.allyChampions[rightRole];
  if (left && right) features.add(`${featureName}:${left}+${right}`);
}

function addCompFeatures(features: Set<string>, side: 'ally' | 'enemy', championIds: string[]) {
  const summary = summarizeComp(championIds);
  features.add(`${side}:damage:${summary.damageProfile}`);
  features.add(`${side}:identity:${summary.identity}`);
  for (const feature of compFeatures) {
    if (summary[feature]) features.add(`${side}:has:${feature}`);
  }
  if (summary.adCount >= 4) features.add(`${side}:damage:heavy_ad`);
  if (summary.apCount >= 4) features.add(`${side}:damage:heavy_ap`);
  if (summary.frontlineCount >= 2) features.add(`${side}:frontline:multiple`);
  if (summary.engageCount >= 2) features.add(`${side}:engage:multiple`);
}

function addCompComparisonFeatures(features: Set<string>, example: DraftTrainingExample) {
  const ally = summarizeComp(Object.values(example.allyChampions).filter(Boolean));
  const enemy = summarizeComp(Object.values(example.enemyChampions).filter(Boolean));
  if (ally.damageProfile !== enemy.damageProfile) features.add(`damage_profile:${ally.damageProfile}:vs:${enemy.damageProfile}`);
  if (ally.identity !== enemy.identity) features.add(`identity:${ally.identity}:vs:${enemy.identity}`);
  features.add(`frontline_count:${bucketCount(ally.frontlineCount)}:vs:${bucketCount(enemy.frontlineCount)}`);
  features.add(`engage_count:${bucketCount(ally.engageCount)}:vs:${bucketCount(enemy.engageCount)}`);
  features.add(`cc_count:${bucketCount(ally.ccCount)}:vs:${bucketCount(enemy.ccCount)}`);
  if (ally.engage && !enemy.disengage) features.add('ally_engage_into_no_disengage');
  if (enemy.engage && !ally.disengage) features.add('enemy_engage_into_no_disengage');
  if (ally.poke && !enemy.engage) features.add('ally_poke_into_low_engage');
  if (enemy.poke && !ally.engage) features.add('enemy_poke_into_low_engage');
  if (ally.dive && !enemy.peel) features.add('ally_dive_into_low_peel');
  if (ally.scaling && !enemy.earlySnowball) features.add('ally_scaling_not_pressured');
  if (enemy.scaling && !ally.earlySnowball) features.add('enemy_scaling_not_pressured');
  if (enemy.dive && !ally.peel) features.add('enemy_dive_into_low_peel');
  if (enemy.frontline && !ally.hasTankAnswer) features.add('enemy_frontline_without_tank_answer');
  if (ally.frontline && !enemy.hasTankAnswer) features.add('ally_frontline_without_tank_answer');
  if (ally.hasTankAnswer && enemy.frontline) features.add('ally_tank_answer_into_frontline');
  if (enemy.hasTankAnswer && ally.frontline) features.add('enemy_tank_answer_into_frontline');
}

function summarizeComp(championIds: string[]) {
  const metas = championIds.map(getChampionMetadata);
  const adCount = metas.filter((metadata) => metadata.damageType === 'AD' || metadata.damageType === 'Mixed' || metadata.damageType === 'True').length;
  const apCount = metas.filter((metadata) => metadata.damageType === 'AP' || metadata.damageType === 'Mixed' || metadata.damageType === 'True').length;
  const compCounts = new Map<string, number>();
  for (const metadata of metas) {
    metadata.compTags.forEach((tag) => compCounts.set(tag, (compCounts.get(tag) ?? 0) + 1));
  }

  const engage = metas.some((metadata) => metadata.utilityTags.includes('Engage') || metadata.utilityTags.includes('HardEngage'));
  const hardEngage = metas.some((metadata) => metadata.utilityTags.includes('HardEngage'));
  const frontline = metas.some((metadata) => metadata.utilityTags.includes('Frontline'));
  const peel = metas.some((metadata) => metadata.utilityTags.includes('Peel'));
  const disengage = metas.some((metadata) => metadata.utilityTags.includes('Disengage'));
  const poke = metas.some((metadata) => metadata.compTags.includes('Poke') || metadata.threatTags.includes('PokeThreat'));
  const dive = metas.some((metadata) => metadata.compTags.includes('Dive') || metadata.threatTags.includes('DiveThreat') || metadata.utilityTags.includes('BacklineAccess'));
  const scaling = metas.some((metadata) => metadata.compTags.includes('Scaling') || metadata.threatTags.includes('ScalingThreat'));
  const pick = metas.some((metadata) => metadata.compTags.includes('Pick'));
  const waveclear = metas.some((metadata) => metadata.utilityTags.includes('Waveclear'));

  return {
    adCount,
    apCount,
    damageProfile: getDamageProfile(adCount, apCount),
    identity: [...compCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Balanced',
    engage,
    hard_engage: hardEngage,
    hardEngage,
    frontline,
    peel,
    disengage,
    poke,
    dive,
    scaling,
    pick,
    waveclear,
    earlySnowball: metas.some((metadata) => metadata.compTags.includes('EarlySnowball') || metadata.threatTags.includes('EarlySnowballThreat')),
    hasTankAnswer: metas.some((metadata) => metadata.counterTags.includes('CountersTanks') || metadata.threatTags.includes('TankKiller')),
    frontlineCount: metas.filter((metadata) => metadata.utilityTags.includes('Frontline')).length,
    engageCount: metas.filter((metadata) => metadata.utilityTags.includes('Engage') || metadata.utilityTags.includes('HardEngage')).length,
    ccCount: metas.filter((metadata) => metadata.utilityTags.includes('CrowdControl') || metadata.utilityTags.includes('PointClickCC')).length,
  };
}

function bucketCount(count: number) {
  if (count <= 0) return '0';
  if (count === 1) return '1';
  if (count === 2) return '2';
  return '3plus';
}

function getDamageProfile(adCount: number, apCount: number) {
  if (adCount > 0 && apCount > 0) return 'mixed';
  if (adCount > 0) return 'ad_only';
  if (apCount > 0) return 'ap_only';
  return 'unknown';
}

function getPatchYear(patch: string) {
  const major = Number(patch.split('.')[0]);
  if (!Number.isFinite(major)) return 'unknown';
  return String(2010 + major);
}

function rolePairs() {
  const pairs: Array<[NormalizedRole, NormalizedRole]> = [];
  for (let left = 0; left < roles.length; left += 1) {
    for (let right = left + 1; right < roles.length; right += 1) {
      const leftRole = roles[left];
      const rightRole = roles[right];
      if (leftRole && rightRole) pairs.push([leftRole, rightRole]);
    }
  }
  return pairs;
}

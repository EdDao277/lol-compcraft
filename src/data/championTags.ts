import type { CompTag, CounterTag, LaneTag, ThreatTag, UtilityTag, WeaknessTag } from '../types/champion';

export const compTags: CompTag[] = ['Pick', 'Dive', 'FrontToBack', 'Poke', 'SplitPush', 'Scaling', 'EarlySnowball'];

export const utilityTags: UtilityTag[] = [
  'Engage',
  'HardEngage',
  'Disengage',
  'Peel',
  'Frontline',
  'CrowdControl',
  'PointClickCC',
  'Waveclear',
  'Burst',
  'SustainedDamage',
  'Mobility',
  'Shielding',
  'Healing',
  'VisionControl',
  'BacklineAccess',
];

export const laneTags: LaneTag[] = ['SafeBlind', 'Counterpick', 'LaneBully', 'WeakEarly', 'Roamer', 'ScalingLane', 'NeedsSetup', 'LowEconomy', 'WeakSide', 'Carry'];

export const threatTags: ThreatTag[] = [
  'ImmobileCarryPunish',
  'TankKiller',
  'SquishyKiller',
  'DiveThreat',
  'PokeThreat',
  'SplitPushThreat',
  'ScalingThreat',
  'EarlySnowballThreat',
  'ResetThreat',
  'AntiEngage',
  'AntiDive',
];

export const weaknessTags: WeaknessTag[] = [
  'LowMobility',
  'ShortRange',
  'SkillshotReliant',
  'NeedsPeel',
  'NeedsEngage',
  'NeedsFrontline',
  'WeakToDive',
  'WeakToPoke',
  'WeakToDisengage',
  'WeakToHardCC',
  'WeakToEarlyPressure',
  'WeakToSplitPush',
];

export const counterTags: CounterTag[] = [
  'CountersDive',
  'CountersPoke',
  'CountersFrontToBack',
  'CountersSplitPush',
  'CountersScaling',
  'CountersHealing',
  'CountersShielding',
  'CountersTanks',
  'CountersMobility',
  'CountersLowMobility',
  'CountersHardEngage',
];

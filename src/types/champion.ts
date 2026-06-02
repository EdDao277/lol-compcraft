export type Role = 'Top' | 'Jungle' | 'Mid' | 'ADC' | 'Support';

export type DamageType = 'AD' | 'AP' | 'Mixed' | 'True' | 'Low';

export type CompTag = 'Pick' | 'Dive' | 'FrontToBack' | 'Poke' | 'SplitPush' | 'Scaling' | 'EarlySnowball';

export type UtilityTag =
  | 'Engage'
  | 'HardEngage'
  | 'Disengage'
  | 'Peel'
  | 'Frontline'
  | 'CrowdControl'
  | 'PointClickCC'
  | 'Waveclear'
  | 'Burst'
  | 'SustainedDamage'
  | 'Mobility'
  | 'Shielding'
  | 'Healing'
  | 'VisionControl'
  | 'BacklineAccess';

export type LaneTag =
  | 'SafeBlind'
  | 'Counterpick'
  | 'LaneBully'
  | 'WeakEarly'
  | 'Roamer'
  | 'ScalingLane'
  | 'NeedsSetup'
  | 'LowEconomy'
  | 'WeakSide'
  | 'Carry';

export type ThreatTag =
  | 'ImmobileCarryPunish'
  | 'TankKiller'
  | 'SquishyKiller'
  | 'DiveThreat'
  | 'PokeThreat'
  | 'SplitPushThreat'
  | 'ScalingThreat'
  | 'EarlySnowballThreat'
  | 'ResetThreat'
  | 'AntiEngage'
  | 'AntiDive';

export type WeaknessTag =
  | 'LowMobility'
  | 'ShortRange'
  | 'SkillshotReliant'
  | 'NeedsPeel'
  | 'NeedsEngage'
  | 'NeedsFrontline'
  | 'WeakToDive'
  | 'WeakToPoke'
  | 'WeakToDisengage'
  | 'WeakToHardCC'
  | 'WeakToEarlyPressure'
  | 'WeakToSplitPush';

export type CounterTag =
  | 'CountersDive'
  | 'CountersPoke'
  | 'CountersFrontToBack'
  | 'CountersSplitPush'
  | 'CountersScaling'
  | 'CountersHealing'
  | 'CountersShielding'
  | 'CountersTanks'
  | 'CountersMobility'
  | 'CountersLowMobility'
  | 'CountersHardEngage';

export type ChampionMetadata = {
  championId: string;
  roles: Role[];
  damageType: DamageType;
  compTags: CompTag[];
  utilityTags: UtilityTag[];
  laneTags: LaneTag[];
  threatTags: ThreatTag[];
  weaknessTags: WeaknessTag[];
  counterTags: CounterTag[];
  blindPickScore: number;
  flexValue: number;
  earlyPickValue: number;
  latePickValue: number;
  synergies: string[];
  counters: string[];
  counteredBy: string[];
  notes?: string;
};

export type Champion = {
  id: string;
  key: number;
  name: string;
  title: string;
  image: string;
  imageUrl: string;
  riotTags: string[];
} & ChampionMetadata;

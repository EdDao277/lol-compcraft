import type { CompTag, CounterTag, LaneTag, ThreatTag, UtilityTag } from '../types/champion';

export type DraftTemplate = {
  identity: CompTag;
  wants: {
    compTags: CompTag[];
    utilityTags: UtilityTag[];
    laneTags: LaneTag[];
    threatTags: ThreatTag[];
  };
  hates: {
    compTags: CompTag[];
    utilityTags: UtilityTag[];
    threatTags: ThreatTag[];
    counterTags: CounterTag[];
  };
  requiredPieces: UtilityTag[];
  riskIfMissing: string[];
};

export const draftTemplates: Record<CompTag, DraftTemplate> = {
  Pick: {
    identity: 'Pick',
    wants: {
      compTags: ['Pick'],
      utilityTags: ['CrowdControl', 'PointClickCC', 'Burst', 'VisionControl'],
      laneTags: ['Roamer', 'LaneBully'],
      threatTags: ['SquishyKiller', 'ImmobileCarryPunish'],
    },
    hates: {
      compTags: ['Scaling', 'FrontToBack'],
      utilityTags: ['Disengage', 'Peel'],
      threatTags: ['AntiEngage'],
      counterTags: ['CountersLowMobility'],
    },
    requiredPieces: ['CrowdControl', 'Burst', 'VisionControl'],
    riskIfMissing: ['Pick comps need reliable CC, burst follow-up, and vision control to create catches.'],
  },
  Dive: {
    identity: 'Dive',
    wants: {
      compTags: ['Dive', 'EarlySnowball'],
      utilityTags: ['HardEngage', 'BacklineAccess', 'CrowdControl'],
      laneTags: ['LaneBully', 'Roamer'],
      threatTags: ['DiveThreat', 'SquishyKiller'],
    },
    hates: {
      compTags: ['Poke'],
      utilityTags: ['Disengage', 'Peel'],
      threatTags: ['AntiDive'],
      counterTags: ['CountersDive'],
    },
    requiredPieces: ['HardEngage', 'BacklineAccess', 'CrowdControl'],
    riskIfMissing: ['Dive comps need hard engage, backline access, and CC chains to finish targets.'],
  },
  FrontToBack: {
    identity: 'FrontToBack',
    wants: {
      compTags: ['FrontToBack', 'Scaling'],
      utilityTags: ['Frontline', 'Peel', 'SustainedDamage'],
      laneTags: ['SafeBlind', 'WeakSide', 'ScalingLane'],
      threatTags: ['ScalingThreat', 'TankKiller'],
    },
    hates: {
      compTags: ['Dive', 'SplitPush'],
      utilityTags: ['BacklineAccess', 'HardEngage'],
      threatTags: ['DiveThreat'],
      counterTags: ['CountersFrontToBack'],
    },
    requiredPieces: ['Frontline', 'Peel', 'SustainedDamage'],
    riskIfMissing: ['Front-to-back comps need frontline, peel, and sustained damage.'],
  },
  Poke: {
    identity: 'Poke',
    wants: {
      compTags: ['Poke'],
      utilityTags: ['Waveclear', 'Disengage', 'CrowdControl'],
      laneTags: ['SafeBlind', 'LaneBully'],
      threatTags: ['PokeThreat'],
    },
    hates: {
      compTags: ['Dive', 'EarlySnowball'],
      utilityTags: ['HardEngage', 'BacklineAccess'],
      threatTags: ['DiveThreat'],
      counterTags: ['CountersPoke'],
    },
    requiredPieces: ['Waveclear', 'Disengage'],
    riskIfMissing: ['Poke comps need waveclear and disengage so they can keep distance.'],
  },
  SplitPush: {
    identity: 'SplitPush',
    wants: {
      compTags: ['SplitPush'],
      utilityTags: ['Mobility', 'Waveclear', 'Disengage'],
      laneTags: ['Counterpick', 'Carry'],
      threatTags: ['SplitPushThreat'],
    },
    hates: {
      compTags: ['Pick', 'Dive'],
      utilityTags: ['HardEngage', 'CrowdControl'],
      threatTags: ['DiveThreat'],
      counterTags: ['CountersSplitPush'],
    },
    requiredPieces: ['Waveclear', 'Disengage'],
    riskIfMissing: ['Split-push comps need side-lane pressure plus enough waveclear/disengage to avoid forced fights.'],
  },
  Scaling: {
    identity: 'Scaling',
    wants: {
      compTags: ['Scaling', 'FrontToBack'],
      utilityTags: ['Peel', 'Waveclear', 'SustainedDamage'],
      laneTags: ['SafeBlind', 'ScalingLane', 'WeakSide'],
      threatTags: ['ScalingThreat', 'ResetThreat'],
    },
    hates: {
      compTags: ['EarlySnowball', 'Dive'],
      utilityTags: ['HardEngage', 'BacklineAccess'],
      threatTags: ['EarlySnowballThreat'],
      counterTags: ['CountersScaling'],
    },
    requiredPieces: ['Peel', 'Waveclear'],
    riskIfMissing: ['Scaling comps need enough waveclear and peel to survive early pressure.'],
  },
  EarlySnowball: {
    identity: 'EarlySnowball',
    wants: {
      compTags: ['EarlySnowball', 'Dive', 'Pick'],
      utilityTags: ['Engage', 'HardEngage', 'CrowdControl'],
      laneTags: ['LaneBully', 'Roamer'],
      threatTags: ['EarlySnowballThreat'],
    },
    hates: {
      compTags: ['Scaling'],
      utilityTags: ['Peel', 'Disengage'],
      threatTags: ['ScalingThreat'],
      counterTags: ['CountersHardEngage'],
    },
    requiredPieces: ['Engage', 'CrowdControl'],
    riskIfMissing: ['Early snowball comps need lane pressure and tools to force fights before enemies scale.'],
  },
};

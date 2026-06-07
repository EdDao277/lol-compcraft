import generatedChampions from '../../src/data/generated/champions.json';

const manualAliases: Record<string, string> = {
  dr_mundo: 'DrMundo',
  mundo: 'DrMundo',
  fiddle_sticks: 'Fiddlesticks',
  fiddlesticks: 'Fiddlesticks',
  kaisa: 'Kaisa',
  kai_sa: 'Kaisa',
  khazix: 'Khazix',
  kha_zix: 'Khazix',
  kogmaw: 'KogMaw',
  kog_maw: 'KogMaw',
  leesin: 'LeeSin',
  lee_sin: 'LeeSin',
  master_yi: 'MasterYi',
  miss_fortune: 'MissFortune',
  mf: 'MissFortune',
  nunu: 'Nunu',
  nunu_willump: 'Nunu',
  reksai: 'RekSai',
  rek_sai: 'RekSai',
  renata_glasc: 'Renata',
  tahm_kench: 'TahmKench',
  twisted_fate: 'TwistedFate',
  velkoz: 'Velkoz',
  vel_koz: 'Velkoz',
  wukong: 'MonkeyKing',
  xin_zhao: 'XinZhao',
};

const byName = new Map<string, string>();

for (const champion of generatedChampions) {
  byName.set(normalizeChampionName(champion.id), champion.id);
  byName.set(normalizeChampionName(champion.name), champion.id);
}

export function toChampionId(value: string | undefined | null) {
  if (!value) return null;
  const key = normalizeChampionName(value);
  return manualAliases[key] ?? byName.get(key) ?? null;
}

function normalizeChampionName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

import { MISSIONS } from './missions.js';
export { MISSIONS } from './missions.js';

// Values are arcade balance units, not canonical technical specifications.
export const SHIPS = {
  xwing: {
    id: 'xwing', name: 'T-65 X-wing', role: 'Универсальный истребитель',
    hull: 100, shield: 100, speed: 95, boostSpeed: 155, turnRate: 1.5,
    laserDamage: 19, laserCooldown: 0.18, laserHeat: 0.09, shieldRegen: 5,
    weapons: [
      { id: 'laser', name: 'Лазерные пушки', type: 'laser', damage: 19, speed: 670, cooldown: 0.18, ammo: null, heat: 0.09, lockDot: 0.96, range: 1400 },
      { id: 'proton-torpedo', name: 'Протонные торпеды', type: 'torpedo', damage: 120, speed: 285, cooldown: 1.25, ammo: 6, reserve: 12, reloadDuration: 4.5, heat: 0, lockDot: 0.94, range: 1700, turnRate: 1.65, splashRadius: 48, splashDamage: 55 },
    ],
    model: 'xwing',
    description: 'Четыре лазерные пушки, протонные торпеды и дефлекторные щиты. Баланс скорости и защиты.',
    ability: {
      id: 'shield-focus', name: 'Фокус щитов', duration: 4, cooldown: 14,
      description: 'Перераспределение энергии: щиты восстанавливают 40 единиц. Игровая модель штатного оборудования.',
      shieldRestore: 40,
    },
  },
  ywing: {
    id: 'ywing', name: 'BTL Y-wing', role: 'Ударный бомбардировщик',
    hull: 145, shield: 125, speed: 77, boostSpeed: 125, turnRate: 1.1,
    laserDamage: 24, laserCooldown: 0.24, laserHeat: 0.08, shieldRegen: 5,
    weapons: [
      { id: 'laser', name: 'Лазерные пушки', type: 'laser', damage: 24, speed: 670, cooldown: 0.24, ammo: null, heat: 0.08, lockDot: 0.96, range: 1400 },
      { id: 'ion-cannon', name: 'Ионные пушки', type: 'ion', damage: 4, speed: 590, cooldown: 0.38, ammo: null, heat: 0.05, stun: 3.5, lockDot: 0.96, range: 1200 },
      { id: 'proton-torpedo', name: 'Протонные торпеды', type: 'torpedo', damage: 120, speed: 285, cooldown: 1.25, ammo: 8, reserve: 16, reloadDuration: 4.5, heat: 0, lockDot: 0.94, range: 1700, turnRate: 1.65, splashRadius: 48, splashDamage: 55 },
    ],
    model: 'ywing',
    description: 'Усиленная защита и мощный залп. Менее манёвренный; перед финалом управление передаётся Люку.',
    ability: {
      id: 'ion-pulse', name: 'Ионный импульс', duration: 5, cooldown: 16,
      description: 'Ионное вооружение временно отключает ближайшую цель. Радиус и время оглушения условны.',
      radius: 320,
    },
  },
};

export const EPISODES = {
  episode4: {
    id: 'episode4', number: 'IV', title: 'Новая надежда',
    subtitle: 'Битва при Явине', location: 'Звезда Смерти · сектор Явина',
    ships: ['xwing', 'ywing'], missions: MISSIONS,
    briefing: 'Планы станции раскрыли уязвимую тепловую шахту. Проложите путь сквозь TIE и батареи, войдите в траншею и помогите Красному Пять нанести решающий удар.',
  },
};

'use strict';

// file0 parser/serializer: plain text, one value per line, crlf, 1-indexed
const FIELD = {
  name: 1,
  lv: 2,
  maxHp: 3,
  at: 5,
  weaponAt: 6,
  df: 7,
  armorDf: 8,
  exp: 10,
  gold: 11,
  kills: 12,
  weapon: 29,
  armor: 30,
  fun: 36,
  totalKills: 232,
  plot: 543,
  room: 548,
  time: 549, // stored in exponential notation
};

const INVENTORY_SLOTS = [13, 15, 17, 19, 21, 23, 25, 27];
const BOX_A_SLOTS = Array.from({ length: 10 }, (_, i) => 331 + i);
const BOX_B_SLOTS = Array.from({ length: 10 }, (_, i) => 343 + i);

// index = raw stored value; in-game item names, used to label inventory slots
const ITEM_NAMES = [
  'None', 'Monster Candy', 'Croquet Roll', 'Stick', 'Bandage', 'Rock Candy',
  'Pumpkin Rings', 'Spider Donut', 'Stoic Onion', 'Ghost Fruit', 'Spider Cider',
  'Butterscotch Pie', 'Faded Ribbon', 'Toy Knife', 'Tough Glove', 'Manly Bandanna',
  'Snowman Piece', 'Nice Cream', 'Puppydough Ice Cream', 'Bisicle', 'Unisicle',
  'Cinnamon Bunny', 'Temmie Flakes', 'Abandoned Quiche', 'Old Tutu', 'Ballet Shoes',
  'Punch Card', 'Annoying Dog', 'Dog Salad', 'Dog Residue (1)', 'Dog Residue (2)',
  'Dog Residue (3)', 'Dog Residue (4)', 'Dog Residue (5)', 'Dog Residue (6)',
  'Astronaut Food', 'Instant Noodles', 'Crab Apple', 'Hot Dog...?', 'Hot Cat',
  'Glamburger', 'Sea Tea', 'Starfait', 'Legendary Hero', 'Cloudy Glasses',
  "Torn Notebook", 'Stained Apron', 'Burnt Pan', 'Cowboy Hat', 'Empty Gun',
  'Heart Locket', 'Worn Dagger', 'Real Knife', 'The Locket', 'Bad Memory',
  'Dream', "Undyne's Letter", "Undyne's Letter EX", 'Potato Chisps', 'Junk Food',
  'Mystery Key', 'Face Steak', 'Hush Puppy', 'Snail Pie', 'Temmie Armor',
];

const ITEM = Object.fromEntries(ITEM_NAMES.map((name, i) => [name, i]));

// equipping a weapon/armor also sets its at/df line
const WEAPON_OPTIONS = [
  { value: 3, label: 'Stick', at: 0 },
  { value: 13, label: 'Toy Knife', at: 3 },
  { value: 14, label: 'Tough Glove', at: 5 },
  { value: 25, label: 'Ballet Shoes', at: 7 },
  { value: 45, label: 'Torn Notebook', at: 2 },
  { value: 47, label: 'Burnt Pan', at: 10 },
  { value: 49, label: 'Empty Gun', at: 12 },
  { value: 51, label: 'Worn Dagger', at: 15 },
  { value: 52, label: 'Real Knife', at: 99 },
];

const ARMOR_OPTIONS = [
  { value: 4, label: 'Bandage', df: 0 },
  { value: 12, label: 'Faded Ribbon', df: 3 },
  { value: 15, label: 'Manly Bandanna', df: 7 },
  { value: 24, label: 'Old Tutu', df: 10 },
  { value: 44, label: 'Cloudy Glasses', df: 5 },
  { value: 46, label: 'Stained Apron', df: 11 },
  { value: 48, label: 'Cowboy Hat', df: 12 },
  { value: 50, label: 'Heart Locket', df: 15 },
  { value: 53, label: 'The Locket', df: 99 },
  { value: 64, label: 'Temmie Armor', df: 20 },
];

// save-point rooms only; labels are our own descriptions
const ROOM_OPTIONS = [
  { value: 6, label: 'Ruins — Entrance' },
  { value: 12, label: 'Ruins — Leaf Pile' },
  { value: 18, label: 'Ruins — Mouse Hole' },
  { value: 31, label: 'Ruins — Home' },
  { value: 46, label: 'Snowdin — Box Road' },
  { value: 56, label: 'Snowdin — Spaghetti' },
  { value: 61, label: 'Snowdin — Dog House' },
  { value: 68, label: 'Snowdin — Town' },
  { value: 83, label: 'Waterfall — Checkpoint' },
  { value: 86, label: 'Waterfall — Hallway' },
  { value: 94, label: 'Waterfall — Crystal' },
  { value: 110, label: 'Waterfall — Bridge' },
  { value: 114, label: 'Waterfall — Trash Zone' },
  { value: 116, label: 'Waterfall — Quiet Area' },
  { value: 128, label: 'Waterfall — Temmie Village' },
  { value: 134, label: 'Waterfall — Undyne Arena' },
  { value: 139, label: 'Hotland — Lab Entrance' },
  { value: 145, label: 'Hotland — Magma Chamber' },
  { value: 155, label: 'Hotland — Core View' },
  { value: 164, label: 'Hotland — Bad Opinion Zone' },
  { value: 176, label: 'Hotland — Spider Entrance' },
  { value: 183, label: 'Hotland — Hotel Lobby' },
  { value: 196, label: 'Hotland — Core Branch' },
  { value: 210, label: 'Hotland — Core End' },
  { value: 216, label: 'Castle Elevator' },
  { value: 219, label: 'New Home' },
  { value: 231, label: 'Last Corridor' },
  { value: 232, label: 'Throne Entrance' },
  { value: 235, label: 'Throne Room' },
  { value: 236, label: 'The End' },
  { value: 246, label: 'True Laboratory' },
  { value: 251, label: 'True Lab — Bedroom' },
];

// full file0 snapshots, copied from flowey's time machine presets/*.js
// (https://github.com/crumblingstatue/FloweysTimeMachine)
const PRESET_LINES_RUINSSTART = [
  "Marty", "1", "20", "20", "10", "0", "10", "0", "4", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "3", "4", "0", "0", "0", "0", "0", "33",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "8", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "14", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "2", "1", "1", "0", "232", "6",
  "0",
];

const PRESET_LINES_ASGORENORMAL = [
  "Marty", "1", "20", "20", "10", "12", "10", "15", "4", "0", "0", "0", "17", "206", "17", "210",
  "11", "0", "43", "0", "61", "0", "0", "0", "0", "0", "0", "0", "49", "50", "0", "0", "0", "0",
  "0", "33", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "8", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "14", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "2", "1", "1", "1",
  "232", "237", "0",
];

const PRESET_LINES_ASGORETRUEENDING = [
  "Marty", "1", "20", "20", "10", "12", "10", "15", "4", "0", "0", "0", "17", "206", "17", "210",
  "11", "0", "43", "0", "61", "0", "0", "0", "0", "0", "0", "0", "49", "50", "0", "0", "0", "0",
  "0", "33", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "8", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "14", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "12", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "2", "1", "1", "1",
  "232", "237", "0",
];

const PRESET_LINES_UNDYNEUNDYING = [
  "Chara", "10", "56", "20", "15", "7", "13", "7", "4", "1648", "683", "0", "16", "206", "16",
  "0", "16", "0", "35", "0", "23", "0", "41", "0", "41", "0", "11", "0", "25", "24", "0", "0",
  "0", "0", "0", "33", "0", "0", "0", "0", "0", "0", "0", "0", "1", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "8", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "4", "0", "0", "0", "0", "0", "0", "1", "1", "1", "0", "0", "2", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "59", "21", "17", "21", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "14", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "2", "1",
  "1", "1", "232", "132", "0",
];

const PRESET_LINES_SANSBATTLE = [
  "Chara", "19", "92", "20", "46", "99", "14", "99", "4", "50000", "0", "0", "11", "206", "61",
  "0", "43", "0", "43", "0", "43", "0", "16", "0", "16", "0", "16", "0", "52", "53", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "4", "0", "0", "0", "0", "0", "0", "1", "1", "1", "0", "0", "2", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "109", "21", "17", "21", "44", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "1", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "1", "0", "0",
  "0", "0", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "1", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "199",
  "1", "1", "1", "0", "231", "0",
];

const PRESET_LINES_TRUEPACIFISTENDING = [
  "Marty", "1", "20", "20", "10", "0", "10", "0", "4", "0", "0", "0", "61", "206", "61", "210",
  "37", "220", "16", "221", "0", "0", "0", "0", "0", "0", "0", "0", "3", "4", "0", "0", "0", "0",
  "0", "33", "0", "1", "0", "0", "0", "0", "0", "0", "2", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "8", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "14", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
  "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "999", "1", "1", "1",
  "232", "236", "0",
];

// story-beat presets replacing every line in the file with optional name override
function presetLinesWithName(lines, name) {
  const copy = [...lines];
  if (name) copy[FIELD.name - 1] = name;
  return copy;
}

const PRESETS = [
  {
    id: 'ruinsStart',
    label: 'Ruins — start of the game',
    lines: PRESET_LINES_RUINSSTART,
  },
  {
    id: 'asgoreNormal',
    label: 'Asgore fight (neutral route)',
    lines: PRESET_LINES_ASGORENORMAL,
  },
  {
    id: 'asgoreTruePacifist',
    label: 'Asgore fight (True Pacifist — Toriel intervenes)',
    lines: PRESET_LINES_ASGORETRUEENDING,
  },
  {
    id: 'undyneUndying',
    label: 'Undyne the Undying (genocide)',
    lines: PRESET_LINES_UNDYNEUNDYING,
  },
  {
    id: 'sansBattle',
    label: 'Sans fight — judgment hall (genocide)',
    lines: PRESET_LINES_SANSBATTLE,
  },
  {
    id: 'truePacifistEnding',
    label: 'True Pacifist ending',
    lines: PRESET_LINES_TRUEPACIFISTENDING,
  },
];

const TIME_FIELD = FIELD.time;

function splitLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

// turns a split line array into the field object the editor renders
function linesToFields(lines) {
  const get = (index) => lines[index - 1] ?? '0';
  const getInt = (index) => parseInt(get(index), 10) || 0;

  return {
    name: get(FIELD.name),
    lv: getInt(FIELD.lv),
    maxHp: getInt(FIELD.maxHp),
    at: getInt(FIELD.at),
    weaponAt: getInt(FIELD.weaponAt),
    df: getInt(FIELD.df),
    armorDf: getInt(FIELD.armorDf),
    exp: getInt(FIELD.exp),
    gold: getInt(FIELD.gold),
    kills: getInt(FIELD.kills),
    totalKills: getInt(FIELD.totalKills),
    weapon: getInt(FIELD.weapon),
    armor: getInt(FIELD.armor),
    fun: getInt(FIELD.fun),
    plot: getInt(FIELD.plot),
    room: getInt(FIELD.room),
    // stored in scientific notation on disk, surfaced as plain frames
    timeFrames: Math.round(parseFloat(get(FIELD.time)) || 0),
    inventory: INVENTORY_SLOTS.map((idx) => getInt(idx)),
    boxA: BOX_A_SLOTS.map((idx) => getInt(idx)),
    boxB: BOX_B_SLOTS.map((idx) => getInt(idx)),
  };
}

function parseFile0(text) {
  const lines = splitLines(text);
  return {
    lineCount: lines.length,
    raw: lines,
    fields: linesToFields(lines),
  };
}

// applies edited fields onto the raw line array, untouched lines stay as read
function serializeFile0(rawLines, fields) {
  const lines = [...rawLines];
  const set = (index, value) => {
    lines[index - 1] = String(value);
  };

  if (fields.name !== undefined) set(FIELD.name, fields.name);
  if (fields.lv !== undefined) set(FIELD.lv, fields.lv);
  if (fields.maxHp !== undefined) set(FIELD.maxHp, fields.maxHp);
  if (fields.at !== undefined) set(FIELD.at, fields.at);
  if (fields.weaponAt !== undefined) set(FIELD.weaponAt, fields.weaponAt);
  if (fields.df !== undefined) set(FIELD.df, fields.df);
  if (fields.armorDf !== undefined) set(FIELD.armorDf, fields.armorDf);
  if (fields.exp !== undefined) set(FIELD.exp, fields.exp);
  if (fields.gold !== undefined) set(FIELD.gold, fields.gold);
  if (fields.kills !== undefined) set(FIELD.kills, fields.kills);
  if (fields.totalKills !== undefined) set(FIELD.totalKills, fields.totalKills);
  if (fields.weapon !== undefined) set(FIELD.weapon, fields.weapon);
  if (fields.armor !== undefined) set(FIELD.armor, fields.armor);
  if (fields.fun !== undefined) set(FIELD.fun, fields.fun);
  if (fields.plot !== undefined) set(FIELD.plot, fields.plot);
  if (fields.room !== undefined) set(FIELD.room, fields.room);
  if (fields.timeFrames !== undefined) {
    // keeps the on-disk exponential notation
    set(TIME_FIELD, Number(fields.timeFrames).toExponential());
  }
  if (fields.inventory !== undefined) {
    INVENTORY_SLOTS.forEach((idx, i) => set(idx, fields.inventory[i] ?? 0));
  }
  if (fields.boxA !== undefined) {
    BOX_A_SLOTS.forEach((idx, i) => set(idx, fields.boxA[i] ?? 0));
  }
  if (fields.boxB !== undefined) {
    BOX_B_SLOTS.forEach((idx, i) => set(idx, fields.boxB[i] ?? 0));
  }

  return lines.join('\r\n');
}

// undertale.ini: persistent progress that survives a true reset
const INI_SECTIONS = [
  {
    section: 'General',
    fields: [
      { key: 'BC', type: 'number', label: 'Items obtained (BC)' },
      { key: 'BH', type: 'bool', label: 'Hard Mode border unlocked' },
      { key: 'BP', type: 'bool', label: 'True Lab border unlocked' },
      { key: 'BW', type: 'bool', label: 'Game-complete borders unlocked' },
      { key: 'DB', type: 'bool', label: 'Annoying Dog border unlocked' },
      { key: 'CH', type: 'bool', label: 'Completed Hard Mode' },
      { key: 'CP', type: 'bool', label: 'Completed Pacifist' },
      { key: 'Gameover', type: 'number', label: 'Game overs' },
      { key: 'Kills', type: 'number', label: 'Lifetime kills' },
      { key: 'Love', type: 'number', label: 'LV (persistent)' },
      { key: 'Name', type: 'text', label: 'Player name' },
      { key: 'Room', type: 'number', label: 'Last saved room' },
      { key: 'Tale', type: 'bool', label: 'Heard Tale of the Fallen Human' },
      { key: 'Time', type: 'number', label: 'Play time (frames)' },
      { key: 'Truth', type: 'bool', label: '"Truth" flag (normally never set)' },
      { key: 'Won', type: 'number', label: 'Endings reached' },
      { key: 'fun', type: 'number', label: '"fun" seed' },
    ],
  },
  {
    section: 'Flowey',
    fields: [
      { key: 'AF', type: 'bool', label: 'Ending without finishing True Lab' },
      { key: 'AK', type: 'bool', label: 'Ending where only Asgore was killed' },
      { key: 'Alter', type: 'bool', label: 'Altered Flowey dialogue active' },
      { key: 'CHANGE', type: 'number', label: 'Route-switch counter' },
      { key: 'CK', type: 'bool', label: 'Unused flag' },
      { key: 'EX', type: 'number', label: "Flowey's extra ending counter" },
      { key: 'FloweyExplain1', type: 'bool', label: 'Flowey explained SAVE power' },
      { key: 'IK', type: 'bool', label: 'Ending with at least one kill' },
      { key: 'K', type: 'bool', label: 'Killed Flowey' },
      { key: 'Met1', type: 'number', label: 'Times met Flowey first' },
      { key: 'NK', type: 'bool', label: 'No-kill ending reached' },
      { key: 'SK', type: 'bool', label: 'Flowey killed Asgore' },
      { key: 'SPECIALK', type: 'bool', label: 'Ending reached during genocide setup' },
      { key: 'alter2', type: 'bool', label: 'Ruins genocide completed' },
      { key: 'truename', type: 'bool', label: 'Ruins genocide completed (alt flag)' },
    ],
  },
  {
    section: 'Toriel',
    fields: [
      { key: 'Bscotch', type: 'number', label: 'Pie flavor chosen (1=Butterscotch, 2=Cinnamon)' },
      { key: 'TK', type: 'number', label: 'Times killed Toriel' },
      { key: 'TS', type: 'number', label: 'Times spared Toriel' },
    ],
  },
  {
    section: 'Sans',
    fields: [
      { key: 'EndMet', type: 'bool', label: 'Met Sans at the judgment hallway' },
      { key: 'F', type: 'number', label: 'Times fought Sans' },
      { key: 'Intro', type: 'number', label: "Times seen Sans's fight intro" },
      { key: 'M1', type: 'number', label: 'Times met Sans first' },
      { key: 'MeetLv', type: 'number', label: 'Judgment hallway meets, LV > 2' },
      { key: 'MeetLv1', type: 'number', label: 'Judgment hallway meets, LV = 1' },
      { key: 'MeetLv2', type: 'number', label: 'Judgment hallway meets, LV = 2' },
      { key: 'MP', type: 'number', label: 'Spare-Sans offers (unused)' },
      { key: 'Pass', type: 'number', label: 'Secret codeword counter' },
      { key: 'SK', type: 'number', label: 'Times killed Sans' },
      { key: 'SS', type: 'number', label: 'Times spared Sans' },
      { key: 'SS2', type: 'number', label: 'Times spared Sans (second offer)' },
    ],
  },
  {
    section: 'Papyrus',
    fields: [
      { key: 'M1', type: 'number', label: 'Times met Papyrus first' },
      { key: 'PD', type: 'number', label: 'Papyrus dates completed' },
      { key: 'PK', type: 'number', label: 'Times killed Papyrus' },
      { key: 'PS', type: 'number', label: 'Times spared Papyrus' },
    ],
  },
  {
    section: 'Undyne',
    fields: [{ key: 'UD', type: 'number', label: 'Undyne dates completed' }],
  },
  {
    section: 'Alphys',
    fields: [
      { key: 'AD', type: 'number', label: 'Alphys dates completed' },
      { key: 'R', type: 'number', label: '"Anime is real" stance' },
      { key: 'M', type: 'number', label: 'Mad Mew Mew interaction state' },
    ],
  },
  {
    section: 'MTT',
    fields: [{ key: 'EssayNo', type: 'number', label: 'Mettaton essays written' }],
  },
  {
    section: 'Mett',
    fields: [{ key: 'O', type: 'bool', label: 'Experienced the Mettaton Opera' }],
  },
  {
    section: 'Mettaton',
    fields: [{ key: 'BossMet', type: 'bool', label: 'Encountered Mettaton (boss)' }],
  },
  {
    section: 'Asgore',
    fields: [{ key: 'KillYou', type: 'number', label: 'Deaths in the Asgore fight' }],
  },
  {
    section: 'FFFFF',
    fields: [
      { key: 'D', type: 'number', label: 'Deaths in the Omega Flowey fight' },
      { key: 'E', type: 'number', label: 'Post-credits stage' },
      { key: 'F', type: 'number', label: 'Post-credits stage (alt)' },
      { key: 'P', type: 'number', label: 'Omega Flowey fight stage' },
    ],
  },
  {
    section: 'EndF',
    fields: [{ key: 'EndF', type: 'number', label: 'True Pacifist ending stage' }],
  },
  {
    section: 'F7',
    fields: [{ key: 'F7', type: 'bool', label: 'Finished the Asriel fight' }],
  },
  {
    section: 'reset',
    fields: [
      { key: 'reset', type: 'bool', label: 'True Reset performed' },
      { key: 's_key', type: 'bool', label: 'Hit 0 names on credits (secret door)' },
    ],
  },
  {
    section: 'Dogshrine',
    fields: [{ key: 'Donated', type: 'bool', label: 'Donated to the Dog Shrine' }],
  },
];

function parseIni(text) {
  const lines = text.split(/\r?\n/);
  const data = {};
  let section = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;

    const sectionMatch = trimmed.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      data[section] = data[section] || {};
      continue;
    }

    const paramMatch = trimmed.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (paramMatch && section) {
      data[section][paramMatch[1]] = paramMatch[2].replace(/"/g, '');
    }
  }
  return data;
}

function serializeIni(data) {
  let out = '';
  for (const section of Object.keys(data)) {
    out += `[${section}]\r\n`;
    for (const key of Object.keys(data[section])) {
      out += `${key}="${data[section][key]}"\r\n`;
    }
  }
  return out;
}

function readIniFields(text) {
  const data = parseIni(text);
  const result = {};
  for (const { section, fields } of INI_SECTIONS) {
    result[section] = {};
    for (const field of fields) {
      const raw = data[section]?.[field.key];
      if (field.type === 'text') {
        result[section][field.key] = raw ?? '';
      } else if (field.type === 'bool') {
        result[section][field.key] = parseFloat(raw ?? '0') > 0;
      } else {
        result[section][field.key] = Math.trunc(parseFloat(raw ?? '0'));
      }
    }
  }
  return result;
}

// only writes keys that changed from original; untouched keys stay as on disk
function writeIniFields(originalText, original, edited) {
  const data = parseIni(originalText);
  for (const { section, fields } of INI_SECTIONS) {
    for (const field of fields) {
      const value = edited[section]?.[field.key];
      const before = original[section]?.[field.key];
      if (value === undefined || value === before) continue;

      data[section] = data[section] || {};
      if (field.type === 'text') {
        data[section][field.key] = String(value);
      } else if (field.type === 'bool') {
        data[section][field.key] = value ? '1.000000' : '0.000000';
      } else {
        data[section][field.key] = `${Math.trunc(Number(value))}.000000`;
      }
    }
  }
  return serializeIni(data);
}

module.exports = {
  FIELD,
  INVENTORY_SLOTS,
  BOX_A_SLOTS,
  BOX_B_SLOTS,
  ITEM_NAMES,
  WEAPON_OPTIONS,
  ARMOR_OPTIONS,
  ROOM_OPTIONS,
  PRESETS,
  INI_SECTIONS,
  linesToFields,
  parseFile0,
  serializeFile0,
  presetLinesWithName,
  readIniFields,
  writeIniFields,
};

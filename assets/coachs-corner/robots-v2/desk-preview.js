// Normalized polygons keep these masks aligned with every 1254px pose canvas.
// They select arms only where the tabletop overlaps the lower character image.
const armOutline = points => points.trim().split(/\s+/).map(pair =>
  pair.split(',').map(coordinate => Number(coordinate) / 1254).join(',')
).join(' ');
// Follow the inked sleeve/cuff/hand boundary. A straight cap between the
// sleeve and knuckles also selects the jacket behind them.
const deskArmMasks = {
  point: [
    armOutline(`0,800 85,960 130,970 180,977 225,988 270,1004
      315,1015 360,1027 398,1038 430,1049 450,1038 480,1025
      510,1015 540,1008 560,1009 582,1013 610,1025 632,1040
      650,1060 675,1090 695,1120 700,1140 690,1158 667,1168
      660,1190 640,1210 620,1221 590,1240 560,1245 500,1254 0,1254`),
    '.79,.55 1,.55 1,1 .82,1 .77,.90 .755,.80 .76,.68'
  ],
  thumbs: [
    armOutline(`0,800 85,960 130,974 180,981 220,992 270,1007
      315,1018 360,1029 402,1037 432,1046 450,1052 470,1039
      510,1027 550,1017 580,1016 610,1024 638,1039 660,1060
      690,1095 711,1127 719,1152 709,1170 690,1180 670,1190
      655,1215 625,1235 600,1247 570,1254 0,1254`),
    '.80,.55 1,.55 1,1 .84,1 .80,.91 .796,.80 .79,.68'
  ],
  tie: [
    '0,.60 .50,.60 .50,.73 .36,.77 .30,.83 .27,.91 .27,1 0,1',
    '.55,.80 .65,.81 .78,.78 1,.70 1,1 .48,1 .46,.95 .46,.90 .49,.84'
  ],
  mic: [
    armOutline(`0,800 85,960 130,974 180,982 225,994 270,1007
      315,1018 360,1029 402,1038 432,1048 450,1053 474,1036
      510,1026 550,1023 582,1024 620,1028 657,1041 680,1064
      704,1096 718,1129 719,1154 705,1172 682,1181 670,1204
      646,1223 618,1237 590,1254 0,1254`),
    '.75,.58 1,.58 1,1 .84,1 .80,.91 .78,.81 .73,.70'
  ],
  warning: [
    '0,.60 .35,.60 .285,.72 .28,.76 .275,.80 .263,.84 .246,.88 .217,.92 .18,.97 .18,1 0,1',
    '.52,.80 .65,.81 .80,.77 1,.70 1,1 .43,1 .40,.94 .405,.91 .44,.86 .48,.83'
  ]
};
const deskPoseMasks = {
  'don-point': 'point', 'don-point-talk': 'point',
  'don-thumbs-up': 'thumbs', 'don-thumbs-up-talk': 'thumbs',
  'don-tie-adjust': 'tie', 'don-mic-remove': 'mic', 'ron-warning': 'warning'
};
const svgNamespace = 'http://www.w3.org/2000/svg';
const maskSvg = document.createElementNS(svgNamespace, 'svg');
maskSvg.classList.add('mask-definitions');
maskSvg.setAttribute('aria-hidden', 'true');
const maskDefs = document.createElementNS(svgNamespace, 'defs');
for (const [name, regions] of Object.entries(deskArmMasks)) {
  const clip = document.createElementNS(svgNamespace, 'clipPath');
  clip.id = 'desk-arms-' + name;
  clip.setAttribute('clipPathUnits', 'objectBoundingBox');
  for (const points of regions) {
    const polygon = document.createElementNS(svgNamespace, 'polygon');
    polygon.setAttribute('points', points);
    clip.append(polygon);
  }
  maskDefs.append(clip);
}
maskSvg.append(maskDefs);
document.body.append(maskSvg);

function updateDeskPose(host, id) {
  const foreground = document.getElementById(host + 'Foreground');
  const actor = foreground.parentElement;
  foreground.src = id + '.webp';
  const mask = deskPoseMasks[id.replace(/^don-(?:halloween|alternate-[123])-/, 'don-')];
  actor.style.setProperty('--hand-mask', mask ? 'url(#desk-arms-' + mask + ')' : 'inset(65% 0 0)');
  actor.style.setProperty('--contact-left', mask === 'tie' || mask === 'warning' ? '43%' : '4%');
  actor.style.setProperty('--contact-width', mask ? '53%' : '92%');
}

const deskNotes = {
  layered: 'The tabletop hides the lower torso. Their hands and forearms sit above it, with a small contact shadow underneath.',
  flat: 'A single desk overlay hides the torso, but also covers their hands. Switch back to “Hands above desk” to restore the foreground arms.',
  none: 'The original transparent cutouts, with no desk. The stage keeps the same spacing so you can compare the lower edges.'
};
document.querySelectorAll('[data-desk-mode]').forEach(button => {
  button.addEventListener('click', () => {
    const mode = button.dataset.deskMode;
    document.getElementById('stage').dataset.desk = mode;
    document.getElementById('deskExplanation').textContent = deskNotes[mode];
    document.querySelectorAll('[data-desk-mode]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  });
});

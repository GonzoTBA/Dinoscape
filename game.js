"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hud = {
  level: document.getElementById("level"),
  coins: document.getElementById("coins"),
  depth: document.getElementById("depth"),
  luckyDepth: document.getElementById("luckyDepth"),
  papaDepth: document.getElementById("papaDepth"),
  music: document.getElementById("music"),
  message: document.getElementById("message"),
};

const keys = new Set();
const justPressed = new Set();
const gravity = 1900;
const groundFriction = 0.82;
const airControl = 0.72;
const baseWorldWidth = 920;
const baseDepthMeters = 10;
const pixelsPerMeter = 78;
const platformHeight = 18;
const normalJump = 780;
const chargeJumpMin = 720;
const chargeJumpMax = 1350;
const chargeJumpAngle = 70 * Math.PI / 180;
const chargeTimeMax = 1.25;
const exitWidth = 180;
const catapultMin = 1050;
const catapultMid = 1450;
const catapultMax = 1750;
const superCatapultCharge = 0.78;
const rocketGap = 742;
const ladderClimbSpeed = 250;
const catapultSideSpeed = 70;
const audio = createAudio();

let levelNumber = 1;
let world;
let dinos;
let camera = { x: 0, y: 0, scale: 1 };
let lastTime = performance.now();
let messageTimer = 0;
let transition = makeTransition();
let beetles = [];
let dustParticles = [];
let pebbleParticles = [];
let sparkleParticles = [];
const LAUNCH = { closeIn: 0.15, closeOut: 2.7, ignite: 3.75, followEnd: 6.55, gone: 7.0, fadeStart: 7.25, fadeEnd: 9.85, end: 10.55 };
let levelIntro = null;
let squashedBeetles = [];
let catapultHintShown = false;
const babyPalette = [
  { body: "#7bd96a", shade: "#3c8a32" },
  { body: "#b07cf0", shade: "#6a3fb0" },
  { body: "#ffcf4a", shade: "#c48a12" },
  { body: "#ff9ec8", shade: "#c2577f" },
  { body: "#ff9a4a", shade: "#b85a14" },
];
let babies = [];
let departingBabies = [];
let babiesBorn = 0;
const eggsTaken = new Set();

const controls = {
  lucky: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", charge: "ArrowDown" },
  papa: { left: "KeyZ", right: "KeyC", jump: "KeyS", charge: "KeyX" },
};

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === "KeyM") {
    event.preventDefault();
    audio.unlock();
    audio.toggleMusic();
    updateHud();
    return;
  }
  if (!keys.has(event.code)) justPressed.add(event.code);
  keys.add(event.code);
  audio.unlock();
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("pointerdown", () => {
  audio.unlock();
});

window.addEventListener("resize", resize);
resize();
newLevel(1);
requestAnimationFrame(loop);

function resize() {
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  justPressed.clear();
  requestAnimationFrame(loop);
}

function newLevel(number, introKind = "boot") {
  audio.stopAllScreams();
  audio.play("levelStart");
  levelNumber = number;
  world = generateWorld(number);
  world.rocketState = "lying";
  world.rocketRaise = 0;
  world.rocketReadyT = 0;
  transition = makeTransition();
  dustParticles = [];
  pebbleParticles = [];
  sparkleParticles = [];
  const lucky = makeDino("lucky", "#2fa8ff", "#125c96", 34, world.startX - 44, 0, controls.lucky);
  const papa = makeDino("papa", "#e84a3c", "#8d1f1a", 52, world.startX + 30, 0, controls.papa);
  lucky.y = world.floorY - lucky.h;
  papa.y = world.floorY - papa.h;
  lucky.inHouse = true;
  papa.inHouse = true;
  dinos = [lucky, papa];
  beetles = makeBeetles(number);
  world.egg = makeEgg(number);
  placeBabiesForLevel();
  squashedBeetles = [];
  levelIntro = null;
  updateCamera(1);
  levelIntro = {
    t: 0,
    dur: introKind === "next" ? 3.2 : introKind === "restart" ? 1.5 : 2.4,
    title: introKind === "restart" ? "" : `Pozo ${number}`,
    subtitle: introKind === "restart" ? "" : `${world.depthMeters.toFixed(1).replace(".0", "")} metros de profundidad`,
    message: number === 1 ? "Recoged la moneda. Para llegar al cohete: ¡supercatapulta!" : `Pozo ${number}: recoged ${coinLabel(world.coins.length)}`,
    shown: false,
  };
  levelIntro.camDur = levelIntro.dur + (introKind === "restart" ? 0.5 : 2.2);
  camera.y -= introKind === "restart" ? 120 : 900;
  camera.scale *= introKind === "restart" ? 0.97 : 0.88;
  hud.message.classList.add("is-hidden");
  updateHud();
}

function generateWorld(number) {
  const depthMeters = Math.round(baseDepthMeters * Math.pow(1.05, number - 1) * 10) / 10;
  const depthPx = depthMeters * pixelsPerMeter;
  const worldWidth = Math.round(Math.max(baseWorldWidth, depthPx * 2.6));
  const floorY = depthPx + 160 + rocketGap - 94;
  const topY = 120;
  const startX = worldWidth / 2;
  const difficulty = Math.min(1, (number - 1) / 18);
  const verticalGap = lerp(118, 152, difficulty);
  const maxHorizontalShift = Math.min(worldWidth * 0.42, lerp(420, 760, difficulty));
  const maxReachStep = lerp(210, 175, difficulty);
  const walls = makeCaveWalls(topY, floorY, number, worldWidth);
  const platforms = [{ x: wallXAt(walls.left, floorY) + 24, y: floorY, w: wallXAt(walls.right, floorY) - wallXAt(walls.left, floorY) - 48, h: 34, kind: "floor" }];
  const pathPlatforms = [];
  const house = { x: startX - 112, y: floorY - 105, w: 224, h: 105 };

  let y = floorY - verticalGap;
  let x = startX;
  let previousPathCenter = startX;
  let index = 0;
  const exitApproachY = topY + rocketGap;
  while (y > exitApproachY + 30) {
    const leftAtY = wallXAt(walls.left, y);
    const rightAtY = wallXAt(walls.right, y);
    const routePhase = Math.floor(index / 3);
    const routeRoll = pseudoRandom(number, routePhase, 31);
    const routeFraction = routeRoll < 0.34 ? 0.22 : routeRoll < 0.68 ? 0.78 : 0.5;
    const localWave = Math.sin(number * 1.7 + index * 1.23) * Math.min(maxHorizontalShift * 0.28, 130);
    const jitter = Math.sin(number * 3.1 + index * 2.17) * 52;
    const desiredX = clamp(lerp(leftAtY + 180, rightAtY - 180, routeFraction) + localWave + jitter, leftAtY + 135, rightAtY - 135);
    x = clamp(desiredX, previousPathCenter - maxReachStep, previousPathCenter + maxReachStep);
    x = clamp(x, leftAtY + 145, rightAtY - 145);
    const sideRoll = pseudoRandom(number, index, 1);
    const sizeRoll = pseudoRandom(number, index, 2);
    const posRoll = pseudoRandom(number, index, 3);
    const widthMin = lerp(170, 140, difficulty);
    const widthMax = lerp(380, 270, difficulty);
    const ledgeWidth = Math.min(lerp(widthMin, widthMax, sizeRoll), rightAtY - leftAtY - 100);
    const embeddedSide = "middle";
    const ledge = makePlatform(embeddedSide, leftAtY, rightAtY, x, y, ledgeWidth, number * 19 + index * 7, 0.5);
    if (ledge.embeddedSide === "middle") {
      ledge.x = clamp(x - ledge.w / 2, leftAtY + 88, rightAtY - 88 - ledge.w);
    }
    platforms.push(ledge);
    pathPlatforms.push(ledge);
    previousPathCenter = ledge.x + ledge.w / 2;
    addExplorationPlatforms(number, index, platforms, leftAtY, rightAtY, x, y, widthMin, widthMax, worldWidth);
    y -= verticalGap * (0.9 + (Math.sin(index * 0.83 + number) + 1) * 0.12);
    index += 1;
  }

  const exitApproachLeft = Math.min(previousPathCenter, startX) - 145;
  const exitApproachRight = Math.max(previousPathCenter, startX) + 145;
  const exitApproach = {
    x: clamp(exitApproachLeft, 120, worldWidth - 410),
    y: exitApproachY,
    w: Math.min(exitApproachRight - exitApproachLeft, worldWidth - 240),
    h: platformHeight,
    kind: "stone",
    embeddedSide: "middle",
    seed: number * 97,
    crumbledEdges: { left: false, right: false },
  };
  platforms.push(exitApproach);
  pathPlatforms.push(exitApproach);
  const exitPlatform = { x: startX - exitWidth / 2, y: topY, w: exitWidth, h: 20, kind: "exit" };
  platforms.push(exitPlatform);

  const sideRoutePlatforms = addSideRoutes(number, pathPlatforms, platforms, walls, worldWidth, difficulty, maxReachStep);
  const coinCount = requiredCoinsForLevel(number);
  const coinPlatforms = makeCoinPlatforms(number, coinCount, pathPlatforms, sideRoutePlatforms, platforms, walls, worldWidth, difficulty);
  const coinPlatformCounts = new Map();
  for (const platform of coinPlatforms) coinPlatformCounts.set(platform, (coinPlatformCounts.get(platform) || 0) + 1);
  const coinPlatformSlots = new Map();
  const coins = coinPlatforms.map((p, coinIndex) => {
    const slots = coinPlatformCounts.get(p) || 1;
    const slot = coinPlatformSlots.get(p) || 0;
    coinPlatformSlots.set(p, slot + 1);
    const spread = slots > 1 ? lerp(-0.28, 0.28, slot / Math.max(1, slots - 1)) : lerp(-0.22, 0.22, pseudoRandom(number, coinIndex, 140));
    return {
      x: clamp(p.x + p.w * (0.5 + spread), p.x + 28, p.x + p.w - 28),
      y: p.y - 44,
      r: 15,
      collected: false,
      spin: coinIndex * 0.8,
    };
  });

  return {
    depthMeters: Math.round((floorY - topY) / pixelsPerMeter * 10) / 10,
    depthPx,
    width: worldWidth,
    floorY,
    topY,
    startX,
    walls,
    house,
    platforms,
    coins,
    ladder: { x: exitPlatform.x + exitPlatform.w - 44, w: 32, top: topY, bottom: exitApproachY, progress: 0, settle: 0, deployed: false },
    exit: exitPlatform,
  };
}

function requiredCoinsForLevel(number) {
  return Math.max(1, number);
}

function coinLabel(count) {
  return count === 1 ? "1 moneda" : `${count} monedas`;
}

function addSideRoutes(number, pathPlatforms, platforms, walls, worldWidth, difficulty, maxReachStep) {
  const sidePlatforms = [];
  if (worldWidth <= 1200 || pathPlatforms.length < 6) return sidePlatforms;
  const sides = pseudoRandom(number, 0, 70) > 0.5 ? ["left", "right"] : ["right", "left"];

  for (let sideIndex = 0; sideIndex < sides.length; sideIndex += 1) {
    const side = sides[sideIndex];
    const sideFraction = side === "left" ? 0.16 : 0.84;
    const startIndex = 1 + sideIndex;
    const endIndex = pathPlatforms.length - 1;
    let previousCenter = pathPlatforms[startIndex].x + pathPlatforms[startIndex].w / 2;

    for (let i = startIndex + 1; i < endIndex; i += 1) {
      const base = pathPlatforms[i];
      const progress = (i - startIndex) / Math.max(1, endIndex - startIndex);
      const leftAtY = wallXAt(walls.left, base.y);
      const rightAtY = wallXAt(walls.right, base.y);
      const returnBlend = progress > 0.72 ? (progress - 0.72) / 0.28 : 0;
      const targetFraction = lerp(sideFraction, 0.5, returnBlend);
      const targetX = lerp(leftAtY + 155, rightAtY - 155, targetFraction);
      const x = clamp(targetX, previousCenter - maxReachStep, previousCenter + maxReachStep);
      const width = lerp(150, 250, pseudoRandom(number, i, 80 + sideIndex)) * lerp(1, 0.86, difficulty);
      const y = base.y + lerp(-20, 28, pseudoRandom(number, i, 90 + sideIndex));
      const platform = {
        x: clamp(x - width / 2, wallXAt(walls.left, y) + 86, wallXAt(walls.right, y) - 86 - width),
        y,
        w: width,
        h: platformHeight,
        kind: "stone",
        embeddedSide: "middle",
        seed: number * 251 + i * 13 + sideIndex * 31,
        crumbledEdges: { left: false, right: false },
      };
      platforms.push(platform);
      sidePlatforms.push(platform);
      previousCenter = platform.x + platform.w / 2;
    }
  }
  return sidePlatforms;
}

function makeCoinPlatforms(number, coinCount, pathPlatforms, sideRoutePlatforms, platforms, walls, worldWidth, difficulty) {
  const coinPlatforms = [];
  if (pathPlatforms.length === 0) return coinPlatforms;
  const sideChoices = sideRoutePlatforms.length >= 2 ? sideRoutePlatforms : [];

  for (let i = 0; i < coinCount; i += 1) {
    const progress = (i + 1) / (coinCount + 1);
    const useSideRoute = sideChoices.length && (i % 2 === 1 || pseudoRandom(number, i, 150) > 0.62);
    if (useSideRoute) {
      const sideIndex = clamp(Math.round(progress * (sideChoices.length - 1)), 0, sideChoices.length - 1);
      coinPlatforms.push(sideChoices[sideIndex]);
      continue;
    }
    const anchorIndex = clamp(Math.round(progress * (pathPlatforms.length - 1)), 0, pathPlatforms.length - 1);
    const base = pathPlatforms[anchorIndex];
    const leftAtY = wallXAt(walls.left, base.y);
    const rightAtY = wallXAt(walls.right, base.y);
    const direction = i % 2 === 0 ? -1 : 1;
    const sideRoom = direction < 0 ? base.x - leftAtY : rightAtY - (base.x + base.w);
    const adjustedDirection = sideRoom > 230 ? direction : -direction;
    const width = lerp(150, 230, pseudoRandom(number, i, 22)) * lerp(1, 0.82, difficulty);
    const horizontal = lerp(190, 285, pseudoRandom(number, i, 23));
    const y = base.y - lerp(38, 88, pseudoRandom(number, i, 24));
    const platformX = clamp(
      base.x + base.w / 2 + adjustedDirection * horizontal - width / 2,
      wallXAt(walls.left, y) + 96,
      wallXAt(walls.right, y) - 96 - width,
    );
    const coinPlatform = {
      x: platformX,
      y,
      w: width,
      h: platformHeight,
      kind: "stone",
      embeddedSide: "middle",
      seed: number * 173 + i * 29,
      crumbledEdges: { left: false, right: false },
    };
    platforms.push(coinPlatform);
    coinPlatforms.push(coinPlatform);
  }
  return coinPlatforms;
}

function addExplorationPlatforms(number, index, platforms, leftAtY, rightAtY, pathX, y, widthMin, widthMax, worldWidth) {
  if (worldWidth <= 1100) return;
  const count = pseudoRandom(number, index, 40) > 0.42 ? 2 : 1;
  for (let i = 0; i < count; i += 1) {
    const roll = pseudoRandom(number, index, 41 + i * 7);
    const side = roll < 0.34 ? "left" : roll < 0.68 ? "right" : "middle";
    const width = Math.min(
      lerp(widthMin * 0.75, widthMax * 0.95, pseudoRandom(number, index, 42 + i * 7)),
      rightAtY - leftAtY - 130,
    );
    const band = i === 0
      ? pseudoRandom(number, index, 43) * 0.36
      : 0.64 + pseudoRandom(number, index, 44) * 0.28;
    const x = lerp(leftAtY + 150, rightAtY - 150, band);
    const yOffset = lerp(-26, 44, pseudoRandom(number, index, 45 + i * 7));
    const platform = makePlatform(side, leftAtY, rightAtY, x, y + yOffset, width, number * 211 + index * 17 + i * 5, pseudoRandom(number, index, 46 + i * 7));

    if (Math.abs(platform.x + platform.w / 2 - pathX) < 130) {
      platform.x += platform.x + platform.w / 2 < pathX ? -150 : 150;
      platform.x = clamp(platform.x, leftAtY + 88, rightAtY - 88 - platform.w);
    }
    platforms.push(platform);
  }
}

function makePlatform(side, leftAtY, rightAtY, centerX, y, width, seed, posRoll) {
  if (side === "left") {
    return { x: leftAtY - 18, y, w: width, h: platformHeight, kind: "stone", embeddedSide: "left", seed, crumbledEdges: { left: false, right: false } };
  }
  if (side === "right") {
    return { x: rightAtY - width + 18, y, w: width, h: platformHeight, kind: "stone", embeddedSide: "right", seed, crumbledEdges: { left: false, right: false } };
  }
  const spanMin = leftAtY + 88;
  const spanMax = rightAtY - 88 - width;
  const x = clamp(lerp(centerX - width / 2, lerp(spanMin, spanMax, posRoll), 0.65), spanMin, spanMax);
  return { x, y, w: width, h: platformHeight, kind: "stone", embeddedSide: "middle", seed, crumbledEdges: { left: false, right: false } };
}

function makeCaveWalls(topY, floorY, seed, worldWidth) {
  const left = [];
  const right = [];
  for (let y = topY - 170; y <= floorY + 190; y += 54) {
    const depth = (y - topY) / Math.max(1, floorY - topY);
    const neck = Math.sin(depth * Math.PI) * 28;
    const leftX = 74 + neck + Math.sin(seed * 1.9 + y * 0.018) * 22 + Math.sin(seed * 5.1 + y * 0.047) * 10;
    const rightX = worldWidth - 74 - neck + Math.sin(seed * 2.6 + y * 0.02) * 22 + Math.sin(seed * 4.4 + y * 0.052) * 10;
    left.push({ x: clamp(leftX, 48, 160), y });
    right.push({ x: clamp(rightX, worldWidth - 160, worldWidth - 48), y });
  }
  return { left, right };
}

function pseudoRandom(a, b, c) {
  return fract(Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453);
}

function wallXAt(points, y) {
  for (let i = 1; i < points.length; i += 1) {
    if (y <= points[i].y) {
      const prev = points[i - 1];
      const next = points[i];
      const t = (y - prev.y) / (next.y - prev.y);
      return lerp(prev.x, next.x, clamp(t, 0, 1));
    }
  }
  return points[points.length - 1].x;
}

function pickCoinIndexes(total) {
  if (total <= 3) return [0, Math.max(0, total - 2), Math.max(0, total - 1)];
  return [
    Math.floor(total * 0.18),
    Math.floor(total * 0.52),
    Math.floor(total * 0.82),
  ];
}

function makeDino(id, body, shade, size, x, y, control) {
  return {
    id,
    body,
    shade,
    size,
    x,
    y,
    w: size * 0.9,
    h: size * 1.45,
    vx: 0,
    vy: 0,
    previousBottom: y,
    impactVy: 0,
    fallTime: 0,
    screaming: false,
    facing: id === "lucky" ? -1 : 1,
    grounded: false,
    charge: 0,
    wasCharging: false,
    control,
    blink: Math.random() * 3,
    blinkTime: 1 + Math.random() * 2,
    blinkDuration: 0,
    landed: false,
    inHouse: false,
    inRocket: false,
    platform: null,
    pebbleCooldown: 0,
    ridingOn: null,
    climbing: false,
    bubble: null,
    safeTime: 0,
    catapultTime: 0,
    frameStartX: x,
  };
}

function makeBeetles(level) {
  const candidates = world.platforms.filter((platform) => platform.kind === "stone");
  const spawnPlatforms = candidates.length ? candidates : world.platforms.filter((platform) => platform.kind === "floor");
  return Array.from({ length: level }, (_, index) => {
    const platform = spawnPlatforms[(index * 3 + level) % spawnPlatforms.length];
    const size = 12;
    const xRoll = pseudoRandom(level, index, 101);
    const x = clamp(platform.x + 26 + xRoll * Math.max(1, platform.w - 52), platform.x + 10, platform.x + platform.w - 28);
    return {
      x,
      y: platform.y - size,
      w: size * 1.55,
      h: size,
      vx: 0,
      vy: 0,
      dir: pseudoRandom(level, index, 102) < 0.5 ? -1 : 1,
      speed: 32 + pseudoRandom(level, index, 103) * 18,
      grounded: true,
      platform,
      jumpTimer: 0.6 + pseudoRandom(level, index, 104) * 2.2,
      step: pseudoRandom(level, index, 105) * Math.PI * 2,
    };
  });
}

function makeTransition() {
  return {
    active: false,
    timer: 0,
    nextLevel: 1,
    confetti: [],
    mode: "next",
    rocket: null,
  };
}

function update(dt) {
  updateLevelIntro(dt);
  updateSquashedBeetles(dt);
  for (const coin of world.coins) if (coin.collected) coin.collectT = (coin.collectT || 0) + dt;
  messageTimer -= dt;
  if (messageTimer <= 0) hud.message.classList.add("is-hidden");

  for (const coin of world.coins) coin.spin += dt * (coin.collected ? 22 : 5);
  updateLadder(dt);
  updateRocketRaise(dt);
  updateTransition(dt);
  updateParticles(dt);
  if (transition.active) {
    updateCamera(dt);
    updateHud();
    return;
  }

  const updateOrder = [...dinos].sort((a, b) => b.size - a.size);
  for (const dino of updateOrder) {
    dino.frameStartX = dino.x;
    dino.landed = false;
    dino.pebbleCooldown = Math.max(0, dino.pebbleCooldown - dt);
    if (dino.inRocket) {
      tryDeployLadder(dino);
      tryRaiseRocket(dino);
      continue;
    }
    updateBlink(dino, dt);
    dino.safeTime = Math.max(0, dino.safeTime - dt);
    if (dino.bubble) {
      updateBubble(dino, dt);
      continue;
    }
    if (dino.inHouse) {
      tryLeaveHouse(dino);
      continue;
    }
    handleInput(dino, dt);
    integrateDino(dino, dt);
    updateEdgePebbles(dino);
  }
  for (const dino of dinos) updateBodyAnim(dino, dt, dino.climbing);

  for (const beetle of beetles) updateBeetle(beetle, dt);
  checkBeetleHits();
  checkBubbleRescue();
  updateEgg(dt);
  updateBabies(dt);
  collectCoins();
  updateCamera(dt);
  updateHud();
  checkExit();
}

function tryLeaveHouse(dino) {
  const controlKeys = [dino.control.left, dino.control.right, dino.control.jump, dino.control.charge];
  if (!controlKeys.some((code) => justPressed.has(code))) return;
  const offset = dino.id === "lucky" ? -34 : 14;
  dino.inHouse = false;
  dino.x = world.startX + offset;
  dino.y = world.floorY - dino.h;
  dino.vx = 0;
  dino.vy = 0;
  dino.grounded = true;
  dino.facing = dino.id === "lucky" ? -1 : 1;
}

function updateParticles(dt) {
  for (const dust of dustParticles) {
    dust.age += dt;
    dust.x += dust.vx * dt;
    dust.y += dust.vy * dt;
    dust.vy -= 8 * dt;
  }
  dustParticles = dustParticles.filter((dust) => dust.age < dust.life);

  for (const pebble of pebbleParticles) {
    pebble.age += dt;
    pebble.x += pebble.vx * dt;
    pebble.y += pebble.vy * dt;
    pebble.vy += 1200 * dt;
    pebble.rotation += pebble.spin * dt;
    if (pebble.y > world.floorY - pebble.r) {
      pebble.y = world.floorY - pebble.r;
      pebble.vx *= 0.25;
      pebble.vy *= -0.16;
      pebble.done = pebble.age > 0.22;
    }
  }
  pebbleParticles = pebbleParticles.filter((pebble) => !pebble.done && pebble.age < 3);

  for (const sparkle of sparkleParticles) {
    sparkle.age += dt;
    sparkle.x += sparkle.vx * dt;
    sparkle.y += sparkle.vy * dt;
    sparkle.rotation += sparkle.spin * dt;
  }
  sparkleParticles = sparkleParticles.filter((sparkle) => sparkle.age < sparkle.life);
}

function spawnSparkles(x, y, amount = 3, spread = 1) {
  for (let i = 0; i < amount; i += 1) {
    sparkleParticles.push({
      x: x + (Math.random() - 0.5) * 18 * spread,
      y: y + (Math.random() - 0.5) * 18 * spread,
      vx: (Math.random() - 0.5) * 90 * spread,
      vy: (Math.random() - 0.5) * 90 * spread,
      size: 4 + Math.random() * 5,
      rotation: Math.random() * Math.PI,
      spin: -5 + Math.random() * 10,
      age: 0,
      life: 0.45 + Math.random() * 0.4,
      color: i % 3 === 0 ? "#fff7d6" : i % 3 === 1 ? "#ffdb66" : "#7fd0ff",
    });
  }
}

function updateEdgePebbles(dino) {
  const platform = dino.platform;
  if (!platform || platform.kind !== "stone" || dino.pebbleCooldown > 0) return;
  const footX = dino.x + dino.w / 2;
  const edgeMargin = 26;
  let edgeX = null;
  let edgeName = null;
  if (footX < platform.x + edgeMargin) {
    edgeX = platform.x + 8;
    edgeName = "left";
  }
  if (footX > platform.x + platform.w - edgeMargin) {
    edgeX = platform.x + platform.w - 8;
    edgeName = "right";
  }
  if (edgeX === null) return;
  if (platform.crumbledEdges[edgeName]) return;
  platform.crumbledEdges[edgeName] = true;
  spawnPebbles(edgeX, platform.y + 8, footX < platform.x + platform.w / 2 ? -1 : 1);
  dino.pebbleCooldown = 0.5;
}

function spawnDust(x, y, amount = 8, scale = 1) {
  for (let i = 0; i < amount; i += 1) {
    dustParticles.push({
      x: x + (Math.random() - 0.5) * 24 * scale,
      y: y + Math.random() * 4,
      vx: (Math.random() - 0.5) * 48 * scale,
      vy: -42 - Math.random() * 78 * Math.min(1.45, scale),
      r: (3.2 + Math.random() * 5) * scale,
      age: 0,
      life: 0.58 + Math.random() * 0.34 + (scale - 1) * 0.12,
    });
  }
}

function spawnPebbles(x, y, direction) {
  const count = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i += 1) {
    pebbleParticles.push({
      x: x + (Math.random() - 0.5) * 12,
      y,
      vx: direction * (20 + Math.random() * 55),
      vy: 20 + Math.random() * 85,
      r: 2 + Math.random() * 3.2,
      age: 0,
      rotation: Math.random() * Math.PI,
      spin: -7 + Math.random() * 14,
      done: false,
    });
  }
}

function updateBeetle(beetle, dt) {
  beetle.step += dt * 9;
  beetle.jumpTimer -= dt;
  if (beetle.grounded) {
    beetle.vx = beetle.dir * beetle.speed;
    const upper = findReachableBeetlePlatform(beetle);
    if (upper && beetle.jumpTimer <= 0) {
      if (Math.random() < 0.55) {
        jumpBeetleToPlatform(beetle, upper);
      }
      beetle.jumpTimer = 1.8 + Math.random() * 2.4;
    } else if (beetle.jumpTimer <= 0 && Math.random() < 0.015) {
      beetle.vy = -360;
      beetle.grounded = false;
      beetle.platform = null;
      beetle.jumpTimer = 2.0 + Math.random() * 2.5;
    }
  }

  integrateBeetle(beetle, dt);
}

function jumpBeetleToPlatform(beetle, platform) {
  const startX = beetle.x + beetle.w / 2;
  const targetX = clamp(startX, platform.x + 18, platform.x + platform.w - 18);
  const height = Math.max(70, beetle.y + beetle.h - platform.y + 36);
  const jumpVy = -Math.sqrt(2 * gravity * height);
  const airTime = Math.max(0.45, Math.abs(jumpVy) / gravity * 1.55);
  const vx = clamp((targetX - startX) / airTime, -190, 190);
  beetle.dir = vx < 0 ? -1 : 1;
  beetle.vx = vx;
  beetle.vy = jumpVy;
  beetle.grounded = false;
  beetle.platform = null;
}

function findReachableBeetlePlatform(beetle) {
  const centerX = beetle.x + beetle.w / 2;
  const aheadX = centerX + beetle.dir * 38;
  let best = null;
  let bestDistance = Infinity;
  for (const platform of world.platforms) {
    if (platform.kind === "exit" || platform === beetle.platform) continue;
    const vertical = beetle.y - platform.y;
    if (vertical < 45 || vertical > 210) continue;
    const horizontalGap = aheadX < platform.x ? platform.x - aheadX : aheadX > platform.x + platform.w ? aheadX - (platform.x + platform.w) : 0;
    if (horizontalGap > 135) continue;
    if (vertical < bestDistance) {
      bestDistance = vertical;
      best = platform;
    }
  }
  return best;
}

function integrateBeetle(beetle, dt) {
  const previousBottom = beetle.y + beetle.h;
  beetle.vy += gravity * dt;
  beetle.x += beetle.vx * dt;
  beetle.y += beetle.vy * dt;
  beetle.grounded = false;

  const wallY = beetle.y + beetle.h * 0.5;
  const leftWall = wallXAt(world.walls.left, wallY) + 8;
  const rightWall = wallXAt(world.walls.right, wallY) - 8;
  if (beetle.x < leftWall) {
    beetle.x = leftWall;
    beetle.dir = 1;
    beetle.vx = Math.abs(beetle.vx) * 0.2;
  }
  if (beetle.x + beetle.w > rightWall) {
    beetle.x = rightWall - beetle.w;
    beetle.dir = -1;
    beetle.vx = -Math.abs(beetle.vx) * 0.2;
  }

  for (const platform of world.platforms) {
    if (beetle.vy >= 0 && previousBottom <= platform.y + 8 && beetle.y + beetle.h >= platform.y) {
      const overlapX = beetle.x + beetle.w > platform.x && beetle.x < platform.x + platform.w;
      if (overlapX) {
        beetle.y = platform.y - beetle.h;
        beetle.vy = 0;
        beetle.grounded = true;
        beetle.platform = platform;
        break;
      }
    }
  }
}

function checkBeetleHits() {
  for (const dino of dinos) {
    if (dino.inHouse || dino.inRocket || dino.bubble) continue;
    const dinoBox = dinoCollisionBox(dino);
    for (let i = beetles.length - 1; i >= 0; i -= 1) {
      const beetle = beetles[i];
      const beetleBox = beetleCollisionBox(beetle);
      if (rectsOverlap(dinoBox, beetleBox)) {
        if (isStompingBeetle(dino, beetleBox)) {
          stompBeetle(dino, beetle, i);
          continue;
        }
        if (isWalkingIntoBeetle(dino, beetleBox) && dino.safeTime <= 0) {
          trapInBubble(dino);
          break;
        }
      }
    }
  }
}

function trapInBubble(dino) {
  dino.bubble = { baseY: dino.y, time: 0, lonely: 0 };
  dino.vx = 0;
  dino.vy = 0;
  dino.charge = 0;
  dino.wasCharging = false;
  dino.climbing = false;
  dino.ridingOn = null;
  dino.grounded = false;
  dino.platform = null;
  resetDinoFallScream(dino);
  audio.play("bubble");
  spawnSparkles(dino.x + dino.w / 2, dino.y + dino.h / 2, 10, 1.5);
  const free = dinos.filter((other) => !other.bubble && !other.inRocket);
  const babyHelpers = babies.filter((b) => !b.inRocket && dinos.some((d) => d.bubble && d.id === b.owner));
  if (dinos.every((other) => other.bubble) && !babyHelpers.length) {
    startLevelRestart();
    showMessage("¡Los dos atrapados en burbujas! Otra vez");
    return;
  }
  const name = dino.id === "lucky" ? "Lucky" : "Papa";
  const ownBaby = babyOf(dino);
  if (ownBaby && !ownBaby.inRocket) {
    const keysHint = dino.id === "lucky" ? "flechas" : "Z/C y S";
    showMessage(`¡${name} atrapado! Mueve a su mini dino (${keysHint}) y ¡revienta la burbuja!`);
    return;
  }
  const rescuer = free.find((other) => other !== dino);
  showMessage(rescuer ? `¡${name} atrapado! ${rescuer.id === "lucky" ? "Lucky" : "Papa"}, ¡revienta la burbuja!` : `¡${name} atrapado en una burbuja!`);
}

function bubbleRadius(dino) {
  return Math.max(dino.w, dino.h) * 0.78;
}

function bubbleCenter(dino) {
  return { x: dino.x + dino.w / 2, y: dino.y + dino.h / 2 };
}

function updateBubble(dino, dt) {
  const bubble = dino.bubble;
  bubble.time += dt;
  const lift = Math.min(1, bubble.time / 1.2) * 46;
  dino.y = bubble.baseY - lift + Math.sin(bubble.time * 2.6) * 6;
  dino.x += Math.sin(bubble.time * 1.7) * 10 * dt;
  const rescuers = dinos.filter((other) => other !== dino && !other.bubble && !other.inRocket && !other.inHouse);
  const ownBaby = babyOf(dino);
  const babyCanHelp = ownBaby && !ownBaby.inRocket;
  bubble.lonely = rescuers.length || babyCanHelp ? 0 : bubble.lonely + dt;
  if (bubble.lonely > 3) popBubble(dino);
}

function checkBubbleRescue() {
  for (const dino of dinos) {
    if (!dino.bubble) continue;
    const c = bubbleCenter(dino);
    const r = bubbleRadius(dino);
    for (const other of dinos) {
      if (other === dino || other.bubble || other.inRocket || other.inHouse) continue;
      const box = dinoCollisionBox(other);
      const nx = clamp(c.x, box.x, box.x + box.w);
      const ny = clamp(c.y, box.y, box.y + box.h);
      if (distance(c.x, c.y, nx, ny) < r) {
        popBubble(dino, other);
        break;
      }
    }
    if (!dino.bubble) continue;
    for (const baby of babies) {
      if (baby.inRocket) continue;
      const nx = clamp(c.x, baby.x, baby.x + baby.w);
      const ny = clamp(c.y, baby.y, baby.y + baby.h);
      if (distance(c.x, c.y, nx, ny) < r) {
        popBubble(dino, baby);
        babyFliesAway(baby);
        break;
      }
    }
  }
}

function babyFliesAway(baby) {
  baby.controlled = false;
  babies = babies.filter((b) => b !== baby);
  departingBabies.push({ baby, time: 0, x: baby.x, y: baby.y, vy: 0, done: false });
  const ownerName = baby.owner === "lucky" ? "Lucky" : "Papa";
  setTimeout(() => showMessage(`El mini dino de ${ownerName} te ha salvado y se va volando 👋 ¡Buscad otro huevo!`), 1200);
}

function popBubble(dino, rescuer = null) {
  const c = bubbleCenter(dino);
  dino.bubble = null;
  dino.safeTime = 1.6;
  dino.vy = -320;
  dino.vx = 0;
  dino.grounded = false;
  spawnSparkles(c.x, c.y, 26, 2.6);
  audio.play("pop");
  if (rescuer) {
    audio.play("rescue");
    const hero = rescuer.owner ? `¡El mini dino de ${rescuer.owner === "lucky" ? "Lucky" : "Papa"}` : `¡${rescuer.id === "lucky" ? "Lucky" : "Papa"}`;
    showMessage(`${hero} al rescate!`);
  }
}

function drawBubble(dino) {
  const c = bubbleCenter(dino);
  const r = bubbleRadius(dino);
  const t = dino.bubble.time;
  const wobble = 1 + Math.sin(t * 7) * 0.04;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(wobble, 2 - wobble);
  const fill = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  fill.addColorStop(0, "rgba(255, 255, 255, 0.28)");
  fill.addColorStop(0.7, "rgba(140, 210, 255, 0.12)");
  fill.addColorStop(1, "rgba(190, 150, 255, 0.35)");
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(220, 240, 255, 0.75)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.18, r * 0.09, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (Math.floor(t * 1.5) % 2 === 0) {
    ctx.save();
    ctx.font = "800 15px Fredoka, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff7e6";
    ctx.fillText("¡Ayuda!", c.x, c.y - r - 10);
    ctx.restore();
  }
}

function isStompingBeetle(dino, beetleBox) {
  const previousBottom = dino.previousBottom ?? dino.y + dino.h;
  return dino.impactVy > 120 && previousBottom <= beetleBox.y + beetleBox.h * 0.55;
}

function isWalkingIntoBeetle(dino, beetleBox) {
  const dinoFeet = dino.y + dino.h;
  const beetleFeet = beetleBox.y + beetleBox.h;
  const sameFooting = Math.abs(dinoFeet - beetleFeet) <= Math.max(10, beetleBox.h * 0.75);
  return dino.grounded && sameFooting;
}

function stompBeetle(dino, beetle, beetleIndex) {
  beetles.splice(beetleIndex, 1);
  squashedBeetles.push({ beetle, t: 0 });
  dino.y = beetle.y - dino.h - 2;
  dino.vy = -430;
  dino.grounded = false;
  dino.platform = null;
  spawnDust(beetle.x + beetle.w / 2, beetle.y + beetle.h, 8, 0.9);
  audio.play("stomp");
}

function beetleCollisionBox(beetle) {
  return {
    x: beetle.x + beetle.w * 0.08,
    y: beetle.y + beetle.h * 0.12,
    w: beetle.w * 0.84,
    h: beetle.h * 0.78,
  };
}

function updateBlink(dino, dt) {
  dino.blinkTime -= dt;
  if (dino.blinkDuration > 0) {
    dino.blinkDuration -= dt;
  } else if (dino.blinkTime <= 0) {
    dino.blinkDuration = 0.12;
    dino.blinkTime = 2.2 + Math.random() * 3.4;
  }
}

function updateTransition(dt) {
  if (!transition.active) return;
  transition.timer += dt;
  for (const bit of transition.confetti) {
    if (transition.mode === "next" && transition.timer < LAUNCH.ignite) continue;
    if (bit.y < -400) bit.y += 900;
    bit.y += bit.speed * dt;
    bit.x += Math.sin(transition.timer * bit.wobble + bit.seed) * 28 * dt;
    bit.rotation += bit.spin * dt;
  }
  if (transition.mode === "next") {
    const t = transition.timer;
    transition.shake = t < LAUNCH.ignite ? 0.6 + Math.pow(t / LAUNCH.ignite, 2) * 3.4 : Math.max(0, 7 * (1 - (t - LAUNCH.ignite) / 1.4));
    if (!transition.yay && t >= 1.0) {
      transition.yay = true;
      audio.play("yay");
    }
    if (!transition.counted && t >= LAUNCH.ignite - 1.1) {
      transition.counted = true;
      audio.play("countdown");
    }
    if (!transition.ignited && t >= LAUNCH.ignite) {
      transition.ignited = true;
      audio.play("rocket");
      audio.play("win");
      spawnDust(world.startX, world.topY, 24, 1.8);
    }
    if (!transition.cheered && t >= LAUNCH.ignite + 1.2) {
      transition.cheered = true;
      showMessage("¡Pozo superado!");
    }
    if (!transition.twinkle && t >= LAUNCH.gone) {
      const rocket = rocketPosition();
      transition.twinkle = { x: rocket.x, y: rocket.y - 60 };
      audio.play("twinkle");
    }
    if (t > LAUNCH.end) newLevel(transition.nextLevel, "next");
  } else if (transition.timer > 2.7) {
    newLevel(transition.nextLevel, "restart");
  }
}

function handleInput(dino, dt) {
  if (handleLadder(dino)) return;
  const left = keys.has(dino.control.left);
  const right = keys.has(dino.control.right);
  const charging = keys.has(dino.control.charge);
  const move = (right ? 1 : 0) - (left ? 1 : 0);
  const speed = dino.size > 40 ? 211 : 224;
  const accel = dino.grounded ? 18 : 10 * airControl;

  if (move !== 0) {
    dino.vx = lerp(dino.vx, move * speed, Math.min(1, accel * dt));
    dino.facing = move;
  } else if (dino.grounded) {
    dino.vx *= Math.pow(groundFriction, dt * 60);
  }

  if (justPressed.has(dino.control.jump) && dino.grounded && !charging) {
    spawnDust(dino.x + dino.w / 2, dino.y + dino.h, 7, 0.95);
    dino.vy = -normalJump;
    dino.grounded = false;
    resetDinoFallScream(dino);
    audio.play("jump", { id: dino.id });
  }

  if (charging && dino.grounded) {
    const before = dino.charge;
    dino.charge = Math.min(chargeTimeMax, dino.charge + dt);
    const superAt = superCatapultCharge * chargeTimeMax;
    if (before < superAt && dino.charge >= superAt && riderOn(dino)) audio.play("superReady");
    dino.wasCharging = true;
    dino.vx *= 0.88;
  }

  if (!charging && dino.wasCharging) {
    const rider = riderOn(dino);
    if (dino.grounded && dino.charge > 0.08 && rider) {
      launchCatapult(dino, rider);
    } else if (dino.grounded && dino.charge > 0.08) {
      const power = chargeJumpMin + (chargeJumpMax - chargeJumpMin) * (dino.charge / chargeTimeMax);
      dino.vx = dino.facing * power * Math.cos(chargeJumpAngle);
      dino.vy = -power * Math.sin(chargeJumpAngle);
      dino.grounded = false;
      resetDinoFallScream(dino);
      spawnDust(dino.x + dino.w / 2, dino.y + dino.h, 10, 1.05);
      audio.play("charge", { id: dino.id });
    }
    dino.charge = 0;
    dino.wasCharging = false;
  }
}

function integrateDino(dino, dt) {
  if (dino.climbing) {
    integrateClimb(dino, dt);
    return;
  }
  const carrier = dino.ridingOn;
  if (carrier && dino.vy >= 0) dino.x += carrier.x - carrier.frameStartX;
  const previousBottom = dino.y + dino.h;
  const wasGrounded = dino.grounded;
  dino.vy += gravity * dt;
  const fallingSpeed = dino.vy;
  dino.previousBottom = previousBottom;
  dino.impactVy = fallingSpeed;
  dino.x += dino.vx * dt;
  dino.y += dino.vy * dt;
  dino.grounded = false;
  dino.platform = null;
  updateDinoFallScream(dino, dt);

  const wallY = dino.y + dino.h * 0.5;
  const leftWall = wallXAt(world.walls.left, wallY) + 6;
  const rightWall = wallXAt(world.walls.right, wallY) - 6;
  if (dino.x < leftWall) {
    dino.x = leftWall;
    dino.vx = Math.abs(dino.vx) * 0.2;
  }
  if (dino.x + dino.w > rightWall) {
    dino.x = rightWall - dino.w;
    dino.vx = -Math.abs(dino.vx) * 0.2;
  }

  for (const platform of world.platforms) {
    if (dino.vy >= 0 && previousBottom <= platform.y + 8 && dino.y + dino.h >= platform.y) {
      const overlapX = dino.x + dino.w > platform.x && dino.x < platform.x + platform.w;
      if (overlapX) {
        dino.y = platform.y - dino.h;
        dino.vy = 0;
        dino.grounded = true;
        resetDinoFallScream(dino);
        dino.landed = true;
        dino.platform = platform;
        if (!wasGrounded && fallingSpeed > 430) {
          const impact = clamp((fallingSpeed - 430) / 820, 0, 1);
          const dustScale = 1.05 + impact * 1.35;
          audio.play(fallingSpeed > 980 ? "ouch" : "land", { id: dino.id });
          spawnDust(dino.x + dino.w / 2, dino.y + dino.h, Math.min(20, 7 + fallingSpeed / 105), dustScale);
        }
      }
    }
  }

  dino.ridingOn = null;
  if (!dino.grounded) landOnHead(dino, previousBottom, carrier, wasGrounded, fallingSpeed);
  if (dino.ridingOn || dino.grounded) dino.catapultTime = 0;
  if (dino.catapultTime > 0) {
    dino.catapultTime = Math.max(0, dino.catapultTime - dt);
    spawnSparkles(dino.x + dino.w / 2, dino.y + dino.h * 0.6, 2, 1);
  }
}

function headTop(dino) {
  const crouchDrop = dino.charge > 0 ? dino.h * (dino.charge / chargeTimeMax) * 0.32 : 0;
  return dino.y + dino.h * 0.1 + crouchDrop;
}

function canCarry(carrier, rider) {
  return carrier !== rider && carrier.size > rider.size && !carrier.inHouse && !carrier.inRocket && !carrier.bubble;
}

function landOnHead(dino, previousBottom, previousCarrier, wasGrounded, fallingSpeed) {
  for (const carrier of dinos) {
    if (!canCarry(carrier, dino)) continue;
    const top = headTop(carrier);
    const riderCenter = dino.x + dino.w / 2;
    const overlapX = riderCenter > carrier.x - dino.w * 0.15 && riderCenter < carrier.x + carrier.w + dino.w * 0.15;
    if (!overlapX) continue;
    const stillRiding = previousCarrier === carrier && dino.vy >= carrier.vy - 40;
    const landing = dino.vy >= 0 && previousBottom <= top + 10 && dino.y + dino.h >= top;
    if (!stillRiding && !landing) continue;
    dino.y = top - dino.h;
    dino.vy = Math.max(0, carrier.vy);
    dino.grounded = true;
    dino.ridingOn = carrier;
    resetDinoFallScream(dino);
    if (!previousCarrier) {
      dino.landed = true;
      if (!wasGrounded && fallingSpeed > 260) audio.play("land", { id: dino.id });
      if (!catapultHintShown) {
        catapultHintShown = true;
        showMessage("¡Lucky en la cabeza de Papa! Papa: mantén X y suelta para la catapulta");
      }
    }
    return;
  }
}

function riderOn(carrier) {
  return dinos.find((other) => other.ridingOn === carrier && !other.inRocket && !other.inHouse) || null;
}

function launchCatapult(carrier, rider) {
  const pct = clamp(carrier.charge / chargeTimeMax, 0, 1);
  const isSuper = pct >= superCatapultCharge;
  const power = isSuper ? catapultMax : lerp(catapultMin, catapultMid, pct / superCatapultCharge);
  rider.ridingOn = null;
  rider.grounded = false;
  rider.platform = null;
  rider.y = headTop(carrier) - rider.h - 2;
  rider.vy = -power;
  rider.vx = carrier.facing * catapultSideSpeed;
  rider.charge = 0;
  rider.wasCharging = false;
  rider.catapultTime = 0.9;
  resetDinoFallScream(rider);
  carrier.vy = -160;
  carrier.grounded = false;
  spawnDust(carrier.x + carrier.w / 2, carrier.y + carrier.h, 14, 1.3);
  spawnSparkles(rider.x + rider.w / 2, rider.y + rider.h, 14, 2);
  audio.play("catapult", { super: isSuper });
  if (isSuper) spawnSparkles(rider.x + rider.w / 2, rider.y + rider.h, 18, 3);
  showMessage(isSuper ? "¡SUPER CATAPULTA!" : "¡Catapulta! Carga más para la súper");
}

function updateDinoFallScream(dino, dt) {
  if (dino.vy <= 120) {
    resetDinoFallScream(dino);
    return;
  }
  dino.fallTime += dt;
  if (dino.fallTime > 0.5 && !dino.screaming) {
    dino.screaming = audio.startScream(dino.id);
  }
}

function resetDinoFallScream(dino) {
  dino.fallTime = 0;
  if (dino.screaming) {
    dino.screaming = false;
    audio.stopScream(dino.id);
  }
}

function resolveDinoPair(a, b) {
  const aBox = dinoCollisionBox(a);
  const bBox = dinoCollisionBox(b);
  if (!rectsOverlap(aBox, bBox)) return;
  const ax = aBox.x + aBox.w / 2;
  const ay = aBox.y + aBox.h / 2;
  const bx = bBox.x + bBox.w / 2;
  const by = bBox.y + bBox.h / 2;
  const overlapX = aBox.w / 2 + bBox.w / 2 - Math.abs(ax - bx);
  const overlapY = aBox.h / 2 + bBox.h / 2 - Math.abs(ay - by);
  const separation = 1.5;

  if (overlapY < overlapX) {
    const top = ay < by ? a : b;
    const bottom = top === a ? b : a;
    top.y -= overlapY + separation;
    top.vy = Math.min(top.vy, -20);
    top.grounded = bottom.grounded || top.vy >= 0;
    bottom.vy = Math.max(bottom.vy, 10);
  } else {
    const dir = ax < bx ? -1 : 1;
    a.x += (overlapX / 2 + separation) * dir;
    b.x -= (overlapX / 2 + separation) * dir;
    const avg = (a.vx + b.vx) * 0.35;
    a.vx = avg - dir * 22;
    b.vx = avg + dir * 22;
  }
}

function dinoCollisionBox(dino) {
  const insetX = dino.w * 0.22;
  const insetTop = dino.h * 0.12;
  return {
    x: dino.x + insetX,
    y: dino.y + insetTop,
    w: dino.w - insetX * 2,
    h: dino.h - insetTop,
  };
}

function rocketPerch(dino) {
  const ladder = world.ladder;
  const hop = ladder.deployed ? Math.sin(Math.min(1, ladder.progress) * Math.PI) * 16 : 0;
  return {
    ...dino,
    x: dino.id === "lucky" ? ladder.x + ladder.w / 2 - dino.w - 2 : world.exit.x + 30,
    y: world.exit.y - dino.h - (dino.id === "lucky" ? hop : 0),
    vx: 0,
    vy: 0,
    charge: 0,
    grounded: true,
    facing: 1,
  };
}

function isWaitingOnRocketPlatform(dino) {
  if (!dino.inRocket || transition.active) return false;
  return world.rocketState !== "ready" || world.rocketReadyT < 0.6;
}

function perchLeader() {
  const perched = dinos.filter((d) => isWaitingOnRocketPlatform(d));
  return perched.find((d) => d.id === "lucky") || perched[0] || null;
}

function tryRaiseRocket(dino) {
  if (world.rocketState !== "lying" || !world.ladder.deployed) return;
  if (!justPressed.has(dino.control.jump)) return;
  world.rocketState = "raising";
  world.rocketRaise = 0;
  audio.play("motor", { dur: 4.6 });
  showMessage("¡Levantando el cohete! 🚀");
}

function updateRocketRaise(dt) {
  if (!world) return;
  if (world.rocketState === "raising") {
    world.rocketRaise = Math.min(1, world.rocketRaise + dt / 4.6);
    if (world.rocketRaise >= 1) {
      world.rocketState = "ready";
      world.rocketReadyT = 0;
      audio.play("locked");
      spawnDust(world.startX, world.topY, 16, 1.2);
      spawnSparkles(world.startX, world.topY - 60, 18, 2);
      const waiting = dinos.filter((d) => !d.inRocket);
      showMessage(waiting.length ? "¡Cohete listo! Papa: sube por la escalera" : "¡Cohete listo! ¡Todos dentro!");
    }
  } else if (world.rocketState === "ready") {
    world.rocketReadyT += dt;
  }
}

function rocketRaisePose() {
  const p = world.rocketState === "ready" || transition.active ? 1 : world.rocketState === "raising" ? world.rocketRaise : 0;
  const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const jitter = world.rocketState === "raising" ? Math.sin(performance.now() * 0.06) * 0.006 : 0;
  return {
    p: e,
    angle: -Math.PI / 2 * (1 - e) + jitter,
    x: world.startX + 56 * (1 - e),
    y: world.topY - 46 * (1 - e),
  };
}

function drawLaunchGantry(pose) {
  const ex = world.exit;
  const t = performance.now() * 0.001;
  const fold = 1 - pose.p;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Torre de andamio
  const tx = ex.x + 4;
  const tw = 20;
  const th = 150;
  ctx.strokeStyle = "#7d8592";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tx, ex.y);
  ctx.lineTo(tx, ex.y - th);
  ctx.moveTo(tx + tw, ex.y);
  ctx.lineTo(tx + tw, ex.y - th);
  ctx.stroke();
  ctx.strokeStyle = "#9aa3b0";
  ctx.lineWidth = 1.6;
  for (let y = ex.y; y > ex.y - th + 4; y -= 22) {
    ctx.beginPath();
    ctx.moveTo(tx, y);
    ctx.lineTo(tx + tw, y - 22);
    ctx.moveTo(tx + tw, y);
    ctx.lineTo(tx, y - 22);
    ctx.moveTo(tx, y);
    ctx.lineTo(tx + tw, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#e0a93b";
  ctx.fillRect(tx - 3, ex.y - th - 4, tw + 6, 6);
  const ready = world.rocketState === "ready" || transition.active;
  const blink = ready ? 1 : Math.sin(t * 6) > 0 ? 1 : 0.25;
  const lamp = ready ? "rgba(110, 255, 140, ALPHA)" : "rgba(255, 80, 70, ALPHA)";
  glow(tx + tw / 2, ex.y - th - 10, 26, lamp, 0.6 * blink);
  ctx.fillStyle = ready ? "#7dff9a" : `rgba(255, 90, 80, ${0.4 + blink * 0.6})`;
  ctx.beginPath();
  ctx.arc(tx + tw / 2, ex.y - th - 10, 4, 0, Math.PI * 2);
  ctx.fill();
  // Brazo hidráulico que empuja el cohete
  const ax = pose.x + Math.cos(pose.angle - Math.PI / 2) * 64;
  const ay = pose.y + Math.sin(pose.angle - Math.PI / 2) * 64;
  const bx = ex.x + 52;
  const by = ex.y - 2;
  if (fold > 0.02 || world.rocketState === "raising") {
    const mx = lerp(bx, ax, 0.55);
    const my = lerp(by, ay, 0.55);
    ctx.strokeStyle = "#5d6470";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.strokeStyle = "#d9dde3";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.fillStyle = "#e0a93b";
    ctx.beginPath();
    ctx.arc(bx, by, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cunas de apoyo que se pliegan al levantar el cohete
  if (fold > 0.01) {
    ctx.strokeStyle = "#8f98a6";
    ctx.lineWidth = 3;
    for (const cx of [world.startX - 34, world.startX + 34]) {
      const h = 26 * fold;
      ctx.beginPath();
      ctx.moveTo(cx - 12, ex.y);
      ctx.lineTo(cx, ex.y - h);
      ctx.lineTo(cx + 12, ex.y);
      ctx.moveTo(cx - 7, ex.y - h * 0.45);
      ctx.lineTo(cx + 7, ex.y - h * 0.45);
      ctx.stroke();
      ctx.fillStyle = "#e0a93b";
      ctx.fillRect(cx - 9, ex.y - h - 3, 18, 4);
    }
  }
  ctx.restore();
}

function drawLadderHint(dino, dir = "down") {
  const perch = rocketPerch(dino);
  const time = performance.now() * 0.001;
  const bob = Math.sin(time * 6) * 5;
  const cx = perch.x + perch.w / 2;
  const top = perch.y - 70 + bob;
  ctx.save();
  ctx.translate(cx, top + 20);
  ctx.scale(1.5, 1.5);
  ctx.translate(-cx, -(top + 20));
  ctx.fillStyle = "rgba(8, 9, 12, 0.78)";
  roundedRect(cx - 22, top, 44, 40, 12);
  ctx.fill();
  ctx.strokeStyle = dino.body;
  ctx.lineWidth = 3;
  ctx.stroke();
  if (dir === "up") {
    ctx.translate(cx, top + 20);
    ctx.scale(1, -1);
    ctx.translate(-cx, -(top + 20));
  }
  ctx.fillStyle = "#fff7e6";
  ctx.beginPath();
  ctx.moveTo(cx - 11, top + 14);
  ctx.lineTo(cx + 11, top + 14);
  ctx.lineTo(cx, top + 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx - 4, top + 6, 8, 9);
  ctx.restore();
}

function tryDeployLadder(dino) {
  const ladder = world.ladder;
  if (ladder.deployed || !justPressed.has(dino.control.charge)) return;
  if (!dinos.some((other) => !other.inRocket)) return;
  ladder.deployed = true;
  audio.play("ladder");
  showMessage(world.rocketState === "lying" ? "¡Escalera lanzada! Ahora pulsa ↑ para levantar el cohete" : "¡Escalera lanzada! Papa: sube con S");
}

function updateLadder(dt) {
  const ladder = world.ladder;
  if (!ladder.deployed) return;
  const before = ladder.progress;
  ladder.progress = Math.min(1, ladder.progress + dt * 1.4);
  if (ladder.progress >= 1) ladder.settle += dt;
  if (before < 1 && ladder.progress >= 1) {
    spawnDust(ladder.x + ladder.w / 2, ladder.bottom, 12, 1.1);
    audio.play("ladderLand");
  }
}

function isOnLadder(dino) {
  const ladder = world.ladder;
  if (!ladder.deployed || ladder.progress < 1 || dino.inRocket || dino.inHouse) return false;
  const cx = dino.x + dino.w / 2;
  return cx > ladder.x - 14 && cx < ladder.x + ladder.w + 14 && dino.y + dino.h > ladder.top && dino.y < ladder.bottom + 4;
}

function handleLadder(dino) {
  const up = keys.has(dino.control.jump);
  const down = keys.has(dino.control.charge);
  const sideways = keys.has(dino.control.left) || keys.has(dino.control.right);
  if (!isOnLadder(dino)) {
    dino.climbing = false;
    return false;
  }
  if (!dino.climbing && up) {
    dino.climbing = true;
    dino.charge = 0;
    dino.wasCharging = false;
    dino.ridingOn = null;
  }
  if (!dino.climbing) return false;
  if (sideways && !up && !down) {
    dino.climbing = false;
    return false;
  }
  dino.vx = 0;
  dino.vy = up ? -ladderClimbSpeed : down ? ladderClimbSpeed : 0;
  return true;
}

function integrateClimb(dino, dt) {
  const ladder = world.ladder;
  const targetX = ladder.x + ladder.w / 2 - dino.w / 2;
  const previousBottom = dino.y + dino.h;
  dino.x = lerp(dino.x, targetX, Math.min(1, dt * 12));
  const rungBefore = Math.floor(dino.y / 26);
  dino.y += dino.vy * dt;
  if (Math.floor(dino.y / 26) !== rungBefore) audio.play("rung");
  dino.previousBottom = previousBottom;
  dino.impactVy = 0;
  dino.grounded = false;
  dino.platform = null;
  dino.ridingOn = null;
  resetDinoFallScream(dino);
  if (dino.vy > 0 && dino.y + dino.h >= ladder.bottom) {
    dino.y = ladder.bottom - dino.h;
    dino.vy = 0;
    dino.grounded = true;
    dino.climbing = false;
  }
}

function drawLadder() {
  const ladder = world.ladder;
  if (!ladder.deployed) return;
  const length = (ladder.bottom - ladder.top) * ladder.progress;
  const top = ladder.top + 6;
  const bottom = ladder.top + length;
  const sway = (1 - ladder.progress) * Math.sin(performance.now() / 90) * 6;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "#8a5a2b";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(ladder.x, top);
  ctx.lineTo(ladder.x + sway, bottom);
  ctx.moveTo(ladder.x + ladder.w, top);
  ctx.lineTo(ladder.x + ladder.w + sway, bottom);
  ctx.stroke();
  ctx.strokeStyle = "#d9a35f";
  ctx.lineWidth = 4;
  for (let y = top + 18; y < bottom - 4; y += 26) {
    const t = (y - top) / Math.max(1, bottom - top);
    ctx.beginPath();
    ctx.moveTo(ladder.x + sway * t, y);
    ctx.lineTo(ladder.x + ladder.w + sway * t, y);
    ctx.stroke();
  }
  ctx.restore();
}

function collectCoins() {
  for (const coin of world.coins) {
    if (coin.collected) continue;
    for (const dino of dinos) {
      if (dino.inHouse || dino.inRocket) continue;
      const cx = dino.x + dino.w / 2;
      const cy = dino.y + dino.h / 2;
      if (distance(cx, cy, coin.x, coin.y) < coin.r + dino.w * 0.58) {
        coin.collected = true;
        const collected = world.coins.filter((c) => c.collected).length;
        audio.play("coin", { step: (collected - 1) * 2 });
        if (collected === world.coins.length) audio.play("allCoins");
        const fan = babyOf(dino);
        if (fan && !fan.controlled && fan.state === "follow") setBabyState(fan, "celebrate");
        if (world.coins.every((c) => c.collected)) showMessage("¡Cohete listo! Lucky a la cabeza de Papa y ¡supercatapulta!");
        break;
      }
    }
  }
}

function checkExit() {
  if (transition.active) return;
  const allCoins = world.coins.every((coin) => coin.collected);
  if (!allCoins) {
    hintMissingCoins();
    return;
  }
  for (const dino of dinos) {
    if (dino.inHouse || dino.inRocket) continue;
    if (isDinoAtRocket(dino)) boardRocket(dino);
  }
  if (dinos.every((dino) => dino.inRocket)) {
    if (world.rocketState !== "ready" || world.rocketReadyT < 0.7) return;
    if (babies.some((baby) => !baby.inRocket)) {
      if (!world.ladder.deployed) {
        world.ladder.deployed = true;
        audio.play("ladder");
        showMessage("¡Escalera para los mini dinos!");
      }
      return;
    }
    startLevelComplete();
  }
}

function hintMissingCoins() {
  const now = performance.now();
  if (now - (world.missingCoinsHintAt || -99999) < 4000) return;
  const atRocket = dinos.some((dino) => !dino.inHouse && !dino.inRocket && isDinoAtRocket(dino));
  if (!atRocket) return;
  world.missingCoinsHintAt = now;
  const missing = world.coins.filter((coin) => !coin.collected).length;
  showMessage(missing === 1 ? "¡Falta 1 moneda! Volved a buscarla 🪙" : `¡Faltan ${missing} monedas! Volved a buscarlas 🪙`);
  audio.play("nope");
  const pill = hud.coins.parentElement;
  pill.classList.remove("alert");
  void pill.offsetWidth;
  pill.classList.add("alert");
}

function isDinoAtRocket(dino) {
  return dino.y + dino.h < world.exit.y + 18 && dino.x + dino.w > world.exit.x && dino.x < world.exit.x + world.exit.w;
}

function boardRocket(dino) {
  dino.inRocket = true;
  dino.climbing = false;
  dino.vx = 0;
  dino.vy = 0;
  dino.charge = 0;
  dino.wasCharging = false;
  resetDinoFallScream(dino);
  spawnDust(world.startX, world.topY + 6, 14, 1.15);
  audio.play("board");
  const name = dino.id === "lucky" ? "Lucky" : "Papa";
  if (!world.ladder.deployed && dinos.some((other) => !other.inRocket)) {
    showMessage(`¡${name} ha llegado al cohete! Pulsa ↓ para lanzar la escalera`);
  } else if (world.rocketState === "lying") {
    showMessage(`¡${name} arriba! Pulsa ↑ para levantar el cohete`);
  } else if (world.rocketState === "raising") {
    showMessage(`¡${name} arriba! El cohete se está levantando…`);
  }
}

function startLevelComplete() {
  audio.stopAllScreams();
  audio.play("board");
  transition.active = true;
  transition.counted = false;
  transition.yay = false;
  transition.cam0 = {
    scale: camera.scale,
    cx: camera.x + canvas.clientWidth / camera.scale / 2,
    cy: camera.y + canvas.clientHeight / camera.scale / 2,
  };
  transition.ignited = false;
  transition.cheered = false;
  transition.twinkle = null;
  transition.shake = 0;
  transition.timer = 0;
  transition.nextLevel = levelNumber + 1;
  transition.mode = "next";
  transition.rocket = { x: world.startX, baseY: world.topY };
  transition.confetti = Array.from({ length: 90 }, (_, i) => ({
    x: (i * 47) % Math.max(1, canvas.clientWidth),
    y: -Math.random() * 260 - 900,
    w: 5 + Math.random() * 7,
    h: 8 + Math.random() * 10,
    color: ["#ffdb66", "#2fa8ff", "#e84a3c", "#9bea7a", "#fff7e6"][i % 5],
    speed: 110 + Math.random() * 190,
    spin: -6 + Math.random() * 12,
    rotation: Math.random() * Math.PI,
    wobble: 2 + Math.random() * 5,
    seed: Math.random() * 20,
  }));
  hud.message.classList.add("is-hidden");
}

function startLevelRestart() {
  if (transition.active) return;
  audio.stopAllScreams();
  audio.play("beetle");
  transition.active = true;
  transition.timer = 0;
  transition.nextLevel = levelNumber;
  transition.mode = "restart";
  transition.rocket = null;
  transition.confetti = [];
  showMessage("¡Cuidado con los escarabajos!");
}

function updateCamera(dt) {
  const viewW = canvas.clientWidth;
  const viewH = canvas.clientHeight;
  if (transition.active && transition.mode === "next") {
    const t = transition.timer;
    if (t >= LAUNCH.followEnd) return;
    const rocket = rocketPosition();
    const baseScale = clamp(Math.min(viewW / 760, viewH / 700), 0.5, 1.3);
    if (t < LAUNCH.ignite) {
      const cam0 = transition.cam0 || { scale: camera.scale, cx: rocket.x, cy: rocket.y - 60 };
      const zin = smoothstep((t - LAUNCH.closeIn) / 1.1);
      const zout = smoothstep((t - LAUNCH.closeOut) / 0.95);
      const closeScale = Math.min(viewW, viewH) / 78;
      const winX = rocket.x;
      const winY = rocket.y - 56;
      // De la vista de juego a la ventanilla, y de la ventanilla a la vista del despegue.
      const s1 = Math.exp(lerp(Math.log(cam0.scale), Math.log(closeScale), zin));
      const s = Math.exp(lerp(Math.log(s1), Math.log(baseScale), zout));
      const cx1 = lerp(cam0.cx, winX, zin);
      const cy1 = lerp(cam0.cy, winY, zin);
      const cx = lerp(cx1, rocket.x, zout);
      const cy = lerp(cy1, rocket.y - 60, zout);
      camera.scale = s;
      camera.x = cx - viewW / s / 2;
      camera.y = cy - viewH / s / 2;
      return;
    }
    const followScale = baseScale * lerp(1, 0.8, smoothstep((t - LAUNCH.ignite) / 2.5));
    const rate = t < LAUNCH.ignite ? 2.6 : 5;
    camera.scale = lerp(camera.scale, followScale, easeRate(2.2, dt));
    const viewWorldH = viewH / camera.scale;
    const targetX = rocket.x - viewW / camera.scale / 2;
    const targetY = rocket.y - 60 - viewWorldH / 2 + (t > LAUNCH.ignite ? viewWorldH * 0.12 : 0);
    camera.x = lerp(camera.x, targetX, easeRate(rate, dt));
    camera.y = lerp(camera.y, targetY, easeRate(rate, dt));
    return;
  }

  const someoneWaiting = dinos.some((dino) => dino.inRocket);
  const subjects = dinos.map((dino) => {
    if (!dino.inRocket) return dino;
    const perch = rocketPerch(dino);
    return { ...perch, y: perch.y - 110, h: perch.h + 110 };
  });
  for (const baby of babies) {
    if (!baby.inRocket && (baby.controlled || baby.state === "toRocket" || baby.state === "climb")) subjects.push(baby);
  }
  const minX = Math.min(...subjects.map((d) => d.x));
  const maxX = Math.max(...subjects.map((d) => d.x + d.w));
  const minY = Math.min(...subjects.map((d) => d.y));
  const maxY = Math.max(...subjects.map((d) => d.y + d.h));
  const focusY = (minY + maxY) / 2;
  const caveWidth = wallXAt(world.walls.right, focusY) - wallXAt(world.walls.left, focusY);
  const needW = Math.max(maxX - minX + 700, Math.min(caveWidth + 260, baseWorldWidth));
  const needH = Math.max(maxY - minY + (someoneWaiting ? 340 : 720), 720);
  const targetScale = clamp(Math.min(viewW / needW, viewH / needH), 0.22, 1.7);
  const targetCenterX = (minX + maxX) / 2;
  const targetX = targetCenterX - viewW / targetScale / 2;
  const targetY = (minY + maxY) / 2 - viewH / targetScale / 2;
  const maxYCamera = world.floorY + 120 - viewH / targetScale;
  const visibleWorldW = viewW / targetScale;
  const minCameraX = visibleWorldW >= world.width ? (world.width - visibleWorldW) / 2 : 0;
  const maxCameraX = visibleWorldW >= world.width ? minCameraX : world.width - visibleWorldW;

  const intro = introCameraFactor();
  camera.scale = lerp(camera.scale, targetScale, easeRate(3.2 * intro, dt));
  camera.x = lerp(camera.x, clamp(targetX, minCameraX, maxCameraX), easeRate(3.4 * intro, dt));
  camera.y = lerp(camera.y, clamp(targetY, someoneWaiting ? -400 : -20, Math.max(-20, maxYCamera)), easeRate(3.4 * intro, dt));
}

function updateHud() {
  const coins = world.coins.filter((coin) => coin.collected).length;
  hud.level.textContent = String(levelNumber);
  hud.coins.textContent = `${coins}/${world.coins.length}`;
  hud.depth.textContent = `${world.depthMeters.toFixed(1).replace(".0", "")} m`;
  hud.luckyDepth.textContent = `${dinoDepth(dinos[0])} m`;
  hud.papaDepth.textContent = `${dinoDepth(dinos[1])} m`;
  hud.music.textContent = audio.isMusicOn() ? "ON" : "OFF";
}

function dinoDepth(dino) {
  const meters = clamp((dino.y + dino.h - world.topY) / pixelsPerMeter, 0, world.depthMeters);
  return meters.toFixed(1).replace(".0", "");
}

// ---------- Gráficos: la cueva mágica ----------
let frameLights = [];
let lightCanvas = null;
let lightCtx = null;

function gfxTime() {
  return performance.now() * 0.001;
}

function viewRect(margin = 0) {
  const w = canvas.clientWidth / camera.scale;
  const h = canvas.clientHeight / camera.scale;
  return { x0: camera.x - margin, y0: camera.y - margin, x1: camera.x + w + margin, y1: camera.y + h + margin };
}

function inView(v, x, y, r = 0) {
  return x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixColor(hex, target, t) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return `rgb(${Math.round(lerp(a[0], b[0], t))}, ${Math.round(lerp(a[1], b[1], t))}, ${Math.round(lerp(a[2], b[2], t))})`;
}

function addLight(x, y, r, strength = 1) {
  frameLights.push({ x, y, r, strength });
}

function glow(x, y, r, color, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace("ALPHA", alpha));
  g.addColorStop(1, color.replace("ALPHA", 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

function quadAt(t, a, c, b) {
  return (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
}

function caveDecor() {
  if (world.decor) return world.decor;
  const seed = levelNumber * 13 + 7;
  const decor = { crystals: [], vines: [], backdrop: [], motes: [], floorBits: [], stones: [] };
  const hues = [188, 280, 322, 160, 205];
  let i = 0;
  for (let y = world.topY + 150; y < world.floorY - 30; y += 88) {
    for (const side of ["left", "right"]) {
      i += 1;
      if (pseudoRandom(seed, i, 501) > 0.45) continue;
      const cy = y + pseudoRandom(seed, i, 502) * 60;
      const wall = side === "left" ? world.walls.left : world.walls.right;
      const dir = side === "left" ? 1 : -1;
      decor.crystals.push({
        x: wallXAt(wall, cy) + dir * 3,
        y: cy,
        dir,
        size: 13 + pseudoRandom(seed, i, 503) * 20,
        hue: hues[Math.floor(pseudoRandom(seed, i, 504) * hues.length)],
        shards: 3 + Math.floor(pseudoRandom(seed, i, 505) * 3),
        phase: pseudoRandom(seed, i, 506) * 6.28,
      });
    }
  }
  for (let k = 0; k < 14; k += 1) {
    const side = k % 2 === 0 ? "left" : "right";
    const y = world.topY - 150 + pseudoRandom(seed, k, 520) * 380;
    const wall = side === "left" ? world.walls.left : world.walls.right;
    decor.vines.push({ x: wallXAt(wall, y) + (side === "left" ? -2 : 2), y, dir: side === "left" ? 1 : -1, len: 60 + pseudoRandom(seed, k, 521) * 150, phase: pseudoRandom(seed, k, 522) * 6.28 });
  }
  const span = world.floorY - world.topY;
  const count = Math.round(span / 70) + 10;
  for (let k = 0; k < count; k += 1) {
    const r = pseudoRandom(seed, k, 604);
    decor.backdrop.push({
      x: pseudoRandom(seed, k, 601) * world.width,
      y: world.topY - 100 + pseudoRandom(seed, k, 602) * (span + 300),
      size: 50 + pseudoRandom(seed, k, 603) * 160,
      kind: r < 0.4 ? "mite" : r < 0.75 ? "tite" : "blob",
      layer: pseudoRandom(seed, k, 605) < 0.5 ? 0 : 1,
      glint: pseudoRandom(seed, k, 606) < 0.35 ? hues[k % hues.length] : 0,
    });
  }
  for (let k = 0; k < 90; k += 1) {
    decor.motes.push({
      x: pseudoRandom(seed, k, 701) * world.width,
      y: world.topY + pseudoRandom(seed, k, 702) * span,
      phase: pseudoRandom(seed, k, 703) * 6.28,
      speed: 5 + pseudoRandom(seed, k, 704) * 14,
      size: 1 + pseudoRandom(seed, k, 705) * 2.2,
      firefly: pseudoRandom(seed, k, 706) < 0.28,
    });
  }
  const floor = world.platforms[0];
  let k = 0;
  for (let x = floor.x + 24; x < floor.x + floor.w - 24; x += 34) {
    k += 1;
    if (Math.abs(x - world.startX) < 135) continue;
    const r = pseudoRandom(seed, k, 801);
    decor.floorBits.push({
      x: x + pseudoRandom(seed, k, 802) * 18,
      kind: r < 0.16 ? "mushroom" : r < 0.27 ? "flower" : r < 0.36 ? "rock" : "grass",
      hue: hues[Math.floor(pseudoRandom(seed, k, 803) * hues.length)],
      size: 0.8 + pseudoRandom(seed, k, 804) * 0.7,
    });
  }
  world.decor = decor;
  return decor;
}

function holePath() {
  ctx.beginPath();
  ctx.moveTo(world.walls.left[0].x, world.walls.left[0].y);
  for (const point of world.walls.left) ctx.lineTo(point.x, point.y);
  for (let i = world.walls.right.length - 1; i >= 0; i -= 1) ctx.lineTo(world.walls.right[i].x, world.walls.right[i].y);
  ctx.closePath();
}

function drawSurface(v) {
  const groundY = world.topY - 170;
  if (v.y0 > groundY) return;
  const x0 = Math.min(-400, v.x0);
  const x1 = Math.max(world.width + 400, v.x1);
  const skyTop = Math.min(v.y0, groundY - 1200);
  const sky = ctx.createLinearGradient(0, groundY - 900, 0, groundY);
  sky.addColorStop(0, "#151b3d");
  sky.addColorStop(0.6, "#2d3a6a");
  sky.addColorStop(1, "#c98a6b");
  ctx.fillStyle = sky;
  ctx.fillRect(x0, skyTop, x1 - x0, groundY - skyTop + 2);
  for (let i = 0; i < 70; i += 1) {
    const sx = x0 + ((i * 197 + levelNumber * 31) % Math.max(1, x1 - x0));
    const sy = groundY - 260 - ((i * 131) % 900);
    if (sy < skyTop) continue;
    const tw = 0.4 + Math.sin(gfxTime() * 2 + i) * 0.3;
    ctx.fillStyle = `rgba(255, 248, 220, ${tw})`;
    ctx.fillRect(sx, sy, 2, 2);
  }
  // Colinas lejanas
  ctx.fillStyle = "#2a2f52";
  ctx.beginPath();
  ctx.moveTo(x0, groundY);
  for (let x = x0; x <= x1; x += 60) ctx.lineTo(x, groundY - 60 - Math.sin(x * 0.004 + levelNumber) * 40 - Math.sin(x * 0.011) * 18);
  ctx.lineTo(x1, groundY);
  ctx.closePath();
  ctx.fill();
}

function drawCave() {
  const decor = caveDecor();
  const v = viewRect(240);
  frameLights = [];
  drawSurface(v);
  const top = world.topY - 172;
  const x0 = Math.min(0, v.x0);
  const x1 = Math.max(world.width, v.x1);
  const earth = ctx.createLinearGradient(0, top, 0, world.floorY + 200);
  earth.addColorStop(0, "#6b4a35");
  earth.addColorStop(0.08, "#4a3328");
  earth.addColorStop(0.5, "#33232a");
  earth.addColorStop(1, "#1f1520");
  ctx.fillStyle = earth;
  ctx.fillRect(x0, top, x1 - x0, world.floorY + 600 - top);
  drawSoilTexture(v, x0, x1);
  // Hierba en la superficie
  ctx.fillStyle = "#4f9a4c";
  ctx.fillRect(x0, top - 4, x1 - x0, 10);
  ctx.fillStyle = "#79c45f";
  ctx.fillRect(x0, top - 6, x1 - x0, 4);
  drawHoleInterior(decor, v);
  drawWallEdge(world.walls.left, 1, v);
  drawWallEdge(world.walls.right, -1, v);
  drawVines(decor, v);
  drawWallCrystals(decor, v);
}

function drawSoilTexture(v, x0, x1) {
  ctx.save();
  // Estratos
  ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
  ctx.lineWidth = 6;
  const startY = Math.max(world.topY - 140, Math.floor(v.y0 / 90) * 90);
  for (let y = startY; y < Math.min(v.y1, world.floorY + 400); y += 90) {
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 40) {
      const yy = y + Math.sin(x * 0.012 + y) * 10;
      if (x === x0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Piedras incrustadas
  for (let y = Math.floor(v.y0 / 64) * 64; y < v.y1; y += 64) {
    for (let x = Math.floor(x0 / 72) * 72; x < x1; x += 72) {
      const r = pseudoRandom(x, y, 33);
      if (r > 0.45) continue;
      const sx = x + pseudoRandom(x, y, 34) * 50;
      const sy = y + pseudoRandom(x, y, 35) * 40;
      if (sy < world.topY - 150) continue;
      const s = 5 + r * 16;
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.beginPath();
      ctx.ellipse(sx + 2, sy + 3, s, s * 0.65, r * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = r < 0.15 ? "rgba(150, 120, 150, 0.35)" : "rgba(170, 130, 100, 0.3)";
      ctx.beginPath();
      ctx.ellipse(sx, sy, s, s * 0.65, r * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawHoleInterior(decor, v) {
  ctx.save();
  holePath();
  const cave = ctx.createLinearGradient(0, world.topY - 170, 0, world.floorY + 130);
  cave.addColorStop(0, "#4d7f86");
  cave.addColorStop(0.1, "#2b4a5a");
  cave.addColorStop(0.4, "#1e2140");
  cave.addColorStop(1, "#140e24");
  ctx.fillStyle = cave;
  ctx.fill();
  ctx.clip();
  drawBackdrop(decor, v);
  drawLightShafts(v);
  ctx.restore();
}

function drawBackdrop(decor, v) {
  const viewW = canvas.clientWidth / camera.scale;
  const viewH = canvas.clientHeight / camera.scale;
  const cx = camera.x + viewW / 2;
  const cy = camera.y + viewH / 2;
  const t = gfxTime();
  for (const layer of [0, 1]) {
    const f = layer === 0 ? 0.55 : 0.3;
    const ox = (cx - world.startX) * f;
    const oy = (cy - (world.topY + world.floorY) / 2) * f * 0.5;
    ctx.fillStyle = layer === 0 ? "rgba(120, 140, 220, 0.045)" : "rgba(4, 3, 14, 0.3)";
    for (const b of decor.backdrop) {
      if (b.layer !== layer) continue;
      const x = b.x + ox;
      const y = b.y + oy;
      if (!inView(v, x, y, b.size * 2)) continue;
      const s = b.size;
      ctx.beginPath();
      if (b.kind === "mite") {
        ctx.moveTo(x - s * 0.4, y + s);
        ctx.quadraticCurveTo(x - s * 0.1, y, x, y - s * 1.2);
        ctx.quadraticCurveTo(x + s * 0.12, y, x + s * 0.4, y + s);
      } else if (b.kind === "tite") {
        ctx.moveTo(x - s * 0.35, y - s);
        ctx.quadraticCurveTo(x - s * 0.08, y, x, y + s * 1.1);
        ctx.quadraticCurveTo(x + s * 0.1, y, x + s * 0.35, y - s);
      } else {
        continue;
      }
      ctx.closePath();
      ctx.fill();
      if (b.glint && layer === 0) {
        const a = 0.35 + Math.sin(t * 1.5 + b.x) * 0.2;
        ctx.save();
        ctx.fillStyle = `hsla(${b.glint}, 90%, 70%, ${a})`;
        ctx.beginPath();
        ctx.arc(x + s * 0.1, y + s * 0.2, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

function drawLightShafts(v) {
  if (v.y0 > world.topY + 1200) return;
  const t = gfxTime();
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < 6; k += 1) {
    const sway = Math.sin(t * 0.25 + k * 1.3) * 40;
    const topX = world.startX + (k - 2.5) * 70 + sway * 0.3;
    const bottomX = world.startX + (k - 2.5) * 210 + sway;
    const topW = 30 + (k % 3) * 18;
    const bottomW = 160 + (k % 2) * 120;
    const y0 = world.topY - 180;
    const y1 = world.topY + 1050;
    const alpha = 0.06 + Math.sin(t * 0.6 + k * 2.1) * 0.025;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(255, 238, 190, ${alpha * 1.6})`);
    g.addColorStop(0.5, `rgba(255, 230, 180, ${alpha * 0.6})`);
    g.addColorStop(1, "rgba(255, 230, 180, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(topX - topW / 2, y0);
    ctx.lineTo(topX + topW / 2, y0);
    ctx.lineTo(bottomX + bottomW / 2, y1);
    ctx.lineTo(bottomX - bottomW / 2, y1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawWallEdge(points, direction, v) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(6, 4, 14, 0.45)";
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(points[0].x + direction * 13, points[0].y);
  for (const point of points) ctx.lineTo(point.x + direction * 13, point.y);
  ctx.stroke();
  ctx.strokeStyle = "#3a2832";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points) ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 214, 160, 0.22)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(points[0].x - direction * 3, points[0].y);
  for (const point of points) ctx.lineTo(point.x - direction * 3, point.y);
  ctx.stroke();
  // Musgo en el borde
  const t = gfxTime();
  for (let i = 1; i < points.length - 1; i += 1) {
    const point = points[i];
    if (!inView(v, point.x, point.y, 60)) continue;
    if (pseudoRandom(point.y, direction, 41) > 0.55) continue;
    const mx = point.x + direction * 2;
    const my = point.y + 10;
    ctx.fillStyle = "#3f7d45";
    ctx.beginPath();
    ctx.ellipse(mx, my, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#68b25a";
    ctx.beginPath();
    ctx.ellipse(mx + direction * 2, my - 2, 6, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (pseudoRandom(point.y, direction, 42) < 0.4) {
      ctx.strokeStyle = "#4e9a4e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx, my + 4);
      ctx.quadraticCurveTo(mx + direction * 6 + Math.sin(t * 1.4 + i) * 3, my + 18, mx + direction * 2, my + 30);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawVines(decor, v) {
  const t = gfxTime();
  ctx.save();
  ctx.lineCap = "round";
  for (const vine of decor.vines) {
    if (!inView(v, vine.x, vine.y + vine.len / 2, vine.len)) continue;
    const sway = Math.sin(t * 0.9 + vine.phase) * 10;
    const endX = vine.x + vine.dir * 18 + sway;
    const endY = vine.y + vine.len;
    ctx.strokeStyle = "#3d7a3f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(vine.x, vine.y);
    ctx.quadraticCurveTo(vine.x + vine.dir * 26, vine.y + vine.len * 0.5, endX, endY);
    ctx.stroke();
    for (let s = 0.15; s < 1; s += 0.16) {
      const lx = quadAt(s, vine.x, vine.x + vine.dir * 26, endX);
      const ly = quadAt(s, vine.y, vine.y + vine.len * 0.5, endY);
      ctx.fillStyle = s * 10 % 2 < 1 ? "#5fae55" : "#4b9449";
      ctx.beginPath();
      ctx.ellipse(lx + (s * 20 % 2 < 1 ? 5 : -5), ly, 6, 3, s * 10 % 2 < 1 ? 0.6 : -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (vine.len > 140) {
      const pulse = 0.6 + Math.sin(t * 2 + vine.phase) * 0.3;
      ctx.fillStyle = `rgba(255, 220, 120, ${pulse})`;
      ctx.beginPath();
      ctx.arc(endX, endY + 4, 4, 0, Math.PI * 2);
      ctx.fill();
      glow(endX, endY + 4, 26, "rgba(255, 210, 110, ALPHA)", 0.35 * pulse);
      addLight(endX, endY, 90, 0.45);
    }
  }
  ctx.restore();
}

function drawWallCrystals(decor, v) {
  const t = gfxTime();
  for (const c of decor.crystals) {
    if (!inView(v, c.x, c.y, c.size * 4)) continue;
    const pulse = 0.75 + Math.sin(t * 1.6 + c.phase) * 0.25;
    glow(c.x + c.dir * c.size * 0.5, c.y - c.size * 0.3, c.size * 3.2, `hsla(${c.hue}, 95%, 62%, ALPHA)`, 0.32 * pulse);
    addLight(c.x, c.y, c.size * 6, 0.55 * pulse);
    ctx.save();
    ctx.translate(c.x, c.y);
    const base = c.dir > 0 ? -0.55 : -Math.PI + 0.55;
    for (let s = 0; s < c.shards; s += 1) {
      const spread = (s - (c.shards - 1) / 2) * 0.42;
      const len = c.size * (0.7 + ((s * 37 + c.size) % 10) / 18);
      const wid = c.size * 0.26;
      ctx.save();
      ctx.rotate(base + spread);
      const g = ctx.createLinearGradient(0, -wid, 0, wid);
      g.addColorStop(0, `hsl(${c.hue}, 90%, 82%)`);
      g.addColorStop(0.5, `hsl(${c.hue}, 80%, 60%)`);
      g.addColorStop(1, `hsl(${c.hue}, 70%, 38%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -wid * 0.6);
      ctx.lineTo(len * 0.78, -wid);
      ctx.lineTo(len, 0);
      ctx.lineTo(len * 0.78, wid);
      ctx.lineTo(0, wid * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 * pulse})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(len * 0.1, -wid * 0.45);
      ctx.lineTo(len * 0.75, -wid * 0.8);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

function drawFloor() {
  const floor = world.platforms[0];
  const decor = caveDecor();
  const v = viewRect(120);
  if (floor.y > v.y1 + 200) return;
  const left = wallXAt(world.walls.left, floor.y) - 16;
  const right = wallXAt(world.walls.right, floor.y) + 16;
  const ground = ctx.createLinearGradient(0, floor.y - 10, 0, floor.y + 140);
  ground.addColorStop(0, "#6a4f3c");
  ground.addColorStop(0.4, "#46322b");
  ground.addColorStop(1, "#2a1d22");
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.moveTo(left, floor.y);
  ctx.quadraticCurveTo(world.startX, floor.y - 8, right, floor.y);
  ctx.lineTo(wallXAt(world.walls.right, floor.y + 110), floor.y + 140);
  ctx.lineTo(wallXAt(world.walls.left, floor.y + 110), floor.y + 140);
  ctx.closePath();
  ctx.fill();
  drawMossCap(left, right, floor.y, floor.y - 8, 11, 1);
  drawGrassRow(left + 10, right - 10, floor.y, floor.y - 8, left, right, 9, 1.2);
  const t = gfxTime();
  for (const bit of decor.floorBits) {
    if (!inView(v, bit.x, floor.y, 40)) continue;
    const by = quadAt((bit.x - left) / (right - left), floor.y, floor.y - 8, floor.y) + 2;
    if (bit.kind === "mushroom") drawMushroom(bit.x, by, bit.size * 1.2, bit.hue, t);
    else if (bit.kind === "flower") drawFlower(bit.x, by, bit.size, bit.hue, t);
    else if (bit.kind === "rock") {
      ctx.fillStyle = "#5b4a52";
      ctx.beginPath();
      ctx.ellipse(bit.x, by - 3, 9 * bit.size, 6 * bit.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.ellipse(bit.x - 2, by - 6, 4 * bit.size, 2 * bit.size, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawMossCap(x0, x1, yEnds, yCtrl, thick, seed) {
  const g = ctx.createLinearGradient(0, yCtrl - 4, 0, yEnds + thick);
  g.addColorStop(0, "#86cf63");
  g.addColorStop(0.45, "#4f9a4c");
  g.addColorStop(1, "#2f6b3a");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0, yEnds + 1);
  ctx.quadraticCurveTo((x0 + x1) / 2, yCtrl - 3, x1, yEnds + 1);
  const steps = Math.max(4, Math.round((x1 - x0) / 11));
  for (let i = steps; i >= 0; i -= 1) {
    const s = i / steps;
    const x = lerp(x0, x1, s);
    const y = quadAt(s, yEnds, yCtrl, yEnds) + thick * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + seed)));
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawGrassRow(x0, x1, yEnds, yCtrl, spanL, spanR, spacing, height) {
  const t = gfxTime();
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 2;
  for (let x = x0; x < x1; x += spacing) {
    const s = (x - spanL) / Math.max(1, spanR - spanL);
    const y = quadAt(clamp(s, 0, 1), yEnds, yCtrl, yEnds) + 1;
    const r = pseudoRandom(x, yEnds, 51);
    const h = (6 + r * 9) * height;
    const sway = Math.sin(t * 2.2 + x * 0.07) * 3;
    ctx.strokeStyle = r < 0.5 ? "#7cc75d" : "#5aa64f";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + sway * 0.4, y - h * 0.6, x + sway, y - h);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMushroom(x, y, size, hue, t) {
  const s = 7 * size;
  const pulse = 0.7 + Math.sin(t * 2.2 + x) * 0.3;
  glow(x, y - s * 1.6, s * 4, `hsla(${hue}, 95%, 65%, ALPHA)`, 0.3 * pulse);
  addLight(x, y - s, 80 * size, 0.45 * pulse);
  ctx.fillStyle = "#e9dcc6";
  roundedRect(x - s * 0.22, y - s * 1.5, s * 0.44, s * 1.5, s * 0.2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - s * 0.3, y - s * 2, 1, x, y - s * 1.5, s * 1.2);
  g.addColorStop(0, `hsl(${hue}, 95%, 85%)`);
  g.addColorStop(1, `hsl(${hue}, 85%, 55%)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y - s * 1.45, s, s * 0.72, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  for (const [dx, dy] of [[-0.45, -1.75], [0.25, -1.95], [0.55, -1.6]]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, s * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawFlower(x, y, size, hue, t) {
  const sway = Math.sin(t * 1.8 + x * 0.05) * 2;
  const h = 14 * size;
  ctx.strokeStyle = "#4e9a4e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + sway * 0.5, y - h * 0.5, x + sway, y - h);
  ctx.stroke();
  const cx = x + sway;
  const cy = y - h;
  ctx.fillStyle = `hsl(${(hue + 40) % 360}, 85%, 72%)`;
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + t * 0.2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * 3.6 * size, cy + Math.sin(a) * 3.6 * size, 2.8 * size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ffe27d";
  ctx.beginPath();
  ctx.arc(cx, cy, 2.2 * size, 0, Math.PI * 2);
  ctx.fill();
}

function rockBodyGradient(top, bottom) {
  const g = ctx.createLinearGradient(0, top - 10, 0, bottom + 14);
  g.addColorStop(0, "#8a7262");
  g.addColorStop(0.35, "#5f4b48");
  g.addColorStop(1, "#2e2232");
  return g;
}

function drawRockDetails(p, left, right, top, underside) {
  ctx.save();
  ctx.strokeStyle = "rgba(20, 10, 20, 0.22)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < Math.max(2, Math.round(p.w / 70)); i += 1) {
    const r = pseudoRandom(p.seed || 1, i, 91);
    const cx = lerp(left + 26, right - 26, r);
    const cy = lerp(top + 14, underside - 4, pseudoRandom(p.seed || 1, i, 92));
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + 8, cy + 2, cx + 12, cy + 7);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 220, 190, 0.1)";
    ctx.beginPath();
    ctx.ellipse(cx - 12, cy + 2, 6, 3.5, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlatformDecor(p, left, right, top, ctrlY) {
  const t = gfxTime();
  const seed = p.seed || 3;
  const r = pseudoRandom(seed, 7, 811);
  const hue = [188, 280, 322, 160][Math.floor(pseudoRandom(seed, 8, 812) * 4)];
  const at = (s) => ({ x: lerp(left, right, s), y: quadAt(s, top, ctrlY, top) + 2 });
  if (r < 0.32) {
    const a = at(0.15 + pseudoRandom(seed, 9, 813) * 0.7);
    drawMushroom(a.x, a.y, 0.85, hue, t);
    if (r < 0.12) {
      const b = at(clamp((a.x - left) / (right - left) + 0.06, 0, 1));
      drawMushroom(b.x, b.y, 0.6, hue, t);
    }
  } else if (r < 0.55) {
    const a = at(0.2 + pseudoRandom(seed, 10, 814) * 0.6);
    drawFlower(a.x, a.y, 0.8, hue, t);
  }
  // Musgo colgante por debajo
  ctx.save();
  ctx.strokeStyle = "rgba(78, 154, 78, 0.8)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  const hangs = Math.round(p.w / 60);
  for (let i = 0; i < hangs; i += 1) {
    if (pseudoRandom(seed, i, 820) < 0.5) continue;
    const s = (i + 0.5) / hangs;
    const x = lerp(left + 10, right - 10, s);
    const y = quadAt(s, top, ctrlY, top) + 8;
    const len = 8 + pseudoRandom(seed, i, 821) * 14;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.sin(t * 1.3 + i) * 2, y + len * 0.6, x + Math.sin(t * 1.3 + i) * 3, y + len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFloatingRock(p) {
  const left = p.x;
  const right = p.x + p.w;
  const top = p.y;
  const underside = p.y + p.h + 22;
  const ctrlY = top - 10 + Math.sin(p.seed) * 4;
  ctx.fillStyle = rockBodyGradient(top, underside);
  ctx.beginPath();
  ctx.moveTo(left + 14, top);
  ctx.quadraticCurveTo(lerp(left, right, 0.5), ctrlY, right - 14, top);
  ctx.quadraticCurveTo(right + 6, top + 13, right - 34, underside);
  ctx.quadraticCurveTo(lerp(left, right, 0.5), underside + 12 + Math.sin(p.seed * 1.3) * 5, left + 34, underside);
  ctx.quadraticCurveTo(left - 6, top + 14, left + 14, top);
  ctx.closePath();
  ctx.fill();
  drawRockDetails(p, left, right, top, underside);
  drawMossCap(left + 8, right - 8, top + 1, ctrlY + 1, 8, p.seed);
  drawGrassRow(left + 14, right - 14, top + 1, ctrlY + 1, left + 8, right - 8, 10, 0.9);
  drawPlatformDecor(p, left + 8, right - 8, top + 1, ctrlY + 1);
}

function drawRockLedge(p) {
  if (p.embeddedSide === "middle") {
    drawFloatingRock(p);
    return;
  }
  const left = p.x;
  const right = p.x + p.w;
  const top = p.y;
  const underside = p.y + p.h + 28;
  const root = p.embeddedSide === "left" ? left : right;
  const tip = p.embeddedSide === "left" ? right : left;
  const sag = 10 + Math.sin(p.seed) * 3;
  const ctrlY = top - 12 + Math.sin(p.seed) * 4;
  ctx.fillStyle = rockBodyGradient(top, underside);
  ctx.beginPath();
  ctx.moveTo(root, top - 5);
  ctx.quadraticCurveTo(lerp(root, tip, 0.45), ctrlY, tip, top + 2);
  ctx.quadraticCurveTo(lerp(root, tip, 0.72), underside + sag, root, underside - 2);
  ctx.closePath();
  ctx.fill();
  drawRockDetails(p, Math.min(root, tip), Math.max(root, tip), top, underside);
  const a = Math.min(root, tip) + 4;
  const b = Math.max(root, tip) - 6;
  drawMossCap(a, b, top - 1, ctrlY + 2, 8, p.seed);
  drawGrassRow(a + 6, b - 6, top - 1, ctrlY + 2, a, b, 10, 0.9);
  drawPlatformDecor(p, a, b, top - 1, ctrlY + 2);
}

function drawPlatforms() {
  const v = viewRect(80);
  for (const p of world.platforms) {
    if (p.kind === "floor") {
      drawFloor();
      continue;
    }
    if (!inView(v, p.x + p.w / 2, p.y, p.w)) continue;
    if (p.kind === "exit") {
      drawExitPad(p);
    } else {
      drawRockLedge(p);
    }
  }
}

function drawExitPad(p) {
  const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
  g.addColorStop(0, "#ffe68a");
  g.addColorStop(0.5, "#e0a93b");
  g.addColorStop(1, "#9c6a22");
  ctx.fillStyle = g;
  roundedRect(p.x, p.y, p.w, p.h, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  roundedRect(p.x + 8, p.y + 3, p.w - 16, 4, 2);
  ctx.fill();
  ctx.fillStyle = "#7a4f17";
  for (let x = p.x + 14; x < p.x + p.w - 8; x += 22) {
    ctx.beginPath();
    ctx.arc(x, p.y + p.h - 6, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const pulse = 0.5 + Math.sin(gfxTime() * 3) * 0.2;
  glow(p.x + p.w / 2, p.y + 4, p.w * 0.8, "rgba(255, 220, 120, ALPHA)", 0.25 * pulse);
}

function drawCoins() {
  const t = gfxTime();
  for (const coin of world.coins) {
    const cp = coin.collected ? (coin.collectT || 0) / 0.7 : 0;
    if (cp >= 1) continue;
    const y = coin.y + Math.sin(coin.spin * 1.7) * 4 - (1 - Math.pow(1 - cp, 3)) * 70;
    const turn = Math.cos(coin.spin);
    const width = 3 + Math.abs(turn) * coin.r;
    glow(coin.x, y, coin.r * 3.4, "rgba(255, 205, 80, ALPHA)", 0.38);
    addLight(coin.x, y, 130, 0.7);
    ctx.save();
    ctx.translate(coin.x, y);
    if (cp > 0) {
      ctx.scale(1 + cp * 0.5, 1 + cp * 0.5);
      ctx.globalAlpha = 1 - smoothstep((cp - 0.35) / 0.65);
      for (let i = 0; i < 6; i += 1) {
        const ang = i * 1.047 + cp * 3;
        drawTrailStar(Math.cos(ang) * (8 + cp * 26), Math.sin(ang) * (8 + cp * 26), 3.5 * (1 - cp), "#fff3b0");
      }
    }
    ctx.fillStyle = "#9a6210";
    ctx.beginPath();
    ctx.ellipse(turn >= 0 ? 1.5 : -1.5, 1.5, width, coin.r, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(-width, -coin.r, width, coin.r);
    g.addColorStop(0, "#fff6bf");
    g.addColorStop(0.45, "#ffcf3f");
    g.addColorStop(1, "#d88d16");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, width, coin.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 250, 215, 0.85)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, width * 0.68, coin.r * 0.68, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (Math.abs(turn) > 0.45) {
      ctx.save();
      ctx.scale(Math.abs(turn), 1);
      drawTrailStar(0, 0, coin.r * 0.42, "rgba(190, 120, 20, 0.7)");
      ctx.restore();
    }
    const glintPhase = (t * 0.8 + coin.x * 0.01) % 2.4;
    if (glintPhase < 0.3) {
      const a = Math.sin((glintPhase / 0.3) * Math.PI);
      ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
      ctx.translate(-coin.r * 0.45, -coin.r * 0.5);
      ctx.rotate(t);
      ctx.fillRect(-7 * a, -1, 14 * a, 2);
      ctx.fillRect(-1, -7 * a, 2, 14 * a);
    }
    ctx.restore();
  }
}

function drawMotes() {
  const decor = caveDecor();
  const v = viewRect(30);
  const t = gfxTime();
  const span = world.floorY - world.topY;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const m of decor.motes) {
    const x = m.x + Math.sin(t * 0.5 + m.phase) * 24;
    const y = world.topY + ((((m.y - world.topY - t * m.speed) % span) + span) % span);
    if (!inView(v, x, y, 10)) continue;
    if (m.firefly) {
      const blink = Math.max(0, Math.sin(t * 2.3 + m.phase * 3));
      if (blink < 0.05) continue;
      ctx.fillStyle = `rgba(200, 255, 120, ${0.18 * blink})`;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(235, 255, 170, ${0.9 * blink})`;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
      if (blink > 0.6) addLight(x, y, 60, 0.3 * blink);
    } else {
      ctx.fillStyle = `rgba(255, 240, 210, ${0.25 + Math.sin(t + m.phase) * 0.12})`;
      ctx.beginPath();
      ctx.arc(x, y, m.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawLighting(viewW, viewH) {
  if (!world) return;
  const centerY = camera.y + viewH / camera.scale / 2;
  const depth = clamp((centerY - world.topY) / Math.max(1, world.floorY - world.topY), 0, 1);
  const launch = rocketLaunchProgress();
  const darkness = lerp(0.12, 0.62, depth) * (1 - launch);
  if (darkness < 0.02) return;
  const w = Math.max(1, Math.ceil(viewW / 2));
  const h = Math.max(1, Math.ceil(viewH / 2));
  if (!lightCanvas) {
    lightCanvas = document.createElement("canvas");
    lightCtx = lightCanvas.getContext("2d");
  }
  if (lightCanvas.width !== w || lightCanvas.height !== h) {
    lightCanvas.width = w;
    lightCanvas.height = h;
  }
  const l = lightCtx;
  l.globalCompositeOperation = "source-over";
  l.clearRect(0, 0, w, h);
  l.fillStyle = `rgba(8, 4, 26, ${darkness})`;
  l.fillRect(0, 0, w, h);
  l.globalCompositeOperation = "destination-out";
  const k = camera.scale / 2;
  const cut = (x, y, r, strength) => {
    const sx = (x - camera.x) * k;
    const sy = (y - camera.y) * k;
    const sr = r * k;
    if (sx < -sr || sy < -sr || sx > w + sr || sy > h + sr) return;
    const g = l.createRadialGradient(sx, sy, 0, sx, sy, sr);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.45, `rgba(0,0,0,${strength * 0.6})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    l.fillStyle = g;
    l.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  };
  for (const d of dinos) {
    if (d.inHouse || isDinoInsideRocket(d)) continue;
    cut(d.x + d.w / 2, d.y + d.h / 2, 280, 0.95);
  }
  for (const b of babies) cut(b.x + b.w / 2, b.y + b.h / 2, 150, 0.75);
  if (world.egg && !world.egg.hatched) cut(world.egg.x, world.egg.y - 15, 140, 0.75);
  cut(world.house.x + world.house.w / 2, world.house.y + world.house.h / 2, 220, 0.7);
  cut(world.startX, world.topY - 80, 720, 1);
  for (const light of frameLights) cut(light.x, light.y, light.r, light.strength);
  ctx.drawImage(lightCanvas, 0, 0, viewW, viewH);
}

// ---------- Animación suave ----------

function smoothstep(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function easeRate(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

function updateBodyAnim(e, dt, climbing = false) {
  if (!e.anim) {
    e.anim = { sx: 1, sy: 1, vsx: 0, vsy: 0, face: e.facing || 1, lean: 0, walk: 0, phase: 0, air: 0, wasGrounded: !!e.grounded, climb: 0, climbPhase: 0, lastY: e.y, fallVy: 0 };
  }
  const a = e.anim;
  if (!a.wasGrounded && e.grounded) {
    const impact = clamp(Math.max(e.impactVy || 0, a.fallVy) / 1300, 0.1, 0.55);
    a.vsy -= impact * 12;
    a.vsx += impact * 9.5;
  }
  if (a.wasGrounded && !e.grounded && e.vy < -150) {
    a.vsy += 5;
    a.vsx -= 4;
  }
  a.fallVy = e.grounded ? 0 : Math.max(0, e.vy);
  const k = 230;
  const damping = 15;
  a.vsx += (-k * (a.sx - 1) - damping * a.vsx) * dt;
  a.vsy += (-k * (a.sy - 1) - damping * a.vsy) * dt;
  a.sx = clamp(a.sx + a.vsx * dt, 0.7, 1.35);
  a.sy = clamp(a.sy + a.vsy * dt, 0.7, 1.35);
  a.face += ((e.facing || 1) - a.face) * easeRate(18, dt);
  const speed = Math.abs(e.vx || 0);
  const onGround = e.grounded && !climbing;
  a.walk += ((onGround ? clamp(speed / 170, 0, 1) : 0) - a.walk) * easeRate(10, dt);
  a.phase += speed * dt * 0.085;
  a.air += ((e.grounded || climbing ? 0 : 1) - a.air) * easeRate(9, dt);
  const leanTarget = climbing
    ? 0
    : e.grounded
      ? clamp((e.vx || 0) / 900, -0.1, 0.1)
      : clamp((e.vx || 0) / 1100, -0.14, 0.14) + clamp((e.vy || 0) / 4000, -0.07, 0.07) * Math.sign(e.facing || 1);
  a.lean += (leanTarget - a.lean) * easeRate(8, dt);
  a.climb += ((climbing ? 1 : 0) - a.climb) * easeRate(12, dt);
  if (climbing) a.climbPhase += Math.abs(e.y - a.lastY) * 0.12;
  a.lastY = e.y;
  a.wasGrounded = !!e.grounded;
}

const restAnim = { sx: 1, sy: 1, face: 1, lean: 0, walk: 0, phase: 0, air: 0, climb: 0, climbPhase: 0 };

function animOf(e) {
  return e.anim || { ...restAnim, face: e.facing || 1 };
}

function drawClimbArms(dino, w, h, a) {
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < 2; i += 1) {
    const up = (Math.sin(a.climbPhase + i * Math.PI) + 1) / 2;
    const sx = w * (0.5 + i * 0.12);
    const sy = h * 0.42;
    const hx = w * (0.62 + i * 0.12);
    const hy = h * (0.34 - up * 0.36);
    ctx.globalAlpha *= a.climb;
    ctx.strokeStyle = i === 0 ? dino.shade : dino.body;
    ctx.lineWidth = Math.max(4, w * 0.1);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + w * 0.16, (sy + hy) / 2 + h * 0.04, hx, hy);
    ctx.stroke();
    ctx.fillStyle = "#fff7e6";
    ctx.beginPath();
    ctx.arc(hx, hy, Math.max(2.4, w * 0.05), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha /= a.climb || 1;
  }
  ctx.restore();
}

function updateSquashedBeetles(dt) {
  for (const s of squashedBeetles) s.t += dt;
  squashedBeetles = squashedBeetles.filter((s) => s.t < 0.7);
}

function drawSquashedBeetles() {
  for (const s of squashedBeetles) {
    const p = s.t / 0.7;
    const cx = s.beetle.x + s.beetle.w / 2;
    const by = s.beetle.y + s.beetle.h;
    ctx.save();
    ctx.globalAlpha = 1 - smoothstep(p);
    ctx.translate(cx, by);
    ctx.scale(1.25 + p * 0.3, Math.max(0.2, 0.45 - p * 0.3));
    ctx.translate(-cx, -by);
    drawBeetle(s.beetle);
    ctx.restore();
    if (p < 0.6) {
      for (let i = 0; i < 3; i += 1) {
        const ang = s.t * 6 + i * 2.1;
        drawTrailStar(cx + Math.cos(ang) * 14, by - 18 + Math.sin(ang) * 5, 3.5 * (1 - p), "#fff3b0");
      }
    }
  }
}

function drawPadSmoke() {
  if (!(transition.active && transition.mode === "next")) return;
  const t = transition.timer;
  const intensity = t < LAUNCH.ignite ? smoothstep((t - (LAUNCH.ignite - 1.3)) / 1.3) * 0.8 : 1 - smoothstep((t - LAUNCH.ignite) / 2.6);
  if (intensity <= 0.01) return;
  ctx.save();
  for (let i = 0; i < 26; i += 1) {
    const p = (t * 0.5 + i * 0.039) % 1;
    const side = i % 2 === 0 ? 1 : -1;
    const reach = 0.55 + ((i * 7) % 5) / 9;
    const x = world.startX + side * (16 + p * 220 * reach);
    const y = world.topY - 4 - p * 46 - (i % 3) * 7;
    const r = 10 + p * 38;
    ctx.fillStyle = `rgba(232, 230, 236, ${(1 - p) * 0.55 * intensity})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPreIgnitionFlame(x, y) {
  if (!(transition.active && transition.mode === "next")) return;
  const t = transition.timer;
  if (t < 0.25 || t >= LAUNCH.ignite) return;
  const p = smoothstep((t - 0.25) / (LAUNCH.ignite - 0.25));
  const flick = 1 + Math.sin(performance.now() * 0.05) * 0.25;
  ctx.save();
  ctx.fillStyle = `rgba(255, 190, 80, ${0.5 + p * 0.4})`;
  ctx.beginPath();
  ctx.moveTo(x - 8 - p * 5, y - 2);
  ctx.quadraticCurveTo(x, y + (8 + p * 26) * flick, x + 8 + p * 5, y - 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  glow(x, y + 8, 50 + p * 50, "rgba(255, 180, 80, ALPHA)", 0.25 + p * 0.3);
}

function drawLaunchOverlay(w, h) {
  if (!(transition.active && transition.mode === "next")) return;
  const t = transition.timer;
  const flash = t >= LAUNCH.ignite && t < LAUNCH.ignite + 0.45 ? 1 - (t - LAUNCH.ignite) / 0.45 : 0;
  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 240, 205, ${0.32 * flash * flash})`;
    ctx.fillRect(0, 0, w, h);
  }
  const tw = transition.twinkle;
  if (tw) {
    const p = (t - LAUNCH.gone) / 1.1;
    if (p >= 0 && p <= 1) {
      const sx = clamp((tw.x - camera.x) * camera.scale, 40, w - 40);
      const sy = clamp((tw.y - camera.y) * camera.scale, 120, h * 0.4);
      const s = Math.sin(p * Math.PI);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(p * 1.2);
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 60 * s);
      g.addColorStop(0, `rgba(255, 245, 210, ${0.8 * s})`);
      g.addColorStop(1, "rgba(255, 245, 210, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(-60, -60, 120, 120);
      ctx.fillStyle = `rgba(255, 255, 255, ${s})`;
      ctx.beginPath();
      ctx.moveTo(0, -44 * s);
      ctx.lineTo(4 * s, -4 * s);
      ctx.lineTo(44 * s, 0);
      ctx.lineTo(4 * s, 4 * s);
      ctx.lineTo(0, 44 * s);
      ctx.lineTo(-4 * s, 4 * s);
      ctx.lineTo(-44 * s, 0);
      ctx.lineTo(-4 * s, -4 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawLevelTitle(w, h) {
  if (!levelIntro || !levelIntro.title || levelIntro.t > levelIntro.dur) return;
  const d = levelIntro.dur;
  const t = levelIntro.t;
  const a = t < d * 0.2 ? smoothstep(t / (d * 0.2)) : 1 - smoothstep((t - d * 0.3) / (d * 0.45));
  if (a <= 0.01) return;
  const rise = (1 - smoothstep(t / (d * 0.35))) * 14;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255, 190, 90, 0.6)";
  ctx.shadowBlur = 28;
  const g = ctx.createLinearGradient(0, h / 2 - 40, 0, h / 2 + 20);
  g.addColorStop(0, "#fff3b0");
  g.addColorStop(1, "#ffb84a");
  ctx.fillStyle = g;
  ctx.font = "700 64px Fredoka, system-ui, sans-serif";
  ctx.fillText(levelIntro.title, w / 2, h / 2 - 12 + rise);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(233, 221, 245, 0.85)";
  ctx.font = "500 20px Fredoka, system-ui, sans-serif";
  ctx.fillText(levelIntro.subtitle || "", w / 2, h / 2 + 42 + rise);
  ctx.restore();
}

function updateLevelIntro(dt) {
  if (!levelIntro) return;
  levelIntro.t += dt;
  if (!levelIntro.shown && levelIntro.t >= levelIntro.dur * 0.6) {
    levelIntro.shown = true;
    if (levelIntro.message) showMessage(levelIntro.message);
  }
  if (levelIntro.t >= (levelIntro.camDur || levelIntro.dur)) levelIntro = null;
}

function introCameraFactor() {
  if (!levelIntro) return 1;
  return lerp(0.12, 1, smoothstep(levelIntro.t / (levelIntro.camDur || levelIntro.dur)));
}

function draw() {
  const viewW = canvas.clientWidth;
  const viewH = canvas.clientHeight;
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.save();
  const shake = transition.active && transition.mode === "next" ? transition.shake || 0 : 0;
  if (shake > 0) ctx.translate(Math.sin(performance.now() * 0.071) * shake, Math.cos(performance.now() * 0.083) * shake);
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.x, -camera.y);
  drawCave();
  drawLaunchSky();
  drawPlatforms();
  drawPebbles();
  drawHouse();
  drawCoins();
  drawEgg();
  drawDust();
  drawBeetles();
  drawSquashedBeetles();
  drawLadder();
  drawBabies();
  for (const dino of dinos) {
    if (dino.inHouse || isDinoInsideRocket(dino)) continue;
    const flicker = dino.safeTime > 0 && Math.floor(dino.safeTime * 12) % 2 === 0;
    ctx.save();
    if (flicker) ctx.globalAlpha = 0.35;
    drawDino(dino);
    ctx.restore();
    if (dino.bubble) drawBubble(dino);
  }
  drawDepartingBabies();
  drawMotes();
  drawSparkles();
  drawExit();
  for (const dino of dinos) {
    if (!isWaitingOnRocketPlatform(dino)) continue;
    drawDino(rocketPerch(dino));
    if (dino !== perchLeader()) continue;
    if (!world.ladder.deployed) drawLadderHint(dino, "down");
    else if (world.rocketState === "lying") drawLadderHint(dino, "up");
  }
  ctx.restore();
  drawLighting(viewW, viewH);
  drawConfetti(viewW, viewH);
  drawVignette(viewW, viewH);
  drawLaunchOverlay(viewW, viewH);
  drawFade(viewW, viewH);
  drawLevelTitle(viewW, viewH);
}

function isDinoInsideRocket(dino) {
  return dino.inRocket || (transition.active && transition.mode === "next" && transition.timer > 0.18);
}

function drawLaunchSky() {
  const t = transition.active && transition.mode === "next" ? transition.timer : 0;
  const launch = smoothstep((t - LAUNCH.ignite * 0.6) / 2.6);
  if (launch <= 0) return;
  const ground = world.topY - 172;
  const v = viewRect(100);
  if (v.y0 > ground) return;
  const top = Math.min(v.y0, ground - 5200);
  const space = ctx.createLinearGradient(0, ground - 2600, 0, ground);
  space.addColorStop(0, `rgba(3, 4, 16, ${launch})`);
  space.addColorStop(0.7, `rgba(10, 14, 40, ${launch * 0.75})`);
  space.addColorStop(1, "rgba(10, 14, 40, 0)");
  ctx.fillStyle = space;
  ctx.fillRect(v.x0, top, v.x1 - v.x0, ground - top);
  const now = performance.now() * 0.001;
  for (let i = 0; i < 260; i += 1) {
    const x = world.startX - 2200 + pseudoRandom(i, levelNumber, 901) * 4400;
    const y = ground - 250 - pseudoRandom(i, levelNumber, 902) * 4800;
    if (!inView(v, x, y, 4)) continue;
    const r = 0.7 + pseudoRandom(i, 3, 903) * 1.8;
    const twinkle = 0.55 + Math.sin(now * (1.5 + (i % 5)) + i) * 0.35;
    ctx.fillStyle = `rgba(255, 248, 225, ${launch * twinkle})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const mx = world.startX + 520;
  const my = ground - 1700;
  if (inView(v, mx, my, 140)) {
    ctx.save();
    ctx.globalAlpha = launch;
    glow(mx, my, 190, "rgba(255, 244, 210, ALPHA)", 0.25);
    ctx.fillStyle = "#f3ead2";
    ctx.beginPath();
    ctx.arc(mx, my, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(170, 160, 140, 0.45)";
    for (const [dx, dy, r] of [[-20, -14, 12], [18, 10, 15], [-6, 26, 8], [26, -22, 7]]) {
      ctx.beginPath();
      ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawHouse() {
  const house = world.house;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(house.x + house.w / 2, house.y + house.h + 7, house.w * 0.5, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#6f4c36";
  roundedRect(house.x + 18, house.y + 30, house.w - 36, house.h - 30, 8);
  ctx.fill();
  ctx.fillStyle = "#8c6548";
  roundedRect(house.x + 30, house.y + 43, house.w - 60, house.h - 48, 7);
  ctx.fill();

  ctx.fillStyle = "#3b251d";
  ctx.beginPath();
  ctx.moveTo(house.x, house.y + 42);
  ctx.lineTo(house.x + house.w / 2, house.y);
  ctx.lineTo(house.x + house.w, house.y + 42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#5a3829";
  ctx.beginPath();
  ctx.moveTo(house.x + 22, house.y + 39);
  ctx.lineTo(house.x + house.w / 2, house.y + 13);
  ctx.lineTo(house.x + house.w - 22, house.y + 39);
  ctx.closePath();
  ctx.fill();

  drawWindow(house.x + 47, house.y + 48, dinos[0]);
  drawWindow(house.x + house.w - 87, house.y + 48, dinos[1]);

  ctx.fillStyle = "#3b251d";
  roundedRect(house.x + house.w / 2 - 18, house.y + house.h - 44, 36, 44, 6);
  ctx.fill();
  ctx.fillStyle = "#d8aa56";
  ctx.beginPath();
  ctx.arc(house.x + house.w / 2 + 10, house.y + house.h - 22, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWindow(x, y, dino) {
  glow(x + 20, y + 17, 60, "rgba(255, 200, 110, ALPHA)", 0.35);
  const pane = ctx.createLinearGradient(0, y, 0, y + 34);
  pane.addColorStop(0, "#ffd88a");
  pane.addColorStop(1, "#e08a3c");
  ctx.fillStyle = pane;
  roundedRect(x, y, 40, 34, 5);
  ctx.fill();

  if (dino.inHouse) {
    drawWindowDino(x + 20, y + 20, dino);
  }

  ctx.strokeStyle = "#d8aa56";
  ctx.lineWidth = 4;
  roundedRect(x, y, 40, 34, 5);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 232, 158, 0.68)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 3);
  ctx.lineTo(x + 20, y + 31);
  ctx.moveTo(x + 4, y + 17);
  ctx.lineTo(x + 36, y + 17);
  ctx.stroke();
}

function drawWindowDino(x, y, dino) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = dino.body;
  ctx.beginPath();
  ctx.ellipse(0, 1, 12, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dino.body;
  ctx.beginPath();
  ctx.ellipse(7, -8, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff7e6";
  ctx.beginPath();
  ctx.arc(10, -9, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#16181d";
  ctx.beginPath();
  ctx.arc(11, -9, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBeetles() {
  for (const beetle of beetles) drawBeetle(beetle);
}

function drawBeetle(beetle) {
  const legPhase = Math.sin(beetle.step);
  const glowPulse = 0.86 + Math.sin(beetle.step * 0.65) * 0.14;
  ctx.save();
  ctx.translate(beetle.x + beetle.w / 2, beetle.y + beetle.h / 2);
  ctx.scale(beetle.dir, 1);
  ctx.translate(-beetle.w / 2, -beetle.h / 2);

  const glow = ctx.createRadialGradient(
    beetle.w * 0.5,
    beetle.h * 0.5,
    beetle.w * 0.18,
    beetle.w * 0.5,
    beetle.h * 0.5,
    beetle.w * 1.05 * glowPulse
  );
  glow.addColorStop(0, "rgba(116, 255, 141, 0.28)");
  glow.addColorStop(0.45, "rgba(86, 229, 117, 0.16)");
  glow.addColorStop(1, "rgba(86, 229, 117, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(beetle.w * 0.5, beetle.h * 0.5, beetle.w * 1.04 * glowPulse, beetle.h * 1.45 * glowPulse, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.shadowColor = "rgba(98, 255, 132, 0.7)";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "rgba(152, 255, 156, 0.58)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(beetle.w * 0.48, beetle.h * 0.5, beetle.w * 0.55, beetle.h * 0.54, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = "#21150f";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i += 1) {
    const x = beetle.w * (0.25 + i * 0.22);
    const swing = (i % 2 === 0 ? legPhase : -legPhase) * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, beetle.h * 0.64);
    ctx.lineTo(x - 4 + swing, beetle.h + 3);
    ctx.moveTo(x, beetle.h * 0.64);
    ctx.lineTo(x + 4 - swing, beetle.h + 3);
    ctx.stroke();
  }

  ctx.fillStyle = "#3a2217";
  ctx.beginPath();
  ctx.ellipse(beetle.w * 0.48, beetle.h * 0.5, beetle.w * 0.46, beetle.h * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b3e24";
  ctx.beginPath();
  ctx.ellipse(beetle.w * 0.62, beetle.h * 0.45, beetle.w * 0.22, beetle.h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#d2a05d";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(beetle.w * 0.75, beetle.h * 0.3);
  ctx.lineTo(beetle.w * 0.95, -2);
  ctx.moveTo(beetle.w * 0.75, beetle.h * 0.36);
  ctx.lineTo(beetle.w * 0.98, beetle.h * 0.02);
  ctx.stroke();

  ctx.fillStyle = "#f3d89a";
  ctx.beginPath();
  ctx.arc(beetle.w * 0.72, beetle.h * 0.38, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSparkles() {
  ctx.save();
  for (const sparkle of sparkleParticles) {
    const t = sparkle.age / sparkle.life;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.save();
    ctx.translate(sparkle.x, sparkle.y);
    ctx.rotate(sparkle.rotation);
    drawTrailStar(0, 0, sparkle.size * (1 - t * 0.5), sparkle.color);
    ctx.restore();
  }
  ctx.restore();
}

function drawDust() {
  ctx.save();
  for (const dust of dustParticles) {
    const t = dust.age / dust.life;
    ctx.globalAlpha = Math.max(0, 1 - t) * 0.36;
    ctx.fillStyle = "#c0a17a";
    ctx.beginPath();
    ctx.ellipse(dust.x, dust.y, dust.r * (1 + t * 0.55), dust.r * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPebbles() {
  ctx.save();
  ctx.fillStyle = "#8b7761";
  for (const pebble of pebbleParticles) {
    ctx.save();
    ctx.translate(pebble.x, pebble.y);
    ctx.rotate(pebble.rotation);
    roundedRect(-pebble.r, -pebble.r, pebble.r * 2, pebble.r * 1.6, 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawExit() {
  const allCoins = world.coins.every((coin) => coin.collected);
  const launching = transition.active && transition.mode === "next";
  const launch = rocketLaunchProgress();
  const rocket = rocketPosition();
  const waitingPassengers = dinos.filter((dino) => dino.inRocket && !isWaitingOnRocketPlatform(dino)).length;
  ctx.save();
  ctx.globalAlpha = allCoins ? 1 : 0.38;
  ctx.fillStyle = allCoins ? "rgba(255, 230, 124, 0.35)" : "rgba(160, 165, 170, 0.14)";
  ctx.beginPath();
  ctx.ellipse(world.startX, world.topY - 40, 150, 54, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = allCoins ? "#ffe27d" : "#a7a8aa";
  ctx.font = "800 22px Fredoka, system-ui, sans-serif";
  ctx.textAlign = "center";
  if (!launching && !dinos.some((dino) => dino.inRocket)) {
    ctx.fillText(allCoins ? "SUBID AL COHETE" : `${world.coins.length} ${world.coins.length === 1 ? "MONEDA" : "MONEDAS"}`, world.startX, world.topY - 34);
  }
  drawPadSmoke();
  const pose = rocketRaisePose();
  drawLaunchGantry(pose);
  ctx.save();
  if (transition.active && transition.mode === "next") {
    ctx.translate(rocket.x, rocket.y);
    ctx.scale(rocket.scale, rocket.scale);
    ctx.translate(-rocket.x, -rocket.y);
    drawPreIgnitionFlame(rocket.x, rocket.y);
    drawRocket(rocket.x, rocket.y, allCoins, launch, waitingPassengers);
  } else {
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.angle);
    ctx.translate(-pose.x, -pose.y);
    drawRocket(pose.x, pose.y, allCoins, 0, waitingPassengers);
  }
  ctx.restore();
  ctx.restore();
}

function rocketLaunchProgress() {
  return transition.active && transition.mode === "next" ? clamp((transition.timer - LAUNCH.ignite) / 2.2, 0, 1) : 0;
}

function rocketPosition() {
  if (!(transition.active && transition.mode === "next")) return { x: world.startX, y: world.topY, scale: 1 };
  const u = Math.max(0, transition.timer - LAUNCH.ignite);
  const rise = 60 * u * u + 45 * u * u * u;
  return {
    x: world.startX + Math.sin(u * 1.1) * u * 9,
    y: world.topY - rise,
    scale: 1 - 0.72 * smoothstep((u - 1.5) / 1.9),
  };
}

function drawRocket(x, baseY, ready, launch, passengers) {
  const shake = transition.active && transition.mode === "next" ? transition.shake || 0 : 0;
  const wobble = Math.sin(performance.now() * 0.045) * (shake * 0.8 + (launch > 0 ? 1.2 * (1 - Math.min(0.8, launch)) : 0)) / Math.max(1, camera.scale * 0.6);
  ctx.save();
  ctx.translate(x + wobble, baseY);

  if (launch > 0) {
    drawRocketTrail(launch);
  }

  if (passengers > 0 || launch > 0) {
    const smokeAlpha = launch > 0 ? 0.58 : 0.3;
    ctx.fillStyle = `rgba(218, 221, 218, ${smokeAlpha})`;
    for (let i = 0; i < 12; i += 1) {
      const t = (performance.now() * 0.001 + i * 0.23) % 1;
      const side = i % 2 === 0 ? -1 : 1;
      ctx.beginPath();
      ctx.ellipse(side * (10 + i * 2.6) + Math.sin(t * 5 + i) * 9, 12 + t * (46 + launch * 80), 10 + t * 22, 7 + t * 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (launch > 0) {
    const flame = 1 + Math.sin(performance.now() * 0.035) * 0.18;
    ctx.fillStyle = "rgba(255, 174, 61, 0.75)";
    ctx.beginPath();
    ctx.moveTo(-15, -4);
    ctx.quadraticCurveTo(0, (56 + launch * 34) * flame, 15, -4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255, 235, 120, 0.9)";
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.quadraticCurveTo(0, (34 + launch * 22) * flame, 8, -2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.globalAlpha = ready ? 1 : 0.55;
  ctx.fillStyle = "#f2eee5";
  ctx.beginPath();
  ctx.moveTo(0, -112);
  ctx.bezierCurveTo(30, -86, 31, -34, 18, 0);
  ctx.lineTo(-18, 0);
  ctx.bezierCurveTo(-31, -34, -30, -86, 0, -112);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = ready ? "#e84a3c" : "#8f8c86";
  ctx.beginPath();
  ctx.moveTo(0, -112);
  ctx.bezierCurveTo(17, -98, 22, -82, 22, -72);
  ctx.lineTo(-22, -72);
  ctx.bezierCurveTo(-22, -82, -17, -98, 0, -112);
  ctx.fill();

  drawRocketWindow(ready);

  ctx.fillStyle = ready ? "#3b5fdb" : "#69645c";
  ctx.beginPath();
  ctx.moveTo(-18, -8);
  ctx.lineTo(-43, 14);
  ctx.lineTo(-16, -32);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(18, -8);
  ctx.lineTo(43, 14);
  ctx.lineTo(16, -32);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#5c4533";
  roundedRect(-17, -5, 34, 10, 4);
  ctx.fill();
  ctx.restore();
}

function drawRocketWindow(ready) {
  const r = 12;
  ctx.save();
  ctx.fillStyle = "#c9c3b6";
  ctx.beginPath();
  ctx.arc(0, -56, r + 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -56, r, 0, Math.PI * 2);
  ctx.clip();
  const glass = ctx.createLinearGradient(0, -56 - r, 0, -56 + r);
  glass.addColorStop(0, ready ? "#7fd4ff" : "#9a9a9a");
  glass.addColorStop(1, ready ? "#1f78c8" : "#5c5c5c");
  ctx.fillStyle = glass;
  ctx.fillRect(-r, -56 - r, r * 2, r * 2);
  const inside = dinos.filter((d) => d.inRocket && !isWaitingOnRocketPlatform(d));
  const time = performance.now() * 0.001;
  const excited = transition.active && transition.mode === "next" ? 1 : 0.4;
  inside.sort((a, b) => (a.id === "papa" ? 1 : -1));
  inside.forEach((d, i) => {
    const solo = inside.length === 1;
    const fx = solo ? 0 : i === 0 ? -5.2 : 4.8;
    const big = d.id === "papa" ? 1.02 : 0.84;
    const bounce = Math.abs(Math.sin(time * (6 + i * 1.3) + i)) * 1.1 * excited;
    const raise = babiesAboard().length ? 1.6 : 0;
    drawWindowFace(d, fx, -52.5 - bounce - raise + (d.id === "papa" ? -0.6 : 0.8), big, time, i);
  });
  const crew = babiesAboard();
  crew.forEach((baby, j) => {
    const spread = crew.length === 1 ? 0 : lerp(-5.5, 5.5, j / (crew.length - 1));
    const bounce = Math.abs(Math.sin(time * (8 + j * 1.7) + j * 2)) * 1.3 * excited;
    drawWindowFace(baby, spread, -47.6 - bounce, 0.52, time, j + 3, true);
  });
  ctx.restore();
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(-4.5, -61, 3.6, 2.2, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(0, -56, 12 - 1.2, Math.PI * 1.1, Math.PI * 1.55);
  ctx.stroke();
  ctx.fillStyle = "#8f887b";
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * (12 + 1.2), -56 + Math.sin(a) * (12 + 1.2), 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function babiesAboard() {
  if (!(transition.active && transition.mode === "next")) return babies.filter((b) => b.inRocket);
  return babies;
}

function drawWindowFace(d, x, y, k, time, index, baby = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  const g = ctx.createLinearGradient(0, -6, 0, 6);
  g.addColorStop(0, mixColor(d.body, "#ffffff", 0.3));
  g.addColorStop(1, d.body);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 1.5, 5.2, 5.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // crestas
  ctx.fillStyle = baby ? "#fff4dc" : "#fff7e6";
  for (let i = 0; i < (baby ? 0 : 3); i += 1) {
    ctx.beginPath();
    ctx.moveTo(-2.6 + i * 2.2, -3.6);
    ctx.lineTo(-1.5 + i * 2.2, -6.2);
    ctx.lineTo(-0.4 + i * 2.2, -3.6);
    ctx.closePath();
    ctx.fill();
  }
  // ojos
  const blink = (time * 0.9 + index * 0.37) % 3.1 < 0.12;
  const look = Math.sin(time * 1.3 + index) * 0.5;
  if (baby) {
    ctx.fillStyle = "#fff4dc";
    ctx.beginPath();
    ctx.moveTo(-3.6, -3.4);
    ctx.lineTo(-2.4, -5.6);
    ctx.lineTo(-1.2, -4.2);
    ctx.lineTo(0, -6);
    ctx.lineTo(1.2, -4.2);
    ctx.lineTo(2.4, -5.6);
    ctx.lineTo(3.6, -3.4);
    ctx.quadraticCurveTo(0, -2.4, -3.6, -3.4);
    ctx.fill();
  }
  const eyeR = baby ? 1.9 : 1.55;
  for (const ex of [-1.9, 1.9]) {
    if (blink) {
      ctx.strokeStyle = "#16181d";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(ex - 1.1, 0.2);
      ctx.lineTo(ex + 1.1, 0.2);
      ctx.stroke();
    } else {
      ctx.fillStyle = "#fff7e6";
      ctx.beginPath();
      ctx.arc(ex, 0, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#16181d";
      ctx.beginPath();
      ctx.arc(ex + look, 0.25, baby ? 1.1 : 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ex + look + 0.3, -0.2, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // mofletes
  ctx.fillStyle = "rgba(255, 120, 150, 0.55)";
  for (const bx of [-3.4, 3.4]) {
    ctx.beginPath();
    ctx.ellipse(bx, 2.4, 1, 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // sonrisa grande
  ctx.fillStyle = "#5a1f24";
  ctx.beginPath();
  ctx.moveTo(-2, 2.7);
  ctx.quadraticCurveTo(0, 6.2, 2, 2.7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ff8fa0";
  ctx.beginPath();
  ctx.ellipse(0, 4.1, 0.9, 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRocketTrail(launch) {
  const time = performance.now() * 0.001;
  const length = 140 + launch * 620;
  const width = 28 + launch * 62;
  const trail = ctx.createLinearGradient(0, 0, 0, length);
  trail.addColorStop(0, "rgba(255, 240, 135, 0.82)");
  trail.addColorStop(0.16, "rgba(255, 151, 64, 0.55)");
  trail.addColorStop(0.5, "rgba(218, 221, 218, 0.34)");
  trail.addColorStop(1, "rgba(218, 221, 218, 0)");
  ctx.fillStyle = trail;
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.bezierCurveTo(-width, length * 0.28, -width * 0.7 + Math.sin(time * 6) * 18, length * 0.66, -width * 0.25, length);
  ctx.bezierCurveTo(0, length * 0.9, width * 0.25, length, width * 0.25, length);
  ctx.bezierCurveTo(width * 0.7 + Math.cos(time * 5) * 18, length * 0.66, width, length * 0.28, 12, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(235, 238, 232, 0.36)";
  for (let i = 0; i < 18; i += 1) {
    const t = (time * 0.9 + i * 0.137) % 1;
    const spread = Math.sin(i * 2.4) * width * (0.2 + t * 0.8);
    ctx.beginPath();
    ctx.ellipse(spread, 40 + t * length, 12 + t * 30, 8 + t * 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 16; i += 1) {
    const t = (time * 0.65 + i * 0.173) % 1;
    const side = Math.sin(i * 4.1);
    const x = side * width * (0.18 + t * 0.72);
    const y = 36 + t * length * 0.95;
    const size = 3.2 + (1 - t) * 3.4;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 2.5 + i);
    ctx.globalAlpha = (1 - t) * 0.9;
    drawTrailStar(0, 0, size, i % 3 === 0 ? "#fff7d6" : "#ffdb66");
    ctx.restore();
  }
}

function drawTrailStar(x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? size : size * 0.42;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawDino(dino) {
  const chargePct = dino.charge / chargeTimeMax;
  const crouch = dino.charge > 0 ? 1 - chargePct * 0.32 : 1;
  const squash = dino.charge > 0 ? 1 + chargePct * 0.18 : 1;
  const x = dino.x;
  const y = dino.y + dino.h * (1 - crouch);
  const w = dino.w;
  const h = dino.h * crouch;
  const dir = dino.facing;
  const time = performance.now() * 0.001;
  const idle = dino.grounded && Math.abs(dino.vx) < 8 && dino.charge === 0;
  const a = animOf(dino);
  const walking = a.walk > 0.35 && dino.charge === 0;
  const idleWave = idle ? Math.sin(time * 4 + (dino.id === "lucky" ? 0.5 : 1.7)) : 0;
  const idleSquash = idle ? 1 + idleWave * 0.018 : 1;
  const frontStep = dino.charge > 0 ? 0 : Math.sin(a.phase) * a.walk;
  const backStep = -frontStep;
  const walkBob = Math.abs(Math.sin(a.phase)) * h * 0.035 * a.walk;
  const frontLift = Math.max(0, Math.sin(a.climbPhase)) * h * 0.09 * a.climb;
  const backLift = Math.max(0, -Math.sin(a.climbPhase)) * h * 0.09 * a.climb;
  const climbSway = Math.sin(a.climbPhase) * 0.05 * a.climb;
  const chargeWobble = dino.charge > 0 ? Math.sin(time * 25) * chargePct * 0.035 : 0;

  ctx.fillStyle = `rgba(0,0,0,${0.22 * (1 - a.climb)})`;
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h + 5, w * 0.48 * a.sx * (1 - a.air * 0.35), 8 * (1 - a.air * 0.35), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x + w / 2, y + h);
  ctx.rotate(a.lean + climbSway);
  ctx.scale(Math.abs(a.face) < 0.08 ? 0.08 * Math.sign(a.face || dir) : a.face, 1);
  ctx.scale((squash + chargeWobble) * a.sx, idleSquash * a.sy);
  ctx.translate(-w / 2, -h - walkBob);

  drawDinoCape(dino, w, h, time, walking);

  const bodyGrad = ctx.createLinearGradient(0, 0, 0, h);
  bodyGrad.addColorStop(0, mixColor(dino.body, "#ffffff", 0.32));
  bodyGrad.addColorStop(0.5, dino.body);
  bodyGrad.addColorStop(1, mixColor(dino.body, dino.shade, 0.55));
  ctx.fillStyle = bodyGrad;
  roundedRect(w * 0.12, h * 0.2, w * 0.68, h * 0.66, 16);
  ctx.fill();
  ctx.fillStyle = dino.shade;
  roundedRect(w * 0.18, h * 0.52, w * 0.44, h * 0.28, 12);
  ctx.fill();

  ctx.fillStyle = bodyGrad;
  roundedRect(w * 0.52, h * 0.06, w * 0.42, h * 0.28, 13);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.16, h * 0.42);
  ctx.lineTo(-w * 0.26, h * 0.58);
  ctx.lineTo(w * 0.16, h * 0.66);
  ctx.closePath();
  ctx.fill();

  drawDinoArms(dino, w, h, chargePct, time);

  if (dino.blinkDuration > 0) {
    ctx.strokeStyle = "#16181d";
    ctx.lineWidth = Math.max(2, w * 0.035);
    ctx.beginPath();
    ctx.moveTo(w * 0.72, h * 0.17);
    ctx.lineTo(w * 0.86, h * 0.17);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#fff7e6";
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.17, w * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#16181d";
    ctx.beginPath();
    ctx.arc(w * 0.8, h * 0.17, w * 0.032, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(w * 0.81, h * 0.155, w * 0.014, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255, 120, 150, 0.45)";
  ctx.beginPath();
  ctx.ellipse(w * 0.72, h * 0.26, w * 0.07, w * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.beginPath();
  ctx.ellipse(w * 0.36, h * 0.3, w * 0.14, h * 0.05, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = dino.shade;
  roundedRect(w * 0.18 + backStep * w * 0.08 - a.air * w * 0.05, h * 0.8 - Math.max(0, backStep) * h * 0.06 - a.air * h * 0.03 - backLift, w * 0.21, h * 0.2, 6);
  ctx.fill();
  roundedRect(w * 0.55 + frontStep * w * 0.08 + a.air * w * 0.05, h * 0.8 - Math.max(0, frontStep) * h * 0.06 - a.air * h * 0.05 - frontLift, w * 0.21, h * 0.2, 6);
  ctx.fill();
  if (a.climb > 0.05) drawClimbArms(dino, w, h, a);

  ctx.fillStyle = "#fff7e6";
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(w * (0.28 + i * 0.13), h * 0.2);
    ctx.lineTo(w * (0.34 + i * 0.13), h * 0.08);
    ctx.lineTo(w * (0.4 + i * 0.13), h * 0.2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  if (dino.charge > 0) drawChargeBar(dino);
}

function drawDinoCape(dino, w, h, time, walking) {
  const walkWave = walking ? Math.sin(time * 15 + dino.x * 0.04) : Math.sin(time * 4.5) * 0.25;
  const airWave = dino.grounded ? 0 : Math.sin(time * 22 + dino.y * 0.02) * 0.9;
  const fallLift = clamp(dino.vy / 900, 0, 1);
  const riseDrop = clamp(-dino.vy / 800, 0, 1);
  const freeX = -w * (0.52 + Math.abs(walkWave) * 0.08 + Math.abs(airWave) * 0.06);
  const lift = fallLift * h * 0.34 - riseDrop * h * 0.12;
  const wave = (walkWave + airWave) * h * 0.06;
  const flutter = airWave * h * 0.05;
  const topY = h * 0.28;
  const bottomY = h * 0.74;
  const capeColor = dino.id === "lucky" ? "#f05a46" : "#3b5fdb";
  const capeShade = dino.id === "lucky" ? "#b92d36" : "#243c9d";

  ctx.save();
  ctx.globalAlpha = 0.94;
  ctx.fillStyle = capeColor;
  ctx.beginPath();
  ctx.moveTo(w * 0.25, topY);
  ctx.bezierCurveTo(w * 0.02, topY + wave - h * 0.04, freeX * 0.68, topY - lift + flutter, freeX, h * 0.36 - lift + wave);
  ctx.bezierCurveTo(freeX * 0.72, h * 0.55 - lift - flutter, w * 0.02, bottomY + wave, w * 0.25, bottomY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = capeShade;
  ctx.lineWidth = Math.max(2, w * 0.035);
  ctx.beginPath();
  ctx.moveTo(w * 0.21, topY + h * 0.06);
  ctx.quadraticCurveTo(freeX * 0.38, h * 0.41 - lift + wave, w * 0.18, bottomY - h * 0.04);
  ctx.stroke();
  ctx.restore();
}

function drawDinoArms(dino, w, h, chargePct, time) {
  if (dino.charge <= 0.01) return;
  const raise = chargePct;
  const wiggle = Math.sin(time * 18) * w * 0.025 * chargePct;
  const arms = [
    { x: w * 0.45, y: h * 0.43, length: w * 0.22, back: true },
    { x: w * 0.66, y: h * 0.4, length: w * 0.25, back: false },
  ];

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const arm of arms) {
    const lift = h * (raise * 0.56);
    const reach = w * (0.02 + raise * 0.1);
    const endX = arm.x + arm.length * 0.7 + reach + (arm.back ? -wiggle : wiggle);
    const endY = arm.y + h * 0.11 - lift;
    ctx.strokeStyle = arm.back ? dino.shade : dino.body;
    ctx.lineWidth = Math.max(4, w * 0.09);
    ctx.beginPath();
    ctx.moveTo(arm.x, arm.y);
    ctx.quadraticCurveTo(arm.x + arm.length * 0.35, arm.y - lift * 0.35, endX, endY);
    ctx.stroke();
    ctx.fillStyle = "#fff7e6";
    ctx.beginPath();
    ctx.arc(endX, endY, Math.max(2.2, w * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawChargeBar(dino) {
  const pct = dino.charge / chargeTimeMax;
  const rider = riderOn(dino);
  const x = dino.x + dino.w / 2 - 28;
  const y = rider ? rider.y - 18 : dino.y - 20;
  ctx.fillStyle = "rgba(8,9,12,0.78)";
  roundedRect(x, y, 56, 8, 4);
  ctx.fill();
  ctx.fillStyle = rider ? (pct >= superCatapultCharge ? "#b98cff" : "#7fd0ff") : pct > 0.78 ? "#ff6b57" : "#ffdb66";
  roundedRect(x + 2, y + 2, 52 * pct, 4, 3);
  ctx.fill();
}

function drawVignette(w, h) {
  const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.74);
  grd.addColorStop(0, "rgba(10,0,30,0)");
  grd.addColorStop(0.7, "rgba(10,0,30,0.12)");
  grd.addColorStop(1, "rgba(6,0,20,0.5)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
}

function drawConfetti(w, h) {
  if (!transition.active) return;
  ctx.save();
  ctx.globalAlpha = 1 - smoothstep((transition.timer - (transition.mode === "next" ? LAUNCH.ignite + 2.3 : 1.4)) / 1.1);
  for (const bit of transition.confetti) {
    if (bit.y > h + 30) continue;
    ctx.save();
    ctx.translate(bit.x, bit.y);
    ctx.rotate(bit.rotation);
    ctx.fillStyle = bit.color;
    roundedRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h, 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawFade(w, h) {
  let alpha = 0;
  if (transition.active) {
    alpha = transition.mode === "next"
      ? smoothstep((transition.timer - LAUNCH.fadeStart) / (LAUNCH.fadeEnd - LAUNCH.fadeStart))
      : smoothstep((transition.timer - 1.3) / 1.0);
  }
  if (levelIntro && levelIntro.t < levelIntro.dur) alpha = Math.max(alpha, 1 - smoothstep(levelIntro.t / (levelIntro.dur * 0.85)));
  if (alpha <= 0.001) return;
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.fillRect(0, 0, w, h);
}

function showMessage(text) {
  if (levelIntro && !levelIntro.shown && text !== levelIntro.message) levelIntro.shown = true;
  hud.message.textContent = text;
  hud.message.classList.remove("is-hidden");
  hud.message.classList.remove("pop");
  void hud.message.offsetWidth;
  hud.message.classList.add("pop");
  messageTimer = 2.8;
}

function createAudio() {
  let context = null;
  let compressor;
  let master;
  let sfxBus;
  let musicBus;
  let reverbSend;
  let noiseBuffer;
  let musicOn = true;
  let musicTimer = null;
  let musicStep = 0;
  let nextStepTime = 0;
  const musicVolume = 0.2;
  const activeScreams = new Map();
  const lastPlayed = new Map();

  // ---------- Infraestructura ----------
  function unlock() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    if (!context) setup(new AudioCtor());
    if (context.state === "suspended") context.resume().catch(() => {});
    startMusic();
  }

  function setup(ctx) {
    context = ctx;
    compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-16, 0);
    compressor.knee.setValueAtTime(12, 0);
    compressor.ratio.setValueAtTime(4, 0);
    compressor.attack.setValueAtTime(0.004, 0);
    compressor.release.setValueAtTime(0.22, 0);
    master = context.createGain();
    master.gain.setValueAtTime(0.95, 0);
    compressor.connect(master);
    master.connect(context.destination);

    sfxBus = context.createGain();
    sfxBus.gain.setValueAtTime(1, 0);
    sfxBus.connect(compressor);

    musicBus = context.createGain();
    musicBus.gain.setValueAtTime(musicOn ? musicVolume : 0.0001, 0);
    musicBus.connect(compressor);

    // Eco de cueva: reverb generada.
    const reverb = context.createConvolver();
    reverb.buffer = makeImpulse(2.4, 2.8);
    reverbSend = context.createGain();
    reverbSend.gain.setValueAtTime(1, 0);
    const reverbTone = context.createBiquadFilter();
    reverbTone.type = "lowpass";
    reverbTone.frequency.setValueAtTime(3800, 0);
    const reverbReturn = context.createGain();
    reverbReturn.gain.setValueAtTime(0.55, 0);
    reverbSend.connect(reverbTone);
    reverbTone.connect(reverb);
    reverb.connect(reverbReturn);
    reverbReturn.connect(compressor);

    noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  function makeImpulse(seconds, decay) {
    const length = Math.floor(context.sampleRate * seconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const early = i < context.sampleRate * 0.09 && i % 997 < 6 ? 0.6 : 0;
        data[i] = ((Math.random() * 2 - 1) + early) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function envelope(gainNode, t, vol, attack, dur) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.max(0.003, attack));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function route(node, bus, verb, vol = 1) {
    node.connect(bus);
    if (verb > 0) {
      const send = context.createGain();
      send.gain.setValueAtTime(verb * vol, 0);
      node.connect(send);
      send.connect(reverbSend);
    }
  }

  // Un oscilador con envolvente, glissando, vibrato y filtro opcionales.
  function tone({ f, to = f, dur = 0.2, type = "sine", vol = 0.08, at = 0, time = null, attack = 0.008, glide = 0.75, vib = 0, vibRate = 6, cutoff = 0, q = 0.8, verb = 0.12, bus = sfxBus, detune = 0 }) {
    const t = time ?? context.currentTime + at;
    const osc = context.createOscillator();
    osc.type = type;
    osc.detune.setValueAtTime(detune, t);
    osc.frequency.setValueAtTime(f, t);
    if (to !== f) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur * glide);
    let last = osc;
    if (cutoff) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(cutoff, t);
      filter.Q.setValueAtTime(q, t);
      last.connect(filter);
      last = filter;
    }
    const gain = context.createGain();
    envelope(gain, t, vol, attack, dur);
    last.connect(gain);
    route(gain, bus, verb);
    let lfo = null;
    if (vib) {
      lfo = context.createOscillator();
      const lfoGain = context.createGain();
      lfo.frequency.setValueAtTime(vibRate, t);
      lfoGain.gain.setValueAtTime(vib, t);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // Ruido filtrado (golpes, soplidos, chispazos).
  function noise({ dur = 0.1, vol = 0.08, at = 0, time = null, filter = "lowpass", from = 800, to = from, q = 0.8, attack = 0.004, verb = 0.1, bus = sfxBus }) {
    const t = time ?? context.currentTime + at;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const biquad = context.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(from, t);
    if (to !== from) biquad.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    biquad.Q.setValueAtTime(q, t);
    const gain = context.createGain();
    envelope(gain, t, vol, attack, dur);
    source.connect(biquad);
    biquad.connect(gain);
    route(gain, bus, verb);
    source.start(t, Math.random() * 1.5, dur + 0.05);
  }

  function arpeggio(notes, { step = 0.07, at = 0, dur = 0.22, type = "triangle", vol = 0.06, verb = 0.25, vib = 0 } = {}) {
    notes.forEach((n, i) => tone({ f: midi(n), dur, type, vol, at: at + i * step, verb, vib, vibRate: 5.5 }));
  }

  function sparkle(at = 0, count = 5, vol = 0.03) {
    const scale = [96, 98, 100, 103, 105, 108];
    for (let i = 0; i < count; i += 1) {
      tone({ f: midi(scale[(Math.random() * scale.length) | 0]), dur: 0.18, type: "sine", vol, at: at + i * 0.055, verb: 0.45 });
    }
  }

  // ---------- Música ----------
  function startMusic() {
    if (!context || musicTimer) return;
    nextStepTime = context.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 60);
  }

  function toggleMusic() {
    musicOn = !musicOn;
    if (!context || !musicBus) return;
    const now = context.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), now);
    musicBus.gain.exponentialRampToValueAtTime(musicOn ? musicVolume : 0.0001, now + 0.3);
  }

  function isMusicOn() {
    return musicOn;
  }

  // Sol mayor, aventura alegre: Sol – Mim – Do – Re.
  const stepDur = 60 / 104 / 2;
  const chords = [
    [55, 59, 62],
    [52, 55, 59],
    [48, 52, 55],
    [50, 54, 57],
  ];
  const melodyA = [
    74, null, 71, 74, 76, null, 74, null,
    71, null, 67, 71, 74, null, null, null,
    72, null, 76, 72, 71, null, 67, null,
    69, null, 71, 74, 69, null, null, null,
  ];
  const melodyB = [
    79, null, 78, 76, 74, null, 71, null,
    76, null, 74, 71, 67, null, null, null,
    76, 74, 72, null, 76, null, 79, null,
    78, null, 74, null, 81, null, null, null,
  ];

  function scheduleMusic() {
    if (!context) return;
    const horizon = context.currentTime + 0.25;
    if (nextStepTime < context.currentTime) nextStepTime = context.currentTime + 0.05;
    while (nextStepTime < horizon) {
      if (musicOn) scheduleStep(musicStep, nextStepTime);
      nextStepTime += stepDur;
      musicStep += 1;
    }
  }

  function scheduleStep(step, time) {
    const inBar = step % 8;
    const bar = Math.floor(step / 8) % 4;
    const loop = Math.floor(step / 32);
    const chord = chords[bar];
    const bus = musicBus;
    // Bajo
    if (inBar === 0 || inBar === 4) tone({ f: midi(chord[0] - 12), dur: stepDur * 3.4, type: "triangle", vol: 0.16, time, attack: 0.01, verb: 0.05, bus });
    if (inBar === 6) tone({ f: midi(chord[2] - 12), dur: stepDur * 1.6, type: "triangle", vol: 0.1, time, verb: 0.05, bus });
    // Arpegio punteado
    const arpNote = chord[[0, 1, 2, 1][inBar % 4]] + 12;
    tone({ f: midi(arpNote), dur: stepDur * 1.2, type: "triangle", vol: 0.045, time, cutoff: 2400, verb: 0.2, bus });
    // Melodía (alterna A y B; se toma un respiro cada cuatro vueltas)
    if (loop % 4 !== 3) {
      const melody = loop % 2 === 0 ? melodyA : melodyB;
      const n = melody[step % 32];
      if (n) tone({ f: midi(n), dur: stepDur * 1.8, type: "sine", vol: 0.075, time, attack: 0.02, vib: 4, vibRate: 5, verb: 0.3, bus });
    }
    // Percusión suave
    if (inBar === 0 || inBar === 4) tone({ f: 130, to: 45, dur: 0.16, type: "sine", vol: 0.13, time, glide: 0.5, verb: 0, bus });
    if (inBar === 2 || inBar === 6) noise({ dur: 0.09, vol: 0.035, time, filter: "bandpass", from: 1800, q: 0.7, verb: 0.15, bus });
    if (inBar % 2 === 1) noise({ dur: 0.035, vol: 0.018, time, filter: "highpass", from: 7000, verb: 0, bus });
  }

  // ---------- Gritos al caer ----------
  function startScream(id) {
    if (!context) return false;
    if (activeScreams.has(id)) return true;
    const now = context.currentTime;
    const lucky = id === "lucky";
    const base = lucky ? 880 : 420;
    const osc = context.createOscillator();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    const formant = context.createBiquadFilter();
    const gain = context.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.62, now + 2.5);
    lfo.frequency.setValueAtTime(lucky ? 9 : 6.5, now);
    lfoGain.gain.setValueAtTime(lucky ? 45 : 26, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    formant.type = "bandpass";
    formant.frequency.setValueAtTime(lucky ? 1500 : 900, now);
    formant.Q.setValueAtTime(1.6, now);
    osc.connect(formant);
    formant.connect(gain);
    route(gain, sfxBus, 0.25);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(lucky ? 0.11 : 0.13, now + 0.1);
    osc.start(now);
    lfo.start(now);
    activeScreams.set(id, { osc, lfo, gain });
    return true;
  }

  function stopScream(id) {
    if (!context || !activeScreams.has(id)) return;
    const scream = activeScreams.get(id);
    const now = context.currentTime;
    scream.gain.gain.cancelScheduledValues(now);
    scream.gain.gain.setValueAtTime(Math.max(0.0001, scream.gain.gain.value), now);
    scream.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    scream.osc.stop(now + 0.1);
    scream.lfo.stop(now + 0.1);
    activeScreams.delete(id);
  }

  function stopAllScreams() {
    for (const id of Array.from(activeScreams.keys())) stopScream(id);
  }

  // ---------- Efectos ----------
  function play(type, opts = {}) {
    if (!context) return;
    // Evita que el mismo sonido se amontone en el mismo instante.
    const nowMs = performance.now();
    const minGap = { rung: 90, babyHey: 120, babyEek: 200, land: 60 }[type] ?? 25;
    if (nowMs - (lastPlayed.get(type) || 0) < minGap) return;
    lastPlayed.set(type, nowMs);
    const papa = opts.id === "papa";
    const p = papa ? 0.55 : 1;
    const sounds = {
      jump() {
        tone({ f: 260 * p, to: 640 * p, dur: 0.16, type: "square", vol: 0.05, cutoff: 1800, glide: 0.6, verb: 0.08 });
        tone({ f: 330 * p, to: 820 * p, dur: 0.14, type: "sine", vol: 0.07, glide: 0.6, verb: 0.08 });
      },
      charge() {
        noise({ dur: 0.32, vol: 0.09, filter: "bandpass", from: 420, to: 2800, q: 1.4, verb: 0.15 });
        tone({ f: 160 * p, to: 760 * p, dur: 0.3, type: "triangle", vol: 0.09, vib: 18, vibRate: 22, verb: 0.12 });
      },
      land() {
        tone({ f: 130 * p, to: 52, dur: 0.14, type: "sine", vol: 0.14, glide: 0.5, verb: 0.05 });
        noise({ dur: 0.08, vol: 0.05, filter: "lowpass", from: 420, verb: 0.05 });
      },
      ouch() {
        noise({ dur: 0.12, vol: 0.09, filter: "lowpass", from: 600, verb: 0.1 });
        tone({ f: 440 * p, to: 260 * p, dur: 0.16, type: "square", vol: 0.05, cutoff: 1100, vib: 20, vibRate: 30 });
        tone({ f: 300 * p, to: 170 * p, dur: 0.24, type: "triangle", vol: 0.08, at: 0.08, verb: 0.15 });
      },
      stomp() {
        noise({ dur: 0.1, vol: 0.1, filter: "bandpass", from: 1400, to: 300, q: 2 });
        tone({ f: 280, to: 980, dur: 0.2, type: "triangle", vol: 0.08, at: 0.03, verb: 0.2 });
        tone({ f: 1500, to: 1900, dur: 0.06, type: "sine", vol: 0.03, at: 0.01 });
      },
      beetle() {
        // Trombón triste: wah, wah, wah, waaah.
        [67, 66, 65].forEach((n, i) => tone({ f: midi(n - 12), dur: 0.3, type: "sawtooth", vol: 0.07, at: i * 0.32, cutoff: 1100, attack: 0.03, verb: 0.2 }));
        tone({ f: midi(52), to: midi(51), dur: 1.0, type: "sawtooth", vol: 0.08, at: 0.98, cutoff: 1000, attack: 0.03, vib: 6, vibRate: 5, verb: 0.3 });
      },
      coin() {
        const step = Math.min(10, opts.step || 0);
        tone({ f: midi(83 + step), dur: 0.09, type: "square", vol: 0.035, cutoff: 4200, verb: 0.15 });
        tone({ f: midi(88 + step), dur: 0.42, type: "sine", vol: 0.08, at: 0.075, verb: 0.3 });
        tone({ f: midi(100 + step), dur: 0.3, type: "sine", vol: 0.02, at: 0.075, verb: 0.4 });
      },
      allCoins() {
        arpeggio([72, 76, 79, 84], { at: 0.18, step: 0.08, dur: 0.24, vol: 0.07 });
        [84, 88, 91].forEach((n) => tone({ f: midi(n), dur: 0.9, type: "triangle", vol: 0.045, at: 0.52, attack: 0.02, vib: 3, verb: 0.4 }));
        sparkle(0.55, 6);
      },
      levelStart() {
        arpeggio([67, 71, 74, 79], { step: 0.09, dur: 0.2, vol: 0.06 });
        tone({ f: midi(83), dur: 0.5, type: "sine", vol: 0.06, at: 0.36, vib: 4, verb: 0.4 });
      },
      board() {
        noise({ dur: 0.07, vol: 0.08, filter: "bandpass", from: 900, q: 3 });
        tone({ f: 140, to: 90, dur: 0.12, type: "square", vol: 0.05, cutoff: 700 });
        tone({ f: 420, to: 1300, dur: 0.28, type: "sine", vol: 0.08, at: 0.06, verb: 0.3 });
        sparkle(0.2, 3, 0.025);
      },
      ladder() {
        for (let i = 0; i < 9; i += 1) {
          noise({ dur: 0.035, vol: 0.09 - i * 0.006, at: i * 0.075, filter: "bandpass", from: 2000 - i * 90, q: 5, verb: 0.2 });
          tone({ f: 640 - i * 38, dur: 0.06, type: "triangle", vol: 0.05, at: i * 0.075, verb: 0.1 });
        }
        noise({ dur: 0.6, vol: 0.04, at: 0.05, filter: "bandpass", from: 3000, to: 1200, q: 0.6, verb: 0.2 });
      },
      ladderLand() {
        tone({ f: 190, to: 110, dur: 0.18, type: "triangle", vol: 0.12, verb: 0.3 });
        noise({ dur: 0.08, vol: 0.08, filter: "bandpass", from: 900, q: 2, verb: 0.3 });
      },
      rung() {
        const f = 480 + Math.random() * 80;
        tone({ f, to: f * 0.9, dur: 0.06, type: "triangle", vol: 0.05, verb: 0.15 });
        noise({ dur: 0.025, vol: 0.04, filter: "bandpass", from: 2200, q: 4 });
      },
      rocket() {
        noise({ dur: 0.7, vol: 0.28, filter: "lowpass", from: 260, to: 120, verb: 0.3 });
        noise({ dur: 2.4, vol: 0.2, at: 0.1, filter: "lowpass", from: 300, to: 1600, attack: 0.5, verb: 0.25 });
        tone({ f: 55, to: 38, dur: 1.8, type: "sawtooth", vol: 0.12, cutoff: 260, attack: 0.1 });
        tone({ f: 380, to: 2600, dur: 1.9, type: "sine", vol: 0.04, at: 0.3, glide: 0.95, verb: 0.3 });
      },
      win() {
        const at = 0.7;
        arpeggio([67, 72, 76, 79], { at, step: 0.11, dur: 0.24, vol: 0.07 });
        [79, 84, 88].forEach((n) => tone({ f: midi(n), dur: 1.2, type: "triangle", vol: 0.05, at: at + 0.48, attack: 0.03, vib: 4, verb: 0.45 }));
        tone({ f: midi(91), dur: 1.1, type: "sine", vol: 0.05, at: at + 0.48, vib: 5, verb: 0.5 });
        sparkle(at + 0.5, 8);
      },
      bubble() {
        [0, 0.12, 0.25].forEach((t, i) => tone({ f: 220 + i * 90, to: 520 + i * 160, dur: 0.18, type: "sine", vol: 0.09, at: t, vib: 30, vibRate: 14, verb: 0.35 }));
        noise({ dur: 0.3, vol: 0.03, filter: "bandpass", from: 600, to: 1400, q: 3, verb: 0.3 });
      },
      pop() {
        noise({ dur: 0.05, vol: 0.14, filter: "highpass", from: 1800, verb: 0.2 });
        tone({ f: 600, to: 1900, dur: 0.09, type: "sine", vol: 0.1, glide: 0.4 });
        sparkle(0.05, 4, 0.025);
      },
      rescue() {
        arpeggio([72, 76, 79], { at: 0.12, step: 0.07, dur: 0.14, type: "square", vol: 0.03 });
        tone({ f: midi(84), dur: 0.55, type: "triangle", vol: 0.07, at: 0.33, vib: 5, verb: 0.4 });
        tone({ f: midi(88), dur: 0.55, type: "sine", vol: 0.04, at: 0.33, verb: 0.4 });
      },
      hatch() {
        // Crac… crac… ¡crac! y ¡pío-pío!
        [0, 0.22, 0.4].forEach((t, i) => {
          noise({ dur: 0.045, vol: 0.09 + i * 0.03, at: t, filter: "highpass", from: 1400, verb: 0.2 });
          tone({ f: 900 + i * 200, to: 600, dur: 0.04, type: "square", vol: 0.025, at: t, cutoff: 3000 });
        });
        noise({ dur: 0.16, vol: 0.12, at: 0.56, filter: "bandpass", from: 2500, to: 900, q: 1, verb: 0.3 });
        tone({ f: midi(84), to: midi(91), dur: 0.14, type: "sine", vol: 0.08, at: 0.7, glide: 0.5, vib: 25, vibRate: 18, verb: 0.3 });
        tone({ f: midi(88), to: midi(96), dur: 0.18, type: "sine", vol: 0.08, at: 0.88, glide: 0.5, vib: 25, vibRate: 18, verb: 0.3 });
        sparkle(1.0, 6, 0.03);
      },
      babyEek() {
        tone({ f: 1500, to: 2400, dur: 0.1, type: "square", vol: 0.03, cutoff: 3200, vib: 60, vibRate: 30 });
        tone({ f: 1800, to: 2700, dur: 0.09, type: "square", vol: 0.025, at: 0.11, cutoff: 3200 });
      },
      babyHey() {
        const f = 1050 + Math.random() * 250;
        tone({ f, to: f * 1.45, dur: 0.08, type: "sine", vol: 0.05, glide: 0.5, vib: 20, vibRate: 20, verb: 0.2 });
        tone({ f: f * 1.25, to: f * 1.8, dur: 0.1, type: "sine", vol: 0.045, at: 0.09, glide: 0.5, vib: 20, vibRate: 20, verb: 0.2 });
      },
      farewell() {
        // «¡A-diós!» dulce, con un acorde que se queda flotando.
        tone({ f: midi(84), dur: 0.26, type: "sine", vol: 0.07, vib: 6, vibRate: 6, verb: 0.4 });
        tone({ f: midi(79), dur: 0.6, type: "sine", vol: 0.07, at: 0.26, vib: 8, vibRate: 5.5, verb: 0.45 });
        tone({ f: midi(76), dur: 0.26, type: "triangle", vol: 0.035, verb: 0.4 });
        tone({ f: midi(72), dur: 0.6, type: "triangle", vol: 0.035, at: 0.26, verb: 0.45 });
        [72, 76, 79, 84].forEach((n) => tone({ f: midi(n), dur: 1.3, type: "sine", vol: 0.02, at: 0.85, attack: 0.25, verb: 0.6 }));
      },
      flap() {
        for (let i = 0; i < 7; i += 1) noise({ dur: 0.07, vol: 0.08 - i * 0.008, at: i * 0.13, filter: "lowpass", from: 1100, to: 400, verb: 0.15 });
        tone({ f: 700, to: 1700, dur: 0.9, type: "sine", vol: 0.03, at: 0.1, glide: 0.95, vib: 15, vibRate: 7, verb: 0.4 });
        sparkle(0.4, 5, 0.022);
      },
      catapult() {
        noise({ dur: 0.42, vol: 0.12, filter: "bandpass", from: 500, to: 3500, q: 1.2, verb: 0.2 });
        tone({ f: 140, to: 900, dur: 0.4, type: "triangle", vol: 0.11, vib: 40, vibRate: 16, verb: 0.2 });
        tone({ f: 280, to: 1800, dur: 0.36, type: "sine", vol: 0.05, at: 0.04, verb: 0.2 });
        if (opts.super) {
          arpeggio([84, 88, 91, 96, 100], { at: 0.12, step: 0.05, dur: 0.22, type: "sine", vol: 0.05, verb: 0.45 });
          sparkle(0.35, 6, 0.03);
        }
      },
      superReady() {
        tone({ f: midi(88), dur: 0.35, type: "sine", vol: 0.07, verb: 0.4 });
        tone({ f: midi(95), dur: 0.45, type: "sine", vol: 0.05, at: 0.06, verb: 0.45 });
      },
      rocketReady() {
        sounds.board();
      },
      nope() {
        tone({ f: midi(76), to: midi(74), dur: 0.16, type: "triangle", vol: 0.07, verb: 0.25 });
        tone({ f: midi(71), to: midi(69), dur: 0.28, type: "triangle", vol: 0.07, at: 0.15, verb: 0.3 });
      },
      motor() {
        const d = opts.dur || 4.5;
        tone({ f: midi(81), dur: 0.12, type: "square", vol: 0.03, cutoff: 2500 });
        tone({ f: midi(76), dur: 0.12, type: "square", vol: 0.03, cutoff: 2500, at: 0.16 });
        tone({ f: 62, to: 104, dur: d, type: "sawtooth", vol: 0.075, cutoff: 520, attack: 0.35, glide: 0.95, vib: 5, vibRate: 32, verb: 0.15 });
        tone({ f: 380, to: 760, dur: d, type: "square", vol: 0.016, cutoff: 1500, attack: 0.5, glide: 0.95, vib: 12, vibRate: 7, verb: 0.2 });
        tone({ f: 124, to: 208, dur: d, type: "triangle", vol: 0.05, attack: 0.4, glide: 0.95, vib: 3, vibRate: 22 });
        noise({ dur: d, vol: 0.035, filter: "bandpass", from: 800, to: 1500, q: 1.4, attack: 0.5, verb: 0.15 });
        for (let i = 0; i < Math.floor((d - 0.3) / 0.14); i += 1) {
          noise({ dur: 0.018, vol: 0.035, at: 0.3 + i * 0.14, filter: "bandpass", from: 2600, q: 7, verb: 0.05 });
        }
      },
      locked() {
        noise({ dur: 0.12, vol: 0.16, filter: "lowpass", from: 900, to: 200, verb: 0.3 });
        tone({ f: 150, to: 80, dur: 0.22, type: "square", vol: 0.07, cutoff: 600 });
        tone({ f: midi(88), dur: 0.5, type: "sine", vol: 0.06, at: 0.18, verb: 0.45 });
        tone({ f: midi(95), dur: 0.6, type: "sine", vol: 0.05, at: 0.28, verb: 0.5 });
        sparkle(0.3, 5, 0.03);
      },
      yay() {
        tone({ f: midi(79), to: midi(86), dur: 0.22, type: "sine", vol: 0.07, glide: 0.5, vib: 18, vibRate: 14, verb: 0.3 });
        tone({ f: midi(84), to: midi(91), dur: 0.3, type: "sine", vol: 0.06, at: 0.18, glide: 0.5, vib: 18, vibRate: 14, verb: 0.35 });
        tone({ f: midi(55), to: midi(62), dur: 0.3, type: "triangle", vol: 0.08, at: 0.05, glide: 0.5, vib: 8, vibRate: 9, verb: 0.3 });
        sparkle(0.35, 4, 0.025);
      },
      countdown() {
        [0, 0.36, 0.72].forEach((at) => tone({ f: midi(81), dur: 0.12, type: "sine", vol: 0.07, at, verb: 0.3 }));
        tone({ f: midi(93), dur: 0.3, type: "sine", vol: 0.08, at: 1.05, verb: 0.4 });
        noise({ dur: 1.15, vol: 0.12, filter: "lowpass", from: 140, to: 420, attack: 0.9, verb: 0.2 });
        tone({ f: 42, to: 58, dur: 1.15, type: "sawtooth", vol: 0.07, cutoff: 220, attack: 0.8 });
      },
      twinkle() {
        tone({ f: midi(96), to: midi(103), dur: 0.6, type: "sine", vol: 0.06, glide: 0.4, verb: 0.55 });
        sparkle(0.05, 7, 0.035);
      },
    };
    (sounds[type] || (() => tone({ f: 360, to: 640, dur: 0.14, type: "square", vol: 0.04, cutoff: 2000 })))();
  }

  return { unlock, play, toggleMusic, isMusicOn, startScream, stopScream, stopAllScreams };
}

function roundedRect(x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function fract(value) {
  return value - Math.floor(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ---------- Mini dinos (bebés) ----------


function makeEgg(number) {
  if (eggsTaken.has(number)) return null;
  const exitApproachY = world.topY + rocketGap;
  const coinYs = world.coins.map((coin) => coin.y + 44);
  const candidates = world.platforms.filter((p) => p.kind === "stone" && p.y !== exitApproachY && p.y < world.floorY - 60 && !coinYs.some((y) => Math.abs(y - p.y) < 2));
  const pool = candidates.length ? candidates : world.platforms.filter((p) => p.kind === "stone");
  if (!pool.length) return null;
  const platform = pool[Math.floor(pseudoRandom(number, 7, 211) * pool.length) % pool.length];
  return {
    x: clamp(platform.x + platform.w * lerp(0.25, 0.75, pseudoRandom(number, 8, 212)), platform.x + 20, platform.x + platform.w - 20),
    y: platform.y,
    wobble: 0,
    hatched: false,
  };
}

function makeBaby(x, y, owner) {
  const colors = babyPalette[babiesBorn % babyPalette.length];
  babiesBorn += 1;
  const size = 25;
  return {
    body: colors.body,
    shade: colors.shade,
    w: size * 0.95,
    h: size * 1.15,
    x: x - size / 2,
    y: y - size * 1.15,
    vx: 0,
    vy: -260,
    facing: 1,
    grounded: false,
    platform: null,
    dropThrough: null,
    dropTime: 0,
    state: "follow",
    stateTime: 0,
    target: null,
    jumpCooldown: 0.3,
    stuckTime: 0,
    lastX: x,
    blink: 0,
    blinkTimer: 1 + Math.random() * 2,
    seed: Math.random() * 10,
    number: babiesBorn,
    inRocket: false,
    owner,
    controlled: false,
  };
}

function placeBabiesForLevel() {
  departingBabies = [];
  babies.forEach((baby, i) => {
    baby.x = world.startX + (i - 1) * 34 - baby.w / 2;
    baby.y = world.floorY - baby.h;
    baby.vx = 0;
    baby.vy = 0;
    baby.grounded = true;
    baby.platform = null;
    baby.state = "follow";
    baby.stateTime = 0;
    baby.target = null;
    baby.dropThrough = null;
    baby.inRocket = false;
  });
}

function updateEgg(dt) {
  const egg = world.egg;
  if (!egg || egg.hatched) return;
  egg.wobble += dt;
  for (const dino of dinos) {
    if (dino.inHouse || dino.inRocket || dino.bubble) continue;
    const box = dinoCollisionBox(dino);
    if (rectsOverlap(box, { x: egg.x - 13, y: egg.y - 34, w: 26, h: 34 })) {
      hatchEgg(egg, dino);
      return;
    }
  }
}

function hatchEgg(egg, hatcher = null) {
  egg.hatched = true;
  eggsTaken.add(levelNumber);
  spawnSparkles(egg.x, egg.y - 16, 30, 2.2);
  audio.play("hatch");
  const hatcherId = hatcher ? hatcher.id : (babies.some((b) => b.owner === "papa") ? "lucky" : "papa");
  const otherId = hatcherId === "lucky" ? "papa" : "lucky";
  const owner = !babies.some((b) => b.owner === hatcherId) ? hatcherId : !babies.some((b) => b.owner === otherId) ? otherId : hatcherId;
  const ownerName = owner === "lucky" ? "Lucky" : "Papa";
  const previous = babies.find((b) => b.owner === owner);
  if (previous) {
    babies = babies.filter((b) => b !== previous);
    departingBabies.push({ baby: previous, time: 0, x: previous.x, y: previous.y, vy: 0, done: false });
  }
  babies.push(makeBaby(egg.x, egg.y, owner));
  showMessage(previous ? `¡Nuevo mini dino para ${ownerName}! El mayor ya es grande y se va de aventura 👋` : `¡Ha nacido el mini dino de ${ownerName}!`);
}

function ownerOf(baby) {
  return dinos.find((d) => d.id === baby.owner) || null;
}

function babyOf(dino) {
  return babies.find((b) => b.owner === dino.id) || null;
}

function babyLeader(baby) {
  const owner = ownerOf(baby);
  if (owner && !owner.inRocket && !owner.bubble) return owner;
  const other = dinos.find((d) => d !== owner && !d.inRocket && !d.bubble && !d.inHouse);
  return other || owner;
}

function updateBabies(dt) {
  for (const entry of departingBabies) updateDepartingBaby(entry, dt);
  departingBabies = departingBabies.filter((entry) => !entry.done);
  babies.forEach((baby, index) => updateBaby(baby, index, dt));
  for (const baby of babies) updateBodyAnim(baby, dt, baby.state === "climb");
  if (babyLadderReady() && babies.length && !babies.every((b) => b.inRocket) && dinos.every((d) => d.inRocket) && !world.babyWaitShown) {
    world.babyWaitShown = true;
    showMessage("¡El cohete espera a los mini dinos!");
  }
}

function setBabyState(baby, state, target = null) {
  baby.state = state;
  baby.stateTime = 0;
  baby.target = target;
}

function updateBaby(baby, index, dt) {
  baby.stateTime += dt;
  baby.jumpCooldown = Math.max(0, baby.jumpCooldown - dt);
  baby.dropTime = Math.max(0, baby.dropTime - dt);
  if (baby.dropTime <= 0) baby.dropThrough = null;
  baby.blinkTimer -= dt;
  if (baby.blinkTimer <= 0) {
    baby.blink = 0.14;
    baby.blinkTimer = 1.5 + Math.random() * 2.5;
  }
  baby.blink = Math.max(0, baby.blink - dt);

  if (baby.inRocket) return;
  const owner = ownerOf(baby);
  if (owner && owner.bubble && !owner.inRocket) {
    updateControlledBaby(baby, owner, dt);
    return;
  }
  if (baby.controlled) {
    baby.controlled = false;
    setBabyState(baby, "follow");
  }
  if (baby.state === "climb") {
    updateBabyClimb(baby, dt);
    return;
  }
  if (baby.state === "fly") {
    updateBabyFly(baby, dt);
    return;
  }
  if (babyLadderReady() && baby.state !== "toRocket") setBabyState(baby, "toRocket");

  const leader = babyLeader(baby);
  const cx = baby.x + baby.w / 2;
  const bottom = baby.y + baby.h;

  if (baby.state === "toRocket") {
    const ladder = world.ladder;
    const lx = ladder.x + ladder.w / 2;
    if (Math.abs(lx - cx) < 16 && Math.abs(bottom - ladder.bottom) < 24) {
      setBabyState(baby, "climb");
      baby.vx = 0;
      baby.vy = 0;
      return;
    }
    moveBabyToward(baby, lx, ladder.bottom, 200, dt);
    integrateBaby(baby, dt);
    const dist = distance(baby.x + baby.w / 2, baby.y + baby.h, lx, ladder.bottom);
    if (baby.bestDist == null || dist < baby.bestDist - 25) {
      baby.bestDist = dist;
      baby.stuckTime = 0;
    } else {
      baby.stuckTime += dt;
    }
    if (baby.stuckTime > 4) {
      setBabyState(baby, "fly");
      baby.bestDist = null;
      baby.stuckTime = 0;
      audio.play("babyHey");
    }
    return;
  }

  // Si se ha quedado muy lejos, se teletransporta junto a la familia.
  if (leader && !leader.inHouse && distance(cx, bottom, leader.x + leader.w / 2, leader.y + leader.h) > 1100) {
    teleportBaby(baby, leader, index);
    return;
  }

  // Miedo: escarabajo cerca.
  const scaryBeetle = beetles.find((b) => Math.abs(b.x + b.w / 2 - cx) < 95 && Math.abs(b.y + b.h - bottom) < 45);
  if (scaryBeetle && baby.state !== "scared") {
    setBabyState(baby, "scared", scaryBeetle);
    audio.play("babyEek");
  }

  let targetX = cx;
  let targetBottom = bottom;
  let speed = 150;

  if (baby.state === "scared") {
    const beetle = baby.target;
    const away = beetle ? (cx < beetle.x + beetle.w / 2 ? -1 : 1) : -baby.facing;
    if (leader && !leader.inHouse) {
      const behind = leader.x + leader.w / 2 + away * (leader.w * 0.4 + 12);
      targetX = behind;
      targetBottom = leader.y + leader.h;
    } else {
      targetX = cx + away * 80;
    }
    speed = 240;
    if (baby.stateTime > 1.4 && (!beetle || !beetles.includes(beetle) || Math.abs(beetle.x - baby.x) > 140)) setBabyState(baby, "follow");
  } else if (baby.state === "celebrate") {
    targetX = cx;
    if (baby.grounded && baby.jumpCooldown <= 0) {
      baby.vy = -330;
      baby.grounded = false;
      baby.platform = null;
      baby.jumpCooldown = 0.35;
      spawnSparkles(cx, baby.y, 3, 0.8);
    }
    if (baby.stateTime > 1.3) setBabyState(baby, "follow");
  }

  if (baby.state === "follow") {
    if (leader && leader.inHouse) {
      targetX = world.startX + (index - 1) * 34;
      targetBottom = world.floorY;
    } else if (leader) {
      const slot = 26 + index * 26;
      targetX = leader.x + leader.w / 2 - leader.facing * (leader.w * 0.5 + slot);
      targetBottom = leader.y + leader.h;
      speed = Math.abs(targetX - cx) > 140 ? 210 : 150;
    }
  }

  moveBabyToward(baby, targetX, targetBottom, speed, dt);
  integrateBaby(baby, dt);

  if (Math.abs(baby.x - baby.lastX) < 0.5 && Math.abs(targetX - (baby.x + baby.w / 2)) > 60) baby.stuckTime += dt;
  else baby.stuckTime = 0;
  baby.lastX = baby.x;
  if (baby.stuckTime > 3 && leader && !leader.inHouse) teleportBaby(baby, leader, index);
}

function moveBabyToward(baby, targetX, targetBottom, speed, dt) {
  const cx = baby.x + baby.w / 2;
  if (!baby.grounded) {
    if (baby.airTarget == null) {
      const dx = targetX - cx;
      baby.vx = lerp(baby.vx, Math.sign(dx) * Math.min(speed, Math.abs(dx) * 4), Math.min(1, dt * 3));
    }
    return;
  }
  baby.airTarget = null;

  const here = baby.platform;
  const goal = platformUnder(targetX, targetBottom);
  let walkX = targetX;
  if (here && goal && here !== goal) {
    const next = babyNextPlatform(here, goal);
    if (next) {
      const goingUp = next.y < here.y - 20;
      if (goingUp) {
        // Ir al punto de la plataforma actual más cercano a la siguiente y saltar.
        const takeoff = clamp(clamp(cx, next.x + 12, next.x + next.w - 12), here.x + 10, here.x + here.w - 10);
        walkX = takeoff;
        if (Math.abs(takeoff - cx) < 26 && baby.jumpCooldown <= 0) {
          jumpBabyToPlatform(baby, next, clamp(targetX, next.x + 16, next.x + next.w - 16));
          return;
        }
      } else {
        // Bajar: ponerse encima de la siguiente y dejarse caer, o salir por el borde.
        walkX = clamp(cx, next.x + 12, next.x + next.w - 12);
        if (Math.abs(walkX - cx) < 6 && here.kind !== "floor" && baby.jumpCooldown <= 0) {
          baby.dropThrough = here;
          baby.dropTime = 0.35;
          baby.grounded = false;
          baby.platform = null;
          baby.vy = -100;
          baby.vx = 0;
          baby.jumpCooldown = 0.4;
          return;
        }
        if (walkX === cx) walkX = cx;
      }
    }
  }

  const dx = walkX - cx;
  if (Math.abs(dx) > 4) {
    const desired = Math.sign(dx) * Math.min(speed, Math.abs(dx) * 5);
    baby.vx = lerp(baby.vx, desired, Math.min(1, dt * 10));
    baby.facing = dx < 0 ? -1 : 1;
  } else {
    baby.vx *= 0.6;
  }
}

function platformUnder(x, bottom) {
  let best = null;
  for (const p of world.platforms) {
    if (p.kind === "exit") continue;
    if (p.y < bottom - 12) continue;
    if (x < p.x - 10 || x > p.x + p.w + 10) continue;
    if (!best || p.y < best.y) best = p;
  }
  return best;
}

function babyCanHop(a, b) {
  if (b.kind === "exit") return false;
  const rise = a.y - b.y;
  const gap = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  if (rise > 20) return rise <= 235 && gap <= 190;
  return gap <= 240;
}

function babyNextPlatform(from, goal) {
  const queue = [from];
  const cameFrom = new Map([[from, null]]);
  while (queue.length) {
    const current = queue.shift();
    if (current === goal) break;
    for (const p of world.platforms) {
      if (cameFrom.has(p) || !babyCanHop(current, p)) continue;
      cameFrom.set(p, current);
      queue.push(p);
    }
  }
  if (!cameFrom.has(goal)) return null;
  let step = goal;
  while (cameFrom.get(step) !== from) step = cameFrom.get(step);
  return step;
}

function jumpBabyToPlatform(baby, platform, targetX) {
  const startX = baby.x + baby.w / 2;
  const landX = clamp(targetX, platform.x + 16, platform.x + platform.w - 16);
  const height = Math.max(60, baby.y + baby.h - platform.y + 40);
  const jumpVy = -Math.sqrt(2 * gravity * height);
  const airTime = Math.abs(jumpVy) / gravity + Math.sqrt(2 * 40 / gravity);
  baby.vx = clamp((landX - startX) / airTime, -300, 300);
  baby.vy = jumpVy;
  baby.facing = baby.vx < 0 ? -1 : 1;
  baby.grounded = false;
  baby.platform = null;
  baby.jumpCooldown = 0.5;
  baby.airTarget = landX;
}

function integrateBaby(baby, dt) {
  const previousBottom = baby.y + baby.h;
  baby.vy = Math.min(baby.vy + gravity * dt, 1400);
  baby.x += baby.vx * dt;
  baby.y += baby.vy * dt;
  baby.grounded = false;

  const wallY = baby.y + baby.h * 0.5;
  const leftWall = wallXAt(world.walls.left, wallY) + 8;
  const rightWall = wallXAt(world.walls.right, wallY) - 8;
  if (baby.x < leftWall) {
    baby.x = leftWall;
    baby.vx = Math.max(0, baby.vx);
  }
  if (baby.x + baby.w > rightWall) {
    baby.x = rightWall - baby.w;
    baby.vx = Math.min(0, baby.vx);
  }

  for (const platform of world.platforms) {
    if (platform.kind === "exit" || platform === baby.dropThrough) continue;
    if (baby.vy >= 0 && previousBottom <= platform.y + 8 && baby.y + baby.h >= platform.y) {
      if (baby.x + baby.w > platform.x && baby.x < platform.x + platform.w) {
        baby.y = platform.y - baby.h;
        baby.vy = 0;
        baby.grounded = true;
        baby.platform = platform;
        break;
      }
    }
  }
  if (baby.y + baby.h > world.floorY + 200) {
    baby.y = world.floorY - baby.h;
    baby.vy = 0;
  }
}

function teleportBaby(baby, leader, index) {
  spawnSparkles(baby.x + baby.w / 2, baby.y + baby.h / 2, 8, 1);
  baby.x = leader.x + leader.w / 2 - leader.facing * (leader.w * 0.5 + 26 + index * 26) - baby.w / 2;
  baby.y = leader.y + leader.h - baby.h - 30;
  baby.vx = 0;
  baby.vy = -120;
  baby.grounded = false;
  baby.platform = null;
  baby.stuckTime = 0;
  setBabyState(baby, "follow");
  spawnSparkles(baby.x + baby.w / 2, baby.y + baby.h / 2, 10, 1.2);
}

function babiesVisible() {
  return !(transition.active && transition.mode === "next" && transition.timer > 0.18);
}

function drawEgg() {
  const egg = world.egg;
  if (!egg || egg.hatched) return;
  const t = egg.wobble;
  const shake = Math.sin(t * 9) * (Math.sin(t * 1.3) > 0.6 ? 0.18 : 0.03);
  ctx.save();
  ctx.translate(egg.x, egg.y);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 2, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(shake);
  ctx.fillStyle = "#fff4dc";
  ctx.beginPath();
  ctx.ellipse(0, -17, 13, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#e0c9a0";
  ctx.lineWidth = 2;
  ctx.stroke();
  const spot = babyPalette[babiesBorn % babyPalette.length].body;
  ctx.fillStyle = spot;
  for (const [sx, sy, sr] of [[-5, -22, 3.5], [5, -12, 3], [4, -26, 2.2], [-6, -9, 2]]) {
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  const glow = 0.5 + Math.sin(t * 3) * 0.5;
  ctx.fillStyle = `rgba(255, 240, 160, ${0.15 + glow * 0.2})`;
  ctx.beginPath();
  ctx.arc(egg.x, egg.y - 17, 26, 0, Math.PI * 2);
  ctx.fill();
}

function drawBabies() {
  if (!babiesVisible()) return;
  for (const baby of babies) {
    if (baby.inRocket) continue;
    if (baby.state === "fly") drawBaby({ ...baby, grounded: false }, 1, Math.min(1, baby.stateTime / 0.5), baby.stateTime + 2);
    else drawBaby(baby, 1);
  }
}

function drawDepartingBabies() {
  if (!babiesVisible()) return;
  for (const entry of departingBabies) {
    const flying = entry.time > 1.8;
    drawBaby({ ...entry.baby, x: entry.x, y: entry.y, vx: 0, grounded: !flying, state: "bye", facing: 1 }, 1, Math.min(1, entry.time / 1.2), entry.time);
  }
}

function drawBaby(baby, alpha, wings = 0, wingTime = 0) {
  const time = performance.now() * 0.001;
  const w = baby.w;
  const h = baby.h;
  const ba = animOf(baby);
  const step = Math.sin(ba.phase * 1.4) * ba.walk + Math.sin(ba.climbPhase * 1.4) * ba.climb;
  const bob = ba.walk > 0.2 ? Math.abs(step) * 2 : Math.sin(time * 3 + baby.seed) * 0.8 * (1 - ba.air);
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (baby.grounded) {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(baby.x + w / 2, baby.y + h + 3, w * 0.45, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.translate(baby.x + w / 2, baby.y + h - bob);
  ctx.rotate(ba.lean + Math.sin(ba.climbPhase * 1.4) * 0.06 * ba.climb);
  ctx.scale((Math.abs(ba.face) < 0.08 ? 0.08 * Math.sign(ba.face || baby.facing) : ba.face) * ba.sx, ba.sy);
  ctx.translate(-w / 2, -h);

  if (wings > 0) drawBabyWings(baby, w, h, wings, wingTime);

  // cola
  ctx.fillStyle = baby.body;
  ctx.beginPath();
  ctx.moveTo(w * 0.15, h * 0.55);
  ctx.lineTo(-w * 0.3, h * 0.72 + Math.sin(time * 8 + baby.seed) * 2);
  ctx.lineTo(w * 0.2, h * 0.8);
  ctx.closePath();
  ctx.fill();
  // patas
  ctx.fillStyle = baby.shade;
  roundedRect(w * 0.2 + step * 2, h * 0.82, w * 0.22, h * 0.18, 4);
  ctx.fill();
  roundedRect(w * 0.55 - step * 2, h * 0.82, w * 0.22, h * 0.18, 4);
  ctx.fill();
  // cuerpo
  ctx.fillStyle = baby.body;
  roundedRect(w * 0.1, h * 0.42, w * 0.72, h * 0.48, 9);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  roundedRect(w * 0.3, h * 0.58, w * 0.36, h * 0.24, 6);
  ctx.fill();
  // cabeza grande
  ctx.fillStyle = baby.body;
  ctx.beginPath();
  ctx.ellipse(w * 0.6, h * 0.3, w * 0.42, h * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  // cáscara en la cabeza del más pequeño
  if (baby === babies[babies.length - 1] && babies.length > 0 && baby.state !== "bye") {
    ctx.fillStyle = "#fff4dc";
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h * 0.12);
    ctx.lineTo(w * 0.38, -h * 0.02);
    ctx.lineTo(w * 0.47, h * 0.06);
    ctx.lineTo(w * 0.56, -h * 0.06);
    ctx.lineTo(w * 0.66, h * 0.05);
    ctx.lineTo(w * 0.75, -h * 0.02);
    ctx.lineTo(w * 0.86, h * 0.12);
    ctx.quadraticCurveTo(w * 0.58, h * 0.2, w * 0.3, h * 0.12);
    ctx.fill();
  }
  // ojo grande
  const eyeX = w * 0.74;
  const eyeY = h * 0.28;
  if (baby.blink > 0) {
    ctx.strokeStyle = "#16181d";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(eyeX - 4, eyeY);
    ctx.lineTo(eyeX + 4, eyeY);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#fff7e6";
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, baby.state === "scared" ? 5.5 : 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#16181d";
    ctx.beginPath();
    ctx.arc(eyeX + 1.2, eyeY + 0.4, baby.state === "scared" ? 1.6 : 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(eyeX + 2, eyeY - 1, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  // mejilla
  ctx.fillStyle = "rgba(255, 120, 150, 0.45)";
  ctx.beginPath();
  ctx.arc(w * 0.82, h * 0.4, 2.6, 0, Math.PI * 2);
  ctx.fill();
  // boca
  ctx.strokeStyle = "#16181d";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  if (baby.state === "scared") ctx.arc(w * 0.92, h * 0.44, 2, 0, Math.PI * 2);
  else ctx.arc(w * 0.88, h * 0.38, 3, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  ctx.restore();

  // bocadillo con el estado
  if (baby.controlled) drawControlArrow(baby);
  const icon = { scared: "!", celebrate: "★", bye: "👋" }[baby.state];
  if (icon) {
    const ix = baby.x + w / 2;
    const iy = baby.y - 14 - bob;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = "bold 15px Fredoka, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = baby.state === "scared" ? "#ff5a4a" : baby.state === "celebrate" ? "#ffcb3c" : "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 3;
    ctx.strokeText(icon, ix, iy);
    ctx.fillText(icon, ix, iy);
    ctx.restore();
  }
}

function babyLadderReady() {
  const ladder = world.ladder;
  return ladder.deployed && ladder.progress >= 1 && world.coins.every((coin) => coin.collected) && !transition.active;
}

function updateBabyClimb(baby, dt) {
  const ladder = world.ladder;
  baby.x = lerp(baby.x, ladder.x + ladder.w / 2 - baby.w / 2, Math.min(1, dt * 12));
  baby.y -= 240 * dt;
  baby.vx = 0;
  baby.vy = 0;
  baby.grounded = false;
  if (baby.y + baby.h <= world.exit.y + 4) {
    baby.inRocket = true;
    spawnSparkles(baby.x + baby.w / 2, baby.y + baby.h / 2, 10, 1.2);
    audio.play("babyHey");
    const left = babies.filter((b) => !b.inRocket).length;
    if (dinos.every((d) => d.inRocket)) showMessage(left ? `¡Mini dino a bordo! Faltan ${left}` : "¡Todos a bordo! ¡Despegue!");
  }
}

function updateDepartingBaby(entry, dt) {
  if (!entry.saidBye) {
    entry.saidBye = true;
    audio.play("farewell");
  }
  entry.time += dt;
  if (entry.time < 1.8) {
    if (entry.time > 1.6 && !entry.hopped) {
      entry.hopped = true;
      entry.vy = -260;
      audio.play("flap");
      spawnDust(entry.x + entry.baby.w / 2, entry.y + entry.baby.h, 8, 0.7);
    }
    return;
  }
  entry.vy = Math.max(-340, entry.vy - 160 * dt);
  entry.y += entry.vy * dt;
  entry.x += Math.sin(entry.time * 2.4) * 40 * dt;
  if (Math.random() < 0.25) spawnSparkles(entry.x + entry.baby.w / 2, entry.y + entry.baby.h, 1, 0.5);
  if (entry.y + entry.baby.h < camera.y - 120 || entry.time > 14) entry.done = true;
}

function drawBabyWings(baby, w, h, grow, time) {
  const flap = Math.sin(time * (time > 1.8 ? 14 : 7)) * 0.6;
  const span = w * 1.5 * grow;
  const shoulderX = w * 0.42;
  const shoulderY = h * 0.48;
  for (const [offset, color, phase] of [[-3, baby.shade, 0.25], [0, "#fff7e6", 0]]) {
    ctx.save();
    ctx.translate(shoulderX + offset, shoulderY);
    ctx.rotate(-0.9 + flap + phase);
    ctx.fillStyle = color;
    ctx.globalAlpha *= offset ? 0.85 : 0.95;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-span * 0.35, -span * 0.75, -span * 0.1, -span * 1.05);
    ctx.quadraticCurveTo(span * 0.08, -span * 0.7, span * 0.18, -span * 0.82);
    ctx.quadraticCurveTo(span * 0.2, -span * 0.4, span * 0.42, -span * 0.48);
    ctx.quadraticCurveTo(span * 0.3, -span * 0.1, 0, 0);
    ctx.fill();
    ctx.restore();
  }
}

function updateBabyFly(baby, dt) {
  const ladder = world.ladder;
  const tx = ladder.x + ladder.w / 2 - baby.w / 2;
  const ty = ladder.bottom - baby.h;
  if (baby.stateTime < 0.5) {
    baby.vy = 0;
    return;
  }
  const dx = tx - baby.x;
  const dy = ty - baby.y;
  const d = Math.hypot(dx, dy);
  const step = Math.min(d, 300 * dt);
  baby.x += (dx / (d || 1)) * step;
  baby.y += (dy / (d || 1)) * step + Math.sin(baby.stateTime * 9) * 0.6;
  baby.facing = dx < 0 ? -1 : 1;
  baby.vx = 0;
  baby.vy = 0;
  if (Math.random() < 0.2) spawnSparkles(baby.x + baby.w / 2, baby.y + baby.h, 1, 0.5);
  if (d < 6) {
    baby.x = tx;
    baby.y = ty;
    baby.grounded = true;
    baby.platform = platformUnder(ladder.x + ladder.w / 2, ladder.bottom);
    setBabyState(baby, "climb");
  }
}

function updateControlledBaby(baby, owner, dt) {
  if (!baby.controlled) {
    baby.controlled = true;
    setBabyState(baby, "hero");
    audio.play("babyHey");
  }
  const c = owner.control;
  const dir = (keys.has(c.right) ? 1 : 0) - (keys.has(c.left) ? 1 : 0);
  const accel = baby.grounded ? 14 : 6;
  baby.vx = lerp(baby.vx, dir * 240, Math.min(1, dt * accel));
  if (dir) baby.facing = dir;
  baby.airTarget = 0;
  if (justPressed.has(c.jump) && baby.grounded) {
    baby.vy = -760;
    baby.grounded = false;
    baby.platform = null;
    audio.play("babyHey");
    spawnDust(baby.x + baby.w / 2, baby.y + baby.h, 4, 0.5);
  }
  if (justPressed.has(c.charge) && baby.grounded && baby.platform && baby.platform.kind !== "floor") {
    baby.dropThrough = baby.platform;
    baby.dropTime = 0.3;
    baby.grounded = false;
    baby.platform = null;
    baby.vy = -60;
  }
  integrateBaby(baby, dt);
  baby.stuckTime = 0;
  baby.lastX = baby.x;
}

function drawControlArrow(baby) {
  const owner = ownerOf(baby);
  const t = performance.now() * 0.001;
  const cx = baby.x + baby.w / 2;
  const top = baby.y - 30 + Math.sin(t * 6) * 4;
  ctx.save();
  ctx.fillStyle = owner ? owner.body : "#ffffff";
  ctx.strokeStyle = "#fff7e6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 9, top);
  ctx.lineTo(cx + 9, top);
  ctx.lineTo(cx, top + 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

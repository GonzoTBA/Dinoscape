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
let catapultHintShown = false;
const maxBabies = 3;
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

function newLevel(number) {
  audio.stopAllScreams();
  levelNumber = number;
  world = generateWorld(number);
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
  updateCamera(1);
  showMessage(number === 1 ? "Recoged la moneda. Para llegar al cohete: ¡supercatapulta!" : `Pozo ${number}: recoged ${coinLabel(world.coins.length)}`);
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
  messageTimer -= dt;
  if (messageTimer <= 0) hud.message.classList.add("is-hidden");

  for (const coin of world.coins) coin.spin += dt * 5;
  updateLadder(dt);
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

  for (const beetle of beetles) updateBeetle(beetle, dt);
  checkBeetleHits();
  checkBubbleRescue();
  updateEgg(dt);
  updateBabies(dt);
  collectCoins();
  collectCoinsByBabies();
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
  if (dinos.every((other) => other.bubble)) {
    startLevelRestart();
    showMessage("¡Los dos atrapados en burbujas! Otra vez");
    return;
  }
  const name = dino.id === "lucky" ? "Lucky" : "Papa";
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
  bubble.lonely = rescuers.length ? 0 : bubble.lonely + dt;
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
  }
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
    const hero = rescuer.id === "lucky" ? "Lucky" : "Papa";
    showMessage(`¡${hero} al rescate!`);
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
    ctx.font = "800 15px system-ui, sans-serif";
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
    bit.y += bit.speed * dt;
    bit.x += Math.sin(transition.timer * bit.wobble + bit.seed) * 28 * dt;
    bit.rotation += bit.spin * dt;
  }
  if (transition.timer > 3.6) {
    newLevel(transition.nextLevel);
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
    audio.play("jump");
  }

  if (charging && dino.grounded) {
    dino.charge = Math.min(chargeTimeMax, dino.charge + dt);
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
      audio.play("charge");
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
          audio.play(fallingSpeed > 980 ? "ouch" : "land");
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
      if (!wasGrounded && fallingSpeed > 260) audio.play("land");
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
  audio.play("catapult");
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
    x: ladder.x + ladder.w / 2 - dino.w - 2,
    y: world.exit.y - dino.h - hop,
    vx: 0,
    vy: 0,
    charge: 0,
    grounded: true,
    facing: 1,
  };
}

function isWaitingOnRocketPlatform(dino) {
  if (!dino.inRocket || transition.active) return false;
  if (!dinos.some((other) => !other.inRocket)) return false;
  const ladder = world.ladder;
  return !ladder.deployed || ladder.progress < 1 || ladder.settle < 0.7;
}

function drawLadderHint(dino) {
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
  audio.play("rocketReady");
  showMessage("¡Escalera lanzada! Papa: sube con S");
}

function updateLadder(dt) {
  const ladder = world.ladder;
  if (!ladder.deployed) return;
  const before = ladder.progress;
  ladder.progress = Math.min(1, ladder.progress + dt * 1.4);
  if (ladder.progress >= 1) ladder.settle += dt;
  if (before < 1 && ladder.progress >= 1) {
    spawnDust(ladder.x + ladder.w / 2, ladder.bottom, 12, 1.1);
    audio.play("land");
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
  dino.y += dino.vy * dt;
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
        audio.play("coin");
        if (world.coins.every((c) => c.collected)) showMessage("¡Cohete listo! Lucky a la cabeza de Papa y ¡supercatapulta!");
        break;
      }
    }
  }
}

function checkExit() {
  if (transition.active) return;
  const allCoins = world.coins.every((coin) => coin.collected);
  if (!allCoins) return;
  for (const dino of dinos) {
    if (dino.inHouse || dino.inRocket) continue;
    if (isDinoAtRocket(dino)) boardRocket(dino);
  }
  if (dinos.every((dino) => dino.inRocket)) {
    if (babies.some((baby) => !baby.inRocket)) {
      if (!world.ladder.deployed) {
        world.ladder.deployed = true;
        audio.play("rocketReady");
        showMessage("¡Escalera para los mini dinos!");
      }
      return;
    }
    startLevelComplete();
  }
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
  audio.play("rocketReady");
  showMessage(dinos.some((other) => !other.inRocket) ? (dino.id === "lucky" ? "¡Lucky en el cohete! Lucky: pulsa ↓ para lanzar la escalera" : "¡Uno dentro! Pulsa abajo para lanzar la escalera") : "¡Despegue!");
}

function startLevelComplete() {
  audio.stopAllScreams();
  audio.play("rocket");
  audio.play("win");
  transition.active = true;
  transition.timer = 0;
  transition.nextLevel = levelNumber + 1;
  transition.mode = "next";
  transition.rocket = { x: world.startX, baseY: world.topY };
  transition.confetti = Array.from({ length: 90 }, (_, i) => ({
    x: (i * 47) % Math.max(1, canvas.clientWidth),
    y: -Math.random() * 260,
    w: 5 + Math.random() * 7,
    h: 8 + Math.random() * 10,
    color: ["#ffdb66", "#2fa8ff", "#e84a3c", "#9bea7a", "#fff7e6"][i % 5],
    speed: 110 + Math.random() * 190,
    spin: -6 + Math.random() * 12,
    rotation: Math.random() * Math.PI,
    wobble: 2 + Math.random() * 5,
    seed: Math.random() * 20,
  }));
  showMessage("¡Pozo superado!");
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
    const rocket = rocketPosition();
    const targetScale = clamp(Math.min(viewW / 820, viewH / 760), 0.55, 1.25);
    camera.scale = lerp(camera.scale, targetScale, Math.min(1, dt * 2.8));
    camera.x = lerp(camera.x, rocket.x - viewW / camera.scale / 2, Math.min(1, dt * 2.8));
    camera.y = lerp(camera.y, rocket.y - 250 - viewH / camera.scale / 2, Math.min(1, dt * 2.8));
    return;
  }

  const someoneWaiting = dinos.some((dino) => dino.inRocket);
  const subjects = dinos.map((dino) => {
    if (!dino.inRocket) return dino;
    const perch = rocketPerch(dino);
    return { ...perch, y: perch.y - 110, h: perch.h + 110 };
  });
  for (const baby of babies) {
    if (!baby.inRocket && (baby.state === "toRocket" || baby.state === "climb")) subjects.push(baby);
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

  camera.scale = lerp(camera.scale, targetScale, Math.min(1, dt * 3.5));
  camera.x = lerp(camera.x, clamp(targetX, minCameraX, maxCameraX), Math.min(1, dt * 3.2));
  camera.y = lerp(camera.y, clamp(targetY, someoneWaiting ? -400 : -20, Math.max(-20, maxYCamera)), Math.min(1, dt * 3.2));
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

function draw() {
  const viewW = canvas.clientWidth;
  const viewH = canvas.clientHeight;
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.save();
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.x, -camera.y);
  drawLaunchSky();
  drawCave();
  drawPlatforms();
  drawPebbles();
  drawHouse();
  drawCoins();
  drawEgg();
  drawDust();
  drawBeetles();
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
  drawLadder();
  drawSparkles();
  drawExit();
  for (const dino of dinos) {
    if (!isWaitingOnRocketPlatform(dino)) continue;
    drawDino(rocketPerch(dino));
    if (!world.ladder.deployed) drawLadderHint(dino);
  }
  ctx.restore();
  drawConfetti(viewW, viewH);
  drawVignette(viewW, viewH);
  drawFade(viewW, viewH);
}

function isDinoInsideRocket(dino) {
  return dino.inRocket || (transition.active && transition.mode === "next" && transition.timer > 0.18);
}

function drawCave() {
  const earth = ctx.createLinearGradient(0, world.topY - 180, 0, world.floorY + 180);
  earth.addColorStop(0, "#514331");
  earth.addColorStop(0.42, "#32271f");
  earth.addColorStop(1, "#211814");
  ctx.fillStyle = earth;
  ctx.fillRect(0, world.topY - 180, world.width, world.floorY + 360);

  drawSoilTexture();
  drawHoleInterior();
  drawWallEdge(world.walls.left, 1);
  drawWallEdge(world.walls.right, -1);

  ctx.fillStyle = "rgba(255, 226, 132, 0.08)";
  ctx.fillRect(world.exit.x - 28, world.topY - 86, world.exit.w + 56, 84);
}

function drawLaunchSky() {
  const launch = transition.active && transition.mode === "next" ? clamp(transition.timer / 2.3, 0, 1) : 0;
  if (launch <= 0) return;
  const top = world.topY - 2200;
  const height = 2400;
  const sky = ctx.createLinearGradient(0, top, 0, world.topY + 220);
  sky.addColorStop(0, `rgba(6, 11, 32, ${0.92 * launch})`);
  sky.addColorStop(1, `rgba(15, 18, 42, ${0.7 * launch})`);
  ctx.fillStyle = sky;
  ctx.fillRect(-2000, top, world.width + 4000, height);
  for (let i = 0; i < 120; i += 1) {
    const x = -1800 + ((i * 137 + levelNumber * 43) % Math.max(1, world.width + 3600));
    const y = top + 80 + ((i * 211 + levelNumber * 97) % 1600);
    const r = 0.8 + ((i * 17) % 4) * 0.35;
    const twinkle = 0.45 + Math.sin(performance.now() * 0.003 + i * 1.7) * 0.25;
    ctx.fillStyle = `rgba(255, 247, 214, ${launch * (0.55 + twinkle)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSoilTexture() {
  ctx.strokeStyle = "rgba(228, 190, 122, 0.08)";
  ctx.lineWidth = 2;
  for (let y = world.topY - 130; y < world.floorY + 180; y += 58) {
    for (let x = 20; x < world.width; x += 120) {
      const wobble = Math.sin(y * 0.03 + x * 0.02) * 16;
      ctx.beginPath();
      ctx.moveTo(x + wobble, y);
      ctx.lineTo(x + 46 - wobble * 0.5, y + 24);
      ctx.stroke();
    }
  }
}

function drawHoleInterior() {
  const cave = ctx.createLinearGradient(0, world.topY - 160, 0, world.floorY + 130);
  cave.addColorStop(0, "#25333a");
  cave.addColorStop(0.25, "#17161b");
  cave.addColorStop(1, "#0b0a0d");
  ctx.fillStyle = cave;
  ctx.beginPath();
  ctx.moveTo(world.walls.left[0].x, world.walls.left[0].y);
  for (const point of world.walls.left) ctx.lineTo(point.x, point.y);
  for (let i = world.walls.right.length - 1; i >= 0; i -= 1) {
    const point = world.walls.right[i];
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.fill();

  const floor = world.platforms[0];
  ctx.fillStyle = "#5b493a";
  ctx.beginPath();
  ctx.moveTo(wallXAt(world.walls.left, floor.y) - 16, floor.y);
  ctx.quadraticCurveTo(world.startX, floor.y - 8, wallXAt(world.walls.right, floor.y) + 16, floor.y);
  ctx.lineTo(wallXAt(world.walls.right, floor.y + 110), floor.y + 125);
  ctx.lineTo(wallXAt(world.walls.left, floor.y + 110), floor.y + 125);
  ctx.closePath();
  ctx.fill();
}

function drawWallEdge(points, direction) {
  ctx.strokeStyle = "rgba(246, 218, 165, 0.16)";
  ctx.lineWidth = 9;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points) ctx.lineTo(point.x, point.y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(0, 0, 0, 0.24)";
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(points[0].x + direction * 9, points[0].y);
  for (const point of points) ctx.lineTo(point.x + direction * 9, point.y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 2;
  for (let i = 2; i < points.length - 2; i += 3) {
    const point = points[i];
    ctx.beginPath();
    ctx.moveTo(point.x + direction * 18, point.y - 12);
    ctx.lineTo(point.x + direction * 42, point.y + 14);
    ctx.stroke();
  }
}

function drawPlatforms() {
  for (const p of world.platforms) {
    const isExit = p.kind === "exit";
    if (p.kind === "floor") continue;
    if (isExit) {
      ctx.fillStyle = "#d9b44f";
      roundedRect(p.x, p.y, p.w, p.h, 7);
      ctx.fill();
      ctx.fillStyle = "#fff0a4";
      roundedRect(p.x + 8, p.y + 3, p.w - 16, Math.max(4, p.h * 0.28), 4);
      ctx.fill();
    } else {
      drawRockLedge(p);
    }
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
  ctx.fillStyle = "#201b20";
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

function drawRockLedge(p) {
  if (p.embeddedSide === "middle") {
    drawFloatingRock(p);
    return;
  }
  const left = p.x;
  const right = p.x + p.w;
  const top = p.y;
  const underside = p.y + p.h + 28;
  const wallSide = p.embeddedSide === "left" ? -1 : 1;
  const root = p.embeddedSide === "left" ? left : right;
  const tip = p.embeddedSide === "left" ? right : left;
  const sag = 10 + Math.sin(p.seed) * 3;

  ctx.fillStyle = "#5f4d3f";
  ctx.beginPath();
  ctx.moveTo(root, top - 5);
  ctx.quadraticCurveTo(lerp(root, tip, 0.45), top - 12 + Math.sin(p.seed) * 4, tip, top + 2);
  ctx.quadraticCurveTo(lerp(root, tip, 0.72), underside + sag, root, underside - 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#8a745d";
  ctx.beginPath();
  ctx.moveTo(root + wallSide * 4, top - 4);
  ctx.quadraticCurveTo(lerp(root, tip, 0.5), top - 9, tip - wallSide * 10, top + 1);
  ctx.quadraticCurveTo(lerp(root, tip, 0.68), top + 8, root + wallSide * 12, top + 7);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(root + wallSide * 18, top + 12);
  ctx.lineTo(lerp(root, tip, 0.48), top + 24 + Math.sin(p.seed * 1.8) * 4);
  ctx.stroke();

  ctx.fillStyle = "rgba(18, 13, 10, 0.35)";
  ctx.beginPath();
  ctx.ellipse(tip - wallSide * 6, top + 16, 18, 10, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFloatingRock(p) {
  const left = p.x;
  const right = p.x + p.w;
  const top = p.y;
  const underside = p.y + p.h + 22;

  ctx.fillStyle = "#5f4d3f";
  ctx.beginPath();
  ctx.moveTo(left + 14, top);
  ctx.quadraticCurveTo(lerp(left, right, 0.5), top - 10 + Math.sin(p.seed) * 4, right - 14, top);
  ctx.quadraticCurveTo(right + 6, top + 13, right - 34, underside);
  ctx.quadraticCurveTo(lerp(left, right, 0.5), underside + 12 + Math.sin(p.seed * 1.3) * 5, left + 34, underside);
  ctx.quadraticCurveTo(left - 6, top + 14, left + 14, top);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#8a745d";
  ctx.beginPath();
  ctx.moveTo(left + 22, top - 2);
  ctx.quadraticCurveTo(lerp(left, right, 0.5), top - 8, right - 22, top - 2);
  ctx.quadraticCurveTo(lerp(left, right, 0.58), top + 8, left + 28, top + 8);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left + p.w * 0.2, top + 18);
  ctx.lineTo(right - p.w * 0.24, top + 26 + Math.sin(p.seed * 2) * 4);
  ctx.stroke();
}

function drawCoins() {
  for (const coin of world.coins) {
    if (coin.collected) continue;
    const width = 9 + Math.abs(Math.cos(coin.spin)) * 16;
    ctx.save();
    ctx.translate(coin.x, coin.y + Math.sin(coin.spin * 1.7) * 4);
    ctx.fillStyle = "#ffcb3c";
    ctx.beginPath();
    ctx.ellipse(0, 0, width, coin.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff0a3";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "rgba(110, 66, 0, 0.35)";
    ctx.fillRect(-2, -9, 4, 18);
    ctx.restore();
  }
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
  ctx.font = "800 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  if (!launching && !dinos.some((dino) => dino.inRocket)) {
    ctx.fillText(allCoins ? "SUBID AL COHETE" : `${world.coins.length} ${world.coins.length === 1 ? "MONEDA" : "MONEDAS"}`, world.startX, world.topY - 34);
  }
  drawRocket(rocket.x, rocket.y, allCoins, launch, waitingPassengers);
  ctx.restore();
}

function rocketLaunchProgress() {
  return transition.active && transition.mode === "next" ? clamp((transition.timer - 0.18) / 2.05, 0, 1) : 0;
}

function rocketPosition() {
  const launch = rocketLaunchProgress();
  const lift = launch * launch * launch * launch;
  return {
    x: world.startX,
    y: world.topY - lift * 1740,
  };
}

function drawRocket(x, baseY, ready, launch, passengers) {
  const wobble = launch > 0 ? Math.sin(performance.now() * 0.04) * 2.2 * (1 - Math.min(0.7, launch)) : 0;
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

  ctx.fillStyle = ready ? "#2fa8ff" : "#777";
  ctx.beginPath();
  ctx.arc(0, -56, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.beginPath();
  ctx.arc(-4, -60, 4, 0, Math.PI * 2);
  ctx.fill();

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
  const walking = dino.grounded && Math.abs(dino.vx) > 20 && dino.charge === 0;
  const idleWave = idle ? Math.sin(time * 4 + (dino.id === "lucky" ? 0.5 : 1.7)) : 0;
  const idleSquash = idle ? 1 + idleWave * 0.018 : 1;
  const walkCycle = walking ? time * 14 + dino.x * 0.035 : 0;
  const frontStep = walking ? Math.sin(walkCycle) : 0;
  const backStep = walking ? Math.sin(walkCycle + Math.PI) : 0;
  const chargeWobble = dino.charge > 0 ? Math.sin(time * 25) * chargePct * 0.035 : 0;

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x + w * 0.46, y + h + 5, w * 0.48, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x + w / 2, y + h);
  ctx.scale(dir, 1);
  ctx.scale(squash + chargeWobble, idleSquash);
  ctx.translate(-w / 2, -h);

  drawDinoCape(dino, w, h, time, walking);

  ctx.fillStyle = dino.body;
  roundedRect(w * 0.12, h * 0.2, w * 0.68, h * 0.66, 16);
  ctx.fill();
  ctx.fillStyle = dino.shade;
  roundedRect(w * 0.18, h * 0.52, w * 0.44, h * 0.28, 12);
  ctx.fill();

  ctx.fillStyle = dino.body;
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
  }

  ctx.fillStyle = dino.shade;
  roundedRect(w * 0.18 + backStep * w * 0.06, h * 0.8 - Math.max(0, backStep) * h * 0.04, w * 0.21, h * 0.2, 6);
  ctx.fill();
  roundedRect(w * 0.55 + frontStep * w * 0.06, h * 0.8 - Math.max(0, frontStep) * h * 0.04, w * 0.21, h * 0.2, 6);
  ctx.fill();

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
  grd.addColorStop(0, "rgba(0,0,0,0)");
  grd.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
}

function drawConfetti(w, h) {
  if (!transition.active) return;
  ctx.save();
  ctx.globalAlpha = clamp(1 - Math.max(0, transition.timer - 1.8) / 0.8, 0, 1);
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
  if (!transition.active) return;
  const fadeStart = transition.mode === "next" ? 2.75 : 1.25;
  const alpha = clamp((transition.timer - fadeStart) / 0.85, 0, 1);
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.fillRect(0, 0, w, h);
}

function showMessage(text) {
  hud.message.textContent = text;
  hud.message.classList.remove("is-hidden");
  messageTimer = 2.8;
}

function createAudio() {
  let context;
  let musicGain;
  let musicTimer;
  let musicStep = 0;
  let musicOn = true;
  const activeScreams = new Map();
  function unlock() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!context) context = new AudioCtor();
    if (context.state === "suspended") context.resume().catch(() => {});
    startMusic();
  }
  function startMusic() {
    if (!context || musicTimer) return;
    musicGain = context.createGain();
    musicGain.gain.setValueAtTime(musicOn ? 0.16 : 0.0001, context.currentTime);
    musicGain.connect(context.destination);
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 1600);
  }
  function toggleMusic() {
    musicOn = !musicOn;
    if (!context || !musicGain) return;
    const now = context.currentTime;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), now);
    musicGain.gain.exponentialRampToValueAtTime(musicOn ? 0.16 : 0.0001, now + 0.25);
  }
  function isMusicOn() {
    return musicOn;
  }
  function scheduleMusic() {
    if (!context || !musicGain || !musicOn) return;
    const notes = [196, 246.94, 293.66, 369.99, 329.63, 246.94, 220, 293.66];
    const bass = [98, 123.47, 146.83, 123.47];
    const now = context.currentTime + 0.04;
    softTone(notes[musicStep % notes.length], now, 1.45, 0.05, "sine");
    if (musicStep % 2 === 0) softTone(bass[(musicStep / 2) % bass.length], now, 1.65, 0.034, "triangle");
    musicStep += 1;
  }
  function softTone(frequency, start, duration, volume, type) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    osc.connect(gain);
    gain.connect(musicGain);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }
  function startScream(id) {
    if (!context) return false;
    if (activeScreams.has(id)) return true;
    const now = context.currentTime;
    const base = id === "lucky" ? 930 : 470;
    const volume = id === "lucky" ? 0.045 : 0.052;
    const osc = context.createOscillator();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    const gain = context.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(base, now);
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(id === "lucky" ? 8.4 : 6.2, now);
    lfoGain.gain.setValueAtTime(id === "lucky" ? 38 : 24, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.08);
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
  function play(type) {
    if (!context) return;
    const now = context.currentTime;
    const beep = (start, end, duration, wave, volume = 0.08, delay = 0) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const at = now + delay;
      osc.connect(gain);
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.frequency.setValueAtTime(start, at);
      osc.frequency.exponentialRampToValueAtTime(end, at + duration * 0.72);
      osc.type = wave;
      osc.start(at);
      osc.stop(at + duration + 0.02);
    };
    const noiseBurst = (duration, volume = 0.08, delay = 0) => {
      const at = now + delay;
      const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = buffer;
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(720, at);
      filter.frequency.exponentialRampToValueAtTime(180, at + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      source.start(at);
    };
    if (type === "coin") {
      beep(760, 1180, 0.14, "triangle", 0.08, 0);
      beep(1160, 1780, 0.18, "sine", 0.055, 0.09);
    } else if (type === "charge") {
      beep(220, 560, 0.2, "sawtooth", 0.07);
    } else if (type === "land") {
      beep(150, 82, 0.13, "triangle", 0.09);
    } else if (type === "ouch") {
      beep(520, 320, 0.13, "sawtooth", 0.065, 0);
      beep(310, 170, 0.18, "triangle", 0.075, 0.08);
      noiseBurst(0.09, 0.035, 0.02);
    } else if (type === "stomp") {
      beep(430, 760, 0.1, "triangle", 0.065, 0);
      beep(220, 160, 0.08, "sine", 0.04, 0.03);
    } else if (type === "beetle") {
      beep(180, 90, 0.16, "sawtooth", 0.08, 0);
      beep(430, 210, 0.1, "square", 0.045, 0.04);
      noiseBurst(0.08, 0.03, 0.02);
    } else if (type === "rocketReady") {
      noiseBurst(0.28, 0.08, 0);
      beep(130, 64, 0.34, "sawtooth", 0.09, 0);
      beep(72, 48, 0.42, "sine", 0.08, 0.04);
    } else if (type === "rocket") {
      noiseBurst(1.45, 0.2, 0);
      noiseBurst(0.85, 0.14, 0.34);
      beep(58, 38, 1.25, "sawtooth", 0.16, 0);
      beep(92, 54, 0.95, "square", 0.1, 0.05);
      beep(140, 280, 0.38, "triangle", 0.07, 0.22);
      beep(220, 120, 0.55, "sawtooth", 0.06, 0.44);
    } else if (type === "bubble") {
      beep(260, 520, 0.22, "sine", 0.08, 0);
      beep(520, 340, 0.2, "sine", 0.06, 0.16);
      beep(340, 700, 0.26, "sine", 0.05, 0.32);
    } else if (type === "hatch") {
      noiseBurst(0.08, 0.07, 0);
      beep(700, 1400, 0.12, "triangle", 0.07, 0.05);
      beep(1000, 1800, 0.14, "sine", 0.06, 0.18);
      beep(1300, 2100, 0.2, "sine", 0.05, 0.32);
    } else if (type === "babyEek") {
      beep(1500, 2300, 0.09, "square", 0.025, 0);
      beep(1800, 2600, 0.08, "square", 0.02, 0.1);
    } else if (type === "babyHey") {
      beep(1100, 1600, 0.08, "sine", 0.04, 0);
      beep(1400, 1900, 0.1, "sine", 0.035, 0.09);
    } else if (type === "pop") {
      noiseBurst(0.06, 0.09, 0);
      beep(900, 1700, 0.1, "sine", 0.08, 0);
      beep(660, 1320, 0.16, "triangle", 0.05, 0.08);
    } else if (type === "catapult") {
      noiseBurst(0.18, 0.06, 0);
      beep(180, 1400, 0.42, "triangle", 0.09, 0);
      beep(360, 2200, 0.36, "sine", 0.05, 0.06);
      beep(990, 1480, 0.2, "sine", 0.04, 0.3);
    } else if (type === "win") {
      beep(520, 780, 0.18, "sine", 0.07);
      beep(660, 990, 0.18, "sine", 0.065, 0.11);
      beep(880, 1320, 0.26, "triangle", 0.06, 0.23);
    } else {
      beep(360, 640, 0.14, "square", 0.06);
    }
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

function makeBaby(x, y) {
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
    exploreCooldown: 1.5,
    number: babiesBorn,
    inRocket: false,
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
      hatchEgg(egg);
      return;
    }
  }
}

function hatchEgg(egg) {
  egg.hatched = true;
  eggsTaken.add(levelNumber);
  spawnSparkles(egg.x, egg.y - 16, 30, 2.2);
  audio.play("hatch");
  const baby = makeBaby(egg.x, egg.y);
  babies.push(baby);
  if (babies.length > maxBabies) {
    const oldest = babies.shift();
    departingBabies.push({ baby: oldest, time: 0, x: oldest.x, y: oldest.y, vy: 0, done: false });
    showMessage("¡Ha nacido un mini dino! El mayor ya es grande y se va de aventura 👋");
  } else {
    showMessage(babies.length === 1 ? "¡Ha nacido un mini dino! Os ayudará a buscar monedas" : `¡Otro mini dino! Ya sois ${babies.length + 2} en la familia`);
  }
}

function babyLeader(baby) {
  const free = dinos.filter((d) => !d.inHouse && !d.inRocket && !d.bubble);
  const pool = free.length ? free : dinos.filter((d) => !d.inRocket);
  if (!pool.length) return null;
  const cx = baby.x + baby.w / 2;
  const cy = baby.y + baby.h / 2;
  let best = pool[0];
  let bestD = Infinity;
  for (const d of pool) {
    const dd = distance(cx, cy, d.x + d.w / 2, d.y + d.h / 2);
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}

function updateBabies(dt) {
  for (const entry of departingBabies) updateDepartingBaby(entry, dt);
  departingBabies = departingBabies.filter((entry) => !entry.done);
  babies.forEach((baby, index) => updateBaby(baby, index, dt));
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
  baby.exploreCooldown = Math.max(0, baby.exploreCooldown - dt);
  baby.dropTime = Math.max(0, baby.dropTime - dt);
  if (baby.dropTime <= 0) baby.dropThrough = null;
  baby.blinkTimer -= dt;
  if (baby.blinkTimer <= 0) {
    baby.blink = 0.14;
    baby.blinkTimer = 1.5 + Math.random() * 2.5;
  }
  baby.blink = Math.max(0, baby.blink - dt);

  if (baby.inRocket) return;
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
  } else if (baby.state === "explore") {
    const coin = baby.target;
    if (!coin || coin.collected || baby.stateTime > 6) {
      baby.exploreCooldown = 2.5;
      setBabyState(baby, "follow");
    } else {
      targetX = coin.x;
      targetBottom = coin.y + 44;
      speed = 175;
    }
  }

  if (baby.state === "follow") {
    const coin = findCoinForBaby(baby);
    if (coin && baby.exploreCooldown <= 0) {
      setBabyState(baby, "explore", coin);
      audio.play("babyHey");
      targetX = coin.x;
      targetBottom = coin.y + 44;
    } else if (leader && leader.inHouse) {
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

function findCoinForBaby(baby) {
  const cx = baby.x + baby.w / 2;
  const bottom = baby.y + baby.h;
  let best = null;
  let bestD = Infinity;
  for (const coin of world.coins) {
    if (coin.collected) continue;
    if (babies.some((other) => other !== baby && other.target === coin)) continue;
    const dx = Math.abs(coin.x - cx);
    const rise = bottom - (coin.y + 44);
    if (dx > 300 || rise > 230 || rise < -260) continue;
    const d = dx + Math.abs(rise);
    if (d < bestD) {
      bestD = d;
      best = coin;
    }
  }
  return best;
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

function collectCoinsByBabies() {
  for (const baby of babies) {
    const cx = baby.x + baby.w / 2;
    const cy = baby.y + baby.h / 2;
    for (const coin of world.coins) {
      if (coin.collected) continue;
      if (distance(cx, cy, coin.x, coin.y) < coin.r + baby.w * 0.7 + 10) {
        coin.collected = true;
        audio.play("coin");
        spawnSparkles(coin.x, coin.y, 12, 1.4);
        setBabyState(baby, "celebrate");
        baby.exploreCooldown = 1.5;
        if (world.coins.every((c) => c.collected)) showMessage("¡Un mini dino cogió la última! ¡Cohete listo! Supercatapulta");
      }
    }
  }
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
  const walking = baby.grounded && Math.abs(baby.vx) > 20;
  const step = walking ? Math.sin(time * 18 + baby.seed) : 0;
  const bob = walking ? Math.abs(step) * 2 : Math.sin(time * 3 + baby.seed) * 0.8;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (baby.grounded) {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(baby.x + w / 2, baby.y + h + 3, w * 0.45, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.translate(baby.x + w / 2, baby.y + h - bob);
  ctx.scale(baby.facing, 1);
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
  const icon = { scared: "!", explore: "?", celebrate: "★", bye: "👋" }[baby.state];
  if (icon) {
    const ix = baby.x + w / 2;
    const iy = baby.y - 14 - bob;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = "bold 15px system-ui, sans-serif";
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
  entry.time += dt;
  if (entry.time < 1.8) {
    if (entry.time > 1.6 && !entry.hopped) {
      entry.hopped = true;
      entry.vy = -260;
      audio.play("babyHey");
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

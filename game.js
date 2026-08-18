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
  levelNumber = number;
  world = generateWorld(number);
  transition = makeTransition();
  dustParticles = [];
  pebbleParticles = [];
  const lucky = makeDino("lucky", "#2fa8ff", "#125c96", 34, world.startX - 44, 0, controls.lucky);
  const papa = makeDino("papa", "#e84a3c", "#8d1f1a", 52, world.startX + 30, 0, controls.papa);
  lucky.y = world.floorY - lucky.h;
  papa.y = world.floorY - papa.h;
  lucky.inHouse = true;
  papa.inHouse = true;
  dinos = [lucky, papa];
  beetles = makeBeetles(number);
  updateCamera(1);
  showMessage(number === 1 ? "Recoged las 3 monedas y salid los dos del pozo" : `Pozo ${number}`);
  updateHud();
}

function generateWorld(number) {
  const depthMeters = Math.round(baseDepthMeters * Math.pow(1.05, number - 1) * 10) / 10;
  const depthPx = depthMeters * pixelsPerMeter;
  const worldWidth = Math.round(Math.max(baseWorldWidth, depthPx * 2.6));
  const floorY = depthPx + 160;
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
  while (y > topY + 120) {
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

  const exitApproachY = topY + 94;
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
  const coinPlatforms = makeCoinPlatforms(number, pathPlatforms, sideRoutePlatforms, platforms, walls, worldWidth, difficulty);
  const coins = coinPlatforms.map((p, coinIndex) => {
    const offset = [-0.16, 0.12, 0.18][coinIndex] || 0;
    return {
      x: clamp(p.x + p.w * (0.5 + offset), p.x + 28, p.x + p.w - 28),
      y: p.y - 44,
      r: 15,
      collected: false,
      spin: coinIndex * 0.8,
    };
  });

  return {
    depthMeters,
    depthPx,
    width: worldWidth,
    floorY,
    topY,
    startX,
    walls,
    house,
    platforms,
    coins,
    exit: exitPlatform,
  };
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

function makeCoinPlatforms(number, pathPlatforms, sideRoutePlatforms, platforms, walls, worldWidth, difficulty) {
  const coinPlatforms = [];
  if (pathPlatforms.length === 0) return coinPlatforms;
  const sideChoices = sideRoutePlatforms.length >= 3 ? sideRoutePlatforms : [];
  const anchors = sideChoices.length
    ? [
        Math.floor(sideChoices.length * 0.18),
        Math.floor(sideChoices.length * 0.48),
        Math.floor(sideChoices.length * 0.78),
      ]
    : [
        Math.floor(pathPlatforms.length * 0.22),
        Math.floor(pathPlatforms.length * 0.52),
        Math.floor(pathPlatforms.length * 0.78),
      ];

  for (let i = 0; i < 3; i += 1) {
    if (sideChoices.length) {
      coinPlatforms.push(sideChoices[clamp(anchors[i], 0, sideChoices.length - 1)]);
      continue;
    }
    const base = pathPlatforms[clamp(anchors[i], 0, pathPlatforms.length - 1)];
    const leftAtY = wallXAt(walls.left, base.y);
    const rightAtY = wallXAt(walls.right, base.y);
    const direction = pseudoRandom(number, i, 21) < 0.5 ? -1 : 1;
    const sideRoom = direction < 0 ? base.x - leftAtY : rightAtY - (base.x + base.w);
    const adjustedDirection = sideRoom > 230 ? direction : -direction;
    const width = lerp(150, 230, pseudoRandom(number, i, 22)) * lerp(1, 0.82, difficulty);
    const horizontal = lerp(155, 230, pseudoRandom(number, i, 23));
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
    platform: null,
    pebbleCooldown: 0,
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
  };
}

function update(dt) {
  messageTimer -= dt;
  if (messageTimer <= 0) hud.message.classList.add("is-hidden");

  for (const coin of world.coins) coin.spin += dt * 5;
  updateTransition(dt);
  updateParticles(dt);
  if (transition.active) {
    updateCamera(dt);
    updateHud();
    return;
  }

  for (const dino of dinos) {
    dino.landed = false;
    dino.pebbleCooldown = Math.max(0, dino.pebbleCooldown - dt);
    updateBlink(dino, dt);
    if (dino.inHouse) {
      tryLeaveHouse(dino);
      continue;
    }
    handleInput(dino, dt);
    integrateDino(dino, dt);
    updateEdgePebbles(dino);
  }

  for (const beetle of beetles) updateBeetle(beetle, dt);
  if (!dinos[0].inHouse && !dinos[1].inHouse) resolveDinoPair(dinos[0], dinos[1]);
  checkBeetleHits();
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
    if (dino.inHouse) continue;
    const dinoBox = dinoCollisionBox(dino);
    for (let i = beetles.length - 1; i >= 0; i -= 1) {
      const beetle = beetles[i];
      const beetleBox = beetleCollisionBox(beetle);
      if (rectsOverlap(dinoBox, beetleBox)) {
        if (isStompingBeetle(dino, beetleBox)) {
          stompBeetle(dino, beetle, i);
          continue;
        }
        if (isWalkingIntoBeetle(dino, beetleBox)) {
          startLevelRestart();
          return;
        }
      }
    }
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
  if (transition.timer > 2.6) {
    newLevel(transition.nextLevel);
  }
}

function handleInput(dino, dt) {
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
    audio.play("jump");
  }

  if (charging && dino.grounded) {
    dino.charge = Math.min(chargeTimeMax, dino.charge + dt);
    dino.wasCharging = true;
    dino.vx *= 0.88;
  }

  if (!charging && dino.wasCharging) {
    if (dino.grounded && dino.charge > 0.08) {
      const power = chargeJumpMin + (chargeJumpMax - chargeJumpMin) * (dino.charge / chargeTimeMax);
      dino.vx = dino.facing * power * Math.cos(chargeJumpAngle);
      dino.vy = -power * Math.sin(chargeJumpAngle);
      dino.grounded = false;
      spawnDust(dino.x + dino.w / 2, dino.y + dino.h, 10, 1.05);
      audio.play("charge");
    }
    dino.charge = 0;
    dino.wasCharging = false;
  }
}

function integrateDino(dino, dt) {
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

function collectCoins() {
  for (const coin of world.coins) {
    if (coin.collected) continue;
    for (const dino of dinos) {
      if (dino.inHouse) continue;
      const cx = dino.x + dino.w / 2;
      const cy = dino.y + dino.h / 2;
      if (distance(cx, cy, coin.x, coin.y) < coin.r + dino.w * 0.58) {
        coin.collected = true;
        audio.play("coin");
        if (world.coins.every((c) => c.collected)) showMessage("Salida abierta: subid los dos");
        break;
      }
    }
  }
}

function checkExit() {
  if (transition.active) return;
  const allCoins = world.coins.every((coin) => coin.collected);
  if (!allCoins) return;
  const bothOut = dinos.every((dino) => !dino.inHouse && dino.y + dino.h < world.exit.y + 12 && dino.x + dino.w > world.exit.x && dino.x < world.exit.x + world.exit.w);
  if (bothOut) {
    startLevelComplete();
  }
}

function startLevelComplete() {
  audio.play("win");
  transition.active = true;
  transition.timer = 0;
  transition.nextLevel = levelNumber + 1;
  transition.mode = "next";
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
  audio.play("beetle");
  transition.active = true;
  transition.timer = 0;
  transition.nextLevel = levelNumber;
  transition.mode = "restart";
  transition.confetti = [];
  showMessage("¡Cuidado con los escarabajos!");
}

function updateCamera(dt) {
  const minX = Math.min(...dinos.map((d) => d.x));
  const maxX = Math.max(...dinos.map((d) => d.x + d.w));
  const minY = Math.min(...dinos.map((d) => d.y));
  const maxY = Math.max(...dinos.map((d) => d.y + d.h));
  const viewW = canvas.clientWidth;
  const viewH = canvas.clientHeight;
  const focusY = (minY + maxY) / 2;
  const caveWidth = wallXAt(world.walls.right, focusY) - wallXAt(world.walls.left, focusY);
  const needW = Math.max(maxX - minX + 360, Math.min(caveWidth + 110, baseWorldWidth));
  const needH = Math.max(maxY - minY + 260, 520);
  const targetScale = clamp(Math.min(viewW / needW, viewH / needH), 0.55, 1.7);
  const targetCenterX = (minX + maxX) / 2;
  const targetX = targetCenterX - viewW / targetScale / 2;
  const targetY = (minY + maxY) / 2 - viewH / targetScale / 2;
  const maxYCamera = world.floorY + 120 - viewH / targetScale;
  const visibleWorldW = viewW / targetScale;
  const minCameraX = visibleWorldW >= world.width ? (world.width - visibleWorldW) / 2 : 0;
  const maxCameraX = visibleWorldW >= world.width ? minCameraX : world.width - visibleWorldW;

  camera.scale = lerp(camera.scale, targetScale, Math.min(1, dt * 3.5));
  camera.x = lerp(camera.x, clamp(targetX, minCameraX, maxCameraX), Math.min(1, dt * 3.2));
  camera.y = lerp(camera.y, clamp(targetY, -20, Math.max(-20, maxYCamera)), Math.min(1, dt * 3.2));
}

function updateHud() {
  const coins = world.coins.filter((coin) => coin.collected).length;
  hud.level.textContent = String(levelNumber);
  hud.coins.textContent = `${coins}/3`;
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
  drawCave();
  drawPlatforms();
  drawPebbles();
  drawHouse();
  drawCoins();
  drawDust();
  drawBeetles();
  for (const dino of dinos) {
    if (!dino.inHouse) drawDino(dino);
  }
  drawExit();
  ctx.restore();
  drawConfetti(viewW, viewH);
  drawVignette(viewW, viewH);
  drawFade(viewW, viewH);
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
  ctx.save();
  ctx.globalAlpha = allCoins ? 1 : 0.38;
  ctx.fillStyle = allCoins ? "rgba(255, 230, 124, 0.35)" : "rgba(160, 165, 170, 0.14)";
  ctx.beginPath();
  ctx.ellipse(world.startX, world.topY - 40, 150, 54, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = allCoins ? "#ffe27d" : "#a7a8aa";
  ctx.font = "800 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(allCoins ? "SALIDA" : "3 MONEDAS", world.startX, world.topY - 34);
  ctx.restore();
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
  const freeX = -w * (0.34 + Math.abs(walkWave) * 0.05 + Math.abs(airWave) * 0.04);
  const lift = fallLift * h * 0.34 - riseDrop * h * 0.12;
  const wave = (walkWave + airWave) * h * 0.06;
  const flutter = airWave * h * 0.05;
  const topY = h * 0.28;
  const bottomY = h * 0.63;
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

function drawChargeBar(dino) {
  const pct = dino.charge / chargeTimeMax;
  const x = dino.x + dino.w / 2 - 28;
  const y = dino.y - 20;
  ctx.fillStyle = "rgba(8,9,12,0.78)";
  roundedRect(x, y, 56, 8, 4);
  ctx.fill();
  ctx.fillStyle = pct > 0.78 ? "#ff6b57" : "#ffdb66";
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
  const alpha = clamp((transition.timer - 1.25) / 1.0, 0, 1);
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
    } else if (type === "win") {
      beep(520, 780, 0.18, "sine", 0.07);
      beep(660, 990, 0.18, "sine", 0.065, 0.11);
      beep(880, 1320, 0.26, "triangle", 0.06, 0.23);
    } else {
      beep(360, 640, 0.14, "square", 0.06);
    }
  }
  return { unlock, play, toggleMusic, isMusicOn };
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

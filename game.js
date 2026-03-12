// =============================================================================
// SECTION 1: CONSTANTS & CONFIG
// =============================================================================

const CONFIG = {
  CANVAS_W: 800,
  CANVAS_H: 600,
  TILE_SIZE: 40,
  PLAYER_SPEED: 3.5,
  PLAYER_MAX_HP: 5,
  PLAYER_RADIUS: 14,
  SHOOT_COOLDOWN: 15,
  INVINCIBILITY_FRAMES: 60,
  BULLET_SPEED: 10,
  BULLET_LIFETIME: 80,
  BULLET_RADIUS: 5,
  BULLET_DAMAGE: 1,
  WAVE_BANNER_DURATION: 90,
  LEVEL_COMPLETE_DURATION: 150,
  SPAWN_SAFE_RADIUS: 120,

  ENEMIES: {
    basic: {
      radius: 14,
      speed: 1.4,
      hp: 2,
      damage: 1,
      score: 10,
      color: '#cc2222',
    },
    fast: {
      radius: 11,
      speed: 2.8,
      hp: 1,
      damage: 1,
      score: 20,
      color: '#ff8800',
    },
    tank: {
      radius: 20,
      speed: 0.8,
      hp: 6,
      damage: 2,
      score: 50,
      color: '#8822cc',
    },
  },

  LEVELS: [
    {
      spawnInterval: 60,
      speedMult: 1.0,
      waves: [
        { basic: 5 },
        { basic: 8 },
        { basic: 10, fast: 2 },
      ],
    },
    {
      spawnInterval: 45,
      speedMult: 1.15,
      waves: [
        { basic: 5, fast: 3 },
        { basic: 8, fast: 4 },
        { basic: 5, fast: 5, tank: 1 },
      ],
    },
    {
      spawnInterval: 30,
      speedMult: 1.32,
      waves: [
        { fast: 6, tank: 2 },
        { basic: 10, fast: 5, tank: 2 },
        { basic: 8, fast: 8, tank: 3 },
      ],
    },
  ],
};

// =============================================================================
// SECTION 2: MATH & UTILITY HELPERS
// =============================================================================

function dist(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function circlesOverlap(a, b) {
  return dist(a, b) < a.radius + b.radius;
}

function angleTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function randomEdgePoint(w, h, safeX, safeY, safeR) {
  let x, y;
  let attempts = 0;
  do {
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) { x = Math.random() * w; y = -20; }
    else if (edge === 1) { x = w + 20; y = Math.random() * h; }
    else if (edge === 2) { x = Math.random() * w; y = h + 20; }
    else { x = -20; y = Math.random() * h; }
    attempts++;
  } while (
    Math.sqrt((x - safeX) ** 2 + (y - safeY) ** 2) < safeR && attempts < 20
  );
  return { x, y };
}

function lerpColor(hex1, hex2, t) {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

// =============================================================================
// SECTION 3: INPUT MANAGER
// =============================================================================

class InputManager {
  constructor(canvas) {
    this.keys = {};
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this._justClicked = false;
    this._justReleased = false;

    window.addEventListener('keydown', e => {
      this.keys[e.key] = true;
      e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this.keys[e.key] = false;
    });
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button === 0) {
        this.mouseDown = true;
        this._justClicked = true;
      }
    });
    canvas.addEventListener('mouseup', e => {
      if (e.button === 0) {
        this.mouseDown = false;
        this._justReleased = true;
      }
    });
  }

  justClicked() {
    const v = this._justClicked;
    this._justClicked = false;
    return v;
  }

  isDown(key) {
    return !!this.keys[key];
  }
}

// =============================================================================
// SECTION 4: PIXEL ART RENDERER
// =============================================================================

const Renderer = {
  // Draw floor checkerboard
  drawFloor(ctx, w, h, scrollX, scrollY) {
    const ts = CONFIG.TILE_SIZE;
    ctx.save();
    for (let row = -1; row <= Math.ceil(h / ts) + 1; row++) {
      for (let col = -1; col <= Math.ceil(w / ts) + 1; col++) {
        const wx = col * ts + ((scrollX % ts) + ts) % ts;
        const wy = row * ts + ((scrollY % ts) + ts) % ts;
        const tileCol = Math.floor((col - Math.floor(scrollX / ts)));
        const tileRow = Math.floor((row - Math.floor(scrollY / ts)));
        const light = (tileCol + tileRow) % 2 === 0;
        ctx.fillStyle = light ? '#1a1a2e' : '#16213e';
        ctx.fillRect(wx, wy, ts, ts);
      }
    }
    ctx.restore();
  },

  // Draw player
  drawPlayer(ctx, player) {
    if (player.invincibilityFrames > 0) {
      if (Math.floor(player.invincibilityFrames / 5) % 2 === 0) return;
    }
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);

    // Legs (animated)
    const legSwing = Math.sin(player.animFrame * 0.25) * 5;
    ctx.fillStyle = '#555566';
    // Left leg
    ctx.fillRect(-5, 8 + legSwing, 5, 10);
    // Right leg
    ctx.fillRect(0, 8 - legSwing, 5, 10);

    // Body (torso)
    ctx.fillStyle = '#778899';
    ctx.fillRect(-10, -12, 20, 22);

    // Head
    ctx.fillStyle = '#aabbcc';
    ctx.fillRect(-7, -18, 14, 12);

    // Eyes
    ctx.fillStyle = '#223344';
    ctx.fillRect(-5, -15, 4, 4);
    ctx.fillRect(1, -15, 4, 4);

    // Gun barrel
    ctx.fillStyle = '#445566';
    ctx.fillRect(8, -4, 14, 6);
    // Gun body
    ctx.fillStyle = '#556677';
    ctx.fillRect(2, -6, 10, 10);

    ctx.restore();
  },

  // Draw basic enemy (red square)
  drawBasicEnemy(ctx, enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle);

    // Legs
    const legSwing = Math.sin(enemy.animFrame * 0.2) * 4;
    ctx.fillStyle = '#771111';
    ctx.fillRect(-5, 8 + legSwing, 5, 9);
    ctx.fillRect(0, 8 - legSwing, 5, 9);

    // Body
    ctx.fillStyle = '#cc2222';
    ctx.fillRect(-10, -12, 20, 22);

    // Head
    ctx.fillStyle = '#dd4444';
    ctx.fillRect(-8, -18, 16, 12);

    // Eyes (menacing)
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(-6, -15, 4, 4);
    ctx.fillRect(2, -15, 4, 4);

    // HP bar above enemy
    ctx.restore();
    this.drawEnemyHPBar(ctx, enemy);
  },

  // Draw fast enemy (orange, lean)
  drawFastEnemy(ctx, enemy) {
    // Motion trail
    if (enemy.vx !== 0 || enemy.vy !== 0) {
      const speed = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
      for (let t = 1; t <= 3; t++) {
        ctx.save();
        ctx.globalAlpha = 0.15 * (4 - t) / 3;
        ctx.translate(
          enemy.x - enemy.vx * t * 2,
          enemy.y - enemy.vy * t * 2
        );
        ctx.rotate(enemy.angle);
        ctx.fillStyle = '#ff8800';
        ctx.fillRect(-7, -10, 14, 18);
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle);

    // Lean body (narrower)
    ctx.fillStyle = '#cc6600';
    ctx.fillRect(-7, -10, 14, 18);

    // Head
    ctx.fillStyle = '#ff8800';
    ctx.fillRect(-6, -16, 12, 10);

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-4, -14, 3, 3);
    ctx.fillRect(1, -14, 3, 3);

    ctx.restore();
    this.drawEnemyHPBar(ctx, enemy);
  },

  // Draw tank enemy (large purple, no legs)
  drawTankEnemy(ctx, enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle);

    // Armored body
    ctx.fillStyle = '#6611aa';
    ctx.fillRect(-18, -18, 36, 36);

    // Armor plates
    ctx.fillStyle = '#8822cc';
    ctx.fillRect(-16, -16, 14, 14);
    ctx.fillRect(2, -16, 14, 14);
    ctx.fillRect(-16, 2, 14, 14);
    ctx.fillRect(2, 2, 14, 14);

    // Cannon
    ctx.fillStyle = '#440088';
    ctx.fillRect(14, -5, 16, 10);
    ctx.fillRect(8, -8, 14, 16);

    // Eye slit
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(-12, -6, 24, 4);

    ctx.restore();
    this.drawEnemyHPBar(ctx, enemy);
  },

  drawEnemyHPBar(ctx, enemy) {
    const barW = enemy.radius * 2;
    const barH = 4;
    const x = enemy.x - barW / 2;
    const y = enemy.y - enemy.radius - 10;
    const pct = enemy.hp / enemy.maxHp;

    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = pct > 0.5 ? '#22cc44' : pct > 0.25 ? '#ffcc00' : '#cc2222';
    ctx.fillRect(x, y, barW * pct, barH);
  },

  // Draw projectile
  drawProjectile(ctx, proj) {
    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.rotate(proj.angle);

    // Bullet glow
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ffff88';
    ctx.fillStyle = '#ffff44';
    ctx.fillRect(-proj.radius, -2, proj.radius * 2, 4);

    // Bright core
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-proj.radius + 2, -1, proj.radius * 2 - 4, 2);

    ctx.shadowBlur = 0;
    ctx.restore();
  },

  // Draw crosshair cursor
  drawCrosshair(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.9;

    const size = 10;
    const gap = 4;

    // Cross lines
    ctx.beginPath();
    ctx.moveTo(x - size - gap, y); ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y); ctx.lineTo(x + size + gap, y);
    ctx.moveTo(x, y - size - gap); ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap); ctx.lineTo(x, y + size + gap);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1, y - 1, 2, 2);

    // Circle
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  },

  // Draw HUD
  drawHUD(ctx, game) {
    const W = CONFIG.CANVAS_W;
    ctx.save();

    // Semi-transparent strip
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, 36);

    ctx.font = 'bold 14px monospace';
    ctx.textBaseline = 'middle';

    // HP
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText('HP:', 10, 18);
    for (let i = 0; i < CONFIG.PLAYER_MAX_HP; i++) {
      ctx.fillStyle = i < game.player.hp ? '#ee2222' : '#333333';
      ctx.fillRect(42 + i * 20, 10, 14, 14);
    }

    // Score
    ctx.fillStyle = '#ffdd44';
    ctx.textAlign = 'center';
    ctx.fillText('SCORE: ' + String(game.score).padStart(6, '0'), W / 2, 18);

    // Level / Wave
    ctx.fillStyle = '#88ccff';
    ctx.textAlign = 'right';
    const waveCount = CONFIG.LEVELS[game.levelIndex].waves.length;
    ctx.fillText(
      `LEVEL ${game.levelIndex + 1}  WAVE ${game.waveManager.waveIndex + 1}/${waveCount}`,
      W - 10, 18
    );

    ctx.restore();
  },

  // Draw effect (particle)
  drawEffect(ctx, eff) {
    ctx.save();
    ctx.globalAlpha = eff.life / eff.maxLife;
    ctx.translate(eff.x, eff.y);

    if (eff.type === 'explosion') {
      ctx.fillStyle = eff.color || '#ff8800';
      ctx.shadowBlur = 10;
      ctx.shadowColor = eff.color || '#ff8800';
      ctx.fillRect(-eff.size / 2, -eff.size / 2, eff.size, eff.size);
    } else if (eff.type === 'muzzle') {
      ctx.fillStyle = '#ffff44';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ffff00';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -2, 4, 4);
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  },
};

// =============================================================================
// SECTION 5: ENTITY BASE CLASS
// =============================================================================

class Entity {
  constructor(x, y, radius) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = radius;
    this.animFrame = 0;
    this.alive = true;
    this.angle = 0;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.animFrame++;
  }
}

// =============================================================================
// SECTION 6: PLAYER
// =============================================================================

class Player extends Entity {
  constructor(x, y) {
    super(x, y, CONFIG.PLAYER_RADIUS);
    this.hp = CONFIG.PLAYER_MAX_HP;
    this.maxHp = CONFIG.PLAYER_MAX_HP;
    this.shootCooldown = 0;
    this.invincibilityFrames = 0;
    this.score = 0;
  }

  update(input) {
    // Movement
    let dx = 0, dy = 0;
    if (input.isDown('ArrowLeft') || input.isDown('a')) dx -= 1;
    if (input.isDown('ArrowRight') || input.isDown('d')) dx += 1;
    if (input.isDown('ArrowUp') || input.isDown('w')) dy -= 1;
    if (input.isDown('ArrowDown') || input.isDown('s')) dy += 1;

    if (dx !== 0 && dy !== 0) {
      dx *= 0.707;
      dy *= 0.707;
    }

    this.vx = dx * CONFIG.PLAYER_SPEED;
    this.vy = dy * CONFIG.PLAYER_SPEED;

    // Clamp to canvas
    this.x = clamp(this.x + this.vx, this.radius, CONFIG.CANVAS_W - this.radius);
    this.y = clamp(this.y + this.vy, this.radius + 36, CONFIG.CANVAS_H - this.radius);

    // Aim toward mouse
    this.angle = Math.atan2(input.mouseY - this.y, input.mouseX - this.x);

    // Cooldowns
    if (this.shootCooldown > 0) this.shootCooldown--;
    if (this.invincibilityFrames > 0) this.invincibilityFrames--;

    if (dx !== 0 || dy !== 0) this.animFrame++;
  }

  tryShoot(input) {
    if ((input.mouseDown) && this.shootCooldown <= 0) {
      this.shootCooldown = CONFIG.SHOOT_COOLDOWN;
      const spawnX = this.x + Math.cos(this.angle) * 22;
      const spawnY = this.y + Math.sin(this.angle) * 22;
      return new Projectile(spawnX, spawnY, this.angle, false);
    }
    return null;
  }

  takeDamage(amount) {
    if (this.invincibilityFrames > 0) return false;
    this.hp -= amount;
    this.invincibilityFrames = CONFIG.INVINCIBILITY_FRAMES;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return true;
  }

  draw(ctx) {
    Renderer.drawPlayer(ctx, this);
  }
}

// =============================================================================
// SECTION 7: ENEMIES
// =============================================================================

class Enemy extends Entity {
  constructor(x, y, type) {
    const cfg = CONFIG.ENEMIES[type];
    super(x, y, cfg.radius);
    this.type = type;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.speed = cfg.speed;
    this.damage = cfg.damage;
    this.score = cfg.score;
    this.color = cfg.color;
  }

  update(player, speedMult) {
    const a = angleTo(this, player);
    this.angle = a;
    this.vx = Math.cos(a) * this.speed * speedMult;
    this.vy = Math.sin(a) * this.speed * speedMult;
    this.x += this.vx;
    this.y += this.vy;
    this.animFrame++;
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }
}

class BasicEnemy extends Enemy {
  constructor(x, y) { super(x, y, 'basic'); }
  draw(ctx) { Renderer.drawBasicEnemy(ctx, this); }
}

class FastEnemy extends Enemy {
  constructor(x, y) { super(x, y, 'fast'); }
  draw(ctx) { Renderer.drawFastEnemy(ctx, this); }
}

class TankEnemy extends Enemy {
  constructor(x, y) { super(x, y, 'tank'); }
  draw(ctx) { Renderer.drawTankEnemy(ctx, this); }
}

// =============================================================================
// SECTION 8: PROJECTILE
// =============================================================================

class Projectile extends Entity {
  constructor(x, y, angle, fromEnemy) {
    super(x, y, CONFIG.BULLET_RADIUS);
    this.angle = angle;
    this.vx = Math.cos(angle) * CONFIG.BULLET_SPEED;
    this.vy = Math.sin(angle) * CONFIG.BULLET_SPEED;
    this.fromEnemy = fromEnemy;
    this.lifetime = CONFIG.BULLET_LIFETIME;
    this.damage = CONFIG.BULLET_DAMAGE;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.lifetime--;
    if (
      this.lifetime <= 0 ||
      this.x < -20 || this.x > CONFIG.CANVAS_W + 20 ||
      this.y < -20 || this.y > CONFIG.CANVAS_H + 20
    ) {
      this.alive = false;
    }
  }

  draw(ctx) {
    Renderer.drawProjectile(ctx, this);
  }
}

// =============================================================================
// SECTION 9: EFFECT
// =============================================================================

class Effect extends Entity {
  constructor(x, y, type, color, size) {
    super(x, y, 1);
    this.type = type;
    this.color = color || '#ff8800';
    this.size = size || 12;
    this.maxLife = type === 'muzzle' ? 8 : 20;
    this.life = this.maxLife;
    // Random velocity for explosion particles
    if (type === 'explosion') {
      const a = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 3;
      this.vx = Math.cos(a) * spd;
      this.vy = Math.sin(a) * spd;
    }
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.9;
    this.vy *= 0.9;
    this.life--;
    if (this.life <= 0) this.alive = false;
  }

  draw(ctx) {
    Renderer.drawEffect(ctx, this);
  }
}

function spawnExplosion(x, y, color, count) {
  const effects = [];
  for (let i = 0; i < count; i++) {
    const size = 4 + Math.random() * 12;
    effects.push(new Effect(x, y, 'explosion', color, size));
  }
  return effects;
}

// =============================================================================
// SECTION 10: WAVE MANAGER
// =============================================================================

class WaveManager {
  constructor() {
    this.levelIndex = 0;
    this.waveIndex = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.allSpawned = false;
  }

  startWave(levelIndex, waveIndex) {
    this.levelIndex = levelIndex;
    this.waveIndex = waveIndex;
    const levelCfg = CONFIG.LEVELS[levelIndex];
    const waveCfg = levelCfg.waves[waveIndex];

    this.spawnQueue = [];
    for (const [type, count] of Object.entries(waveCfg)) {
      for (let i = 0; i < count; i++) {
        this.spawnQueue.push(type);
      }
    }
    // Shuffle queue
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }
    this.spawnTimer = 0;
    this.allSpawned = false;
  }

  update(playerX, playerY) {
    if (this.allSpawned || this.spawnQueue.length === 0) {
      this.allSpawned = true;
      return null;
    }

    const levelCfg = CONFIG.LEVELS[this.levelIndex];
    this.spawnTimer++;
    if (this.spawnTimer >= levelCfg.spawnInterval) {
      this.spawnTimer = 0;
      const type = this.spawnQueue.shift();
      const pos = randomEdgePoint(
        CONFIG.CANVAS_W, CONFIG.CANVAS_H,
        playerX, playerY,
        CONFIG.SPAWN_SAFE_RADIUS
      );
      switch (type) {
        case 'basic': return new BasicEnemy(pos.x, pos.y);
        case 'fast': return new FastEnemy(pos.x, pos.y);
        case 'tank': return new TankEnemy(pos.x, pos.y);
      }
    }
    return null;
  }

  isWaveComplete(enemies) {
    return this.allSpawned && enemies.length === 0;
  }
}

// =============================================================================
// SECTION 11: GAME (state machine, loop, HUD, screens)
// =============================================================================

const STATE = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  WAVE_COMPLETE: 'WAVE_COMPLETE',
  LEVEL_COMPLETE: 'LEVEL_COMPLETE',
  WIN: 'WIN',
  GAME_OVER: 'GAME_OVER',
};

class Game {
  init() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = CONFIG.CANVAS_W;
    this.canvas.height = CONFIG.CANVAS_H;

    this.input = new InputManager(this.canvas);
    this.state = STATE.MENU;
    this.score = 0;
    this.levelIndex = 0;
    this.bannerTimer = 0;
    this.menuScrollY = 0;
    this.menuBlink = 0;
    this.highScore = 0;

    this.player = null;
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.waveManager = new WaveManager();

    this.boundLoop = this.loop.bind(this);
    requestAnimationFrame(this.boundLoop);
  }

  startGame() {
    this.score = 0;
    this.levelIndex = 0;
    this.startLevel();
  }

  startLevel() {
    this.player = new Player(CONFIG.CANVAS_W / 2, CONFIG.CANVAS_H / 2);
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.waveManager = new WaveManager();
    this.waveManager.startWave(this.levelIndex, 0);
    this.state = STATE.PLAYING;
  }

  nextWave() {
    const levelCfg = CONFIG.LEVELS[this.levelIndex];
    const nextWaveIdx = this.waveManager.waveIndex + 1;
    if (nextWaveIdx >= levelCfg.waves.length) {
      // Level complete
      this.bannerTimer = CONFIG.LEVEL_COMPLETE_DURATION;
      this.state = STATE.LEVEL_COMPLETE;
    } else {
      this.waveManager.startWave(this.levelIndex, nextWaveIdx);
      this.bannerTimer = CONFIG.WAVE_BANNER_DURATION;
      this.state = STATE.WAVE_COMPLETE;
    }
  }

  nextLevel() {
    this.levelIndex++;
    if (this.levelIndex >= CONFIG.LEVELS.length) {
      this.state = STATE.WIN;
      if (this.score > this.highScore) this.highScore = this.score;
    } else {
      this.startLevel();
    }
  }

  update() {
    const input = this.input;

    if (this.state === STATE.MENU) {
      this.menuScrollY += 0.5;
      this.menuBlink++;
      if (input.justClicked()) {
        this.startGame();
      }
      return;
    }

    if (this.state === STATE.GAME_OVER || this.state === STATE.WIN) {
      if (input.justClicked()) {
        this.state = STATE.MENU;
      }
      return;
    }

    if (this.state === STATE.WAVE_COMPLETE) {
      this.bannerTimer--;
      if (this.bannerTimer <= 0) {
        this.state = STATE.PLAYING;
      }
      // Also run player update so they can move during banner
      this.player.update(input);
      return;
    }

    if (this.state === STATE.LEVEL_COMPLETE) {
      this.bannerTimer--;
      if (this.bannerTimer <= 0) {
        this.nextLevel();
      }
      this.player.update(input);
      return;
    }

    if (this.state !== STATE.PLAYING) return;

    // --- PLAYING state ---

    // Player update
    this.player.update(input);

    // Player shooting
    const bullet = this.player.tryShoot(input);
    if (bullet) {
      this.projectiles.push(bullet);
      this.effects.push(new Effect(
        this.player.x + Math.cos(this.player.angle) * 24,
        this.player.y + Math.sin(this.player.angle) * 24,
        'muzzle'
      ));
    }

    // Spawn enemies
    const levelCfg = CONFIG.LEVELS[this.levelIndex];
    const newEnemy = this.waveManager.update(this.player.x, this.player.y);
    if (newEnemy) this.enemies.push(newEnemy);

    // Update enemies
    for (const enemy of this.enemies) {
      enemy.update(this.player, levelCfg.speedMult);
    }

    // Update projectiles
    for (const proj of this.projectiles) {
      proj.update();
    }

    // Update effects
    for (const eff of this.effects) {
      eff.update();
    }

    // --- COLLISION DETECTION ---

    // Bullets vs enemies
    for (const proj of this.projectiles) {
      if (!proj.alive || proj.fromEnemy) continue;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (circlesOverlap(proj, enemy)) {
          proj.alive = false;
          enemy.takeDamage(proj.damage);
          // Hit sparks
          this.effects.push(...spawnExplosion(proj.x, proj.y, '#ffaa00', 4));
          if (!enemy.alive) {
            this.score += enemy.score;
            this.effects.push(...spawnExplosion(enemy.x, enemy.y, enemy.color, 10));
          }
          break;
        }
      }
    }

    // Enemies vs player (contact damage)
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (circlesOverlap(enemy, this.player)) {
        const damaged = this.player.takeDamage(enemy.damage);
        if (damaged) {
          this.effects.push(...spawnExplosion(
            this.player.x, this.player.y, '#ff4444', 5
          ));
        }
      }
    }

    // Clean up dead entities
    this.projectiles = this.projectiles.filter(p => p.alive);
    this.enemies = this.enemies.filter(e => e.alive);
    this.effects = this.effects.filter(e => e.alive);

    // Check player death
    if (!this.player.alive) {
      if (this.score > this.highScore) this.highScore = this.score;
      this.state = STATE.GAME_OVER;
      return;
    }

    // Check wave complete
    if (this.waveManager.isWaveComplete(this.enemies)) {
      this.nextWave();
    }
  }

  draw() {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS_W;
    const H = CONFIG.CANVAS_H;

    ctx.clearRect(0, 0, W, H);

    if (this.state === STATE.MENU) {
      this.drawMenu(ctx);
      return;
    }

    // 1. Floor
    const scrollX = this.player ? -this.player.x * 0.1 : 0;
    const scrollY = this.player ? -this.player.y * 0.1 : 0;
    Renderer.drawFloor(ctx, W, H, scrollX, scrollY);

    // 2. Projectiles
    for (const proj of this.projectiles) proj.draw(ctx);

    // 3. Enemies (tanks first, then others, fast on top)
    const tanks = this.enemies.filter(e => e.type === 'tank');
    const others = this.enemies.filter(e => e.type !== 'tank' && e.type !== 'fast');
    const fasts = this.enemies.filter(e => e.type === 'fast');
    for (const e of tanks) e.draw(ctx);
    for (const e of others) e.draw(ctx);
    for (const e of fasts) e.draw(ctx);

    // 4. Player
    if (this.player) this.player.draw(ctx);

    // 5. Effects
    for (const eff of this.effects) eff.draw(ctx);

    // 6. HUD
    if (
      this.state === STATE.PLAYING ||
      this.state === STATE.WAVE_COMPLETE ||
      this.state === STATE.LEVEL_COMPLETE
    ) {
      Renderer.drawHUD(ctx, this);
    }

    // 7. State overlays
    if (this.state === STATE.WAVE_COMPLETE) {
      this.drawWaveBanner(ctx);
    } else if (this.state === STATE.LEVEL_COMPLETE) {
      this.drawLevelCompleteBanner(ctx);
    } else if (this.state === STATE.GAME_OVER) {
      this.drawGameOver(ctx);
    } else if (this.state === STATE.WIN) {
      this.drawWin(ctx);
    }

    // 8. Crosshair (always on top)
    Renderer.drawCrosshair(ctx, this.input.mouseX, this.input.mouseY);
  }

  drawMenu(ctx) {
    const W = CONFIG.CANVAS_W;
    const H = CONFIG.CANVAS_H;

    // Scrolling floor
    Renderer.drawFloor(ctx, W, H, this.menuScrollY * 0.5, this.menuScrollY * 0.3);

    // Dark overlay
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.save();
    ctx.textAlign = 'center';

    // Shadow
    ctx.fillStyle = '#880000';
    ctx.font = 'bold 64px monospace';
    ctx.fillText('RETRO', W / 2 + 4, H / 2 - 90 + 4);
    ctx.fillText('SHOOTER', W / 2 + 4, H / 2 - 20 + 4);

    // Main title
    ctx.fillStyle = '#ff4444';
    ctx.fillText('RETRO', W / 2, H / 2 - 90);
    ctx.fillStyle = '#ff8800';
    ctx.fillText('SHOOTER', W / 2, H / 2 - 20);

    // Decorative line
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 160, H / 2 + 20);
    ctx.lineTo(W / 2 + 160, H / 2 + 20);
    ctx.stroke();

    // Blinking "CLICK TO START"
    if (Math.floor(this.menuBlink / 30) % 2 === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px monospace';
      ctx.fillText('CLICK TO START', W / 2, H / 2 + 55);
    }

    // Controls
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '14px monospace';
    ctx.fillText('ARROWS / WASD  —  Move', W / 2, H / 2 + 105);
    ctx.fillText('MOUSE  —  Aim', W / 2, H / 2 + 125);
    ctx.fillText('CLICK  —  Shoot', W / 2, H / 2 + 145);

    // High score
    if (this.highScore > 0) {
      ctx.fillStyle = '#ffdd44';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('HIGH SCORE: ' + String(this.highScore).padStart(6, '0'), W / 2, H / 2 + 185);
    }

    ctx.restore();

    // Crosshair
    Renderer.drawCrosshair(ctx, this.input.mouseX, this.input.mouseY);
  }

  drawBanner(ctx, lines, bgColor) {
    const W = CONFIG.CANVAS_W;
    const H = CONFIG.CANVAS_H;
    ctx.save();
    ctx.fillStyle = bgColor || 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, H / 2 - 55, W, 110);

    ctx.textAlign = 'center';
    lines.forEach((line, i) => {
      ctx.fillStyle = line.color || '#ffffff';
      ctx.font = line.font || '20px monospace';
      ctx.fillText(line.text, W / 2, H / 2 - 20 + i * 38);
    });
    ctx.restore();
  }

  drawWaveBanner(ctx) {
    const waveIdx = this.waveManager.waveIndex;
    const totalWaves = CONFIG.LEVELS[this.levelIndex].waves.length;
    const fade = Math.min(1, this.bannerTimer / 20);
    ctx.save();
    ctx.globalAlpha = fade;
    this.drawBanner(ctx, [
      { text: `WAVE ${waveIdx + 1} OF ${totalWaves}`, font: 'bold 36px monospace', color: '#44ff88' },
      { text: 'SURVIVE!', font: '20px monospace', color: '#aaffcc' },
    ], 'rgba(0,30,0,0.8)');
    ctx.restore();
  }

  drawLevelCompleteBanner(ctx) {
    const fade = Math.min(1, this.bannerTimer / 20);
    ctx.save();
    ctx.globalAlpha = fade;
    this.drawBanner(ctx, [
      { text: `LEVEL ${this.levelIndex + 1} COMPLETE!`, font: 'bold 36px monospace', color: '#ffdd44' },
      { text: `SCORE: ${String(this.score).padStart(6, '0')}`, font: '22px monospace', color: '#ffffff' },
    ], 'rgba(30,20,0,0.85)');
    ctx.restore();
  }

  drawGameOver(ctx) {
    const W = CONFIG.CANVAS_W;
    const H = CONFIG.CANVAS_H;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.textAlign = 'center';

    ctx.fillStyle = '#cc2222';
    ctx.font = 'bold 56px monospace';
    ctx.fillText('GAME OVER', W / 2 + 3, H / 2 - 50 + 3);
    ctx.fillStyle = '#ff4444';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 50);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`FINAL SCORE: ${String(this.score).padStart(6, '0')}`, W / 2, H / 2 + 15);

    if (this.score >= this.highScore && this.score > 0) {
      ctx.fillStyle = '#ffdd44';
      ctx.font = '18px monospace';
      ctx.fillText('NEW HIGH SCORE!', W / 2, H / 2 + 50);
    }

    if (Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '18px monospace';
      ctx.fillText('CLICK TO RETURN TO MENU', W / 2, H / 2 + 95);
    }

    ctx.restore();
    Renderer.drawCrosshair(ctx, this.input.mouseX, this.input.mouseY);
  }

  drawWin(ctx) {
    const W = CONFIG.CANVAS_W;
    const H = CONFIG.CANVAS_H;

    // Celebratory background shimmer
    const t = Date.now() / 1000;
    ctx.fillStyle = `hsl(${(t * 40) % 360}, 40%, 8%)`;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.textAlign = 'center';

    ctx.fillStyle = '#ffaa00';
    ctx.font = 'bold 60px monospace';
    ctx.fillText('YOU WIN!', W / 2 + 3, H / 2 - 60 + 3);
    ctx.fillStyle = '#ffdd44';
    ctx.fillText('YOU WIN!', W / 2, H / 2 - 60);

    ctx.fillStyle = '#88ffaa';
    ctx.font = '22px monospace';
    ctx.fillText('All 3 levels cleared!', W / 2, H / 2);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`FINAL SCORE: ${String(this.score).padStart(6, '0')}`, W / 2, H / 2 + 45);

    ctx.fillStyle = '#ffdd44';
    ctx.font = '18px monospace';
    ctx.fillText(`HIGH SCORE: ${String(this.highScore).padStart(6, '0')}`, W / 2, H / 2 + 80);

    if (Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '18px monospace';
      ctx.fillText('CLICK TO RETURN TO MENU', W / 2, H / 2 + 125);
    }

    ctx.restore();
    Renderer.drawCrosshair(ctx, this.input.mouseX, this.input.mouseY);
  }

  loop() {
    this.update();
    this.draw();
    requestAnimationFrame(this.boundLoop);
  }
}

// Boot
new Game().init();

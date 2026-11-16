import Phaser from 'phaser';

const PLAYER_SPEED = 290;
const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1600;
const PLAYER_RADIUS = 19;
const DRONE_RADIUS = 18;
const GIFT_SPEED = 560;
const MAX_HEALTH = 5;
const HIT_COOLDOWN_MS = 1000;
const COINS_PER_UPGRADE = 5;
const START_FIRE_DELAY_MS = 1100;
const MIN_FIRE_DELAY_MS = 260;
const FIRE_DELAY_STEP_MS = 150;
const GIFT_LIFETIME_MS = 1800;
const KILL_POINTS = 10;
const TIME_POINTS_PER_SECOND = 1;

type Drone = { view: Phaser.GameObjects.Container; speed: number };
type Gift = { view: Phaser.GameObjects.Arc; vx: number; vy: number; remainingMs: number };
type Coin = { view: Phaser.GameObjects.Arc };

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private upgradeKey!: Phaser.Input.Keyboard.Key;
  private healthText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private coinsText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private upgradeMenu?: Phaser.GameObjects.Container;
  private drones: Drone[] = [];
  private gifts: Gift[] = [];
  private coins: Coin[] = [];
  private health = MAX_HEALTH;
  private score = 0;
  private totalCoins = 0;
  private level = 1;
  private nextUpgradeAt = COINS_PER_UPGRADE;
  private survivedMs = 0;
  private spawnTimer = 0;
  private fireTimer = 0;
  private lastHitAt = -HIT_COOLDOWN_MS;
  private gameOver = false;
  private upgradeOpen = false;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.health = MAX_HEALTH;
    this.score = 0;
    this.totalCoins = 0;
    this.level = 1;
    this.nextUpgradeAt = COINS_PER_UPGRADE;
    this.survivedMs = 0;
    this.spawnTimer = 700;
    this.fireTimer = 400;
    this.lastHitAt = -HIT_COOLDOWN_MS;
    this.gameOver = false;
    this.upgradeOpen = false;
    this.upgradeMenu = undefined;
    this.drones = [];
    this.gifts = [];
    this.coins = [];
    this.drawBackground();
    this.createPlayer();
    this.createHud();
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    if (!this.input.keyboard) throw new Error('Keyboard input is unavailable.');
    const keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    this.wasd = keys as typeof this.wasd;
    this.upgradeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.input.keyboard.on('keydown-R', () => {
      if (this.gameOver) this.scene.restart();
    });
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;
    if (this.upgradeOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.upgradeKey)) this.chooseFireRateUpgrade();
      return;
    }
    const step = Math.min(delta, 50);
    this.survivedMs += step;
    this.refreshHud();
    this.movePlayer(step / 1000);
    this.spawnTimer -= step;
    if (this.spawnTimer <= 0) {
      this.spawnDrone();
      this.spawnTimer = Math.max(360, 1200 - this.survivedMs / 200);
    }
    this.fireTimer -= step;
    if (this.fireTimer <= 0 && this.drones.length > 0) {
      this.fireGift();
      this.fireTimer = Math.max(MIN_FIRE_DELAY_MS, START_FIRE_DELAY_MS - (this.level - 1) * FIRE_DELAY_STEP_MS);
    }
    this.moveDrones(step / 1000);
    this.moveGifts(step);
    this.checkGiftHits();
    this.checkPlayerHits();
    this.collectCoins();
  }

  private drawBackground(): void {
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x10233d);
    for (let i = 0; i < 170; i++) {
      const x = (i * 173 + 41) % WORLD_WIDTH;
      const y = (i * 97 + 23) % WORLD_HEIGHT;
      this.add.circle(x, y, i % 4 === 0 ? 2 : 1, 0xb8d7ed, 0.48);
    }
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH - 4, WORLD_HEIGHT - 4, 0x10233d, 0)
      .setStrokeStyle(5, 0x80b8d3);
  }

  private createPlayer(): void {
    this.player = this.add.container(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    this.player.add([
      this.add.ellipse(0, 15, 58, 20, 0xbe2635),
      this.add.rectangle(0, 8, 54, 5, 0xf8d8a2),
      this.add.circle(0, -2, 18, 0xd73642),
      this.add.circle(0, -14, 11, 0xffd4ad),
      this.add.ellipse(0, -7, 18, 14, 0xffffff),
      this.add.triangle(0, -29, -14, 12, 12, 12, 0, -10, 0xd73642),
      this.add.circle(0, -39, 5, 0xffffff),
    ]);
    this.player.setDepth(5);
  }

  private createHud(): void {
    const style = { fontFamily: 'Arial, sans-serif', fontSize: '21px', color: '#f7fbff' };
    this.add.rectangle(this.scale.width / 2, 48, this.scale.width, 96, 0x071626, 0.94).setScrollFactor(0).setDepth(10);
    this.add.rectangle(this.scale.width / 2, 96, this.scale.width, 2, 0x4d8198, 0.6).setScrollFactor(0).setDepth(10);
    this.add.text(18, 12, 'ДЕД МОРОЗ ПРОТИВ ДРОНОВ', {
      ...style, fontSize: '24px', fontStyle: 'bold', color: '#f7df9c',
    }).setScrollFactor(0).setDepth(11);
    this.add.text(18, 53, 'WASD — летать  •  подарки летят автоматически  •  собирай монеты', {
      ...style, fontSize: '16px', color: '#b6cadc',
    }).setScrollFactor(0).setDepth(11);
    this.healthText = this.add.text(750, 10, '', style).setScrollFactor(0).setDepth(11);
    this.scoreText = this.add.text(750, 39, '', style).setScrollFactor(0).setDepth(11);
    this.timerText = this.add.text(750, 68, '', { ...style, fontSize: '18px' }).setScrollFactor(0).setDepth(11);
    this.coinsText = this.add.text(18, this.scale.height - 35, '', style).setScrollFactor(0).setDepth(11);
    this.levelText = this.add.text(790, this.scale.height - 35, '', style).setScrollFactor(0).setDepth(11);
    this.refreshHud();
  }

  private refreshHud(): void {
    const seconds = Math.floor(this.survivedMs / 1000);
    const points = seconds * TIME_POINTS_PER_SECOND + this.score * KILL_POINTS;
    this.healthText.setText(`Здоровье: ${this.health}/${MAX_HEALTH}`);
    this.scoreText.setText(`Очки: ${points}`);
    this.timerText.setText(`Время: ${this.formatTime(seconds)}`);
    this.coinsText.setText(`Монеты: ${this.totalCoins}  •  Сбито: ${this.score}`);
    this.levelText.setText(`Уровень: ${this.level}`);
  }

  private formatTime(seconds: number): string {
    return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  }

  private movePlayer(seconds: number): void {
    let dx = Number(this.wasd.right.isDown) - Number(this.wasd.left.isDown);
    let dy = Number(this.wasd.down.isDown) - Number(this.wasd.up.isDown);
    if (dx || dy) {
      const length = Math.hypot(dx, dy);
      dx /= length;
      dy /= length;
      this.player.x += dx * PLAYER_SPEED * seconds;
      this.player.y += dy * PLAYER_SPEED * seconds;
    }
    this.player.x = Phaser.Math.Clamp(this.player.x, 30, WORLD_WIDTH - 30);
    this.player.y = Phaser.Math.Clamp(this.player.y, 125, WORLD_HEIGHT - 55);
  }

  private spawnDrone(): void {
    const viewBounds = this.cameras.main.worldView;
    const side = Phaser.Math.Between(0, 3);
    const x = side === 0 ? viewBounds.left - 35 : side === 1 ? viewBounds.right + 35 :
      Phaser.Math.Between(viewBounds.left + 30, viewBounds.right - 30);
    const y = side === 2 ? viewBounds.top - 35 : side === 3 ? viewBounds.bottom + 35 :
      Phaser.Math.Between(viewBounds.top + 30, viewBounds.bottom - 30);
    const spawnX = Phaser.Math.Clamp(x, 24, WORLD_WIDTH - 24);
    const spawnY = Phaser.Math.Clamp(y, 24, WORLD_HEIGHT - 24);
    const view = this.add.container(spawnX, spawnY);
    view.add([
      this.add.rectangle(0, 0, 34, 18, 0x8ba9b6),
      this.add.rectangle(-24, -3, 17, 4, 0xc1d0d5),
      this.add.rectangle(24, -3, 17, 4, 0xc1d0d5),
      this.add.circle(0, 1, 5, 0xf15a5a),
    ]);
    this.drones.push({ view, speed: 95 + Math.min(100, this.survivedMs / 1000) });
  }

  private moveDrones(seconds: number): void {
    for (const drone of this.drones) {
      const dx = this.player.x - drone.view.x;
      const dy = this.player.y - drone.view.y;
      const length = Math.hypot(dx, dy) || 1;
      drone.view.x += (dx / length) * drone.speed * seconds;
      drone.view.y += (dy / length) * drone.speed * seconds;
    }
  }

  private fireGift(): void {
    const target = this.drones.reduce((best, drone) => {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, drone.view.x, drone.view.y);
      return distance < best.distance ? { drone, distance } : best;
    }, { drone: this.drones[0], distance: Infinity }).drone;
    const dx = target.view.x - this.player.x;
    const dy = target.view.y - this.player.y;
    const length = Math.hypot(dx, dy) || 1;
    const view = this.add.circle(this.player.x, this.player.y, 8, 0xffda61);
    view.setStrokeStyle(2, 0xffffff);
    this.gifts.push({
      view, vx: (dx / length) * GIFT_SPEED, vy: (dy / length) * GIFT_SPEED,
      remainingMs: GIFT_LIFETIME_MS,
    });
  }

  private moveGifts(deltaMs: number): void {
    for (let i = this.gifts.length - 1; i >= 0; i--) {
      const gift = this.gifts[i];
      gift.view.x += gift.vx * deltaMs / 1000;
      gift.view.y += gift.vy * deltaMs / 1000;
      gift.remainingMs -= deltaMs;
      if (gift.remainingMs <= 0 || gift.view.x < -30 || gift.view.x > WORLD_WIDTH + 30 ||
          gift.view.y < -30 || gift.view.y > WORLD_HEIGHT + 30) {
        gift.view.destroy();
        this.gifts.splice(i, 1);
      }
    }
  }

  private checkGiftHits(): void {
    for (let i = this.gifts.length - 1; i >= 0; i--) {
      const gift = this.gifts[i];
      for (let j = this.drones.length - 1; j >= 0; j--) {
        const drone = this.drones[j];
        if (Phaser.Math.Distance.Between(gift.view.x, gift.view.y, drone.view.x, drone.view.y) > DRONE_RADIUS + 8) continue;
        this.dropCoin(drone.view.x, drone.view.y);
        gift.view.destroy();
        drone.view.destroy();
        this.gifts.splice(i, 1);
        this.drones.splice(j, 1);
        this.score++;
        this.refreshHud();
        break;
      }
    }
  }

  private checkPlayerHits(): void {
    if (this.survivedMs - this.lastHitAt < HIT_COOLDOWN_MS) return;
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const drone = this.drones[i];
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, drone.view.x, drone.view.y) > PLAYER_RADIUS + DRONE_RADIUS) continue;
      drone.view.destroy();
      this.drones.splice(i, 1);
      this.health--;
      this.lastHitAt = this.survivedMs;
      this.player.setAlpha(0.45);
      this.time.delayedCall(HIT_COOLDOWN_MS, () => this.player.setAlpha(1));
      this.refreshHud();
      if (this.health <= 0) this.endGame();
      break;
    }
  }

  private dropCoin(x: number, y: number): void {
    const view = this.add.circle(x, y, 9, 0xffcf52);
    view.setStrokeStyle(2, 0xffedac);
    this.coins.push({ view });
  }

  private collectCoins(): void {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, coin.view.x, coin.view.y) > PLAYER_RADIUS + 12) continue;
      coin.view.destroy();
      this.coins.splice(i, 1);
      this.totalCoins++;
      this.refreshHud();
      if (this.totalCoins >= this.nextUpgradeAt) {
        this.nextUpgradeAt += COINS_PER_UPGRADE;
        this.showUpgradeMenu();
        break;
      }
    }
  }

  private showUpgradeMenu(): void {
    this.upgradeOpen = true;
    const { width, height } = this.scale;
    const menu = this.add.container(width / 2, height / 2).setScrollFactor(0).setDepth(30);
    menu.add([
      this.add.rectangle(0, 0, width, height, 0x06101c, 0.78),
      this.add.rectangle(0, 0, 510, 290, 0x142c47).setStrokeStyle(3, 0xf8df9f),
      this.add.text(0, -103, `УРОВЕНЬ ${this.level + 1}`, {
        fontFamily: 'Arial, sans-serif', fontSize: '31px', color: '#f8df9f', fontStyle: 'bold',
      }).setOrigin(0.5),
      this.add.text(0, -53, 'Выбери улучшение', {
        fontFamily: 'Arial, sans-serif', fontSize: '19px', color: '#d4e3ee',
      }).setOrigin(0.5),
    ]);
    const choice = this.add.text(0, 20, '1  •  Скорострельность +1', {
      fontFamily: 'Arial, sans-serif', fontSize: '23px', color: '#10233d',
      backgroundColor: '#f8df9f', padding: { x: 28, y: 16 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    choice.on('pointerdown', () => this.chooseFireRateUpgrade());
    menu.add(choice);
    menu.add(this.add.text(0, 101, 'Нажми 1 или выбери мышью', {
      fontFamily: 'Arial, sans-serif', fontSize: '17px', color: '#b6cadc',
    }).setOrigin(0.5));
    this.upgradeMenu = menu;
  }

  private chooseFireRateUpgrade(): void {
    if (!this.upgradeOpen) return;
    this.level++;
    this.upgradeOpen = false;
    this.upgradeMenu?.destroy();
    this.upgradeMenu = undefined;
    this.fireTimer = Math.min(this.fireTimer,
      Math.max(MIN_FIRE_DELAY_MS, START_FIRE_DELAY_MS - (this.level - 1) * FIRE_DELAY_STEP_MS));
    this.refreshHud();
  }

  private endGame(): void {
    this.gameOver = true;
    const { width, height } = this.scale;
    const seconds = Math.floor(this.survivedMs / 1000);
    const points = seconds * TIME_POINTS_PER_SECOND + this.score * KILL_POINTS;
    const menu = this.add.container(width / 2, height / 2).setScrollFactor(0).setDepth(30);
    menu.add(this.add.rectangle(0, 0, width, height, 0x06101c, 0.84));
    menu.add(this.add.text(0, -112, 'ПОЛЁТ ЗАКОНЧЕН', {
      fontFamily: 'Arial, sans-serif', fontSize: '38px', color: '#f8df9f', fontStyle: 'bold',
    }).setOrigin(0.5));
    menu.add(this.add.text(0, -45, `Очки: ${points}   •   Сбито: ${this.score}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '23px', color: '#ffffff',
    }).setOrigin(0.5));
    menu.add(this.add.text(0, -7, `Время: ${this.formatTime(seconds)}   •   Монет: ${this.totalCoins}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '20px', color: '#b6cadc',
    }).setOrigin(0.5));
    const restart = this.add.text(0, 78, 'ИГРАТЬ СНОВА  [R]', {
      fontFamily: 'Arial, sans-serif', fontSize: '24px', color: '#10233d', backgroundColor: '#f8df9f',
      padding: { x: 22, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    restart.on('pointerdown', () => this.scene.restart());
    menu.add(restart);
  }
}

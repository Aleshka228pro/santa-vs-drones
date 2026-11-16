import Phaser from 'phaser';

const PLAYER_SPEED = 290;
const PLAYER_RADIUS = 19;
const DRONE_RADIUS = 18;
const GIFT_SPEED = 560;
const MAX_HEALTH = 5;
const HIT_COOLDOWN_MS = 1000;
const COINS_PER_UPGRADE = 5;
const START_FIRE_DELAY_MS = 650;
const MIN_FIRE_DELAY_MS = 180;
const FIELD_TOP = 105;

type Drone = { view: Phaser.GameObjects.Container; speed: number };
type Gift = { view: Phaser.GameObjects.Arc; vx: number; vy: number };
type Coin = { view: Phaser.GameObjects.Arc };

export class GameScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private healthText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private coinsText!: Phaser.GameObjects.Text;
  private upgradeText!: Phaser.GameObjects.Text;
  private drones: Drone[] = [];
  private gifts: Gift[] = [];
  private coins: Coin[] = [];
  private health = MAX_HEALTH;
  private score = 0;
  private totalCoins = 0;
  private level = 1;
  private survivedMs = 0;
  private spawnTimer = 0;
  private fireTimer = 0;
  private lastHitAt = -HIT_COOLDOWN_MS;
  private gameOver = false;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.health = MAX_HEALTH;
    this.score = 0;
    this.totalCoins = 0;
    this.level = 1;
    this.survivedMs = 0;
    this.spawnTimer = 700;
    this.fireTimer = 400;
    this.lastHitAt = -HIT_COOLDOWN_MS;
    this.gameOver = false;
    this.drones = [];
    this.gifts = [];
    this.coins = [];
    this.drawBackground();
    this.createPlayer();
    this.createHud();

    if (!this.input.keyboard) throw new Error('Keyboard input is unavailable.');
    const keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    this.wasd = keys as typeof this.wasd;
    this.input.keyboard.on('keydown-R', () => {
      if (this.gameOver) this.scene.restart();
    });
  }

  update(_time: number, delta: number): void {
    if (this.gameOver) return;
    const step = Math.min(delta, 50);
    this.survivedMs += step;
    this.movePlayer(step / 1000);
    this.spawnTimer -= step;
    if (this.spawnTimer <= 0) {
      this.spawnDrone();
      this.spawnTimer = Math.max(360, 1200 - this.survivedMs / 200);
    }
    this.fireTimer -= step;
    if (this.fireTimer <= 0 && this.drones.length > 0) {
      this.fireGift();
      this.fireTimer = Math.max(MIN_FIRE_DELAY_MS, START_FIRE_DELAY_MS - (this.level - 1) * 90);
    }
    this.moveDrones(step / 1000);
    this.moveGifts(step / 1000);
    this.checkGiftHits();
    this.checkPlayerHits();
    this.collectCoins();
  }

  private drawBackground(): void {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x10233d);
    for (let i = 0; i < 38; i++) {
      const x = (i * 173 + 41) % width;
      const y = FIELD_TOP + ((i * 97 + 23) % (height - FIELD_TOP - 20));
      this.add.circle(x, y, i % 4 === 0 ? 2 : 1, 0xb8d7ed, 0.48);
    }
    this.add.rectangle(width / 2, 48, width, 96, 0x071626, 0.94);
    this.add.rectangle(width / 2, 96, width, 2, 0x4d8198, 0.6);
  }

  private createPlayer(): void {
    const { width, height } = this.scale;
    this.player = this.add.container(width / 2, height / 2);
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
    this.add.text(18, 12, 'ДЕД МОРОЗ ПРОТИВ ДРОНОВ', {
      ...style, fontSize: '24px', fontStyle: 'bold', color: '#f7df9c',
    });
    this.add.text(18, 53, 'WASD — летать  •  подарки летят автоматически  •  собирай монеты', {
      ...style, fontSize: '16px', color: '#b6cadc',
    });
    this.healthText = this.add.text(640, 12, '', style);
    this.scoreText = this.add.text(640, 43, '', style);
    this.coinsText = this.add.text(18, this.scale.height - 35, '', style);
    this.upgradeText = this.add.text(600, this.scale.height - 35, '', style);
    this.refreshHud();
  }

  private refreshHud(): void {
    this.healthText.setText(`Здоровье: ${this.health}/${MAX_HEALTH}`);
    this.scoreText.setText(`Сбито: ${this.score}`);
    this.coinsText.setText(`Монеты: ${this.totalCoins}`);
    this.upgradeText.setText(`Скорострельность: ${this.level}`);
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
    this.player.x = Phaser.Math.Clamp(this.player.x, 30, this.scale.width - 30);
    this.player.y = Phaser.Math.Clamp(this.player.y, FIELD_TOP + 45, this.scale.height - 55);
  }

  private spawnDrone(): void {
    const { width, height } = this.scale;
    const side = Phaser.Math.Between(0, 3);
    const x = side === 0 ? -35 : side === 1 ? width + 35 : Phaser.Math.Between(30, width - 30);
    const y = side === 2 ? FIELD_TOP - 35 : side === 3 ? height + 35 : Phaser.Math.Between(FIELD_TOP + 25, height - 45);
    const view = this.add.container(x, y);
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
    this.gifts.push({ view, vx: (dx / length) * GIFT_SPEED, vy: (dy / length) * GIFT_SPEED });
  }

  private moveGifts(seconds: number): void {
    for (let i = this.gifts.length - 1; i >= 0; i--) {
      const gift = this.gifts[i];
      gift.view.x += gift.vx * seconds;
      gift.view.y += gift.vy * seconds;
      if (gift.view.x < -30 || gift.view.x > this.scale.width + 30 ||
          gift.view.y < FIELD_TOP - 40 || gift.view.y > this.scale.height + 30) {
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
      const newLevel = 1 + Math.floor(this.totalCoins / COINS_PER_UPGRADE);
      if (newLevel > this.level) {
        this.level = newLevel;
        this.showUpgrade();
      }
      this.refreshHud();
    }
  }

  private showUpgrade(): void {
    const label = this.add.text(this.player.x, this.player.y - 48, 'Скорострельность +1!', {
      fontFamily: 'Arial, sans-serif', fontSize: '20px', color: '#ffdc79', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);
    this.tweens.add({ targets: label, y: label.y - 36, alpha: 0, duration: 1100, onComplete: () => label.destroy() });
  }

  private endGame(): void {
    this.gameOver = true;
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x06101c, 0.84).setDepth(20);
    this.add.text(width / 2, height / 2 - 95, 'ПОЛЁТ ЗАКОНЧЕН', {
      fontFamily: 'Arial, sans-serif', fontSize: '38px', color: '#f8df9f', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);
    this.add.text(width / 2, height / 2 - 25, `Сбито дронов: ${this.score}   •   Монет: ${this.totalCoins}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '23px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(21);
    this.add.text(width / 2, height / 2 + 10, `Время: ${Math.floor(this.survivedMs / 1000)} сек.`, {
      fontFamily: 'Arial, sans-serif', fontSize: '20px', color: '#b6cadc',
    }).setOrigin(0.5).setDepth(21);
    const restart = this.add.text(width / 2, height / 2 + 78, 'ИГРАТЬ СНОВА  [R]', {
      fontFamily: 'Arial, sans-serif', fontSize: '24px', color: '#10233d', backgroundColor: '#f8df9f',
      padding: { x: 22, y: 12 },
    }).setOrigin(0.5).setDepth(21).setInteractive({ useHandCursor: true });
    restart.on('pointerdown', () => this.scene.restart());
  }
}

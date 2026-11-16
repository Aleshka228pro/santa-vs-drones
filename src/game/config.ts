import Phaser from 'phaser';
import { GameScene } from './GameScene';

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#0f172a',
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
    },
  };

  return new Phaser.Game(config);
}

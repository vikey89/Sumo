import { Color4, DynamicTexture, ParticleSystem, Scene, Texture, Vector3 } from './babylon';

const CONFETTI = ['#e4bf77', '#d8573c', '#f1ece0', '#7cc3c9', '#9fdc9a'];

/** One soft dot, shared by every burst. */
function dotTexture(scene: Scene): Texture {
  const texture = new DynamicTexture('particle-dot', { width: 32, height: 32 }, scene, false);
  const context = texture.getContext();
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  texture.update();
  texture.hasAlpha = true;
  return texture;
}

/** Short particle bursts: salt before a bout, confetti for a new champion. */
export class Effects {
  private readonly texture: Texture;

  constructor(private readonly scene: Scene, private readonly reducedMotion: () => boolean) {
    this.texture = dotTexture(scene);
  }

  /** A handful of salt thrown up and forward, as wrestlers do to purify the ring. */
  salt(position: Vector3, facing: number, height: number): void {
    if (this.reducedMotion()) return;
    const forward = new Vector3(Math.sin(facing), 0, Math.cos(facing));
    const system = this.burst(position.add(new Vector3(0, height, 0)).addInPlace(forward.scale(0.6)), 70, 1.1);
    system.color1 = new Color4(1, 1, 1, 1);
    system.color2 = new Color4(0.95, 0.93, 0.88, 0.9);
    system.colorDead = new Color4(1, 1, 1, 0);
    system.minSize = 0.06;
    system.maxSize = 0.14;
    system.direction1 = forward.scale(1.5).addInPlace(new Vector3(-0.6, 3.6, -0.6));
    system.direction2 = forward.scale(3).addInPlace(new Vector3(0.6, 5, 0.6));
    system.gravity = new Vector3(0, -9, 0);
    system.start();
  }

  /** Paper confetti raining over a fighter. */
  confetti(position: Vector3, height: number): void {
    if (this.reducedMotion()) return;
    for (const hex of CONFETTI) {
      const system = this.burst(position.add(new Vector3(0, height + 0.6, 0)), 36, 2.6);
      const color = Color4.FromHexString(`${hex}ff`);
      system.color1 = color;
      system.color2 = color;
      system.colorDead = new Color4(color.r, color.g, color.b, 0);
      system.minSize = 0.12;
      system.maxSize = 0.22;
      system.minEmitBox = new Vector3(-1.5, 0, -1.5);
      system.maxEmitBox = new Vector3(1.5, 0.5, 1.5);
      system.direction1 = new Vector3(-2.5, 3, -2.5);
      system.direction2 = new Vector3(2.5, 6, 2.5);
      system.gravity = new Vector3(0, -4.5, 0);
      system.minAngularSpeed = -6;
      system.maxAngularSpeed = 6;
      system.start();
    }
  }

  private burst(emitter: Vector3, count: number, lifetime: number): ParticleSystem {
    const system = new ParticleSystem('burst', count, this.scene);
    system.particleTexture = this.texture;
    system.emitter = emitter;
    system.manualEmitCount = count;
    system.minLifeTime = lifetime * 0.6;
    system.maxLifeTime = lifetime;
    system.minEmitPower = 0.8;
    system.maxEmitPower = 1.4;
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    system.targetStopDuration = lifetime;
    // Not disposeOnStop: that would also dispose the shared texture.
    system.onAnimationEnd = () => window.setTimeout(() => system.dispose(false));
    return system;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

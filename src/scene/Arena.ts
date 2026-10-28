import {
  ArcRotateCamera,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  Engine,
  GlowLayer,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointerEventTypes,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
  Viewport,
} from './babylon';
import type { AbstractMesh, PickingInfo } from './babylon';
import type { Customization } from '../customizations';
import type { AppInfo } from '../types';
import { BoutDirector } from './Bout';
import type { Kimarite } from './Bout';
import { Crowd } from './Crowd';
import { Effects } from './Effects';
import { Fighter } from './Fighter';
import { scatterLayout } from './layout';

const ARENA_CENTER = new Vector3(0, 1.1, 0);
const DEFAULT_BETA = 1.08;
const GROUND_Y = 0.53;
/** Radius of the straw ring: drop a fighter beyond it to push the app out. */
const RING_RADIUS = 19.9;
/** What the camera frames: the raised dohyō plus a margin for the fighters' heads. */
const FRAME_RADIUS = 23.2;
const FRAME_HEIGHT = 2.6;
/** Share of the field of view the ring may use, leaving room for the overlays. */
const FIT_MARGIN = 0.94;
const PORTRAIT_CROP = 0.62;
/** In portrait, look down more steeply so the ring is rounder and fills the height. */
const PORTRAIT_BETA = 0.78;
const DRAG_THRESHOLD_PX = 6;
const LABEL_ATTEMPTS = 4;
/** How much closer the camera moves while a bout is on. */
const BOUT_ZOOM = 0.24;

/** The app a mesh belongs to: fighters tag their meshes with it. */
function meshId(mesh: AbstractMesh | null | undefined): string | undefined {
  return (mesh?.metadata as { id?: string } | null | undefined)?.id;
}

function pickedId(pick: PickingInfo | null): string | undefined {
  return pick?.hit ? meshId(pick.pickedMesh) : undefined;
}
/** Game speed during the tachiai slow motion, and how long it lasts in real seconds. */
const SLOW_MOTION = 0.3;
/** Frame rate while something happens (a bout, the user's hand), and while the arena just breathes. */
const ACTIVE_FPS = 60;
const IDLE_FPS = 30;
const IDLE_AFTER_MS = 3000;
const SLOW_MOTION_SECONDS = 0.9;
/** Label priority of the referee: after the named fighters, before the compact weight pills. */
const REFEREE_RANK = 5.5;

/** Lighting at ease and under heavy memory pressure; the arena blends between the two. */
const MOOD = {
  calm: { key: '#ffd6a0', ambient: '#ffe4c1', rim: '#7d9fc5', ambientIntensity: 0.6, rimIntensity: 0.7, fog: '#010101' },
  tense: { key: '#ff9f7f', ambient: '#ffc6b3', rim: '#e0573a', ambientIntensity: 0.5, rimIntensity: 1.05, fog: '#0b0201' },
};
const COLOR = {
  calm: { key: Color3.FromHexString(MOOD.calm.key), ambient: Color3.FromHexString(MOOD.calm.ambient), rim: Color3.FromHexString(MOOD.calm.rim), fog: Color3.FromHexString(MOOD.calm.fog) },
  tense: { key: Color3.FromHexString(MOOD.tense.key), ambient: Color3.FromHexString(MOOD.tense.ambient), rim: Color3.FromHexString(MOOD.tense.rim), fog: Color3.FromHexString(MOOD.tense.fog) },
};

export interface ArenaEvents {
  onSelect(process?: AppInfo): void;
  onBoutStart(east: AppInfo, west: AppInfo, eastChance: number): void;
  onBoutClash(): void;
  onBoutResult(winner: AppInfo, loser: AppInfo, kimarite: Kimarite): void;
  onBoutAbort(): void;
  /** A fighter or its label was tapped; return true to consume the tap (e.g. as a prediction). */
  onPick?(process: AppInfo): boolean;
  /** A fighter was dropped outside the ring; answer with `resolvePushOut`. */
  onPushOut(process: AppInfo): void;
  customization(id: string): Customization;
}

interface Drag {
  id: string;
  startX: number;
  startY: number;
  active: boolean;
}

function pbr(scene: Scene, name: string, color: string, roughness: number, metallic = 0): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = Color3.FromHexString(color);
  mat.roughness = roughness;
  mat.metallic = metallic;
  return mat;
}

export class Arena {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly shadows: ShadowGenerator;
  private readonly glow: GlowLayer;
  private readonly crowd: Crowd;
  private readonly director: BoutDirector;
  private readonly fighters = new Map<string, Fighter>();
  private readonly edge: Mesh;
  private readonly edgeMaterial: StandardMaterial;
  private readonly viewport = new Viewport(0, 0, 0, 0);
  private lineup: Fighter[] = [];
  private selectedId?: string;
  private drag?: Drag;
  /** Fighters waiting outside the ring for the user to confirm, or for their app to exit. */
  private readonly ejected = new Set<string>();
  private elapsed = 0;
  private boutZoom = 0;
  private readonly focus = new Vector3();
  private readonly effects: Effects;
  private readonly ambient: HemisphericLight;
  private readonly key: DirectionalLight;
  private readonly rim: DirectionalLight;
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private hoveredId?: string;
  private timeScale = 1;
  private lastFrame = 0;
  private lastInput = 0;
  private slowUntil = 0;
  private shake = 0;
  private tension = 0;
  private targetTension = 0;
  /** Set once the first line-up is in, so the opening roster doesn't all throw salt at once. */
  private populated = false;
  private championId?: string;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly labelLayer: HTMLElement,
    private readonly events: ArenaEvents,
  ) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    // Render at the display's real density: on a Retina screen anything less looks soft.
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio, 2));
    this.scene = new Scene(this.engine);
    // Hover does its own, filtered pick; the scene's pick of every mesh on each move is wasted.
    this.scene.skipPointerMovePicking = true;
    this.scene.clearColor = new Color4(0.004, 0.004, 0.003, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = new Color3(0.004, 0.004, 0.003);
    this.scene.fogDensity = 0.006;

    this.camera = new ArcRotateCamera('camera', Math.PI / 2, DEFAULT_BETA, 52, ARENA_CENTER.clone(), this.scene);
    this.camera.attachControl(canvas, true);
    this.camera.lowerRadiusLimit = 14;
    this.camera.upperRadiusLimit = 160;
    this.camera.lowerBetaLimit = 0.55;
    this.camera.upperBetaLimit = 1.38;
    this.camera.panningSensibility = 0;
    this.camera.wheelDeltaPercentage = 0.01;
    this.camera.inertia = 0.82;
    this.frame();

    const ambient = this.ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
    ambient.diffuse = Color3.FromHexString('#ffe4c1');
    ambient.groundColor = Color3.FromHexString('#323746');
    ambient.intensity = 0.6;

    const key = this.key = new DirectionalLight('key', new Vector3(-0.45, -1, -0.35), this.scene);
    key.position = new Vector3(12, 24, 16);
    key.diffuse = Color3.FromHexString('#ffd6a0');
    key.intensity = 1.4;
    key.shadowMinZ = 1;
    key.shadowMaxZ = 250;
    this.shadows = new ShadowGenerator(2048, key);
    this.shadows.useBlurExponentialShadowMap = true;
    this.shadows.blurKernel = 32;
    this.shadows.darkness = 0.35;
    // Fighters move slowly enough that a shadow one frame late is invisible.
    this.shadows.getShadowMap()!.refreshRate = 2;

    const rim = this.rim = new DirectionalLight('rim', new Vector3(0.6, -0.5, 0.7), this.scene);
    rim.diffuse = Color3.FromHexString('#7d9fc5');
    rim.intensity = 0.7;

    this.buildArena();
    this.crowd = new Crowd(this.scene);
    this.effects = new Effects(this.scene, () => this.reducedMotion);
    this.edgeMaterial = new StandardMaterial('edge-warning', this.scene);
    this.edgeMaterial.disableLighting = true;
    this.edgeMaterial.alpha = 0.85;
    this.edge = MeshBuilder.CreateTorus('edge-warning', { diameter: RING_RADIUS * 2, thickness: 0.22, tessellation: 128 }, this.scene);
    this.edge.position.y = 0.6;
    this.edge.material = this.edgeMaterial;
    this.edge.isPickable = false;
    this.edge.setEnabled(false);

    // Only the rings glow: by default the layer redraws every mesh in the arena once more.
    this.glow = new GlowLayer('glow', this.scene);
    this.glow.intensity = 0.18;
    this.glow.addIncludedOnlyMesh(this.edge);
    const pipeline = new DefaultRenderingPipeline('presentation', true, this.scene, [this.camera]);
    // MSAA already smooths the edges; FXAA on top of it blurs the faces and the labels.
    // On a Retina screen the pixels are dense enough for 2 samples.
    pipeline.samples = window.devicePixelRatio >= 2 ? 2 : 4;
    pipeline.fxaaEnabled = false;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.88;
    pipeline.bloomWeight = 0.1;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.contrast = 1.1;
    pipeline.imageProcessing.exposure = 0.85;

    this.director = new BoutDirector({
      onStart: (east, west, eastChance) => this.events.onBoutStart(east.process, west.process, eastChance),
      onAbort: () => this.events.onBoutAbort(),
      onShikiri: (east, west) => {
        for (const fighter of [east, west]) this.effects.salt(fighter.root.position, fighter.root.rotation.y, fighter.root.scaling.y * 2);
      },
      onClash: () => {
        this.crowd.cheer(0.5);
        if (!this.reducedMotion) {
          this.slowUntil = performance.now() + SLOW_MOTION_SECONDS * 1000;
          this.shake = 1;
        }
        this.events.onBoutClash();
      },
      onResult: (winner, loser, kimarite) => {
        this.crowd.cheer(1.2);
        this.effects.confetti(winner.root.position, winner.root.scaling.y * 2);
        this.events.onBoutResult(winner.process, loser.process, kimarite);
      },
    });

    this.scene.onPointerObservable.add((info) => {
      this.lastInput = performance.now();
      switch (info.type) {
        case PointerEventTypes.POINTERDOWN: this.pointerDown(); break;
        case PointerEventTypes.POINTERMOVE: this.pointerMove(); break;
        case PointerEventTypes.POINTERUP: this.pointerUp(); break;
        case PointerEventTypes.POINTERTAP: {
          // A tap, not every pointer-down: dragging to orbit the camera must not clear the selection.
          const pick = info.pickInfo ?? this.scene.pick(this.scene.pointerX, this.scene.pointerY);
          this.tap(pickedId(pick));
          break;
        }
      }
    });

    window.addEventListener('resize', this.resize);
    this.canvas.addEventListener('pointerleave', () => this.hover(undefined));
    this.engine.runRenderLoop(() => {
      // A 120 Hz display would otherwise redraw hundreds of meshes 120 times a second.
      const now = performance.now();
      const busy = this.director.active || this.drag !== undefined || now - this.lastInput < IDLE_AFTER_MS
        || now < this.slowUntil || this.shake > 0.01;
      if (now - this.lastFrame < 1000 / (busy ? ACTIVE_FPS : IDLE_FPS) - 2) return;
      const real = Math.min((now - this.lastFrame) / 1000, 0.05);
      this.lastFrame = now;
      // The tachiai plays in slow motion, then eases back to full speed.
      const slow = performance.now() < this.slowUntil ? SLOW_MOTION : 1;
      this.timeScale += (slow - this.timeScale) * (1 - Math.exp(-real * (slow < 1 ? 20 : 4)));
      const delta = real * this.timeScale;
      this.elapsed += delta;
      if (!this.drag?.active) this.director.update(this.elapsed, this.lineup);
      this.fighters.forEach((fighter) => fighter.update(this.elapsed, delta));
      this.crowd.update(this.elapsed, delta);
      this.followSelection(real);
      this.zoomOnBout(real);
      this.shakeCamera(real);
      this.updateMood(real);
      this.scene.render();
      this.placeLabels(real);
    });
  }

  /**
   * Closest camera distance at which the whole ring rim (and the heads above it) projects
   * inside the viewport. Perspective makes the near rim look bigger, so this searches
   * numerically instead of trusting a flat estimate.
   */
  private fitDistance(): number {
    const aspect = this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1);
    const tanVertical = Math.tan(this.camera.fov / 2) * FIT_MARGIN;
    // In portrait, framing the full width would leave a tiny ring: crop the sides instead.
    const tanHorizontal = Math.tan(this.camera.fov / 2) * aspect * FIT_MARGIN / (aspect < 1 ? PORTRAIT_CROP : 1);
    const alpha = this.camera.alpha;
    const beta = this.camera.beta;
    const forward = new Vector3(-Math.cos(alpha) * Math.sin(beta), -Math.cos(beta), -Math.sin(alpha) * Math.sin(beta));
    const right = Vector3.Cross(Vector3.Up(), forward).normalize();
    const up = Vector3.Cross(forward, right);
    const fits = (distance: number): boolean => {
      const eye = ARENA_CENTER.subtract(forward.scale(distance));
      for (let i = 0; i < 32; i++) {
        const angle = i / 32 * Math.PI * 2;
        for (const height of [0.4, FRAME_HEIGHT]) {
          const offset = new Vector3(Math.cos(angle) * FRAME_RADIUS, height, Math.sin(angle) * FRAME_RADIUS).subtractInPlace(eye);
          const depth = Vector3.Dot(offset, forward);
          if (depth <= 0) return false;
          if (Math.abs(Vector3.Dot(offset, right)) / depth > tanHorizontal) return false;
          if (Math.abs(Vector3.Dot(offset, up)) / depth > tanVertical) return false;
        }
      }
      return true;
    };
    let near = 10;
    let far = 200;
    for (let step = 0; step < 24; step++) {
      const middle = (near + far) / 2;
      if (fits(middle)) far = middle;
      else near = middle;
    }
    return far;
  }

  private frame(): void {
    const portrait = this.canvas.clientWidth < this.canvas.clientHeight;
    this.camera.beta = portrait ? PORTRAIT_BETA : DEFAULT_BETA;
    this.camera.radius = this.fitDistance();
  }

  private readonly resize = (): void => {
    this.engine.resize();
    this.frame();
  };

  private get reducedMotion(): boolean {
    return this.motionQuery.matches;
  }

  /** Glide the orbit target toward the selected fighter, and back to the ring centre. */
  private followSelection(delta: number): void {
    const fighter = this.selectedId === undefined || this.reducedMotion ? undefined : this.fighters.get(this.selectedId);
    if (fighter) this.focus.set(fighter.root.position.x * 0.6, ARENA_CENTER.y, fighter.root.position.z * 0.6);
    else this.focus.copyFrom(ARENA_CENTER);
    Vector3.LerpToRef(this.camera.target, this.focus, 1 - Math.exp(-delta * 2.5), this.camera.target);
  }

  /** Lean in while a bout is on (unless the user is following a fighter), keeping any manual zoom. */
  private zoomOnBout(delta: number): void {
    const goal = this.director.active && this.selectedId === undefined && !this.reducedMotion ? 1 : 0;
    const previous = this.boutZoom;
    this.boutZoom += (goal - this.boutZoom) * (1 - Math.exp(-delta * 1.6));
    this.camera.radius *= (1 - BOUT_ZOOM * this.boutZoom) / (1 - BOUT_ZOOM * previous);
  }

  /** A short jolt of the orbit at the clash. */
  private shakeCamera(delta: number): void {
    if (this.shake <= 0.001) return;
    const previous = this.shake;
    this.shake *= Math.exp(-delta * 6);
    const wobble = (amount: number, speed: number) => Math.sin(this.elapsed * speed) * amount;
    this.camera.alpha += wobble(0.012, 61) * (previous - this.shake) * 8;
    this.camera.beta += wobble(0.008, 47) * (previous - this.shake) * 8;
  }

  /** Warm, calm light when the Mac is light; red and restless when memory runs out. */
  private updateMood(delta: number): void {
    this.tension += (this.targetTension - this.tension) * (1 - Math.exp(-delta * 0.7));
    const t = this.tension;
    Color3.LerpToRef(COLOR.calm.key, COLOR.tense.key, t, this.key.diffuse);
    Color3.LerpToRef(COLOR.calm.ambient, COLOR.tense.ambient, t, this.ambient.diffuse);
    Color3.LerpToRef(COLOR.calm.rim, COLOR.tense.rim, t, this.rim.diffuse);
    Color3.LerpToRef(COLOR.calm.fog, COLOR.tense.fog, t, this.scene.fogColor);
    this.scene.clearColor.set(this.scene.fogColor.r, this.scene.fogColor.g, this.scene.fogColor.b, 1);
    this.ambient.intensity = MOOD.calm.ambientIntensity + (MOOD.tense.ambientIntensity - MOOD.calm.ambientIntensity) * t;
    const pulse = t > 0.75 && !this.reducedMotion ? Math.sin(this.elapsed * 2.4) * 0.25 * (t - 0.75) * 4 : 0;
    this.rim.intensity = MOOD.calm.rimIntensity + (MOOD.tense.rimIntensity - MOOD.calm.rimIntensity) * t + pulse;
  }

  /**
   * Labels go in priority order (selection, then rank); one that would cover a placed label
   * climbs above it, and if there is still no room it fades so the important ones stay legible.
   */
  private placeLabels(delta: number): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.camera.viewport.toGlobalToRef(width, height, this.viewport);
    const transform = this.scene.getTransformMatrix();
    const bout = this.director.active;
    const priority = (id: string, fighter: Fighter) => id === this.selectedId ? -2 : this.director.involves(fighter) ? -1 : fighter.rankIndex;
    const visible = [...this.fighters.entries()]
      .filter(([, fighter]) => fighter.project(this.viewport, transform))
      .sort(([idA, a], [idB, b]) => priority(idA, a) - priority(idB, b));
    const placed: number[] = [];
    for (const [id, fighter] of visible) {
      const box = fighter.labelBox;
      const { x, y } = fighter.screen;
      let lift = 0;
      let free = false;
      for (let attempt = 0; attempt < LABEL_ATTEMPTS && !free; attempt++) {
        const left = x - box.width / 2 - 3;
        const right = x + box.width / 2 + 3;
        const bottom = y - lift + 2;
        const top = bottom - box.height - 8;
        free = true;
        for (let i = 0; i < placed.length; i += 4) {
          if (left < placed[i + 2] && right > placed[i] && top < placed[i + 3] && bottom > placed[i + 1]) {
            free = false;
            break;
          }
        }
        if (free) placed.push(left, top, right, bottom);
        else lift += box.height + 6;
      }
      const fighting = this.director.involves(fighter);
      fighter.markFighting(fighting);
      fighter.placeLabel(free ? lift : 0, !free || (bout && !fighting && id !== this.selectedId), delta);
    }
  }

  private pointerDown(): void {
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
    const id = pickedId(pick);
    if (id === undefined || this.ejected.has(id)) return;
    this.drag = { id, startX: this.scene.pointerX, startY: this.scene.pointerY, active: false };
    this.camera.detachControl();
  }

  private pointerMove(): void {
    const drag = this.drag;
    if (!drag) {
      const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) => meshId(mesh) !== undefined);
      this.hover(pickedId(pick));
      return;
    }
    this.canvas.style.cursor = 'grabbing';
    const fighter = this.fighters.get(drag.id);
    if (!fighter) return;
    if (!drag.active) {
      if (Math.hypot(this.scene.pointerX - drag.startX, this.scene.pointerY - drag.startY) < DRAG_THRESHOLD_PX) return;
      drag.active = true;
      if (this.director.involves(fighter)) this.director.abort(this.elapsed);
      fighter.setStance('held');
      this.edge.setEnabled(true);
    }
    const point = this.groundPoint();
    if (!point) return;
    fighter.setScript(point, undefined, 40);
    // Protected apps never turn the rim red: dropping them outside does nothing.
    const outside = Math.hypot(point.x, point.z) > RING_RADIUS && !fighter.process.locked;
    this.edgeMaterial.emissiveColor = Color3.FromHexString(fighter.process.locked ? '#8e8d83' : outside ? '#ff5a3c' : '#e4bf77');
    this.edgeMaterial.alpha = outside ? 0.95 : 0.4;
  }

  private pointerUp(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = undefined;
    this.camera.attachControl(this.canvas, true);
    this.edge.setEnabled(false);
    this.canvas.style.cursor = this.hoveredId ? 'grab' : '';
    if (!drag.active) return;
    const fighter = this.fighters.get(drag.id);
    if (!fighter) return;
    const { x, z } = fighter.root.position;
    const point = this.groundPoint();
    const outside = Math.hypot(point?.x ?? x, point?.z ?? z) > RING_RADIUS;
    if (outside) {
      this.ejected.add(drag.id);
      fighter.setStance('crouch');
      this.events.onPushOut(fighter.process);
    } else {
      this.release(drag.id);
    }
  }

  private hover(id?: string): void {
    if (id === this.hoveredId) return;
    if (this.hoveredId !== undefined) this.fighters.get(this.hoveredId)?.setHovered(false);
    this.hoveredId = id;
    if (id !== undefined) this.fighters.get(id)?.setHovered(true);
    this.canvas.style.cursor = id === undefined ? '' : 'grab';
  }

  private tap(id?: string): void {
    const fighter = id === undefined ? undefined : this.fighters.get(id);
    if (fighter && this.events.onPick?.(fighter.process)) return;
    this.select(id);
  }

  /** Where the pointer ray meets the ring surface. */
  private groundPoint(): Vector3 | undefined {
    const ray = this.scene.createPickingRay(this.scene.pointerX, this.scene.pointerY, null, this.camera);
    if (Math.abs(ray.direction.y) < 1e-4) return undefined;
    const distance = (GROUND_Y - ray.origin.y) / ray.direction.y;
    if (distance < 0) return undefined;
    const point = ray.origin.add(ray.direction.scale(distance));
    const reach = Math.hypot(point.x, point.z);
    const limit = RING_RADIUS + 4;
    if (reach > limit) point.scaleInPlace(limit / reach);
    point.y = GROUND_Y;
    return point;
  }

  /** The user decided: knock the fighter down while the app quits, or walk back in. */
  resolvePushOut(id: string, confirmed: boolean): void {
    const fighter = this.fighters.get(id);
    if (!fighter) return;
    if (confirmed) {
      fighter.setStance('fall-back');
      this.crowd.cheer(1.4);
    } else {
      this.release(id);
    }
  }

  /** Hand a fighter back to the layout, e.g. when its app refused to quit. */
  release(id: string): void {
    this.ejected.delete(id);
    const fighter = this.fighters.get(id);
    fighter?.setScript(undefined);
    fighter?.setStance('free');
  }

  setExcitement(level: number): void {
    this.crowd.setExcitement(level);
  }

  /** 0 = plenty of free memory, 1 = memory nearly exhausted. */
  setTension(level: number): void {
    this.targetTension = Math.min(1, Math.max(0, level));
  }

  /** Payouts over the fighters' heads while predictions are open; pass nothing to clear them. */
  showOdds(odds?: Record<string, string>): void {
    this.fighters.forEach((fighter, id) => fighter.setOdds(odds?.[id]));
  }

  cheer(strength = 1): void {
    this.crowd.cheer(strength);
  }

  requestBout(): void {
    this.director.requestBout(this.elapsed);
  }

  customize(id: string, customization: Customization): void {
    this.fighters.get(id)?.setCustomization(customization);
  }

  private buildArena(): void {
    const clay = pbr(this.scene, 'clay', '#b4774f', 0.94);
    const edge = pbr(this.scene, 'edge', '#3b3028', 0.82);
    const sand = pbr(this.scene, 'sand', '#d0aa75', 1);
    const straw = pbr(this.scene, 'straw', '#d2b46d', 0.9);
    const dark = pbr(this.scene, 'ground', '#050505', 0.96);
    const gold = pbr(this.scene, 'gold', '#bd9552', 0.42, 0.65);
    const pedestalMaterial = pbr(this.scene, 'pedestal-mat', '#24211b', 0.8);

    const floor = MeshBuilder.CreateGround('floor', { width: 260, height: 260 }, this.scene);
    floor.position.y = -0.31;
    floor.material = dark;
    floor.receiveShadows = true;

    const base = MeshBuilder.CreateCylinder('arena-base', { diameter: 46, height: 0.64, tessellation: 128 }, this.scene);
    base.material = edge;
    base.receiveShadows = true;

    const top = MeshBuilder.CreateCylinder('arena-top', { diameter: 45.3, height: 0.15, tessellation: 128 }, this.scene);
    top.position.y = 0.36;
    top.material = clay;
    top.receiveShadows = true;

    const dohyo = MeshBuilder.CreateCylinder('dohyo', { diameter: 42, height: 0.12, tessellation: 128 }, this.scene);
    dohyo.position.y = 0.46;
    dohyo.material = sand;
    dohyo.receiveShadows = true;

    const ring = MeshBuilder.CreateTorus('ring', { diameter: 39.8, thickness: 0.12, tessellation: 128 }, this.scene);
    ring.position.y = 0.54;
    ring.material = straw;

    const strawParts: Mesh[] = [ring];
    for (let i = 0; i < 40; i++) {
      const angle = i / 40 * Math.PI * 2;
      const bale = MeshBuilder.CreateBox('straw-bale', { width: 0.85, height: 0.07, depth: 0.2 }, this.scene);
      bale.position.set(Math.cos(angle) * 19.85, 0.55, Math.sin(angle) * 19.85);
      bale.rotation.y = -angle;
      strawParts.push(bale);
    }
    for (const side of [-1, 1]) {
      const line = MeshBuilder.CreateBox('starting-line', { width: 1.4, height: 0.015, depth: 0.18 }, this.scene);
      line.position.set(side * 1.1, 0.535, 0);
      strawParts.push(line);
    }
    const strawMesh = Mesh.MergeMeshes(strawParts, true, true)!;
    strawMesh.material = straw;
    strawMesh.receiveShadows = true;

    const trim = MeshBuilder.CreateTorus('gold-trim', { diameter: 46.05, thickness: 0.045, tessellation: 128 }, this.scene);
    trim.position.y = 0.17;
    trim.material = gold;

    const pedestal = MeshBuilder.CreateCylinder('pedestal', { diameter: 48, height: 0.08, tessellation: 128 }, this.scene);
    pedestal.position.y = -0.29;
    pedestal.material = pedestalMaterial;

    for (const mesh of [floor, base, top, dohyo, strawMesh, trim, pedestal]) {
      mesh.isPickable = mesh === dohyo || mesh === floor;
      mesh.freezeWorldMatrix();
    }
    for (const mat of [clay, edge, sand, straw, dark, gold, pedestalMaterial]) mat.freeze();
  }

  setProcesses(processes: AppInfo[], limit: number): void {
    const visible = [...processes].sort((a, b) => b.memory - a.memory).slice(0, limit);
    const visibleIds = new Set(visible.map((process) => process.id));

    for (const [id, fighter] of this.fighters) {
      if (!visibleIds.has(id)) {
        if (this.director.involves(fighter)) this.director.abort(this.elapsed);
        if (this.drag?.id === id) {
          this.drag = undefined;
          this.camera.attachControl(this.canvas, true);
          this.edge.setEnabled(false);
        }
        this.glow.removeIncludedOnlyMesh(fighter.selection);
        fighter.dispose();
        this.fighters.delete(id);
        this.ejected.delete(id);
        if (this.selectedId === id) this.select(undefined);
      }
    }

    this.lineup = visible.map((process) => {
      let fighter = this.fighters.get(process.id);
      if (!fighter) {
        fighter = new Fighter(this.scene, process, this.shadows, this.labelLayer, (id) => this.tap(id));
        this.glow.addIncludedOnlyMesh(fighter.selection);
        fighter.setCustomization(this.events.customization(process.id));
        this.fighters.set(process.id, fighter);
        if (this.populated) {
          const entering = fighter;
          // Salt once it has its spot and size.
          window.setTimeout(() => this.effects.salt(entering.root.position, entering.root.rotation.y, entering.root.scaling.y * 2), 400);
        }
      } else {
        fighter.updateProcess(process);
      }
      return fighter;
    });
    let rank = 0;
    for (const fighter of this.lineup) fighter.setRank(fighter.process.system ? REFEREE_RANK : rank++);
    const champion = this.lineup.find((fighter) => !fighter.process.system);
    if (champion && this.populated && this.championId !== undefined && champion.process.id !== this.championId) {
      this.effects.confetti(champion.root.position, champion.root.scaling.y * 2);
      this.crowd.cheer(1);
    }
    this.championId = champion?.process.id;
    this.populated = true;

    const positions = scatterLayout(
      this.lineup.map((fighter) => ({ radius: fighter.radius, target: fighter.layoutTarget })),
      this.director.active ? { x: 0, z: 0, radius: 7 } : undefined,
    );
    const extent = positions.reduce((maximum, position, index) => Math.max(
      maximum,
      Math.hypot(position.x, position.z) + this.lineup[index].radius,
    ), 1);
    const layoutScale = Math.min(1, 18.5 / extent);
    this.lineup.forEach((fighter, index) => {
      fighter.setPosition(new Vector3(positions[index].x * layoutScale, GROUND_Y, positions[index].z * layoutScale));
    });
  }

  select(id?: string): void {
    this.selectedId = id;
    this.fighters.forEach((fighter, fighterId) => fighter.setSelected(fighterId === id));
    this.events.onSelect(id === undefined ? undefined : this.fighters.get(id)?.process);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.fighters.forEach((fighter) => fighter.dispose());
    this.fighters.clear();
    this.effects.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}

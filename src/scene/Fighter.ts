import { Color3, Matrix, Mesh, MeshBuilder, PBRMaterial, Scalar, Scene, ShadowGenerator, TransformNode, Vector3, Viewport } from './babylon';
import type { Customization } from '../customizations';
import { REFEREE, rankFor } from '../ranks';
import type { AppInfo } from '../types';
import { formatBytes } from '../types';
import type { LayoutPoint } from './layout';
import { FighterBody } from './FighterBody';
import { moodFor } from './FighterFace';
import { FighterLabel } from './FighterLabel';
import { material, selectionMaterial, sharedMaterial } from './fighter-materials';
import { pose, stomp } from './fighter-pose';
import type { Stance } from './fighter-pose';
import { makeExtraFood, makeFood, makeGunbai } from './fighter-props';

export type { Stance } from './fighter-pose';

const CLOTH_COLORS = ['#d95f43', '#397f7b', '#d5a943', '#76618e', '#426789', '#a64e5c', '#52804e', '#c17437'];
const GROWTH_MS = 4500;
const SHIKO_MS = 3200;
const LIFT_HELD = 1.4;
const REFEREE_CLOTH = '#4b3a6b';

function memoryToWeight(memory: number): number {
  return Scalar.Clamp(1 - Math.exp(-memory / (3 * 1024 ** 3)), 0.03, 1);
}

function identityHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

interface Script {
  position: Vector3;
  facing?: number;
  speed: number;
}

export class Fighter {
  readonly root: TransformNode;
  readonly label: HTMLButtonElement;
  process: AppInfo;

  private readonly rig: FighterBody;
  private readonly nameplate: FighterLabel;
  private readonly food: TransformNode;
  private readonly leftFood: TransformNode;
  private readonly pizza: TransformNode;
  private readonly soda: TransformNode;
  /** Gold ring under a selected fighter; the only part of it that glows. */
  readonly selection: Mesh;
  private readonly gunbai?: TransformNode;
  private readonly skin: PBRMaterial;
  private readonly cloth: PBRMaterial;
  private readonly hair: PBRMaterial;
  private readonly defaultCloth: Color3;
  private readonly bodyBuild: number;
  private readonly height: number;
  private nickname?: string;
  private targetWeight: number;
  private weight: number;
  private overallScale = 1;
  private overallHeight = 1;
  private targetPosition = new Vector3();
  private groundY = 0;
  private wander = new Vector3();
  private wanderUntil = 0;
  private eatingUntil = 0;
  private growthFrom = 0;
  private growthStartedAt = 0;
  private shikoStartedAt = 0;
  private script?: Script;
  private stance: Stance = 'free';
  private stanceStartedAt = 0;
  private rank = -1;
  private facing: number;
  private speed = 0;
  private stepPhase: number;
  private phase: number;
  private readonly handPosition = new Vector3();
  private readonly mouthPosition = new Vector3();

  constructor(
    scene: Scene,
    process: AppInfo,
    shadows: ShadowGenerator,
    labelLayer: HTMLElement,
    onSelect: (id: string) => void,
  ) {
    this.process = process;
    const identity = identityHash(process.id);
    const variant = (identity >>> 4) % 4;
    this.phase = identity % 100 / 100 * Math.PI * 2;
    this.stepPhase = this.phase;
    this.facing = this.phase;
    this.bodyBuild = 0.94 + (identity >>> 8) % 12 / 100;
    this.height = 0.95 + (identity >>> 13) % 10 / 100;
    this.weight = this.targetWeight = memoryToWeight(process.memory);
    this.growthFrom = this.weight;
    this.root = new TransformNode(`fighter-${process.id}`, scene);

    const skinColors = ['#e5ae87', '#bd7957', '#f0c39e', '#8f563f', '#d89a72', '#f1b995', '#a9684c', '#edb18b'];
    const hue = identity % skinColors.length;
    this.defaultCloth = Color3.FromHexString(process.system ? REFEREE_CLOTH : CLOTH_COLORS[(identity >>> 3) % CLOTH_COLORS.length]);
    this.skin = material(scene, `skin-${process.id}`, Color3.FromHexString(skinColors[hue]), 0.62);
    this.cloth = material(scene, `cloth-${process.id}`, this.defaultCloth.clone(), 0.8);
    this.hair = material(scene, `hair-${process.id}`, new Color3(0.045, 0.035, 0.03), 0.88);
    const white = sharedMaterial(scene, 'eye-white', '#f0e6d1', 0.35);

    this.rig = new FighterBody(scene, this.root, this.skin, this.cloth, this.hair, white, variant, this.bodyBuild);
    this.food = makeFood(scene, this.root);
    if (process.system) this.gunbai = makeGunbai(scene, this.root);
    const extraFood = makeExtraFood(scene, this.root);
    this.leftFood = extraFood.group;
    this.pizza = extraFood.pizza;
    this.soda = extraFood.soda;

    this.selection = MeshBuilder.CreateTorus('selection', { diameter: 2.4, thickness: 0.04, tessellation: 64 }, scene);
    this.selection.parent = this.root;
    this.selection.position.y = 0.035;
    this.selection.material = selectionMaterial(scene);
    this.selection.isVisible = false;

    for (const mesh of this.root.getChildMeshes()) {
      mesh.metadata = { id: process.id };
      mesh.receiveShadows = true;
    }
    // Body and head make the whole silhouette on the floor; limbs and hair barely change it
    // and would each cost one more draw in the shadow pass.
    for (const caster of [this.rig.torso, this.rig.face.headSkin]) shadows.addShadowCaster(caster, false);

    this.nameplate = new FighterLabel(labelLayer, () => onSelect(process.id));
    this.label = this.nameplate.element;
    this.updateLabelText();
  }

  get radius(): number {
    const bulk = this.targetWeight ** 1.6;
    return (0.34 + bulk * 1.16) * this.bodyBuild * this.overallScale + 0.45;
  }

  get layoutTarget(): LayoutPoint {
    return { x: this.targetPosition.x, z: this.targetPosition.z };
  }

  get displayName(): string {
    return this.nickname ?? this.process.name;
  }

  /** Strength in a bout: mostly mass, a little drive from CPU. */
  get power(): number {
    return this.targetWeight + Math.min(this.process.cpu, 200) / 800;
  }

  get rankIndex(): number {
    return this.rank;
  }

  get isScripted(): boolean {
    return this.script !== undefined;
  }

  setPosition(position: Vector3): void {
    this.targetPosition.copyFrom(position);
    this.groundY = position.y;
    if (this.root.position.lengthSquared() === 0) this.root.position.copyFrom(position);
  }

  /** Walk to a point chosen by a choreography instead of the layout; `undefined` hands back control. */
  setScript(position?: Vector3, facing?: number, speed = 2): void {
    if (!position) {
      this.script = undefined;
      return;
    }
    this.script ??= { position: new Vector3(), speed };
    this.script.position.copyFrom(position);
    this.script.facing = facing;
    this.script.speed = speed;
  }

  setStance(stance: Stance): void {
    if (stance === this.stance) return;
    this.stance = stance;
    this.stanceStartedAt = performance.now();
  }

  setCustomization(customization: Customization): void {
    this.nickname = customization.nickname;
    this.cloth.albedoColor.copyFrom(customization.color ? Color3.FromHexString(customization.color) : this.defaultCloth);
    this.updateLabelText();
  }

  updateProcess(process: AppInfo): void {
    const previousMemory = this.process.memory;
    this.process = process;
    this.targetWeight = memoryToWeight(process.memory);
    const grew = process.memory - previousMemory;
    if (grew > Math.max(4 * 1024 ** 2, previousMemory * 0.005)) {
      this.growthFrom = this.weight;
      this.growthStartedAt = performance.now();
      this.eatingUntil = this.growthStartedAt + GROWTH_MS;
    } else if (grew < 0) {
      this.eatingUntil = 0;
      if (-grew > Math.max(32 * 1024 ** 2, previousMemory * 0.03)) this.shikoStartedAt = performance.now();
    }
    this.updateLabelText();
  }

  setRank(index: number): void {
    if (index === this.rank) return;
    this.rank = index;
    this.nameplate.setRank(this.process.system ? REFEREE : rankFor(index));
  }

  private updateLabelText(): void {
    this.nameplate.setText(this.displayName, formatBytes(this.process.memory), this.process.locked);
  }

  setSelected(selected: boolean): void {
    this.selection.isVisible = selected;
    this.nameplate.setSelected(selected);
  }

  setHovered(hovered: boolean): void {
    this.nameplate.setHovered(hovered);
  }

  /** Show the payout over the fighter's head while predictions are open. */
  setOdds(text?: string): void {
    this.nameplate.setOdds(text);
  }

  update(time: number, deltaSeconds: number): void {
    const { body, head, leftArm, rightArm, leftLeg, rightLeg } = this.rig;
    const now = performance.now();
    const eating = now < this.eatingUntil;
    if (eating && this.growthStartedAt > 0) {
      const progress = Scalar.Clamp((now - this.growthStartedAt) / GROWTH_MS, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      this.weight = Scalar.Lerp(this.growthFrom, this.targetWeight, eased);
    } else {
      const smoothing = 1 - Math.exp(-deltaSeconds * 3.5);
      this.weight = Scalar.Lerp(this.weight, this.targetWeight, smoothing);
    }

    if (time > this.wanderUntil) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * 1.1;
      this.wander.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      this.wanderUntil = time + 2.5 + Math.random() * 4.5;
    }

    const script = this.script;
    const goalX = script ? script.position.x : this.targetPosition.x + this.wander.x;
    const goalZ = script ? script.position.z : this.targetPosition.z + this.wander.z;
    const dx = goalX - this.root.position.x;
    const dz = goalZ - this.root.position.z;
    const distance = Math.hypot(dx, dz);
    const shiko = !script && this.shikoStartedAt > 0 && now - this.shikoStartedAt < SHIKO_MS;
    const topSpeed = script ? script.speed : shiko ? 0 : (1.7 - this.weight * 0.85) * (eating ? 0.35 : 1);
    if (distance > 0.02) {
      const step = Math.min(distance, topSpeed * deltaSeconds);
      this.root.position.x += dx / distance * step;
      this.root.position.z += dz / distance * step;
      this.speed = step / Math.max(deltaSeconds, 1e-4);
    } else {
      this.speed *= Math.exp(-deltaSeconds * 5);
    }
    // Walk facing the way you go; once a choreography has you in place, face where it says.
    const heading = script?.facing !== undefined && (distance < 0.6 || this.stance !== 'free')
      ? script.facing
      : distance > 0.06 ? Math.atan2(dx, dz) : this.facing;
    let turn = heading - this.facing;
    turn -= Math.PI * 2 * Math.floor((turn + Math.PI) / (Math.PI * 2));
    this.facing += turn * (1 - Math.exp(-deltaSeconds * 6));
    this.root.rotation.y = this.facing;
    const lift = this.stance === 'held' ? LIFT_HELD : 0;
    this.root.position.y = Scalar.Lerp(this.root.position.y, this.groundY + lift, 1 - Math.exp(-deltaSeconds * 10));
    const walking = this.stance === 'free' || this.stance === 'held' ? this.speed : 0;
    this.stepPhase += walking * deltaSeconds * (5.5 + this.weight * 3.5);

    const energy = Scalar.Clamp(this.process.cpu / 100, 0.08, 1);
    const moving = Scalar.Clamp(walking / 0.7, 0, 1);
    const shape = this.weight ** 0.8;
    const bulk = this.weight ** 1.6;
    this.overallScale = Scalar.Lerp(0.9, 1.38, shape);
    this.overallHeight = Scalar.Lerp(0.88, 1.9, shape);
    this.root.scaling.x = this.overallScale;
    this.root.scaling.z = this.overallScale;
    this.root.scaling.y = this.overallHeight * this.height;
    const breathing = Math.sin(time * (1.6 + energy) + this.phase);
    const bounce = Math.abs(Math.sin(this.stepPhase)) * moving * (0.09 - this.weight * 0.035);
    body.position.y = bounce;
    body.scaling.y = 1 + breathing * 0.012;
    body.rotation.z = Math.sin(this.stepPhase) * moving * (0.025 + bulk * 0.12);
    this.rig.updateProportions(bulk, bounce);
    head.rotation.z = Math.sin(time * 0.55 + this.phase) * 0.035;

    const stride = moving * (0.8 - bulk * 0.46);
    leftLeg.rotation.x = Math.sin(this.stepPhase) * stride;
    rightLeg.rotation.x = -Math.sin(this.stepPhase) * stride;
    const swing = Math.sin(this.stepPhase) * moving * (0.85 - bulk * 0.5);
    leftArm.rotation.x = swing + Math.sin(time * energy + this.phase) * 0.04;
    rightArm.rotation.x = -swing;

    const carrying = this.weight >= 0.22 && this.stance === 'free';
    const foodScale = (0.175 + bulk * 0.26) * (2.1 + this.weight * 0.3);
    this.food.scaling.setAll(foodScale);
    this.leftFood.scaling.setAll(foodScale);
    const handLength = 1.2 * rightArm.scaling.y;
    const handAngle = rightArm.rotation.z;
    const handPosition = this.handPosition.set(
      rightArm.position.x + Math.sin(handAngle) * handLength,
      rightArm.position.y - Math.cos(handAngle) * handLength,
      0.85,
    );
    this.food.setEnabled(carrying && !this.gunbai);
    if (this.gunbai) {
      this.gunbai.position.copyFrom(handPosition);
      this.gunbai.rotation.z = Math.sin(time * 1.3 + this.phase) * 0.12;
      this.gunbai.scaling.setAll(foodScale * 0.9);
    }
    if (carrying && eating) {
      const bite = (Math.sin(time * 5 + this.phase) + 1) / 2;
      this.mouthPosition.set(0, head.position.y - 0.1, head.scaling.z * 0.53);
      Vector3.LerpToRef(handPosition, this.mouthPosition, bite, this.food.position);
      this.food.rotation.z = -bite * 0.25;
      rightArm.rotation.x = -bite * 1.2;
      head.rotation.x = bite * 0.09;
    } else if (carrying) {
      this.food.position.copyFrom(handPosition);
      this.food.rotation.z = 0;
    }

    const leftHandLength = 1.2 * leftArm.scaling.y;
    const leftHandAngle = leftArm.rotation.z;
    this.leftFood.position.set(
      leftArm.position.x + Math.sin(leftHandAngle) * leftHandLength,
      leftArm.position.y - Math.cos(leftHandAngle) * leftHandLength,
      0.85,
    );
    this.pizza.setEnabled(this.weight >= 0.48);
    this.soda.setEnabled(this.weight >= 0.72);
    this.leftFood.setEnabled(this.weight >= 0.48 && this.stance === 'free' && !this.gunbai);
    if (!eating) head.rotation.x = Scalar.Lerp(head.rotation.x, 0, 1 - Math.exp(-deltaSeconds * 3.5));
    if (shiko) stomp(this.rig, (now - this.shikoStartedAt) / SHIKO_MS, bulk);
    pose(this.rig, this.stance, this.stanceStartedAt, this.phase, time, deltaSeconds, bulk);
    this.rig.face.express(moodFor(this.stance, this.process.cpu), this.process.cpu >= 40 || this.stance === 'push', this.phase, time, deltaSeconds);

    this.selection.rotation.y += deltaSeconds * 0.35;
    this.selection.scaling.setAll(1 + Math.sin(time * 3) * 0.025);
  }

  /** Project the label anchor; returns false when it is behind the camera. */
  project(viewport: Viewport, transform: Matrix): boolean {
    return this.nameplate.project(this.root.position, this.rig.labelHeight * this.overallHeight * this.height, viewport, transform);
  }

  get screen(): Vector3 {
    return this.nameplate.screen;
  }

  get labelBox(): { width: number; height: number } {
    return this.nameplate.box;
  }

  markFighting(fighting: boolean): void {
    this.nameplate.markFighting(fighting, this.rank, this.process.system);
  }

  /** Place the label `lift` pixels above its anchor; dimmed labels yield to their neighbours. */
  placeLabel(lift: number, dimmed: boolean, deltaSeconds: number): void {
    this.nameplate.place(lift, dimmed, deltaSeconds);
  }

  dispose(): void {
    this.label.remove();
    this.root.getChildMeshes().forEach((mesh) => mesh.dispose());
    this.root.dispose();
    this.skin.dispose();
    this.cloth.dispose();
    this.hair.dispose();
  }
}

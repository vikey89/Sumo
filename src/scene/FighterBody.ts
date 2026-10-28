// The fighter's skeleton and meshes: torso, belt, head, limbs, reshaped as it gains weight.
import { Mesh, MeshBuilder, PBRMaterial, Scene, TransformNode, Vector3 } from './babylon';
import { FighterFace } from './FighterFace';
import { box, mergeInto, sphere } from './fighter-materials';
import type { Rig } from './fighter-pose';
import { beltCurve, profileAt, profileCurve, profileData } from './fighter-profile';

export class FighterBody implements Rig {
  readonly body: TransformNode;
  readonly torso: Mesh;
  readonly head: TransformNode;
  readonly face: FighterFace;
  readonly leftArm: TransformNode;
  readonly rightArm: TransformNode;
  readonly leftLeg: TransformNode;
  readonly rightLeg: TransformNode;
  /** Height of the label anchor above the feet, before the root's scaling. */
  labelHeight = 3.5;
  private readonly belt: Mesh;
  private readonly neck: Mesh;
  private readonly beltFlap: Mesh;
  private torsoStep = -1;

  constructor(
    private readonly scene: Scene,
    readonly root: TransformNode,
    private readonly skin: PBRMaterial,
    cloth: PBRMaterial,
    dark: PBRMaterial,
    white: PBRMaterial,
    variant: number,
    private readonly bodyBuild: number,
  ) {
    this.body = new TransformNode('body-motion', scene);
    this.body.parent = root;
    this.torso = MeshBuilder.CreateLathe('torso', { shape: profileCurve(0), tessellation: 32, updatable: true }, scene);
    this.torso.parent = this.body;
    this.torso.material = skin;
    this.belt = MeshBuilder.CreateLathe('belt', { shape: beltCurve(0), tessellation: 32, updatable: true }, scene);
    this.belt.parent = this.body;
    this.belt.material = cloth;
    this.neck = MeshBuilder.CreateCylinder('neck', { diameter: 1, height: 1, tessellation: 20 }, scene);
    this.neck.parent = this.body;
    this.neck.material = skin;

    this.beltFlap = box(scene, 'mawashi-flap', new Vector3(0.55, 0.65, 0.12), this.belt, cloth);
    this.beltFlap.rotation.x = -0.14;
    if (variant === 0 || variant === 3) {
      const stripe = box(scene, 'mawashi-stripe', new Vector3(0.12, 0.66, 0.025), this.beltFlap, white);
      stripe.position.z = 0.07;
    }

    this.head = new TransformNode('head-motion', scene);
    this.head.parent = root;
    this.face = new FighterFace(scene, this.head, skin, cloth, dark, white, variant);

    this.leftArm = this.makeArm(-1).joint;
    this.rightArm = this.makeArm(1).joint;
    this.leftLeg = this.makeLeg(-1).joint;
    this.rightLeg = this.makeLeg(1).joint;
  }

  private makeArm(side: number): { joint: TransformNode; mesh: Mesh } {
    const arm = new TransformNode(side < 0 ? 'left-arm' : 'right-arm', this.scene);
    arm.parent = this.root;
    const limb = MeshBuilder.CreateCapsule('arm', { height: 1.25, radius: 0.25, tessellation: 16 }, this.scene);
    limb.parent = arm;
    limb.position.y = -0.625;
    limb.material = this.skin;
    const hand = sphere(this.scene, 'hand', 0.48, arm, this.skin);
    hand.position.y = -1.2;
    return { joint: arm, mesh: mergeInto(arm, 'arm', [limb, hand]) };
  }

  private makeLeg(side: number): { joint: TransformNode; mesh: Mesh } {
    const joint = new TransformNode(side < 0 ? 'left-leg' : 'right-leg', this.scene);
    joint.parent = this.root;
    const leg = MeshBuilder.CreateCapsule('leg', { height: 0.75, radius: 0.27, tessellation: 16 }, this.scene);
    leg.parent = joint;
    leg.position.y = -0.375;
    leg.material = this.skin;
    const foot = sphere(this.scene, 'foot', 0.54, joint, this.skin);
    foot.position.set(0, -0.68, 0.16);
    foot.scaling.set(0.85, 0.45, 1.25);
    return { joint, mesh: mergeInto(joint, 'leg', [leg, foot]) };
  }

  updateProportions(bulk: number, bounce: number): void {
    const step = Math.round(bulk * 32);
    if (step !== this.torsoStep) {
      profileData(this.scene, step, false).applyToMesh(this.torso);
      profileData(this.scene, step, true).applyToMesh(this.belt);
      this.torsoStep = step;
    }

    const lean = 1 - bulk;
    const legRadius = 0.085 + bulk * 0.195;
    const legLength = Math.max(0.66 - bulk * 0.12, legRadius * 2.4);
    const hipY = legLength;
    const torsoWidth = (0.34 + bulk * 1.16) * this.bodyBuild;
    const torsoHeight = 1.05 + bulk * 0.95;
    this.torso.scaling.set(torsoWidth, torsoHeight, torsoWidth * 0.93);
    this.torso.position.y = hipY;
    this.belt.scaling.copyFrom(this.torso.scaling);
    this.belt.position.y = hipY;

    const shoulderY = hipY + torsoHeight * (0.80 - bulk * 0.05);
    const neckLength = 0.17 * lean ** 1.4;
    const headRadius = 0.175 + bulk * 0.26;
    const headY = hipY + torsoHeight + neckLength + headRadius * 0.82;
    this.neck.scaling.set(headRadius * 1.2, Math.max(0.001, neckLength * 1.6), headRadius * 1.2);
    this.neck.position.y = hipY + torsoHeight * 0.99;
    this.neck.setEnabled(neckLength > 0.012);
    this.head.scaling.setAll(headRadius * 1.94);
    this.head.position.y = headY + bounce;
    this.labelHeight = headY + headRadius * 1.4 + 0.2;

    const beltMiddle = 0.17 + bulk * 0.14;
    this.beltFlap.position.set(0, beltMiddle - 0.12, profileAt(bulk, beltMiddle) * 1.03);
    this.beltFlap.scaling.set(0.65 + bulk * 0.45, 0.7 + bulk * 0.5, 1);

    const hipRadius = profileAt(bulk, 0.04);
    const legX = torsoWidth * hipRadius * 0.52;
    for (const [joint, side] of [[this.leftLeg, -1], [this.rightLeg, 1]] as const) {
      joint.position.set(side * legX, hipY + 0.02, 0);
      joint.scaling.set(legRadius / 0.27, legLength / 0.75, legRadius / 0.27);
      joint.rotation.z = side * bulk * 0.22;
    }

    const armLength = 0.62 + bulk * 0.30;
    const armRadius = 0.068 + bulk * 0.15;
    const shoulderRadius = profileAt(bulk, 0.80 - bulk * 0.05);
    const shoulderX = torsoWidth * shoulderRadius * 0.88 + armRadius * 0.6;
    const armRest = 0.08 + bulk * 1.16;
    for (const [joint, side] of [[this.leftArm, -1], [this.rightArm, 1]] as const) {
      joint.position.set(side * shoulderX, shoulderY, 0);
      joint.scaling.set(armRadius / 0.25, armLength / 1.25, armRadius / 0.25);
      joint.rotation.z = side * armRest;
    }

    const { hairCap, topKnot, headband } = this.face;
    hairCap.position.y = 0.55 - bulk * 0.12;
    hairCap.scaling.y = 0.28 + bulk * 0.3;
    topKnot.setEnabled(bulk > 0.22 && hairCap.isEnabled());
    headband.setEnabled(bulk < 0.38);
  }
}

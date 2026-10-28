// The head's features (eyes, brows, mouth, hair, sweat) and the expressions that move them.
import { Mesh, MeshBuilder, PBRMaterial, Scalar, Scene, TransformNode, Vector3 } from './babylon';
import { box, mergeInto, sharedMaterial, sphere } from './fighter-materials';
import type { Stance } from './fighter-pose';

type Mood = 'calm' | 'happy' | 'sad' | 'strain' | 'surprised';

interface Expression {
  mouthWidth: number;
  mouthHeight: number;
  /** Positive turns the inner end of the brows down (frown), negative up (worry). */
  browTilt: number;
  browLift: number;
  eyeOpen: number;
}

const EXPRESSIONS: Record<Mood, Expression> = {
  calm: { mouthWidth: 1, mouthHeight: 1, browTilt: 0, browLift: 0, eyeOpen: 1 },
  happy: { mouthWidth: 1.35, mouthHeight: 2.1, browTilt: -0.12, browLift: 0.05, eyeOpen: 0.45 },
  sad: { mouthWidth: 0.75, mouthHeight: 1.1, browTilt: -0.42, browLift: 0.03, eyeOpen: 0.8 },
  strain: { mouthWidth: 1.35, mouthHeight: 0.35, browTilt: 0.38, browLift: -0.03, eyeOpen: 0.7 },
  surprised: { mouthWidth: 0.85, mouthHeight: 2.4, browTilt: -0.15, browLift: 0.09, eyeOpen: 1.2 },
};

export function moodFor(stance: Stance, cpu: number): Mood {
  switch (stance) {
    case 'celebrate': return 'happy';
    case 'fall-back':
    case 'fall-forward': return 'sad';
    case 'held': return 'surprised';
    case 'crouch':
    case 'push': return 'strain';
    case 'free': return cpu >= 60 ? 'strain' : 'calm';
  }
}

export class FighterFace {
  readonly headSkin: Mesh;
  readonly hairCap: Mesh;
  readonly topKnot: Mesh;
  readonly headband: Mesh;
  private readonly eyes: Mesh;
  private readonly pupils: Mesh;
  private readonly mouth: Mesh;
  private readonly mouthRest: number;
  private readonly brows: { mesh: Mesh; side: number; tilt: number; y: number }[] = [];
  private readonly sweat: Mesh[] = [];
  private readonly expression: Expression = { ...EXPRESSIONS.calm };

  constructor(scene: Scene, head: TransformNode, skin: PBRMaterial, cloth: PBRMaterial, dark: PBRMaterial, white: PBRMaterial, variant: number) {
    const skinParts: Mesh[] = [];
    const whiteParts: Mesh[] = [];
    const pupilParts: Mesh[] = [];
    const darkParts: Mesh[] = [];
    const face = sphere(scene, 'face', 1.03, head, skin);
    face.scaling.set(0.93 + variant * 0.05, 1.04 - variant * 0.025, 0.92);
    skinParts.push(face);
    for (const side of [-1, 1]) {
      const ear = sphere(scene, 'ear', 0.25, head, skin);
      ear.position.set(side * 0.52, 0, 0);
      skinParts.push(ear);
      const eye = sphere(scene, 'eye-white', 0.18, head, white);
      eye.position.set(side * 0.205, 0.1, 0.445);
      eye.scaling.set(1, variant === 2 ? 0.72 : 1, 0.45);
      whiteParts.push(eye);
      const pupil = sphere(scene, 'pupil', 0.085, head, dark);
      pupil.position.set(side * 0.205, 0.095, 0.515);
      pupil.scaling.z = 0.35;
      const brow = box(scene, 'eyebrow', new Vector3(0.24, 0.045 + variant * 0.008, 0.045), head, dark);
      const tilt = side * (variant === 1 ? -0.28 : variant === 2 ? 0.12 : -0.09);
      brow.position.set(side * 0.21, 0.28, 0.455);
      brow.rotation.z = tilt;
      this.brows.push({ mesh: brow, side, tilt, y: 0.28 });
      pupilParts.push(pupil);
    }

    const nose = sphere(scene, 'nose', 0.19 + variant * 0.015, head, skin);
    nose.position.set(0, -0.045, 0.53);
    skinParts.push(nose);
    const mouth = MeshBuilder.CreateTorus('mouth', { diameter: 0.2, thickness: 0.025, tessellation: 16 }, scene);
    mouth.parent = head;
    mouth.position.set(0, -0.25, 0.468);
    mouth.rotation.x = Math.PI / 2;
    // The ring is turned to face forward, so its local z is the face's vertical.
    this.mouthRest = variant === 2 ? 0.9 : 0.55;
    mouth.scaling.z = this.mouthRest;
    mouth.material = dark;
    this.mouth = mouth;
    if (variant === 2) {
      for (const side of [-1, 1]) {
        const moustache = box(scene, 'moustache', new Vector3(0.16, 0.055, 0.045), head, dark);
        moustache.position.set(side * 0.075, -0.16, 0.5);
        moustache.rotation.z = side * -0.22;
        darkParts.push(moustache);
      }
    }
    this.headSkin = mergeInto(head, 'head-skin', skinParts);
    this.eyes = mergeInto(head, 'eyes', whiteParts);
    this.pupils = mergeInto(head, 'pupils', pupilParts);
    if (darkParts.length > 0) mergeInto(head, 'face-details', darkParts);

    const sweatMaterial = sharedMaterial(scene, 'sweat', '#bfe3f2', 0.15);
    sweatMaterial.alpha = 0.8;
    for (const side of [-1, 1]) {
      const drop = sphere(scene, 'sweat', 0.09, head, sweatMaterial);
      drop.scaling.y = 1.5;
      drop.position.set(side * 0.36, 0.3, 0.36);
      drop.setEnabled(false);
      this.sweat.push(drop);
    }

    this.hairCap = sphere(scene, 'hair-cap', 1.04, head, dark);
    this.hairCap.position.set(0, 0.53, -0.045);
    this.hairCap.scaling.set(1.01, 0.3, 0.93);
    this.hairCap.setEnabled(variant !== 3);
    this.topKnot = sphere(scene, 'top-knot', 0.38, head, dark);
    this.topKnot.position.set(variant === 2 ? 0.12 : 0, 0.67, variant === 2 ? 0.08 : -0.08);
    this.topKnot.scaling.set(1.1 + variant * 0.15, 0.6, 0.8);

    this.headband = MeshBuilder.CreateTorus('headband', { diameter: 1.04, thickness: 0.075, tessellation: 40 }, scene);
    this.headband.parent = head;
    this.headband.position.y = 0.32;
    this.headband.material = variant === 0 || variant === 3 ? white : cloth;
    const bandKnot = box(scene, 'headband-knot', new Vector3(0.18, 0.18, 0.1), this.headband, cloth);
    bandKnot.position.set(0.47, 0, -0.15);
  }

  /** Ease the face toward the current mood; a busy CPU makes the fighter sweat. */
  express(mood: Mood, sweating: boolean, phase: number, time: number, deltaSeconds: number): void {
    const target = EXPRESSIONS[mood];
    const ease = 1 - Math.exp(-deltaSeconds * 8);
    const face = this.expression;
    for (const key of Object.keys(face) as (keyof Expression)[]) face[key] = Scalar.Lerp(face[key], target[key], ease);
    this.mouth.scaling.x = face.mouthWidth;
    this.mouth.scaling.z = this.mouthRest * face.mouthHeight;
    for (const brow of this.brows) {
      brow.mesh.rotation.z = brow.tilt + brow.side * face.browTilt;
      brow.mesh.position.y = brow.y + face.browLift;
    }
    this.eyes.scaling.y = face.eyeOpen;
    this.pupils.scaling.y = Math.min(face.eyeOpen, 1);

    this.sweat.forEach((drop, index) => {
      drop.setEnabled(sweating);
      if (!sweating) return;
      const cycle = (time * 0.9 + index * 0.5 + phase) % 1;
      drop.position.y = 0.32 - cycle * 0.5;
      drop.scaling.setAll(1 - cycle * 0.6);
      drop.scaling.y *= 1.5;
    });
  }
}

// Stances: choreographed poses and the shiko stomp, applied over the walk cycle.
import { Scalar, TransformNode } from './babylon';

/** Choreographed poses, layered over walking and breathing. */
export type Stance = 'free' | 'crouch' | 'push' | 'fall-back' | 'fall-forward' | 'celebrate' | 'held';

/** The joints a pose moves. */
export interface Rig {
  readonly root: TransformNode;
  readonly body: TransformNode;
  readonly head: TransformNode;
  readonly leftArm: TransformNode;
  readonly rightArm: TransformNode;
  readonly leftLeg: TransformNode;
  readonly rightLeg: TransformNode;
}

/** Lean of the whole body, pivoting on the feet (radians, positive = forward). */
const STANCE_LEAN: Record<Stance, number> = {
  'free': 0,
  'crouch': 0.36,
  'push': 0.3,
  'fall-back': -1.3,
  'fall-forward': 1.32,
  'celebrate': -0.08,
  'held': 0,
};

/** Shiko: the ritual stomp, alternating legs, played when an app frees memory. */
export function stomp(rig: Rig, progress: number, bulk: number): void {
  const beat = progress * 4;
  const side = Math.floor(beat) % 2 === 0 ? -1 : 1;
  const lift = Math.sin((beat % 1) * Math.PI) ** 2 * Math.sin(progress * Math.PI);
  const leg = side < 0 ? rig.leftLeg : rig.rightLeg;
  leg.rotation.z += side * lift * (1.05 - bulk * 0.35);
  leg.rotation.x = 0;
  rig.body.rotation.z = -side * lift * 0.16;
  rig.body.position.y -= (1 - lift) * 0.06 * Math.sin(progress * Math.PI);
  rig.leftArm.rotation.x = rig.rightArm.rotation.x = -0.35 * Math.sin(progress * Math.PI);
}

export function pose(rig: Rig, stance: Stance, stanceStartedAt: number, phase: number, time: number, deltaSeconds: number, bulk: number): void {
  const { root, body, head, leftArm, rightArm, leftLeg, rightLeg } = rig;
  const falling = stance === 'fall-back' || stance === 'fall-forward';
  const rate = falling ? 5 : 7;
  root.rotation.x = Scalar.Lerp(root.rotation.x, STANCE_LEAN[stance], 1 - Math.exp(-deltaSeconds * rate));
  const since = (performance.now() - stanceStartedAt) / 1000;

  switch (stance) {
    case 'crouch':
      body.position.y -= 0.1;
      leftLeg.rotation.z -= 0.45;
      rightLeg.rotation.z += 0.45;
      leftArm.rotation.x = rightArm.rotation.x = -0.95;
      head.rotation.x = -0.25;
      break;
    case 'push': {
      const slap = Math.sin(time * 13 + phase);
      leftArm.rotation.x = -1.4 + slap * 0.3;
      rightArm.rotation.x = -1.4 - slap * 0.3;
      leftArm.rotation.z = -0.25 - bulk * 0.3;
      rightArm.rotation.z = 0.25 + bulk * 0.3;
      leftLeg.rotation.x = 0.35;
      rightLeg.rotation.x = -0.25;
      break;
    }
    case 'fall-back':
    case 'fall-forward': {
      const flail = Math.sin(time * 16) * Math.exp(-since * 2);
      leftArm.rotation.x = -2.3 + flail * 0.4;
      rightArm.rotation.x = -2.1 - flail * 0.4;
      leftLeg.rotation.x = stance === 'fall-back' ? -0.7 : 0.4;
      rightLeg.rotation.x = stance === 'fall-back' ? -0.4 : 0.6;
      break;
    }
    case 'celebrate': {
      const pump = Math.abs(Math.sin(time * 6));
      leftArm.rotation.z = -2.5 - pump * 0.3;
      rightArm.rotation.z = 2.5 + pump * 0.3;
      body.position.y += pump * 0.12;
      break;
    }
    case 'held': {
      const dangle = Math.sin(time * 7 + phase);
      leftArm.rotation.z = -2.2 - dangle * 0.2;
      rightArm.rotation.z = 2.2 + dangle * 0.2;
      leftLeg.rotation.x = dangle * 0.5;
      rightLeg.rotation.x = -dangle * 0.5;
      break;
    }
    case 'free':
      break;
  }
}

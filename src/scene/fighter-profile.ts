// The torso and belt silhouettes, blended from a fit build to a sumo build by `bulk`.
import { Curve3, MeshBuilder, Scalar, Scene, Vector3, VertexData } from './babylon';

const TORSO_FIT = [
  [0, -0.10], [0.36, -0.05], [0.62, 0.03], [0.72, 0.15],
  [0.63, 0.33], [0.66, 0.47], [0.84, 0.63], [1, 0.78],
  [0.93, 0.90], [0.52, 0.99], [0, 1.02],
];
const TORSO_SUMO = [
  [0, -0.12], [0.44, -0.06], [0.80, 0.05], [0.95, 0.19],
  [1, 0.34], [0.98, 0.48], [0.89, 0.64], [0.75, 0.79],
  [0.63, 0.90], [0.44, 0.99], [0, 1.02],
];
const torsoCache = new Map<number, VertexData>();
const beltCache = new Map<number, VertexData>();

export function profileCurve(bulk: number, segments = 40): Vector3[] {
  const controls = TORSO_FIT.map((point, index) => new Vector3(
    Scalar.Lerp(point[0], TORSO_SUMO[index][0], bulk),
    Scalar.Lerp(point[1], TORSO_SUMO[index][1], bulk),
    0,
  ));
  return Curve3.CreateCatmullRomSpline(controls, segments, false).getPoints()
    .map((point) => new Vector3(Math.max(0, point.x), point.y, 0));
}

export function profileAt(bulk: number, y: number): number {
  for (let i = 1; i < TORSO_FIT.length; i++) {
    const highY = Scalar.Lerp(TORSO_FIT[i][1], TORSO_SUMO[i][1], bulk);
    if (y > highY && i < TORSO_FIT.length - 1) continue;
    const lowY = Scalar.Lerp(TORSO_FIT[i - 1][1], TORSO_SUMO[i - 1][1], bulk);
    const lowR = Scalar.Lerp(TORSO_FIT[i - 1][0], TORSO_SUMO[i - 1][0], bulk);
    const highR = Scalar.Lerp(TORSO_FIT[i][0], TORSO_SUMO[i][0], bulk);
    const amount = highY === lowY ? 0 : Scalar.Clamp((y - lowY) / (highY - lowY), 0, 1);
    return Scalar.Lerp(lowR, highR, amount);
  }
  return 1;
}

export function beltCurve(bulk: number): Vector3[] {
  const middle = 0.17 + bulk * 0.14;
  const half = 0.055 + bulk * 0.075;
  const points = profileCurve(bulk, 160)
    .filter((point) => point.y >= middle - half && point.y <= middle + half)
    .map((point) => new Vector3(Math.max(0.01, point.x) * 1.04, point.y, 0));
  return points.length >= 2 ? points : [new Vector3(1, middle, 0), new Vector3(1, middle + 0.01, 0)];
}

export function profileData(scene: Scene, step: number, belt: boolean): VertexData {
  const cache = belt ? beltCache : torsoCache;
  const cached = cache.get(step);
  if (cached) return cached;
  const bulk = step / 32;
  const mesh = MeshBuilder.CreateLathe('profile-data', {
    shape: belt ? beltCurve(bulk) : profileCurve(bulk),
    tessellation: 32,
  }, scene);
  const data = VertexData.ExtractFromMesh(mesh);
  mesh.dispose();
  cache.set(step, data);
  return data;
}

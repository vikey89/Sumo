import { Color3, Mesh, MeshBuilder, PBRMaterial, Scalar, Scene, Vector3 } from './babylon';

/** Ringside cushions on the floor, then three stepped tiers. */
const ROWS = [
  { radius: 26.6, y: -0.31, count: 46 },
  { radius: 30.2, y: 0.55, count: 56 },
  { radius: 33.7, y: 1.45, count: 64 },
  { radius: 37, y: 2.35, count: 72 },
];
const ROBES = ['#5d3b34', '#2f4a57', '#6b5a3a', '#3d3550', '#47533a', '#6e4a2c', '#2c2a28', '#7a3f3a'];
const SKIN = ['#e5ae87', '#bd7957', '#f0c39e', '#8f563f', '#d89a72'];

interface Spectator {
  x: number;
  y: number;
  z: number;
  scale: number;
  phase: number;
  tempo: number;
}

function pbr(scene: Scene, name: string, color: string, roughness: number): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = Color3.FromHexString(color);
  mat.roughness = roughness;
  mat.metallic = 0;
  return mat;
}

function colorBuffer(count: number, palette: string[]): Float32Array {
  const buffer = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const color = Color3.FromHexString(palette[Math.floor(Math.random() * palette.length)]);
    buffer.set([color.r, color.g, color.b, 1], i * 4);
  }
  return buffer;
}

function writeMatrix(buffer: Float32Array, index: number, scale: number, x: number, y: number, z: number): void {
  const offset = index * 16;
  buffer.fill(0, offset, offset + 16);
  buffer[offset] = scale;
  buffer[offset + 5] = scale;
  buffer[offset + 10] = scale;
  buffer[offset + 12] = x;
  buffer[offset + 13] = y;
  buffer[offset + 14] = z;
  buffer[offset + 15] = 1;
}

/** Spectators that fidget with RAM pressure and jump when something big happens. */
export class Crowd {
  private readonly spectators: Spectator[] = [];
  private readonly bodies: Mesh;
  private readonly heads: Mesh;
  private readonly bodyMatrices: Float32Array;
  private readonly headMatrices: Float32Array;
  private excitement = 0.2;
  private targetExcitement = 0.2;
  private cheerLevel = 0;

  constructor(scene: Scene) {
    const stands = MeshBuilder.CreateLathe('stands', {
      shape: [
        new Vector3(28.4, -0.31, 0), new Vector3(28.4, 0.55, 0), new Vector3(31.9, 0.55, 0),
        new Vector3(31.9, 1.45, 0), new Vector3(35.4, 1.45, 0), new Vector3(35.4, 2.35, 0),
        new Vector3(39, 2.35, 0), new Vector3(39, -0.31, 0),
      ],
      tessellation: 96,
      sideOrientation: Mesh.DOUBLESIDE,
    }, scene);
    stands.material = pbr(scene, 'stands-wood', '#2a221b', 0.85);
    stands.isPickable = false;
    stands.receiveShadows = true;
    stands.freezeWorldMatrix();

    for (const row of ROWS) {
      for (let i = 0; i < row.count; i++) {
        const angle = (i + Math.random() * 0.5) / row.count * Math.PI * 2;
        const radius = row.radius + (Math.random() - 0.5) * 0.6;
        this.spectators.push({
          x: Math.cos(angle) * radius,
          y: row.y,
          z: Math.sin(angle) * radius,
          scale: 0.85 + Math.random() * 0.35,
          phase: Math.random() * Math.PI * 2,
          tempo: 0.7 + Math.random() * 0.6,
        });
      }
    }

    const count = this.spectators.length;
    this.bodies = MeshBuilder.CreateSphere('spectator-body', { diameter: 1, segments: 10 }, scene);
    this.bodies.scaling.set(1.15, 1.2, 1.05);
    this.bodies.bakeCurrentTransformIntoVertices();
    this.bodies.material = pbr(scene, 'spectator-robe', '#ffffff', 0.9);
    this.heads = MeshBuilder.CreateSphere('spectator-head', { diameter: 0.5, segments: 10 }, scene);
    this.heads.material = pbr(scene, 'spectator-skin', '#ffffff', 0.7);
    this.bodyMatrices = new Float32Array(count * 16);
    this.headMatrices = new Float32Array(count * 16);
    for (const [mesh, matrices, palette] of [
      [this.bodies, this.bodyMatrices, ROBES],
      [this.heads, this.headMatrices, SKIN],
    ] as const) {
      mesh.isPickable = false;
      // Instances ring the arena, far outside the template sphere's bounds.
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
      mesh.thinInstanceSetBuffer('color', colorBuffer(count, palette), 4, true);
    }
    this.update(0, 0);
  }

  /** 0 = calm, 1 = frantic. Driven by memory pressure. */
  setExcitement(level: number): void {
    this.targetExcitement = Scalar.Clamp(level, 0, 1);
  }

  cheer(strength = 1): void {
    this.cheerLevel = Math.min(1.4, this.cheerLevel + strength);
  }

  update(time: number, delta: number): void {
    this.excitement = Scalar.Lerp(this.excitement, this.targetExcitement, 1 - Math.exp(-delta * 0.8));
    this.cheerLevel *= Math.exp(-delta * 0.9);
    const fidget = 0.02 + this.excitement * 0.12;
    this.spectators.forEach((spectator, index) => {
      const beat = time * spectator.tempo * (1.6 + this.excitement * 3) + spectator.phase;
      const jump = this.cheerLevel * Math.abs(Math.sin(time * 7.5 * spectator.tempo + spectator.phase)) * 0.55;
      const lift = Math.abs(Math.sin(beat)) * fidget + jump;
      const { x, y, z, scale } = spectator;
      writeMatrix(this.bodyMatrices, index, scale, x, y + 0.55 * scale + lift, z);
      writeMatrix(this.headMatrices, index, scale, x, y + 1.18 * scale + lift * 1.08, z);
    });
    this.bodies.thinInstanceBufferUpdated('matrix');
    this.heads.thinInstanceBufferUpdated('matrix');
  }
}

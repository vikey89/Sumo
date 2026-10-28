// Materials and mesh helpers shared by every part of a fighter.
import { Color3, Mesh, MeshBuilder, PBRMaterial, Scene, StandardMaterial, TransformNode, Vector3 } from './babylon';

const sharedMaterials = new WeakMap<Scene, Map<string, PBRMaterial>>();
const selectionMaterials = new WeakMap<Scene, StandardMaterial>();

export function material(scene: Scene, name: string, color: Color3, roughness = 0.72): PBRMaterial {
  const result = new PBRMaterial(name, scene);
  result.albedoColor = color;
  result.roughness = roughness;
  result.metallic = 0;
  return result;
}

/** Props and eye whites look the same on every fighter, so they share one material per scene. */
export function sharedMaterial(scene: Scene, name: string, hex: string, roughness: number): PBRMaterial {
  let cache = sharedMaterials.get(scene);
  if (!cache) sharedMaterials.set(scene, cache = new Map<string, PBRMaterial>());
  let result = cache.get(name);
  if (!result) cache.set(name, result = material(scene, name, Color3.FromHexString(hex), roughness));
  return result;
}

export function selectionMaterial(scene: Scene): StandardMaterial {
  let result = selectionMaterials.get(scene);
  if (!result) {
    result = new StandardMaterial('selection-material', scene);
    result.emissiveColor = Color3.FromHexString('#edc779');
    result.disableLighting = true;
    selectionMaterials.set(scene, result);
  }
  return result;
}

/**
 * Bake same-material parts that never move relative to each other into one mesh under
 * `parent`, so a fighter costs a few draw calls instead of dozens.
 */
export function mergeInto(parent: TransformNode, name: string, meshes: Mesh[]): Mesh {
  if (meshes.length === 1) return meshes[0];
  parent.computeWorldMatrix(true);
  const merged = Mesh.MergeMeshes(meshes, true, true)!;
  merged.name = name;
  merged.bakeTransformIntoVertices(parent.getWorldMatrix().clone().invert());
  merged.parent = parent;
  return merged;
}

export function sphere(scene: Scene, name: string, diameter: number, parent: TransformNode, mat: PBRMaterial): Mesh {
  const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: 24 }, scene);
  mesh.parent = parent;
  mesh.material = mat;
  return mesh;
}

export function box(scene: Scene, name: string, size: Vector3, parent: TransformNode, mat: PBRMaterial): Mesh {
  const mesh = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, scene);
  mesh.parent = parent;
  mesh.material = mat;
  return mesh;
}

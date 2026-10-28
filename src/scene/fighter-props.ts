// Hand-held props: the burger, the pizza and soda of the heavyweights, the referee's fan.
import { MeshBuilder, Scene, TransformNode } from './babylon';
import { mergeInto, sharedMaterial, sphere } from './fighter-materials';

export function makeFood(scene: Scene, root: TransformNode): TransformNode {
  const food = new TransformNode('burger', scene);
  food.parent = root;
  const bun = sharedMaterial(scene, 'bun', '#e3a64e', 0.8);
  const filling = sharedMaterial(scene, 'filling', '#693b29', 0.9);
  const lettuce = sharedMaterial(scene, 'lettuce', '#6e9c55', 0.9);
  const lower = sphere(scene, 'burger-bottom', 0.65, food, bun);
  lower.scaling.y = 0.35;
  const patty = MeshBuilder.CreateCylinder('patty', { diameter: 0.65, height: 0.14, tessellation: 24 }, scene);
  patty.parent = food;
  patty.position.y = 0.15;
  patty.material = filling;
  const salad = MeshBuilder.CreateCylinder('salad', { diameter: 0.7, height: 0.07, tessellation: 24 }, scene);
  salad.parent = food;
  salad.position.y = 0.25;
  salad.material = lettuce;
  const top = sphere(scene, 'burger-top', 0.7, food, bun);
  top.position.y = 0.36;
  top.scaling.y = 0.5;
  mergeInto(food, 'bun', [lower, top]);
  food.setEnabled(false);
  return food;
}

/** The referee's war fan. */
export function makeGunbai(scene: Scene, root: TransformNode): TransformNode {
  const fan = new TransformNode('gunbai', scene);
  fan.parent = root;
  const lacquer = sharedMaterial(scene, 'gunbai', '#c9a14f', 0.4);
  const cord = sharedMaterial(scene, 'gunbai-cord', '#a8342a', 0.7);
  const blade = MeshBuilder.CreateCylinder('gunbai-blade', { diameter: 0.9, height: 0.05, tessellation: 28 }, scene);
  blade.parent = fan;
  blade.rotation.x = Math.PI / 2;
  blade.position.y = 0.62;
  blade.scaling.set(1, 1, 1.15);
  blade.material = lacquer;
  const handle = MeshBuilder.CreateCylinder('gunbai-handle', { diameter: 0.09, height: 0.55, tessellation: 10 }, scene);
  handle.parent = fan;
  handle.position.y = 0.05;
  handle.material = lacquer;
  mergeInto(fan, 'gunbai', [blade, handle]);
  const tassel = sphere(scene, 'gunbai-tassel', 0.16, fan, cord);
  tassel.position.y = -0.26;
  return fan;
}

export function makeExtraFood(scene: Scene, root: TransformNode): { group: TransformNode; pizza: TransformNode; soda: TransformNode } {
  const group = new TransformNode('extra-food', scene);
  group.parent = root;
  const pizza = new TransformNode('pizza', scene);
  pizza.parent = group;
  pizza.position.set(-0.2, 0, 0);
  pizza.rotation.y = 0.5;
  const crust = sharedMaterial(scene, 'pizza-crust', '#d99a4e', 0.85);
  const cheese = sharedMaterial(scene, 'pizza-cheese', '#f0c95c', 0.8);
  const pepperoni = sharedMaterial(scene, 'pepperoni', '#b94d38', 0.75);
  const base = MeshBuilder.CreateCylinder('pizza-base', { diameter: 0.95, height: 0.1, tessellation: 3 }, scene);
  base.parent = pizza;
  base.material = crust;
  const topping = MeshBuilder.CreateCylinder('pizza-topping', { diameter: 0.86, height: 0.11, tessellation: 3 }, scene);
  topping.parent = pizza;
  topping.position.y = 0.04;
  topping.material = cheese;
  const slices = [[-0.16, -0.1], [0.17, -0.08], [0, 0.18]].map(([x, z]) => {
    const salami = MeshBuilder.CreateCylinder('pepperoni', { diameter: 0.16, height: 0.025, tessellation: 16 }, scene);
    salami.parent = pizza;
    salami.position.set(x, 0.11, z);
    salami.material = pepperoni;
    return salami;
  });
  mergeInto(pizza, 'pepperoni', slices);

  const soda = new TransformNode('soda', scene);
  soda.parent = group;
  soda.position.set(0.55, 0.35, 0.1);
  const cupMaterial = sharedMaterial(scene, 'soda-cup', '#c94235', 0.55);
  const lidMaterial = sharedMaterial(scene, 'soda-lid', '#eee7d9', 0.5);
  const cup = MeshBuilder.CreateCylinder('soda-cup', { diameterTop: 0.46, diameterBottom: 0.34, height: 0.8, tessellation: 24 }, scene);
  cup.parent = soda;
  cup.material = cupMaterial;
  const band = MeshBuilder.CreateCylinder('soda-band', { diameterTop: 0.43, diameterBottom: 0.41, height: 0.16, tessellation: 24 }, scene);
  band.parent = soda;
  band.material = lidMaterial;
  const lid = MeshBuilder.CreateCylinder('soda-lid', { diameter: 0.48, height: 0.07, tessellation: 24 }, scene);
  lid.parent = soda;
  lid.position.y = 0.43;
  lid.material = lidMaterial;
  const straw = MeshBuilder.CreateCylinder('straw', { diameter: 0.05, height: 0.62, tessellation: 12 }, scene);
  straw.parent = soda;
  straw.position.set(0.1, 0.72, 0);
  straw.rotation.z = -0.16;
  straw.material = cupMaterial;
  mergeInto(soda, 'soda-cup', [cup, straw]);
  mergeInto(soda, 'soda-lid', [band, lid]);

  group.setEnabled(false);
  return { group, pizza, soda };
}

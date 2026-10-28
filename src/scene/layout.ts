export interface LayoutPoint {
  x: number;
  z: number;
}

/** A circle the layout keeps clear, e.g. the middle of the ring during a bout. */
export interface ReservedArea extends LayoutPoint {
  radius: number;
}

interface LayoutItem {
  radius: number;
  target?: LayoutPoint;
}

const DENSITY = 0.25;
const GAP = 2.4;
const ITERATIONS = 80;
const SPRING = 0.07;

export function scatterLayout(items: LayoutItem[], reserved?: ReservedArea): LayoutPoint[] {
  const count = items.length;
  if (count === 0) return [];

  const padding = items.map((item) => item.radius + GAP * 0.5);
  const covered = padding.reduce((sum, radius) => sum + radius * radius, 0);
  const field = Math.sqrt(covered / DENSITY);
  const preferred = new Float64Array(count);
  const x = new Float64Array(count);
  const z = new Float64Array(count);

  for (let i = 0; i < count; i++) {
    const rank = count === 1 ? 0 : i / (count - 1);
    preferred[i] = Math.sqrt(rank) * Math.max(0, field - padding[i]);
    const target = items[i].target;
    if (target && (target.x !== 0 || target.z !== 0)) {
      x[i] = target.x;
      z[i] = target.z;
    } else {
      const angle = i * 2.39996;
      const radius = Math.max(0.05, preferred[i]);
      x[i] = Math.cos(angle) * radius;
      z[i] = Math.sin(angle) * radius;
    }
  }

  for (let pass = 0; pass < ITERATIONS; pass++) {
    for (let i = 0; i < count; i++) {
      const distance = Math.hypot(x[i], z[i]);
      if (distance < 1e-6) continue;
      const pull = (preferred[i] - distance) * SPRING;
      x[i] += x[i] / distance * pull;
      z[i] += z[i] / distance * pull;
    }

    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        let dx = x[j] - x[i];
        let dz = z[j] - z[i];
        let distance = Math.hypot(dx, dz);
        const minimum = padding[i] + padding[j];
        if (distance >= minimum) continue;
        if (distance < 1e-6) {
          dx = Math.cos(i * 2.39996);
          dz = Math.sin(i * 2.39996);
          distance = 1;
        }
        const push = (minimum - distance) * 0.5;
        const pushX = dx / distance * push;
        const pushZ = dz / distance * push;
        x[i] -= pushX;
        z[i] -= pushZ;
        x[j] += pushX;
        z[j] += pushZ;
      }
    }

    if (reserved) {
      for (let i = 0; i < count; i++) {
        let dx = x[i] - reserved.x;
        let dz = z[i] - reserved.z;
        let distance = Math.hypot(dx, dz);
        const minimum = reserved.radius + padding[i];
        if (distance >= minimum) continue;
        if (distance < 1e-6) {
          dx = Math.cos(i * 2.39996);
          dz = Math.sin(i * 2.39996);
          distance = 1;
        }
        x[i] = reserved.x + dx / distance * minimum;
        z[i] = reserved.z + dz / distance * minimum;
      }
    }

    for (let i = 0; i < count; i++) {
      const limit = Math.max(0, field - padding[i]);
      const distance = Math.hypot(x[i], z[i]);
      if (distance > limit && distance > 1e-6) {
        x[i] *= limit / distance;
        z[i] *= limit / distance;
      }
    }
  }

  return items.map((_, index) => ({ x: x[index], z: z[index] }));
}

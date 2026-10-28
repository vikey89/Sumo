import { describe, expect, it } from 'vitest';
import { scatterLayout } from './layout';

describe('scatterLayout', () => {
  it('keeps fighters from overlapping', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({ radius: 1 + (index % 4) * 0.5 }));
    const points = scatterLayout(items);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const distance = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z);
        expect(distance).toBeGreaterThan(items[i].radius + items[j].radius);
      }
    }
  });

  it('keeps a reserved area clear', () => {
    const points = scatterLayout(Array.from({ length: 12 }, () => ({ radius: 1 })), { x: 0, z: 0, radius: 6 });
    for (const point of points) expect(Math.hypot(point.x, point.z)).toBeGreaterThan(6);
  });
});

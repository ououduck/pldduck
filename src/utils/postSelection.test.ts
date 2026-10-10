import { describe, it, expect } from 'vitest';
import { isPinnedFeaturedPost } from './postSelection';

describe('isPinnedFeaturedPost', () => {
  it('featured 且存在 featured-top 为 true', () => {
    expect(isPinnedFeaturedPost({ featured: true, 'featured-top': 0 })).toBe(true);
  });

  it('featured 但无 featured-top 为 false', () => {
    expect(isPinnedFeaturedPost({ featured: true })).toBe(false);
  });

  it('非 featured 即使有 featured-top 也为 false', () => {
    expect(isPinnedFeaturedPost({ featured: false, 'featured-top': 1 })).toBe(false);
    expect(isPinnedFeaturedPost({ 'featured-top': 1 })).toBe(false);
  });
});

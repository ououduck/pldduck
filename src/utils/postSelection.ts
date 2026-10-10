/**
 * 文章选取工具：置顶精选（featured 且带 featured-top 权重）判定，
 * 供排序（postSorting）与卡片（PostCard）共用。
 */
import type { PostMetadata } from '@/types';

type FeaturedPostFields = Pick<PostMetadata, 'featured' | 'featured-top'>;

const isFeaturedPost = (post: Pick<PostMetadata, 'featured'>) => post.featured === true;

/** 判断是否为置顶精选文章（featured 且带数值型 featured-top 权重）。 */
export const isPinnedFeaturedPost = (post: FeaturedPostFields) =>
  isFeaturedPost(post) && typeof post['featured-top'] === 'number';

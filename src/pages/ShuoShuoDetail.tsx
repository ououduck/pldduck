/**
 * 说说详情页（/shuoshuo/:id）：单条短动态的独立可索引页面。
 *
 * 内容来自构建期内联的 generated/shuoshuo.json（eager glob），首帧与 SSG 输出
 * 逐字一致；取不到条目时显示「找不到这条说说」，不发起任何请求。
 *
 * 评论区已于 2026-11 下线：说说只承载内容本身，互动统一收敛到文章评论。
 */

import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { siteConfig } from '@config/site.config';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { shuoshuoPath, buildShuoShuoDescription } from '@/utils/shuoshuo';
import { Seo, buildSiteSchemas } from '../components/Seo';
import { ShuoShuoItem } from '@/components/ShuoShuoItem';
import { ImageViewer, type ImageViewerImage } from '@/components/ImageViewer';
import { ShareModal } from '@/components/ShareModal';
import { NotFoundState } from '@/components/NotFoundState';
import { formatDate } from '@/utils/date';
import { stripMarkdown } from '@/utils/markdownText';
import { copyTextToClipboard } from '@/utils/clipboard';
import { getInitialShuoShuoItem, getShuoShuoTitle } from '@/services/shuoshuo';

export const ShuoShuoDetail = () => {
  const { id } = useParams<{ id: string }>();
  const item = useMemo(() => (id ? getInitialShuoShuoItem(id) : undefined), [id]);
  const strippedContent = useMemo(() => stripMarkdown(item?.content ?? ''), [item?.content]);
  const [previewGallery, setPreviewGallery] = useState<{ images: ImageViewerImage[]; index: number } | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [autoCopied, setAutoCopied] = useState<boolean | null>(null);

  if (!item) {
    // 说说不存在：SPA 内以 200 响应返回该内容，必须 noindex，
    // 避免爬虫把已删除说说的 URL 视为可索引页面收录。
    return (
      <>
        <Seo title="未找到这条说说" description="你访问的说说不存在，可能已经删除或链接失效。" noindex />
        <NotFoundState
          title="未找到这条说说"
          description="这条说说可能已经被删除，或者链接地址已经发生变化。"
          debugLabel={`说说标识：${id || '未知'}`}
          backTo="/shuoshuo"
          backLabel="返回全部说说"
        />
      </>
    );
  }

  const title = getShuoShuoTitle(item);
  const description = buildShuoShuoDescription({
    excerpt: strippedContent || title,
    authorName: siteConfig.author.name,
    date: item.date,
    siteTitle: siteConfig.title,
  });
  const shareImage = item.images && item.images.length > 0 ? item.images[0] : siteConfig.seoImage;

  const handleShare = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : siteConfig.url;
    const url = absoluteSiteUrl(shuoshuoPath(item.id), origin);
    setShareUrl(url);
    setIsShareOpen(true);
    setAutoCopied(null);
    const copied = await copyTextToClipboard(url);
    setAutoCopied(copied);
  };

  const structuredData = [
    ...buildSiteSchemas(description),
    {
      '@context': 'https://schema.org',
      // SocialMediaPosting 是 Article 的子类型，语义上最贴合「朋友圈式短动态」。
      '@type': 'SocialMediaPosting',
      headline: title,
      description,
      ...(shareImage ? { image: [absoluteSiteUrl(shareImage, siteConfig.url)] } : {}),
      datePublished: item.date,
      author: {
        '@type': 'Person',
        name: siteConfig.author.name,
        url: siteConfig.social.github,
        email: siteConfig.social.rawEmail,
      },
      articleBody: strippedContent,
      inLanguage: 'zh-CN',
      isPartOf: {
        '@type': 'WebSite',
        name: siteConfig.title,
        url: absoluteSiteUrl('/', siteConfig.url),
      },
      mainEntityOfPage: absoluteSiteUrl(shuoshuoPath(item.id), siteConfig.url),
      publisher: {
        '@type': 'Organization',
        name: siteConfig.title,
        url: siteConfig.url,
        logo: {
          '@type': 'ImageObject',
          url: absoluteSiteUrl(siteConfig.logo, siteConfig.url),
        },
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: absoluteSiteUrl('/', siteConfig.url) },
        { '@type': 'ListItem', position: 2, name: '说说', item: absoluteSiteUrl('/shuoshuo', siteConfig.url) },
        { '@type': 'ListItem', position: 3, name: title, item: absoluteSiteUrl(shuoshuoPath(item.id), siteConfig.url) },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-3xl pb-12 pt-6 md:pb-20 md:pt-10">
      <Seo
        title={`说说：${title}`}
        description={description}
        image={shareImage}
        url={shuoshuoPath(item.id)}
        type="article"
        publishedTime={item.date}
        structuredData={structuredData}
      />

      <nav aria-label="面包屑" className="mb-4 flex min-w-0 items-center gap-1.5 px-1 text-xs text-content-muted">
        <Link to="/" className="inline-flex items-center gap-1 transition-colors hover:text-content">
          <ArrowLeft size={13} aria-hidden="true" />
          首页
        </Link>
        <ChevronRight size={11} aria-hidden="true" />
        <Link to="/shuoshuo" className="transition-colors hover:text-content">
          说说
        </Link>
        <ChevronRight size={11} aria-hidden="true" />
        <span className="truncate" aria-current="page">
          {title}
        </span>
      </nav>

      <h1 className="mb-4 px-1 font-sans text-2xl font-bold leading-9 tracking-tight text-content md:text-3xl">
        {title}
        <span className="sr-only">
          ，{siteConfig.author.name} 于{' '}
          {formatDate(item.date, 'zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })} 发布
        </span>
      </h1>

      <div data-shuoshuo-id={item.id}>
        <ShuoShuoItem
          item={item}
          onPreview={(images, index) => setPreviewGallery({ images, index })}
          onShare={handleShare}
          showDetailLink={false}
        />
      </div>

      <div className="mt-4 px-1 text-xs">
        <Link to="/shuoshuo" className="inline-flex items-center gap-1.5 text-content-muted hover:text-accent">
          <ArrowLeft size={13} aria-hidden="true" />
          <span>返回说说列表</span>
        </Link>
      </div>

      {previewGallery && (
        <ImageViewer
          src={null}
          images={previewGallery.images}
          initialIndex={previewGallery.index}
          onClose={() => setPreviewGallery(null)}
        />
      )}

      {isShareOpen && (
        <ShareModal
          isOpen={isShareOpen}
          onClose={() => {
            setIsShareOpen(false);
            setAutoCopied(null);
          }}
          title={title}
          excerpt={strippedContent}
          url={shareUrl}
          autoCopied={autoCopied}
          contentLabel="这条说说"
        />
      )}
    </div>
  );
};

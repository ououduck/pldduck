/**
 * 轻量 Markdown 正文渲染（说说 / 留言板详情页用）。
 *
 * 为什么不直接复用文章页的渲染栈：Post.tsx 的 createMarkdownComponents 绑定了
 * 目录游标、代码块复制/下载、Mermaid、KaTeX 与图片查看器等整套文章阅读能力，
 * 把它拉进说说详情会让这个页面 chunk 变重一大截，而这些能力对一段短动态没有意义。
 *
 * 这里只保留短内容真正需要的东西：GFM（表格/删除线/自动链接）、行内代码、
 * 图片（点击查看原图）与外链统一加 rel。**不接 Mermaid、KaTeX 与语法高亮** ——
 * 说说正文里出现这些属于异常输入，按普通文本渲染即可（不假装支持）。
 *
 * 安全：react-markdown 默认不渲染原始 HTML（不启用 rehype-raw），链接与图片地址
 * 由 React 属性转义；外链在组件里强制 rel="noopener noreferrer"，不出现
 * javascript: 协议（react-markdown 的默认 urlTransform 会剔除危险协议）。
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface DiscussionMarkdownProps {
  content: string;
  /** 点击图片时回调（详情页用它打开图片查看器；缺省时图片不可点击）。 */
  onPreviewImage?: (image: { src: string; alt?: string }) => void;
  className?: string;
}

export const DiscussionMarkdown: React.FC<DiscussionMarkdownProps> = ({ content, onPreviewImage, className }) => {
  // 每次渲染重建组件表：与文章页同样的理由（不做 useMemo 缓存），
  // 这里组件表本身不持有游标状态，重建只是保持两处写法一致、便于将来合并。
  const components: Components = {
    // 正文里的标题在短内容页面里不应盖过页面 h1：统一降级为 div 语义块。
    h1: ({ children }) => <p className="mt-4 text-base font-semibold text-content">{children}</p>,
    h2: ({ children }) => <p className="mt-4 text-base font-semibold text-content">{children}</p>,
    h3: ({ children }) => <p className="mt-3 text-[15px] font-semibold text-content">{children}</p>,
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
      >
        {children}
      </a>
    ),
    img: ({ src, alt }) => {
      const source = typeof src === 'string' ? src : '';
      if (!source) return null;
      const image = (
        <img
          src={source}
          alt={alt ?? ''}
          loading="lazy"
          decoding="async"
          className="max-h-[32rem] w-auto max-w-full rounded-media object-contain"
        />
      );
      if (!onPreviewImage) return <span className="my-3 block">{image}</span>;
      return (
        <button
          type="button"
          onClick={() => onPreviewImage({ src: source, alt: alt ?? undefined })}
          className="my-3 block max-w-full cursor-zoom-in rounded-media focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={alt ? `查看大图：${alt}` : '查看大图'}
        >
          {image}
        </button>
      );
    },
    p: ({ children }) => <p className="my-2 leading-7">{children}</p>,
    ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
    blockquote: ({ children }) => (
      <blockquote className="my-3 border-l-2 border-line pl-3 text-content-muted">{children}</blockquote>
    ),
    code: ({ children, className: codeClassName }) => {
      // 围栏代码块（带 language- 前缀）与行内代码样式分开：短内容里不引高亮，只保证可读。
      const isBlock = typeof codeClassName === 'string' && codeClassName.startsWith('language-');
      if (isBlock) {
        return (
          <code className="block overflow-x-auto whitespace-pre rounded-control bg-surface-muted p-3 font-mono text-[13px] leading-6">
            {children}
          </code>
        );
      }
      return <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>;
    },
    pre: ({ children }) => <pre className="my-3 overflow-x-auto">{children}</pre>,
    table: ({ children }) => (
      <div className="my-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border border-line px-2 py-1 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border border-line px-2 py-1">{children}</td>,
    hr: () => <hr className="my-4 border-line" />,
  };

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
};

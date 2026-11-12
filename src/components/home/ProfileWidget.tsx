/**
 * 首页名片卡小部件：头像、名字（全页唯一 `h1`）、身份、`author.bio` 原文与全站搜索。
 *
 * 内容全部取自构建期内联的 `siteConfig`；搜索输入初值固定空字符串，
 * 渲染期不访问时钟/随机值/客户端 API，SSG 与水合首帧严格一致。
 * 搜索只做跳转（空查询 → `/search`，非空 → `/search?q=`），不做联想或内嵌结果。
 */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { siteConfig } from '@config/site.config';
import { assetUrl } from '@/utils/siteUrl';

export const ProfileWidget = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
  };

  return (
    <section
      aria-label="站主名片"
      data-home-reveal="card-1"
      className="home-widget home-reveal home-profile relative flex min-w-0 flex-col overflow-hidden rounded-overlay bg-surface p-5 sm:p-7 lg:col-span-3 xl:col-span-5 xl:row-span-2"
    >
      <div aria-hidden="true" className="home-widget-glow" />

      <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center text-center sm:items-start sm:text-left">
        <img
          src={assetUrl(siteConfig.author.avatar)}
          alt={siteConfig.author.name}
          width={96}
          height={96}
          decoding="async"
          className="h-16 w-16 rounded-full bg-surface-muted object-cover ring-1 ring-line sm:h-20 sm:w-20"
        />

        <h1 className="mt-4 font-serif text-[2rem] font-bold leading-tight tracking-tight text-content [overflow-wrap:anywhere] sm:text-4xl">
          {siteConfig.author.name}
        </h1>

        <p className="mt-1.5 text-[13px] text-content-muted sm:text-sm">{siteConfig.author.role}</p>

        <p className="mt-3 max-w-lg text-[13px] leading-6 text-content-muted sm:mt-4 sm:text-sm sm:leading-7">
          {siteConfig.author.bio}
        </p>
      </div>

      <form role="search" onSubmit={handleSearchSubmit} className="relative mt-auto pt-5 sm:pt-6">
        <label htmlFor="home-search" className="sr-only">
          搜索全站
        </label>
        <div className="flex items-center gap-2 rounded-control bg-surface-muted px-3 transition-shadow duration-200 focus-within:ring-1 focus-within:ring-content-muted">
          <Search size={16} aria-hidden="true" className="shrink-0 text-content-muted" />
          <input
            id="home-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索文章、标签与分类…"
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-content outline-none placeholder:text-content-muted sm:text-sm"
          />
          <button
            type="submit"
            className="min-h-11 shrink-0 rounded-micro px-2 text-sm font-medium text-content-muted transition-colors hover:text-content"
          >
            搜索
          </button>
        </div>
      </form>
    </section>
  );
};

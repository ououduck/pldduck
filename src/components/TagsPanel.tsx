/**
 * 文章标签面板：桌面右侧 sticky 卡片；移动端固定右侧标签按钮 + 侧边弹层。
 * 只负责标签列表与筛选交互，计数/排序由调用方（Posts）传入。
 */
import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Tag, X } from 'lucide-react';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { mergeClassName } from '@/utils/classNames';

export interface TagSummary {
  name: string;
  count: number;
}

interface TagsPanelProps {
  tags: TagSummary[];
  selectedTag: string | null;
  totalPosts: number;
  onSelectTag: (tag: string | null) => void;
}

const tagButtonClass = (active: boolean) =>
  `flex min-h-11 w-full items-center justify-between gap-2 rounded-control px-2.5 text-left text-sm transition-colors ${
    active ? 'bg-content font-semibold text-background' : 'text-content-muted hover:bg-surface-muted hover:text-content'
  }`;

const TagList: React.FC<{
  tags: TagSummary[];
  selectedTag: string | null;
  totalPosts: number;
  onSelectTag: (tag: string | null) => void;
  closeAfterSelect?: () => void;
}> = ({ tags, selectedTag, totalPosts, onSelectTag, closeAfterSelect }) => {
  const select = (tag: string | null) => {
    onSelectTag(tag);
    closeAfterSelect?.();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={() => select(null)}
        aria-pressed={!selectedTag}
        className={mergeClassName(tagButtonClass(!selectedTag), 'shrink-0')}
      >
        <span>全部文章</span>
        <span className="shrink-0 text-[11px] tabular-nums opacity-70">{totalPosts}</span>
      </button>
      <ul className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain pr-0.5">
        {tags.map((tag) => {
          const active = selectedTag === tag.name;
          return (
            <li key={tag.name}>
              <button
                type="button"
                onClick={() => select(tag.name)}
                aria-pressed={active}
                aria-label={`筛选标签 ${tag.name}，共 ${tag.count} 篇文章`}
                className={tagButtonClass(active)}
              >
                <span className="min-w-0 truncate">{tag.name}</span>
                <span className="shrink-0 text-[11px] tabular-nums opacity-70">{tag.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export const TagsPanel: React.FC<TagsPanelProps> = ({ tags, selectedTag, totalPosts, onSelectTag }) => {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const close = () => setIsOpen(false);
  useModalOverlay({
    isOpen,
    onClose: close,
    containerRef: panelRef,
    initialFocusRef: closeButtonRef,
  });

  return (
    <>
      <aside aria-label="全部标签" className="hidden w-64 shrink-0 self-start lg:sticky lg:top-24 lg:block">
        <div className="flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-overlay bg-surface-muted p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="font-serif text-lg font-bold text-content">标签</h2>
            <span className="text-[11px] tabular-nums text-content-muted">{tags.length} 个</span>
          </div>
          <TagList tags={tags} selectedTag={selectedTag} totalPosts={totalPosts} onSelectTag={onSelectTag} />
        </div>
      </aside>

      {/* 移动端：贴右侧中部的标签入口（桌面隐藏） */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-controls="posts-tags-panel"
          aria-label="打开标签筛选"
          className="fixed right-0 top-1/2 z-floating inline-flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-control bg-content px-2.5 py-4 text-background transition-transform active:scale-[0.98]"
        >
          <Tag size={15} aria-hidden="true" />
          <span className="text-[10px] font-semibold tracking-[0.12em] [writing-mode:vertical-rl]">标签</span>
        </button>
      </div>

      {isOpen &&
        createPortal(
          <>
            <motion.div
              className="fixed inset-0 z-modal bg-black/60"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: 'easeOut' }}
              onClick={close}
            />
            <motion.aside
              ref={panelRef}
              id="posts-tags-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="posts-tags-panel-title"
              tabIndex={-1}
              initial={shouldReduceMotion ? false : { opacity: 0, x: 24, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeOut' }}
              className="fixed inset-y-0 right-0 z-modal flex w-[min(17rem,86vw)] flex-col bg-surface px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top,0px))] text-content shadow-xl"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 id="posts-tags-panel-title" className="font-serif text-xl font-bold text-content">
                  标签
                </h2>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={close}
                  aria-label="关闭标签筛选"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>
              <TagList
                tags={tags}
                selectedTag={selectedTag}
                totalPosts={totalPosts}
                onSelectTag={onSelectTag}
                closeAfterSelect={close}
              />
            </motion.aside>
          </>,
          document.body,
        )}
    </>
  );
};

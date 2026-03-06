import { useState, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function CollapsibleSection({
  title,
  icon,
  badge,
  defaultHeight = 160,
  minHeight = 60,
  maxHeight = 500,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: number;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState(defaultHeight);
  const isResizing = useRef(false);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startY = e.clientY;
    const startH = height;

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newH = Math.min(maxHeight, Math.max(minHeight, startH + (e.clientY - startY)));
      setHeight(newH);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [height, minHeight, maxHeight]);

  return (
    <div className="border-t border-th-border flex flex-col shrink-0" style={collapsed ? undefined : { height }}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="px-3 py-1.5 flex items-center gap-2 shrink-0 hover:bg-th-bg-alt/50 transition-colors w-full text-left"
      >
        {collapsed ? <ChevronRight className="w-3 h-3 text-th-text-muted" /> : <ChevronDown className="w-3 h-3 text-th-text-muted" />}
        {icon}
        <span className="text-xs font-semibold">{title}</span>
        {badge !== undefined && <span className="text-[10px] text-th-text-muted ml-auto">{badge}</span>}
      </button>
      {!collapsed && (
        <>
          <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
          <div
            onMouseDown={startResize}
            className="h-1 cursor-row-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors shrink-0"
          />
        </>
      )}
    </div>
  );
}

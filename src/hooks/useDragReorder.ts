import { useState } from "react";

// 行のドラッグ&ドロップによる手動並べ替え。
// onReorder には並べ替え後の配列が渡される（各行に sort_order を振り直して保存する想定）。
export function useDragReorder<T>(items: T[], onReorder: (ordered: T[]) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const onDragStart = (index: number) => (e: React.DragEvent) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (index !== overIndex) setOverIndex(index);
  };

  const onDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    setDragIndex(null);
    setOverIndex(null);
    onReorder(next);
  };

  const onDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const rowProps = (index: number) => ({
    draggable: true,
    onDragStart: onDragStart(index),
    onDragOver: onDragOver(index),
    onDrop: onDrop(index),
    onDragEnd,
    "data-dragging": dragIndex === index ? "true" : undefined,
    "data-over": overIndex === index && dragIndex !== index ? "true" : undefined,
  });

  return { rowProps, dragIndex, overIndex };
}

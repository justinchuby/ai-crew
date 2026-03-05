/**
 * Full-pane drop overlay indicator. Place inside a `relative` positioned
 * container and render when `isDragOver` is true.
 */
export function DropOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-accent/10 border-2 border-dashed border-accent rounded-lg z-20 pointer-events-none">
      <div className="text-sm font-medium text-accent bg-th-bg/80 px-4 py-2 rounded-lg shadow">
        Drop file to attach
      </div>
    </div>
  );
}

import { useState, useRef } from 'react';

export default function DraggableLayout({ theme, sections }) {
  const [order, setOrder] = useState(() => sections.map(s => s.id));
  const dragId = useRef(null);
  const dragOverId = useRef(null);

  const orderedSections = order.map(id => sections.find(s => s.id === id)).filter(Boolean);

  const handleDragStart = (id) => {
    dragId.current = id;
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    dragOverId.current = id;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const from = dragId.current;
    const to = dragOverId.current;
    if (!from || !to || from === to) return;

    setOrder(prev => {
      const next = [...prev];
      const fi = next.indexOf(from);
      const ti = next.indexOf(to);
      next.splice(fi, 1);
      next.splice(ti, 0, from);
      return next;
    });
    dragId.current = null;
    dragOverId.current = null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {orderedSections.map(section => (
        <DraggableSection
          key={section.id}
          section={section}
          theme={theme}
          onDragStart={() => handleDragStart(section.id)}
          onDragOver={(e) => handleDragOver(e, section.id)}
          onDrop={handleDrop}
        />
      ))}
    </div>
  );
}

function DraggableSection({ section, theme, onDragStart, onDragOver, onDrop }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      draggable
      onDragStart={() => { setIsDragging(true); onDragStart(); }}
      onDragEnd={() => setIsDragging(false)}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); onDragOver(e); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { setIsDragOver(false); onDrop(e); }}
      style={{
        opacity: isDragging ? 0.5 : 1,
        outline: isDragOver ? `2px dashed ${theme.accent}` : '2px solid transparent',
        borderRadius: 16,
        transition: 'opacity 0.15s, outline 0.15s',
      }}
    >
      {/* Drag handle row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        paddingLeft: 2,
        cursor: 'grab',
      }}>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          style={{ color: theme.dragHandle, flexShrink: 0 }}
        >
          <circle cx="4" cy="3" r="1.2" fill="currentColor"/>
          <circle cx="4" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="4" cy="11" r="1.2" fill="currentColor"/>
          <circle cx="10" cy="3" r="1.2" fill="currentColor"/>
          <circle cx="10" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="10" cy="11" r="1.2" fill="currentColor"/>
        </svg>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: theme.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          fontFamily: "'Space Grotesk', sans-serif",
          userSelect: 'none',
        }}>
          {section.label}
        </span>
      </div>

      {section.render()}
    </div>
  );
}

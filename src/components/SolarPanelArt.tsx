import { useId } from 'react';

/**
 * Tasteful 3D-style solar panel illustration drawn as SVG.
 * Used inside the Solar Panel Monitoring card and as a compact system icon.
 */

interface Quad {
  a: [number, number];
  b: [number, number];
  c: [number, number];
  d: [number, number];
}

/** Bilinear interpolation of a quad at (u, v) in [0,1]. */
function quadPoint(q: Quad, u: number, v: number): [number, number] {
  const ab: [number, number] = [q.a[0] + (q.b[0] - q.a[0]) * u, q.a[1] + (q.b[1] - q.a[1]) * u];
  const dc: [number, number] = [q.d[0] + (q.c[0] - q.d[0]) * u, q.d[1] + (q.c[1] - q.d[1]) * u];
  return [ab[0] + (dc[0] - ab[0]) * v, ab[1] + (dc[1] - ab[1]) * v];
}

function quadPoly(q: Quad, u0: number, u1: number, v0: number, v1: number): string {
  return [quadPoint(q, u0, v0), quadPoint(q, u1, v0), quadPoint(q, u1, v1), quadPoint(q, u0, v1)]
    .map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(' ');
}

export function SolarPanelArt({ className }: { className?: string }) {
  const uid = useId().replaceAll(':', '');
  const panel: Quad = {
    a: [30, 74],
    b: [176, 44],
    c: [226, 128],
    d: [80, 158],
  };
  const cols = 5;
  const rows = 3;
  const cells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(
        quadPoly(panel, c / cols + 0.012, (c + 1) / cols - 0.012, r / rows + 0.03, (r + 1) / rows - 0.03),
      );
    }
  }
  const frame = quadPoly(panel, 0, 1, 0, 1);
  return (
    <svg viewBox="0 0 256 200" className={className} role="img" aria-label="Rooftop solar panel illustration">
      <defs>
        <linearGradient id={`cell-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5a83ff" />
          <stop offset="55%" stopColor="#3d64e8" />
          <stop offset="100%" stopColor="#2c48b8" />
        </linearGradient>
        <linearGradient id={`sheen-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
          <stop offset="35%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`sun-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffc08a" />
          <stop offset="60%" stopColor="#ff944d" />
          <stop offset="100%" stopColor="#ff7a26" />
        </radialGradient>
        <radialGradient id={`glow-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ff944d" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ff944d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`leg-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a3a3a" />
          <stop offset="100%" stopColor="#262626" />
        </linearGradient>
      </defs>

      {/* sun + glow */}
      <circle cx="206" cy="38" r="52" fill={`url(#glow-${uid})`} />
      <circle cx="206" cy="38" r="17" fill={`url(#sun-${uid})`} />
      <g stroke="#ff944d" strokeWidth="2.4" strokeLinecap="round" opacity="0.9">
        {Array.from({ length: 8 }, (_, i) => {
          const angle = (i * Math.PI) / 4;
          const x1 = 206 + Math.cos(angle) * 24;
          const y1 = 38 + Math.sin(angle) * 24;
          const x2 = 206 + Math.cos(angle) * 31;
          const y2 = 38 + Math.sin(angle) * 31;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>

      {/* ground shadow */}
      <ellipse cx="150" cy="170" rx="104" ry="16" fill="#000" opacity="0.35" />

      {/* legs */}
      <g fill={`url(#leg-${uid})`}>
        <polygon points="96,142 108,138 104,168 92,168" />
        <polygon points="188,118 200,114 214,162 202,162" />
      </g>

      {/* panel */}
      <polygon points={frame} fill="#1a2340" />
      <polygon points={frame} fill={`url(#cell-${uid})`} />
      {cells.map((points, i) => (
        <g key={i}>
          <polygon points={points} fill="none" stroke="#0e1530" strokeWidth="1.6" opacity="0.85" />
          <polygon points={points} fill={`url(#sheen-${uid})`} opacity="0.5" />
        </g>
      ))}
      <polygon points={frame} fill="none" stroke="#6d8dff" strokeWidth="1.6" opacity="0.7" />

      {/* rising energy sparks */}
      <g fill="#8fa7ff">
        <circle cx="118" cy="52" r="2.6" opacity="0.9" />
        <circle cx="140" cy="38" r="2" opacity="0.55" />
        <circle cx="100" cy="30" r="1.6" opacity="0.4" />
      </g>
    </svg>
  );
}

/** Compact panel icon for system status rows. */
export function PanelGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M5 4h14l2.2 9H2.8L5 4Z" fill="#3d64e8" fillOpacity="0.35" stroke="#8fa7ff" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M9.2 4.4 8 13M14.8 4.4 16 13M3.6 8.8h16.8" stroke="#8fa7ff" strokeWidth="1.1" opacity="0.8" />
      <path d="M12 13v6M8.5 21.5h7" stroke="#8fa7ff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

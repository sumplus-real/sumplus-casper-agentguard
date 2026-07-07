"use client";

/**
 * Animated DNA Double Helix SVG
 *
 * A procedurally generated double helix with brand gradient colors,
 * glowing base-pair rungs, and a slow continuous rotation animation.
 */
export default function DnaHelix({
  width = 280,
  height = 480,
  className = "",
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  // Helix parameters
  const steps = 24;
  const amplitude = 40;
  const centerX = width / 2;
  const yStart = 20;
  const yEnd = height - 20;
  const yRange = yEnd - yStart;

  // Generate helix points
  const points: {
    y: number;
    x1: number;
    x2: number;
    phase: number;
    opacity: number;
  }[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = yStart + t * yRange;
    const phase = t * Math.PI * 3; // 1.5 full turns
    const x1 = centerX + Math.sin(phase) * amplitude;
    const x2 = centerX + Math.sin(phase + Math.PI) * amplitude;
    // Depth-based opacity: front strand brighter, back strand dimmer
    const opacity = 0.4 + 0.6 * ((Math.sin(phase) + 1) / 2);
    points.push({ y, x1, x2, phase, opacity });
  }

  // Build strand paths
  const strand1Path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x1.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const strand2Path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x2.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  // Build smooth bezier paths for strands
  function smoothPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 2) return "";
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cpY = (prev.y + curr.y) / 2;
      d += ` C ${prev.x.toFixed(1)} ${cpY.toFixed(1)}, ${curr.x.toFixed(1)} ${cpY.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }
    return d;
  }

  const strand1Smooth = smoothPath(points.map((p) => ({ x: p.x1, y: p.y })));
  const strand2Smooth = smoothPath(points.map((p) => ({ x: p.x2, y: p.y })));

  // Rungs: connect the two strands at each step, skip very close ones
  const rungs = points.filter((_, i) => i % 2 === 0 && i > 0 && i < steps);

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      {/* Outer glow */}
      <div
        className="absolute inset-0 blur-3xl opacity-30"
        style={{
          background: "radial-gradient(ellipse at center, rgba(40,20,254,0.4) 0%, rgba(2,158,231,0.2) 40%, transparent 70%)",
        }}
      />

      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fill="none"
        className="relative z-10 dna-helix-rotate"
      >
        <defs>
          {/* Strand gradients */}
          <linearGradient id="strand1Grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2814FE" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#029EE7" stopOpacity="1" />
            <stop offset="100%" stopColor="#2814FE" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="strand2Grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#029EE7" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#2814FE" stopOpacity="1" />
            <stop offset="100%" stopColor="#029EE7" stopOpacity="0.9" />
          </linearGradient>

          {/* Rung gradient */}
          <linearGradient id="rungGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2814FE" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#029EE7" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#2814FE" stopOpacity="0.6" />
          </linearGradient>

          {/* Glow filter */}
          <filter id="dnaGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="rungGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Fade mask for top and bottom */}
          <linearGradient id="fadeMask" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="12%" stopColor="white" stopOpacity="1" />
            <stop offset="88%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="edgeFade">
            <rect x="0" y="0" width={width} height={height} fill="url(#fadeMask)" />
          </mask>
        </defs>

        <g mask="url(#edgeFade)">
          {/* Rungs (base pairs) - draw behind strands where needed */}
          {rungs.map((p, i) => {
            // Determine if rung is "in front" or "behind" the strands
            const sinVal = Math.sin(p.phase);
            const isFront = sinVal > 0;
            // Split rung into two halves with different colors (like base pairs)
            const midX = (p.x1 + p.x2) / 2;
            return (
              <g key={`rung-${i}`} opacity={isFront ? 0.7 : 0.25}>
                {/* Left half */}
                <line
                  x1={p.x1}
                  y1={p.y}
                  x2={midX}
                  y2={p.y}
                  stroke="#2814FE"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  filter="url(#rungGlow)"
                />
                {/* Right half */}
                <line
                  x1={midX}
                  y1={p.y}
                  x2={p.x2}
                  y2={p.y}
                  stroke="#029EE7"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  filter="url(#rungGlow)"
                />
                {/* Center node */}
                <circle
                  cx={midX}
                  cy={p.y}
                  r={2}
                  fill="white"
                  opacity={isFront ? 0.8 : 0.3}
                />
                {/* End nodes */}
                <circle cx={p.x1} cy={p.y} r={3} fill="#2814FE" opacity={isFront ? 0.9 : 0.3} />
                <circle cx={p.x2} cy={p.y} r={3} fill="#029EE7" opacity={isFront ? 0.9 : 0.3} />
              </g>
            );
          })}

          {/* Strand 1 (primary) */}
          <path
            d={strand1Smooth}
            stroke="url(#strand1Grad)"
            strokeWidth={3}
            strokeLinecap="round"
            filter="url(#dnaGlow)"
          />

          {/* Strand 2 (secondary) */}
          <path
            d={strand2Smooth}
            stroke="url(#strand2Grad)"
            strokeWidth={3}
            strokeLinecap="round"
            filter="url(#dnaGlow)"
          />

          {/* Floating particles along strands */}
          {[0.15, 0.35, 0.55, 0.75, 0.92].map((t, i) => {
            const idx = Math.floor(t * steps);
            const p = points[Math.min(idx, points.length - 1)];
            return (
              <circle
                key={`particle-${i}`}
                cx={i % 2 === 0 ? p.x1 : p.x2}
                cy={p.y}
                r={2}
                fill="white"
                opacity={0.8}
                className="dna-particle"
                style={{ animationDelay: `${i * 0.7}s` }}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}

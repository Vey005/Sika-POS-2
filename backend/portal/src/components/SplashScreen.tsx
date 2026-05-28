import { useEffect, useState } from 'react';

/**
 * SplashScreen — matches the desktop Electron splash exactly:
 *   - Dark #0C0C0F background
 *   - Animated gold SVG ring drawing in
 *   - ₵ symbol fading in at center
 *   - "₵ SIKAPOS" title sliding up
 *   - "PREMIUM BUSINESS SOLUTIONS" tagline
 *   - Gold shimmer loading bar sweeping along the bottom
 *
 * Shown for ~2.5 seconds on first mount then fades out.
 */
export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 2400);
    const doneTimer = setTimeout(onDone, 2900);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: '#0C0C0F',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      overflow: 'hidden',
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.5s ease',
    }}>
      {/* Radial gold glow */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(circle at center, rgba(212,160,23,0.06) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Animated ring + ₵ symbol */}
      <div style={{ position: 'relative', width: 100, height: 100, marginBottom: 32 }}>
        <svg
          viewBox="0 0 100 100"
          width="100"
          height="100"
          style={{ filter: 'drop-shadow(0 0 10px rgba(212,160,23,0.4))' }}
        >
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke="#D4A017"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="283"
            strokeDashoffset="283"
            style={{
              transformOrigin: 'center',
              transform: 'rotate(-90deg)',
              animation: 'sikaDrawRing 1.5s cubic-bezier(0.65,0,0.35,1) forwards',
            }}
          />
        </svg>
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#D4A017',
          fontSize: 36,
          fontWeight: 700,
          opacity: 0,
          textShadow: '0 0 20px rgba(212,160,23,0.5)',
          animation: 'sikaFadeIn 0.8s ease 1s forwards',
        }}>₵</div>
      </div>

      {/* Title */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        opacity: 0,
        animation: 'sikaSlideUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.5s forwards',
      }}>
        <span style={{ color: '#D4A017', fontSize: 28, fontWeight: 700 }}>₵</span>
        <span style={{
          color: '#FFFFFF',
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: 6,
          textTransform: 'uppercase',
        }}>SIKAPOS</span>
      </div>

      {/* Tagline */}
      <div style={{
        marginTop: 12,
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 3,
        textTransform: 'uppercase',
        opacity: 0,
        animation: 'sikaFadeIn 1s ease 1.2s forwards',
      }}>
        Premium Business Solutions
      </div>

      {/* Loading bar at bottom */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0,
        height: 3,
        width: '50%',
        background: 'linear-gradient(90deg, transparent, #D4A017, transparent)',
        animation: 'sikaLoading 2s infinite ease-in-out',
      }} />

      <style>{`
        @keyframes sikaDrawRing {
          to { stroke-dashoffset: 0; }
        }
        @keyframes sikaFadeIn {
          to { opacity: 1; }
        }
        @keyframes sikaSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sikaLoading {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}

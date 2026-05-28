import React, { useRef } from 'react';

interface RippleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'icon-round';
  children: React.ReactNode;
}

/**
 * RippleButton — drop-in replacement for <button> that adds an Android-style
 * ripple on every tap/click. Just pass className="btn-primary" etc. as usual.
 */
export default function RippleButton({
  children,
  className = '',
  variant,
  onClick,
  style,
  ...rest
}: RippleButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const variantClass =
    variant === 'primary' ? 'btn-primary' :
    variant === 'secondary' ? 'btn-secondary' :
    variant === 'danger' ? 'btn-danger' :
    variant === 'icon-round' ? 'btn-icon-round' :
    '';

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const btn = btnRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top  - size / 2;

    const ripple = document.createElement('span');
    ripple.className = 'ripple-wave';
    ripple.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
    `;
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });

    onClick?.(e);
  }

  return (
    <button
      ref={btnRef}
      className={`ripple ${variantClass} ${className}`.trim()}
      style={{ position: 'relative', overflow: 'hidden', ...style }}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </button>
  );
}

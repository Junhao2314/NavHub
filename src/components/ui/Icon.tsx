import { Link } from 'lucide-react';
import React, { Suspense } from 'react';
import { getLucideIconLazy, isLucideIconName } from './lucideIconMap';

interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

const isTextIcon = (rawName: string): boolean => {
  const trimmed = rawName.trim();
  if (!trimmed) return false;
  return !/^[a-z0-9-]+$/i.test(trimmed);
};

const Icon: React.FC<IconProps> = ({ name, size = 20, className }) => {
  const trimmed = name.trim();
  const FallbackIcon = Link;
  const LoadingFallback = (
    <span
      className={className}
      style={{ width: size, height: size, display: 'inline-block' }}
      aria-hidden="true"
    />
  );

  if (!trimmed) {
    return <FallbackIcon size={size} className={className} />;
  }

  if (isTextIcon(trimmed)) {
    return (
      <span
        className={className}
        style={{ fontSize: size, lineHeight: 1, display: 'inline-flex' }}
        aria-hidden="true"
      >
        {trimmed}
      </span>
    );
  }

  if (trimmed === 'Link') {
    return <FallbackIcon size={size} className={className} />;
  }

  if (isLucideIconName(trimmed)) {
    const IconComponent = getLucideIconLazy(trimmed);
    return (
      <Suspense fallback={LoadingFallback}>
        <IconComponent size={size} className={className} />
      </Suspense>
    );
  }

  return <FallbackIcon size={size} className={className} />;
};

export default Icon;

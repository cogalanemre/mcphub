import React from 'react';

interface VaultAvatarProps {
  name: string;
  image?: string | null;
  size?: number;
}

const hue = (value: string): number => {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
};

const VaultAvatar: React.FC<VaultAvatarProps> = ({ name, image, size = 32 }) => {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        className="flex-shrink-0 object-cover"
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size / 4),
          border: '1px solid var(--hub-line)',
          background: 'var(--hub-surface)',
        }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className="grid flex-shrink-0 place-items-center font-semibold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 4),
        fontSize: Math.round(size * 0.42),
        background: `oklch(0.62 0.13 ${hue(name)})`,
      }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
};

export default VaultAvatar;

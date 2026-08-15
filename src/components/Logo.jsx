export default function Logo({ size = 96, radius }) {
  const r = radius ?? Math.round(size * 0.28)
  const uid = 'lg' + size
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="GAV YOUTH">
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6857b" />
          <stop offset="1" stopColor="#ffab4d" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx={r} fill={`url(#${uid})`} />
      {/* speech bubble */}
      <path
        d="M31 30h30a9 9 0 0 1 9 9v14a9 9 0 0 1-9 9H45l-11 8v-8h-3a9 9 0 0 1-9-9V39a9 9 0 0 1 9-9z"
        fill="#ffffff"
      />
      {/* sparkle */}
      <path
        d="M52 38c1.1 4.6 2.4 5.9 7 7-4.6 1.1-5.9 2.4-7 7-1.1-4.6-2.4-5.9-7-7 4.6-1.1 5.9-2.4 7-7z"
        fill="#f6857b"
      />
    </svg>
  )
}

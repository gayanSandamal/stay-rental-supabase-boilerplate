import { ImageResponse } from 'next/og';

export const alt = 'Stay Rental - Verified Mid-to-Long-Term Rentals in Sri Lanka';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #062C2B 0%, #0A3F3D 35%, #083432 65%, #051F1E 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #0F5C5A, #0C4B49)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
            >
              <path d="M3 9.5L12 3l9 6.5V21H3V9.5z" strokeLinejoin="round" fill="rgba(255,255,255,0.2)" />
              <rect x="9" y="14" width="6" height="7" rx="1" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ fontSize: 48, fontWeight: 800, color: 'white' }}>
            Stay<span style={{ color: '#5EEAD4' }}>Rental</span>
          </span>
        </div>
        <p style={{ fontSize: 28, color: 'rgba(255,255,255,0.9)', margin: 0 }}>
          Verified Mid-to-Long-Term Rentals in Sri Lanka
        </p>
        <p style={{ fontSize: 20, color: 'rgba(255,255,255,0.6)', marginTop: 12 }}>
          Verified landlords · Property visits · Fast viewing coordination
        </p>
      </div>
    ),
    { ...size }
  );
}

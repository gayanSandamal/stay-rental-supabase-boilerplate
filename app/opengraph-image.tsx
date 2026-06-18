import { ImageResponse } from 'next/og';

export const alt = 'Easy Rent - Verified Mid-to-Long-Term Rentals in Sri Lanka';
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
          fontFamily: 'sans-serif',
          background:
            'linear-gradient(135deg, #062C2B 0%, #0A3F3D 35%, #083432 65%, #051F1E 100%)',
        }}
      >
        {/* House mark */}
        <svg width="156" height="156" viewBox="0 0 100 100" fill="none">
          <path
            d="M43.09,26.76 Q50.00,21.00 56.91,26.76 L73.09,40.24 Q80.00,46.00 80.00,55.00 L80.00,73.00 Q80.00,82.00 71.00,82.00 L29.00,82.00 Q20.00,82.00 20.00,73.00 L20.00,55.00 Q20.00,46.00 26.91,40.24 L43.09,26.76 Z"
            fill="none"
            stroke="#ffffff"
            strokeWidth="6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>

        {/* Wordmark */}
        <div
          style={{
            display: 'flex',
            marginTop: 40,
            fontSize: 62,
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: 16,
          }}
        >
          EASY RENT
        </div>

        {/* Tagline */}
        <div
          style={{
            display: 'flex',
            marginTop: 10,
            fontSize: 20,
            fontWeight: 600,
            color: '#E3A11A',
            letterSpacing: 7,
          }}
        >
          VERIFIED RENTALS · SRI LANKA
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 30,
            fontSize: 27,
            color: 'rgba(255,255,255,0.88)',
          }}
        >
          Verified mid-to-long-term rentals in Sri Lanka
        </div>
      </div>
    ),
    { ...size }
  );
}

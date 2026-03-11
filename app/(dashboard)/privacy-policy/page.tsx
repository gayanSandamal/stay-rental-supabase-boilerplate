import Link from 'next/link';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://stayrental.lk';

export const metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for Stay Rental - Sri Lanka\'s trusted platform for verified mid-to-long-term rentals.',
  alternates: {
    canonical: `${baseUrl}/privacy-policy`,
  },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link
          href="/"
          className="text-sm text-teal-600 hover:text-teal-700 mb-8 inline-block"
        >
          ← Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-slate-500 text-sm mb-12">
          Last updated: {new Date().toLocaleDateString('en-GB')}
        </p>

        <div className="prose prose-slate max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              1. Introduction
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Stay Rental (Pvt) Ltd (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates
              the Stay Rental platform for verified mid-to-long-term rentals in Sri Lanka.
              This Privacy Policy explains how we collect, use, disclose, and safeguard
              your information when you use our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              2. Information We Collect
            </h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              We may collect information that you provide directly, including:
            </p>
            <ul className="list-disc pl-6 text-slate-600 space-y-1">
              <li>Name, email address, and phone number</li>
              <li>Account credentials and profile information</li>
              <li>Property listings and related details</li>
              <li>Viewing requests, lead inquiries, and communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              3. How We Use Your Information
            </h2>
            <p className="text-slate-600 leading-relaxed">
              We use your information to operate the platform, provide customer support,
              send you relevant updates and notifications, improve our services, and
              comply with legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              4. Data Sharing and Disclosure
            </h2>
            <p className="text-slate-600 leading-relaxed">
              We may share your information with landlords, tenants, and service
              providers as necessary to facilitate rentals. We do not sell your
              personal data to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              5. Data Security
            </h2>
            <p className="text-slate-600 leading-relaxed">
              We implement appropriate technical and organisational measures to
              protect your personal data against unauthorised access, alteration,
              or destruction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              6. Contact Us
            </h2>
            <p className="text-slate-600 leading-relaxed">
              For questions about this Privacy Policy, please contact us at{' '}
              <a href="mailto:hello@stayrental.lk" className="text-teal-600 hover:underline">
                hello@stayrental.lk
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

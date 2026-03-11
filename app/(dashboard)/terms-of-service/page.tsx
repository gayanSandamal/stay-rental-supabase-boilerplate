import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | Stay Rental',
  description: 'Terms of Service for Stay Rental - Sri Lanka\'s trusted platform for verified mid-to-long-term rentals.',
};

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link
          href="/"
          className="text-sm text-teal-600 hover:text-teal-700 mb-8 inline-block"
        >
          ← Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-slate-500 text-sm mb-12">
          Last updated: {new Date().toLocaleDateString('en-GB')}
        </p>

        <div className="prose prose-slate max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              1. Acceptance of Terms
            </h2>
            <p className="text-slate-600 leading-relaxed">
              By accessing or using Stay Rental (&quot;the Platform&quot;), you agree to be
              bound by these Terms of Service. If you do not agree, please do not use
              our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              2. Description of Service
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Stay Rental (Pvt) Ltd operates a platform connecting tenants with verified
              landlords for mid-to-long-term rentals in Sri Lanka. We facilitate
              listings, viewings, and lead management but are not a party to rental
              agreements between tenants and landlords.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              3. User Responsibilities
            </h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              You agree to:
            </p>
            <ul className="list-disc pl-6 text-slate-600 space-y-1">
              <li>Provide accurate and complete information</li>
              <li>Use the platform only for lawful purposes</li>
              <li>Not engage in fraud, misrepresentation, or harassment</li>
              <li>Respect the intellectual property and rights of others</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              4. Listings and Content
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Landlords are responsible for the accuracy of their listings. We reserve
              the right to remove or modify content that violates our policies or
              applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              5. Limitation of Liability
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Stay Rental is not liable for any disputes, damages, or losses arising
              from transactions between users. We provide the platform as-is and do not
              guarantee uninterrupted or error-free service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900 mb-3">
              6. Contact
            </h2>
            <p className="text-slate-600 leading-relaxed">
              For questions about these Terms, contact us at{' '}
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

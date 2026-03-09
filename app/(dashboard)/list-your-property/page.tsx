import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Shield,
  Users,
  Eye,
  Clock,
  CheckCircle,
  ArrowRight,
  Phone,
  Building2,
} from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'List Your Property | Stay Rental',
  description:
    'List your rental property on Stay Rental. Reach verified tenants, get viewing coordination, and enjoy a hassle-free listing experience in Sri Lanka.',
};

const benefits = [
  {
    icon: Shield,
    title: 'Verified Tenant Leads',
    description:
      'Every viewing request includes tenant contact details. Our ops team screens and coordinates viewings so you only meet serious tenants.',
  },
  {
    icon: Eye,
    title: 'Property Visit Badge',
    description:
      'Our team visits your property and awards a "Visited" badge, increasing trust and attracting more tenants.',
  },
  {
    icon: Users,
    title: 'Dedicated Ops Support',
    description:
      'A dedicated operations team manages your listing, handles inquiries, schedules viewings, and keeps you updated.',
  },
  {
    icon: Clock,
    title: '30-Day Active Listings',
    description:
      'Your listing stays active for 30 days with easy renewal. No daily re-posting needed.',
  },
  {
    icon: Phone,
    title: 'Verified Contact Numbers',
    description:
      'Only platform-verified phone numbers are shown to tenants, reducing spam and ensuring real communication.',
  },
  {
    icon: Building2,
    title: 'Business Accounts',
    description:
      'Manage multiple properties under a single business account. Ideal for agencies and portfolio landlords.',
  },
];

const steps = [
  {
    number: '1',
    title: 'Sign Up',
    description: 'Create your free landlord account in under a minute.',
  },
  {
    number: '2',
    title: 'Submit Your Property',
    description:
      'Fill in property details, upload photos, and add your contact numbers.',
  },
  {
    number: '3',
    title: 'We Verify & Publish',
    description:
      'Our ops team reviews your listing, optionally visits the property, and publishes it.',
  },
  {
    number: '4',
    title: 'Receive Qualified Leads',
    description:
      'Get viewing requests from verified tenants. We coordinate schedules for you.',
  },
];

export default function ListYourPropertyPage() {
  return (
    <main>
      {/* Hero */}
      <section className="bg-gradient-to-br from-green-50 via-green-100 to-green-50 py-16 lg:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            List Your Property on{' '}
            <span className="text-green-600">Stay Rental</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Reach thousands of verified tenants looking for mid-to-long-term
            rentals in Sri Lanka. Free to list, hassle-free management.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/sign-up">
              <Button
                size="lg"
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button variant="outline" size="lg" className="px-8 py-6 text-lg">
                Already have an account? Sign in
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Why List With Us?
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefits.map((benefit) => (
              <Card key={benefit.title} className="border-0 shadow-sm">
                <CardContent className="pt-6">
                  <benefit.icon className="h-10 w-10 text-green-600 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-gray-600 text-sm">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            How It Works for Landlords
          </h2>
          <div className="space-y-8">
            {steps.map((step) => (
              <div key={step.number} className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-12 h-12 bg-green-600 text-white rounded-full flex items-center justify-center text-xl font-bold">
                  {step.number}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {step.title}
                  </h3>
                  <p className="text-gray-600">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-green-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Find Your Next Tenant?
          </h2>
          <p className="text-green-100 mb-8 text-lg">
            Join hundreds of landlords who trust Stay Rental to manage their
            listings and find qualified tenants.
          </p>
          <Link href="/sign-up">
            <Button
              size="lg"
              className="bg-white text-green-600 hover:bg-green-50 px-8 py-6 text-lg"
            >
              <CheckCircle className="mr-2 h-5 w-5" />
              List Your Property Now
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}

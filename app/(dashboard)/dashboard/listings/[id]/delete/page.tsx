import Link from 'next/link';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { AlertTriangle, ArrowLeft, MapPin } from 'lucide-react';
import { getListingById, getUser } from '@/lib/db/queries';
import { canManageListing } from '@/lib/auth/listing-access';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getFirstListingPhoto } from '@/lib/seo';
import { archiveListingAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

/**
 * Confirmation page for the WhatsApp delete link.
 *
 * The link (/l/<token>/d/<id>) signs the landlord in and lands here. Nothing is
 * mutated by loading this page — a crawler, a link prefetch or an accidental
 * long-press cannot remove a listing. Removal happens on POST via the server
 * action.
 */
export default async function DeleteListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listingId = Number(id);
  if (!Number.isFinite(listingId) || listingId <= 0) notFound();

  const user = await getUser();
  if (!user) notFound();

  const listing = await getListingById(listingId);
  if (!listing) notFound();

  const allowed = await canManageListing(user, listing);
  if (!allowed) notFound();

  const photo = getFirstListingPhoto(listing.photos);
  const alreadyGone = listing.status === 'archived';

  return (
    <section className="mx-auto max-w-xl flex-1 p-4 lg:p-8">
      <Button asChild variant="outline" className="mb-6">
        <Link href="/dashboard/listings">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to my listings
        </Link>
      </Button>

      <h1 className="text-2xl font-bold text-slate-900">
        {alreadyGone ? 'This listing is already removed' : 'Remove this listing?'}
      </h1>
      <p className="mt-2 text-slate-600">
        {alreadyGone
          ? 'It is no longer visible to tenants. Contact us if you would like it back.'
          : 'It will stop appearing to tenants straight away. Tell us within 30 days if you change your mind and we can restore it.'}
      </p>

      <Card className="mt-6">
        <CardContent className="flex gap-4 pt-6">
          {photo ? (
            <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-slate-100">
              <Image src={photo} alt={listing.title} fill className="object-cover" sizes="128px" />
            </div>
          ) : null}
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{listing.title}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                {listing.address}, {listing.city}
              </span>
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              LKR {Number(listing.rentPerMonth).toLocaleString()}/month
            </p>
          </div>
        </CardContent>
      </Card>

      {!alreadyGone && (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {/* Mutation on POST only — never on page load. */}
          <form action={archiveListingAction} className="sm:flex-1">
            <input type="hidden" name="listingId" value={listing.id} />
            <Button type="submit" variant="outline" className="w-full border-red-300 text-red-700 hover:bg-red-50">
              <AlertTriangle className="mr-2 h-4 w-4" />
              Yes, remove it
            </Button>
          </form>
          <Button asChild className="sm:flex-1">
            <Link href={`/dashboard/listings/${listing.id}/edit`}>Keep it — edit instead</Link>
          </Button>
        </div>
      )}
    </section>
  );
}

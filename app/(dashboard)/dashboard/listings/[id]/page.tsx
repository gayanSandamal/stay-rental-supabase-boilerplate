import { notFound } from 'next/navigation';
import { getListingById, getUser, getUserWithLandlord } from '@/lib/db/queries';
import { ListingApprovalForm } from './listing-approval-form';
import { RequestReReviewButton } from './request-rereview-button';
import { ArchiveListingButton } from './archive-listing-button';
import { DeleteListingButton } from './delete-listing-button';
import { PropertyImagesGallery } from '@/components/property-images-gallery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Bed, Bath, Home, Building2, User, Calendar, Phone, MessageCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/db/drizzle';
import { businessAccountMembers, businessAccounts, users, landlords } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export default async function ListingEditPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const resolvedParams = params instanceof Promise ? await params : params;
  const listingId = Number(resolvedParams.id);

  if (isNaN(listingId) || listingId <= 0) {
    notFound();
  }

  const listing = await getListingById(listingId);

  if (!listing) {
    notFound();
  }

  // Check if user can edit this listing
  const isAdminOrOps = user.role === 'admin' || user.role === 'ops';
  let canEdit = isAdminOrOps;

  if (!canEdit) {
    // Check if user is the owner (landlord or business account member)
    const userWithLandlord = await getUserWithLandlord(user.id);
    
    if (userWithLandlord?.landlord && userWithLandlord.landlord.id === listing.landlordId) {
      canEdit = true;
    } else {
      // Check if user is a business account member who created this listing
      try {
        const member = await db.query.businessAccountMembers.findFirst({
          where: and(
            eq(businessAccountMembers.userId, user.id),
            eq(businessAccountMembers.isActive, true)
          ),
        });
        
        if (member && listing.businessAccountId === member.businessAccountId) {
          canEdit = true;
        } else if (listing.createdBy === user.id) {
          canEdit = true;
        }
      } catch (error: any) {
        // If columns don't exist, just check createdBy
        if (listing.createdBy === user.id) {
          canEdit = true;
        }
      }
    }
  }

  if (!canEdit) {
    notFound();
  }

  // Fetch publisher information
  let publisherName = 'Unknown';
  let publisherType: 'individual' | 'business' = 'individual';
  let teamMemberName: string | null = null;

  if (listing.businessAccountId) {
    try {
      const businessAccount = await db.query.businessAccounts.findFirst({
        where: eq(businessAccounts.id, listing.businessAccountId),
      });
      
      if (businessAccount) {
        publisherType = 'business';
        publisherName = businessAccount.name;

        // Get team member who created it
        if (listing.createdBy) {
          const creator = await db.query.users.findFirst({
            where: eq(users.id, listing.createdBy),
          });
          teamMemberName = creator?.name || creator?.email || null;
        }
      }
    } catch (error) {
      console.error('Error fetching business account:', error);
    }
  }

  // If not a business account, get landlord info
  if (publisherType === 'individual' && !listing.businessAccountId) {
    try {
      const landlordInfo = await db.query.landlords.findFirst({
        where: eq(landlords.id, listing.landlordId),
        with: {
          user: true,
        },
      });
      
      if (landlordInfo?.user) {
        publisherName = landlordInfo.user.name || landlordInfo.user.email;
      }
    } catch (error) {
      console.error('Error fetching landlord info:', error);
    }
  }

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6">
        <Button asChild variant="outline" className="mb-4">
          <Link href="/dashboard/listings">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Listings
          </Link>
        </Button>
        <div className="flex justify-between items-center">
          <h1 className="text-lg lg:text-2xl font-medium">
            {isAdminOrOps ? 'Review Listing' : 'Edit Listing'}
          </h1>
          {isAdminOrOps && (
            <Button asChild variant="outline">
              <Link href={`/dashboard/listings/${listing.id}/edit`}>
                Edit Details
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {/* Property Images */}
          {(() => {
            let photos: string[] = [];
            if (typeof listing.photos === 'string') {
              try {
                const parsed = JSON.parse(listing.photos);
                photos = Array.isArray(parsed) ? parsed : [];
              } catch (e) {
                photos = [];
              }
            } else if (Array.isArray(listing.photos)) {
              photos = listing.photos;
            }
            return photos.length > 0 ? (
              <div className="mb-6">
                <PropertyImagesGallery images={photos} title={listing.title} />
              </div>
            ) : null;
          })()}

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{listing.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center text-gray-600">
                  <MapPin className="h-5 w-5 mr-2" />
                  {listing.address}, {listing.city}
                  {listing.district && `, ${listing.district}`}
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs text-gray-500 mb-1">Publisher</p>
                  <div className="flex items-center gap-2">
                    {publisherType === 'business' ? (
                      <Building2 className="h-4 w-4 text-teal-800" />
                    ) : (
                      <User className="h-4 w-4 text-gray-600" />
                    )}
                    <span className="text-sm font-medium text-gray-900">{publisherName}</span>
                  </div>
                  {teamMemberName && (
                    <p className="text-xs text-gray-500 ml-6 mt-1">
                      by {teamMemberName}
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-2">
                    <Calendar className="h-3 w-3 text-gray-400" />
                    <span className="text-xs text-gray-500">
                      {new Date(listing.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-gray-600">
                  <div className="flex items-center">
                    <Home className="h-5 w-5 mr-2" />
                    {listing.propertyType || 'N/A'}
                  </div>
                  <div className="flex items-center">
                    <Bed className="h-5 w-5 mr-2" />
                    {listing.bedrooms} Bedroom{listing.bedrooms > 1 ? 's' : ''}
                  </div>
                  {listing.bathrooms && (
                    <div className="flex items-center">
                      <Bath className="h-5 w-5 mr-2" />
                      {listing.bathrooms} Bathroom{listing.bathrooms > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs text-gray-500 mb-2">Publisher</p>
                  <div className="flex items-center gap-2 mb-1">
                    {publisherType === 'business' ? (
                      <Building2 className="h-4 w-4 text-teal-800" />
                    ) : (
                      <User className="h-4 w-4 text-gray-600" />
                    )}
                    <span className="text-sm font-medium text-gray-900">{publisherName}</span>
                  </div>
                  {teamMemberName && (
                    <p className="text-xs text-gray-500 ml-6">
                      by {teamMemberName}
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-2">
                    <Calendar className="h-3 w-3 text-gray-400" />
                    <span className="text-xs text-gray-500">
                      {new Date(listing.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                </div>
                {listing.description && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Description</p>
                    <p className="text-gray-600 whitespace-pre-line">{listing.description}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Rent</p>
                  <p className="text-lg font-semibold text-gray-900">
                    LKR {Number(listing.rentPerMonth).toLocaleString()}/month
                  </p>
                </div>

                {/* Contact Numbers */}
                {listing.contactNumbers && listing.contactNumbers.length > 0 && (
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">Contact Numbers</p>
                    <div className="space-y-2">
                      {listing.contactNumbers.map((lc) => {
                        const contact = lc.contactNumber;
                        if (!contact || !contact.isActive) return null;
                        
                        const isNew = lc.isNew;
                        const wasChanged = lc.wasChanged;
                        const isVerified = contact.verified;
                        
                        return (
                          <div
                            key={contact.id}
                            className={`p-3 border rounded-lg ${
                              isNew || wasChanged
                                ? 'border-yellow-400 bg-yellow-50'
                                : isVerified
                                ? 'border-green-200 bg-green-50'
                                : 'border-gray-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <Phone className="h-5 w-5 text-gray-500" />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{contact.phoneNumber}</span>
                                    {isVerified && (
                                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">
                                        Verified
                                      </span>
                                    )}
                                    {isNew && (
                                      <span className="px-2 py-0.5 text-xs bg-yellow-200 text-yellow-800 rounded flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" />
                                        New
                                      </span>
                                    )}
                                    {wasChanged && !isNew && (
                                      <span className="px-2 py-0.5 text-xs bg-orange-200 text-orange-800 rounded flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" />
                                        Changed
                                      </span>
                                    )}
                                  </div>
                                  {contact.label && (
                                    <div className="text-sm text-gray-500">{contact.label}</div>
                                  )}
                                  {isNew && (
                                    <div className="text-xs text-yellow-700 mt-1">
                                      ⚠️ Owner must SMS/WhatsApp Platform Support to verify this number
                                    </div>
                                  )}
                                  {wasChanged && !isNew && (
                                    <div className="text-xs text-orange-700 mt-1">
                                      ⚠️ This contact number was modified and needs re-verification
                                    </div>
                                  )}
                                </div>
                              </div>
                              {contact.isWhatsApp && (
                                <div className="flex items-center gap-1 text-green-600">
                                  <MessageCircle className="h-4 w-4" />
                                  <span className="text-sm">WhatsApp</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-4">
          {isAdminOrOps && (
            <ListingApprovalForm listing={listing} />
          )}
          {!isAdminOrOps && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Listing Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-gray-600">Status</p>
                      <span className={`inline-block px-2 py-1 text-xs rounded font-medium mt-1 ${
                        listing.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : listing.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : listing.status === 'rented'
                          ? 'bg-teal-100 text-teal-900'
                          : listing.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {listing.status}
                      </span>
                    </div>
                    {listing.status === 'pending' && (
                      <p className="text-sm text-gray-600 mt-4">
                        Your listing is pending approval. The operations team will review and activate it soon.
                      </p>
                    )}
                    {listing.status === 'rejected' && listing.rejectionReason && (
                      <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-sm font-medium text-red-800 mb-2">Rejection Reason:</p>
                        <p className="text-sm text-red-700">{listing.rejectionReason}</p>
                        {listing.rejectedAt && (
                          <p className="text-xs text-red-600 mt-2">
                            Rejected on {new Date(listing.rejectedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              {listing.status === 'rejected' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Request Re-Review</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 mb-4">
                      Once you've updated your listing according to the feedback above, click the button below to request a re-review.
                    </p>
                    <RequestReReviewButton listingId={listing.id} />
                  </CardContent>
                </Card>
              )}
            </>
          )}
          
          {/* Archive and Delete Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <ArchiveListingButton listingId={listing.id} currentStatus={listing.status} />
              <DeleteListingButton listingId={listing.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}


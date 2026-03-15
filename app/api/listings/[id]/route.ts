import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { listings, listingContactNumbers, userContactNumbers, businessAccountMembers, users } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq, and, inArray, or } from 'drizzle-orm';
import { logListingAction } from '@/lib/db/audit-logger';
import { isUserPremium } from '@/lib/subscription';
import { sendListingApprovedToLandlord, sendListingRejectedToLandlord } from '@/lib/email';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = params instanceof Promise ? await params : params;
    const listingId = Number(resolvedParams.id);

    if (isNaN(listingId) || listingId <= 0) {
      return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
    }

    const body = await request.json();
    const {
      status,
      verified,
      visited,
      verifiedAt,
      visitedAt,
      rejectionReason,
      rejectedAt,
    } = body;

    // Verify listing exists
    const listing = await db.query.listings.findFirst({
      where: eq(listings.id, listingId),
      with: {
        landlord: true,
      },
    });

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    // Check permissions
    const isAdminOrOps = user.role === 'admin' || user.role === 'ops';
    const isOwner = listing.landlord?.userId === user.id || listing.createdBy === user.id;

    if (!isAdminOrOps && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Landlords can only:
    // 1. Change status from rejected to pending (re-request review)
    // 2. Archive their own listings
    if (!isAdminOrOps && status !== undefined) {
      if (listing.status === 'rejected' && status === 'pending') {
        // Allow re-request review
      } else if (status === 'archived') {
        // Allow owners to archive their listings
        if (!isOwner) {
          return NextResponse.json({
            error: 'You can only archive your own listings'
          }, { status: 403 });
        }
      } else {
        return NextResponse.json({
          error: 'You can only request re-review for rejected listings or archive your listings'
        }, { status: 403 });
      }
    }

    // Build update object
    const updates: any = {};

    if (status !== undefined) {
      updates.status = status;
      
      // When status changes to 'active', set publishedAt and expiresAt if not already set
      if (status === 'active' && listing.status !== 'active') {
        if (!listing.publishedAt) {
          updates.publishedAt = new Date();
          const expiresDate = new Date();
          expiresDate.setDate(expiresDate.getDate() + 30);
          updates.expiresAt = expiresDate;
        }
        else if (!listing.expiresAt && listing.publishedAt) {
          const publishedDate = new Date(listing.publishedAt);
          const expiresDate = new Date(publishedDate);
          expiresDate.setDate(expiresDate.getDate() + 30);
          updates.expiresAt = expiresDate;
        }
      }
    }

    if (verified !== undefined) {
      updates.verified = verified;
      if (verified && !verifiedAt) {
        updates.verifiedAt = new Date();
        updates.verifiedBy = user.id;
      } else if (!verified) {
        updates.verifiedAt = null;
        updates.verifiedBy = null;
      } else if (verifiedAt) {
        updates.verifiedAt = new Date(verifiedAt);
        updates.verifiedBy = user.id;
      }
    }

    if (visited !== undefined) {
      updates.visited = visited;
      if (visited && !visitedAt) {
        updates.visitedAt = new Date();
        updates.visitedBy = user.id;
      } else if (!visited) {
        updates.visitedAt = null;
        updates.visitedBy = null;
      } else if (visitedAt) {
        updates.visitedAt = new Date(visitedAt);
        updates.visitedBy = user.id;
      }
    }

    // Handle rejection
    if (status === 'rejected' && rejectionReason) {
      updates.rejectionReason = rejectionReason;
      updates.rejectedAt = rejectedAt ? new Date(rejectedAt) : new Date();
      updates.rejectedBy = user.id;
    }

    // Clear rejection fields if status changes from rejected to something else
    if (status !== undefined && status !== 'rejected' && listing.status === 'rejected') {
      updates.rejectionReason = null;
      updates.rejectedAt = null;
      updates.rejectedBy = null;
    }

    // Update listing
    const [updatedListing] = await db
      .update(listings)
      .set(updates)
      .where(eq(listings.id, listingId))
      .returning();

    // Audit log
    const auditAction = status === 'active' ? 'listing_approved' as const
      : status === 'rejected' ? 'listing_rejected' as const
      : status === 'archived' ? 'listing_archived' as const
      : 'listing_updated' as const;

    await logListingAction(auditAction, listingId, user.id, {
      previousStatus: listing.status,
      newStatus: status ?? listing.status,
      rejectionReason: updates.rejectionReason ?? null,
    });

    // Send email notifications for status changes (non-blocking)
    if (listing.landlord) {
      const landlordUser = await db.query.users.findFirst({
        where: eq(users.id, listing.landlord.userId),
      });

      if (landlordUser) {
        if (status === 'active' && listing.status !== 'active') {
          sendListingApprovedToLandlord(
            landlordUser.email,
            landlordUser.name || landlordUser.email,
            updatedListing.title,
            listingId
          ).catch(() => {});
        } else if (status === 'rejected' && rejectionReason) {
          sendListingRejectedToLandlord(
            landlordUser.email,
            landlordUser.name || landlordUser.email,
            updatedListing.title,
            listingId,
            rejectionReason
          ).catch(() => {});
        }
      }
    }

    return NextResponse.json(
      { success: true, listing: updatedListing },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error updating listing:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update listing' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = params instanceof Promise ? await params : params;
    const listingId = Number(resolvedParams.id);

    if (isNaN(listingId) || listingId <= 0) {
      return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
    }

    const body = await request.json();

    // Verify listing exists
    const listing = await db.query.listings.findFirst({
      where: eq(listings.id, listingId),
      with: {
        landlord: true,
      },
    });

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    // Check permissions
    const isAdminOrOps = user.role === 'admin' || user.role === 'ops';
    const isOwner = listing.landlord?.userId === user.id || listing.createdBy === user.id;

    if (!isAdminOrOps && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Validate contact numbers if provided
    if (body.contactNumbers !== undefined) {
      if (!Array.isArray(body.contactNumbers) || body.contactNumbers.length === 0) {
        return NextResponse.json(
          { error: 'At least one contact number is required' },
          { status: 400 }
        );
      }
    }

    // Helper function to convert empty strings to null for numeric fields
    const toNumberOrNull = (value: any): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const num = Number(value);
      return isNaN(num) ? null : num;
    };

    // Helper function to convert empty strings to null for string fields
    const toStringOrNull = (value: any): string | null => {
      if (value === null || value === undefined) return null;
      const str = String(value).trim();
      return str === '' ? null : str;
    };

    // Prepare update data (only allow editing of listing content, not status/approval fields)
    const updates: any = {
      title: body.title,
      description: toStringOrNull(body.description),
      address: body.address,
      city: body.city || 'Colombo',
      district: toStringOrNull(body.district),
      latitude: toNumberOrNull(body.latitude),
      longitude: toNumberOrNull(body.longitude),
      propertyType: toStringOrNull(body.propertyType),
      bedrooms: Number(body.bedrooms),
      bathrooms: toNumberOrNull(body.bathrooms),
      areaSqft: toNumberOrNull(body.areaSqft),
      rentPerMonth: Number(body.rentPerMonth),
      depositMonths: toNumberOrNull(body.depositMonths) ?? 3,
      utilitiesIncluded: Boolean(body.utilitiesIncluded),
      serviceCharge: toNumberOrNull(body.serviceCharge),
      powerBackup: toStringOrNull(body.powerBackup),
      waterSource: toStringOrNull(body.waterSource),
      waterTankSize: toNumberOrNull(body.waterTankSize),
      hasFiber: Boolean(body.hasFiber),
      fiberISPs: toStringOrNull(body.fiberISPs),
      acUnits: toNumberOrNull(body.acUnits),
      fans: toNumberOrNull(body.fans),
      ventilation: toStringOrNull(body.ventilation),
      isGated: Boolean(body.isGated),
      hasGuard: Boolean(body.hasGuard),
      hasCCTV: Boolean(body.hasCCTV),
      hasBurglarBars: Boolean(body.hasBurglarBars),
      parking: Boolean(body.parking),
      parkingSpaces: toNumberOrNull(body.parkingSpaces),
      petsAllowed: Boolean(body.petsAllowed),
      noticePeriodDays: toNumberOrNull(body.noticePeriodDays) ?? 30,
      photos: body.photos && Array.isArray(body.photos) && body.photos.length > 0 
        ? JSON.stringify(body.photos) 
        : null,
      updatedAt: new Date(),
    };

    if (body.exclusive !== undefined && (isAdminOrOps || isUserPremium(user))) {
      updates.exclusive = Boolean(body.exclusive);
    }

    // If editing an active listing, change status to pending for review
    // But preserve publishedAt and expiresAt (don't include them in updates)
    if (listing.status === 'active') {
      // Check if any content fields are being updated (not just contactNumbers)
      const contentFields = [
        'title', 'description', 'address', 'city', 'district', 'latitude', 'longitude',
        'propertyType', 'bedrooms', 'bathrooms', 'areaSqft', 'rentPerMonth', 'depositMonths',
        'utilitiesIncluded', 'serviceCharge', 'powerBackup', 'waterSource', 'waterTankSize',
        'hasFiber', 'fiberISPs', 'acUnits', 'fans', 'ventilation', 'isGated', 'hasGuard',
        'hasCCTV', 'hasBurglarBars', 'parking', 'parkingSpaces', 'petsAllowed',
        'noticePeriodDays', 'photos'
      ];
      
      const hasContentChanges = contentFields.some(field => body[field] !== undefined);
      
      if (hasContentChanges) {
        updates.status = 'pending';
        // Explicitly preserve publishedAt and expiresAt by not including them
        // They will remain unchanged in the database
      }
    }

    // Update listing
    const [updatedListing] = await db
      .update(listings)
      .set(updates)
      .where(eq(listings.id, listingId))
      .returning();

    // Update contact numbers if provided
    if (body.contactNumbers !== undefined) {
      try {
        // Get business account membership if applicable
        const businessMember = updatedListing.businessAccountId
          ? await db.query.businessAccountMembers.findFirst({
              where: and(
                eq(businessAccountMembers.userId, user.id),
                eq(businessAccountMembers.businessAccountId, updatedListing.businessAccountId),
                eq(businessAccountMembers.isActive, true)
              ),
            })
          : null;

        // Get existing contact number links to track changes
        const existingLinks = await db.query.listingContactNumbers.findMany({
          where: eq(listingContactNumbers.listingId, listingId),
        });
        const existingContactNumberIds = existingLinks.map(link => link.contactNumberId);

        // Delete existing contact number links
        await db
          .delete(listingContactNumbers)
          .where(eq(listingContactNumbers.listingId, listingId));

        // Add new contact number links if provided
        if (Array.isArray(body.contactNumbers) && body.contactNumbers.length > 0) {
          const contactConditions: any[] = [
            inArray(userContactNumbers.id, body.contactNumbers),
            eq(userContactNumbers.isActive, true),
          ];

          // Add ownership condition
          if (businessMember && updatedListing.businessAccountId) {
            contactConditions.push(
              or(
                eq(userContactNumbers.userId, user.id),
                eq(userContactNumbers.businessAccountId, updatedListing.businessAccountId)
              )
            );
          } else {
            contactConditions.push(eq(userContactNumbers.userId, user.id));
          }

          const validContactNumbers = await db.query.userContactNumbers.findMany({
            where: and(...contactConditions),
          });

          if (validContactNumbers.length > 0) {
            // Track which contact numbers are new vs existing, and which have been changed
            const contactNumbersToLink = validContactNumbers.map((cn) => {
              const isNew = !existingContactNumberIds.includes(cn.id);
              
              // Check if the contact number was modified after it was linked to this listing
              let wasChanged = false;
              if (!isNew) {
                const existingLink = existingLinks.find(l => l.contactNumberId === cn.id);
                if (existingLink && cn.updatedAt) {
                  const linkCreatedAt = new Date(existingLink.linkedAt || existingLink.createdAt).getTime();
                  const contactUpdatedAt = new Date(cn.updatedAt).getTime();
                  // If contact was updated after it was linked, mark as changed
                  wasChanged = contactUpdatedAt > linkCreatedAt;
                }
              }

              const existingLink = existingLinks.find(l => l.contactNumberId === cn.id);
              return {
                listingId: listingId,
                contactNumberId: cn.id,
                isNew,
                wasChanged,
                linkedAt: isNew ? new Date() : (existingLink?.linkedAt || existingLink?.createdAt || new Date()),
              };
            });

            await db.insert(listingContactNumbers).values(contactNumbersToLink);
          }
        }
      } catch (error: any) {
        // If table doesn't exist yet, skip contact numbers
        if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
          console.warn('Contact numbers tables not available yet. Skipping contact numbers.');
        } else {
          throw error;
        }
      }
    }

    return NextResponse.json(
      { success: true, listing: updatedListing },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error updating listing:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update listing' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const listingId = Number(resolvedParams.id);

    if (isNaN(listingId) || listingId <= 0) {
      return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
    }

    const listing = await db.query.listings.findFirst({
      where: eq(listings.id, listingId),
      with: {
        contactNumbers: {
          with: {
            contactNumber: true,
          },
        },
      },
    });

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, listing });
  } catch (error: any) {
    console.error('Error fetching listing:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch listing' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = params instanceof Promise ? await params : params;
    const listingId = Number(resolvedParams.id);

    if (isNaN(listingId) || listingId <= 0) {
      return NextResponse.json({ error: 'Invalid listing ID' }, { status: 400 });
    }

    // Verify listing exists
    const listing = await db.query.listings.findFirst({
      where: eq(listings.id, listingId),
      with: {
        landlord: true,
      },
    });

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    // Check permissions - only admin/ops or owner can delete
    const isAdminOrOps = user.role === 'admin' || user.role === 'ops';
    const isOwner = listing.landlord?.userId === user.id || listing.createdBy === user.id;

    if (!isAdminOrOps && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Delete related contact number links first
    await db
      .delete(listingContactNumbers)
      .where(eq(listingContactNumbers.listingId, listingId));

    // Delete the listing
    await db.delete(listings).where(eq(listings.id, listingId));

    return NextResponse.json({ success: true, message: 'Listing deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting listing:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete listing' },
      { status: 500 }
    );
  }
}


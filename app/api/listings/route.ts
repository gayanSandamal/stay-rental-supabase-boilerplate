import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { listings, listingContactNumbers, userContactNumbers, users } from '@/lib/db/schema';
import { getUser, getActiveListingCountForLandlord } from '@/lib/db/queries';
import { landlords } from '@/lib/db/schema';
import { getLandlordPlanTier, getListingLimit } from '@/lib/landlord-plans';
import { eq, and, inArray, or, sql } from 'drizzle-orm';
import { businessAccountMembers } from '@/lib/db/schema';
import { logListingAction } from '@/lib/db/audit-logger';
import { isFeatureEnabled } from '@/lib/feature-flags';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { isUserPremium } from '@/lib/subscription';

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip') || '127.0.0.1';
    const rl = checkRateLimit(ip, 'POST', '/api/listings');
    if (!rl.allowed) return rateLimitResponse(rl.resetAt);

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      landlordId,
      title,
      description,
      address,
      city,
      district,
      latitude,
      longitude,
      propertyType,
      bedrooms,
      bathrooms,
      areaSqft,
      rentPerMonth,
      depositMonths,
      utilitiesIncluded,
      serviceCharge,
      powerBackup,
      waterSource,
      waterTankSize,
      hasFiber,
      fiberISPs,
      acUnits,
      fans,
      ventilation,
      isGated,
      hasGuard,
      hasCCTV,
      hasBurglarBars,
      parking,
      parkingSpaces,
      petsAllowed,
      noticePeriodDays,
      status,
      photos,
      contactNumbers, // Array of contact number IDs
      businessAccountId, // New field
      createdBy,
      exclusive,
    } = body;

    // Validate required fields
    if (!title || !address || !city || !bedrooms || !rentPerMonth) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate contact numbers
    if (!contactNumbers || !Array.isArray(contactNumbers) || contactNumbers.length === 0) {
      return NextResponse.json(
        { error: 'At least one contact number is required' },
        { status: 400 }
      );
    }

    // Verify landlord belongs to user, or auto-create for self-service
    let landlord = await db.query.landlords.findFirst({
      where: eq(landlords.id, landlordId),
    });

    if (!landlord || landlord.userId !== user.id) {
      // Allow admin/ops to create on behalf of any landlord
      if (user.role === 'admin' || user.role === 'ops') {
        if (!landlord) {
          return NextResponse.json(
            { error: 'Landlord record not found' },
            { status: 404 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'Unauthorized: Landlord not found or does not belong to user' },
          { status: 403 }
        );
      }
    }

    // Auto-upgrade tenant role to landlord on first listing creation
    if (user.role === 'tenant') {
      await db
        .update(users)
        .set({ role: 'landlord', updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    // Listing limits: all plans allow unlimited (Reimagined model). Limit check kept for edge cases.
    if (user.role !== 'admin' && user.role !== 'ops') {
      const tier = getLandlordPlanTier(landlord);
      const limit = getListingLimit(tier);
      const currentCount = await getActiveListingCountForLandlord(landlord.id);
      if (currentCount >= limit) {
        return NextResponse.json(
          {
            error: `You've reached the maximum number of active listings. Contact support if you need assistance.`,
            code: 'LISTING_LIMIT_REACHED',
          },
          { status: 403 }
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

    // Build listing data - start with base fields
    const listingData: any = {
        landlordId,
        title,
        description: toStringOrNull(description),
        address,
        city: city || 'Colombo',
        district: toStringOrNull(district),
        latitude: toNumberOrNull(latitude),
        longitude: toNumberOrNull(longitude),
        propertyType: toStringOrNull(propertyType),
        bedrooms: Number(bedrooms),
        bathrooms: toNumberOrNull(bathrooms),
        areaSqft: toNumberOrNull(areaSqft),
        rentPerMonth: Number(rentPerMonth),
        depositMonths: toNumberOrNull(depositMonths) ?? 3,
        utilitiesIncluded: Boolean(utilitiesIncluded),
        serviceCharge: toNumberOrNull(serviceCharge),
        powerBackup: toStringOrNull(powerBackup),
        waterSource: toStringOrNull(waterSource),
        waterTankSize: toNumberOrNull(waterTankSize),
        hasFiber: Boolean(hasFiber),
        fiberISPs: toStringOrNull(fiberISPs),
        acUnits: toNumberOrNull(acUnits),
        fans: toNumberOrNull(fans),
        ventilation: toStringOrNull(ventilation),
        isGated: Boolean(isGated),
        hasGuard: Boolean(hasGuard),
        hasCCTV: Boolean(hasCCTV),
        hasBurglarBars: Boolean(hasBurglarBars),
        parking: Boolean(parking),
        parkingSpaces: toNumberOrNull(parkingSpaces),
        petsAllowed: Boolean(petsAllowed),
        noticePeriodDays: toNumberOrNull(noticePeriodDays) ?? 30,
        photos: photos && Array.isArray(photos) && photos.length > 0 
          ? JSON.stringify(photos) 
          : null,
        status: status || 'pending',
        exclusive: (user.role === 'admin' || user.role === 'ops' || isUserPremium(user)) && Boolean(exclusive),
    };

    // Only add new fields if columns exist (after migration)
    // Check if businessAccountId is provided and verify membership
    if (businessAccountId) {
      try {
        const member = await db.query.businessAccountMembers.findFirst({
          where: and(
            eq(businessAccountMembers.businessAccountId, businessAccountId),
            eq(businessAccountMembers.userId, user.id),
            eq(businessAccountMembers.isActive, true)
          ),
        });

        if (!member) {
          return NextResponse.json(
            { error: 'Unauthorized: Not a member of this business account' },
            { status: 403 }
          );
        }
        listingData.businessAccountId = businessAccountId;
      } catch (error: any) {
        // If table doesn't exist yet, skip business account features
        if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
          console.warn('Business account tables not available yet. Skipping business account features.');
        } else {
          throw error;
        }
      }
    }

    // Add createdBy if provided (only if column exists)
    if (createdBy) {
      listingData.createdBy = createdBy;
    }

    // Duplicate listing detection
    if (isFeatureEnabled('enableDuplicateDetection')) {
      const duplicateConditions = [
        eq(listings.address, listingData.address),
        eq(listings.city, listingData.city),
      ];
      if (listingData.bedrooms) {
        duplicateConditions.push(eq(listings.bedrooms, listingData.bedrooms));
      }
      const possibleDuplicates = await db
        .select({ id: listings.id, title: listings.title, status: listings.status })
        .from(listings)
        .where(and(...duplicateConditions))
        .limit(5);

      const activeDuplicates = possibleDuplicates.filter(
        (d) => d.status === 'active' || d.status === 'pending'
      );
      if (activeDuplicates.length > 0) {
        return NextResponse.json(
          {
            error: 'A similar listing already exists at this address',
            duplicates: activeDuplicates.map((d) => ({ id: d.id, title: d.title })),
          },
          { status: 409 }
        );
      }
    }

    const [newListing] = await db
      .insert(listings)
      .values(listingData)
      .returning();

    // Link contact numbers to listing if provided
    if (contactNumbers && Array.isArray(contactNumbers) && contactNumbers.length > 0) {
      try {
        // Verify all contact numbers belong to user or their business account
        const businessMember = businessAccountId
          ? await db.query.businessAccountMembers.findFirst({
              where: and(
                eq(businessAccountMembers.userId, user.id),
                eq(businessAccountMembers.businessAccountId, businessAccountId),
                eq(businessAccountMembers.isActive, true)
              ),
            })
          : null;

        const validContactNumbers = await db.query.userContactNumbers.findMany({
          where: and(
            inArray(userContactNumbers.id, contactNumbers),
            eq(userContactNumbers.isActive, true),
            or(
              eq(userContactNumbers.userId, user.id),
              businessMember
                ? eq(userContactNumbers.businessAccountId, businessAccountId)
                : undefined
            )
          ),
        });

        if (validContactNumbers.length > 0) {
          // All contact numbers are new for a new listing
          await db.insert(listingContactNumbers).values(
            validContactNumbers.map((cn) => ({
              listingId: newListing.id,
              contactNumberId: cn.id,
              isNew: true, // All are new for a new listing
              wasChanged: false,
              linkedAt: new Date(),
            }))
          );
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

    await logListingAction('listing_created', newListing.id, user.id, {
      title: newListing.title,
      city: newListing.city,
      businessAccountId: listingData.businessAccountId ?? null,
    });

    return NextResponse.json(
      { success: true, listing: newListing },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating listing:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create listing' },
      { status: 500 }
    );
  }
}


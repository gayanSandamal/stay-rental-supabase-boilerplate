'use client';

import { FormBuilder } from '@/components/form-builder';
import { formConfigs } from '@/lib/forms';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Listing } from '@/lib/db/schema';

interface EditListingFormProps {
  listing: Listing;
}

export function EditListingForm({ listing }: EditListingFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contactNumberIds, setContactNumberIds] = useState<number[]>([]);

  // Fetch contact numbers for this listing
  useEffect(() => {
    fetch(`/api/listings/${listing.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.listing?.contactNumbers) {
          setContactNumberIds(
            data.listing.contactNumbers.map((lc: any) => lc.contactNumber.id)
          );
        }
      })
      .catch(console.error);
  }, [listing.id]);

  // Parse photos if it's a JSON string
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

  // Prepare default values from existing listing
  const defaultValues = {
    title: listing.title,
    description: listing.description || '',
    address: listing.address,
    city: listing.city,
    district: listing.district || '',
    latitude: listing.latitude ? String(listing.latitude) : '',
    longitude: listing.longitude ? String(listing.longitude) : '',
    propertyType: listing.propertyType || '',
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms || undefined,
    areaSqft: listing.areaSqft || undefined,
    rentPerMonth: Number(listing.rentPerMonth),
    depositMonths: listing.depositMonths || 3,
    utilitiesIncluded: listing.utilitiesIncluded || false,
    serviceCharge: listing.serviceCharge ? Number(listing.serviceCharge) : undefined,
    powerBackup: listing.powerBackup || '',
    waterSource: listing.waterSource || '',
    waterTankSize: listing.waterTankSize || undefined,
    hasFiber: listing.hasFiber || false,
    fiberISPs: listing.fiberISPs || '',
    acUnits: listing.acUnits || undefined,
    fans: listing.fans || undefined,
    ventilation: listing.ventilation || '',
    isGated: listing.isGated || false,
    hasGuard: listing.hasGuard || false,
    hasCCTV: listing.hasCCTV || false,
    hasBurglarBars: listing.hasBurglarBars || false,
    parking: listing.parking || false,
    parkingSpaces: listing.parkingSpaces || undefined,
    petsAllowed: listing.petsAllowed || false,
    noticePeriodDays: listing.noticePeriodDays || 30,
    photos: photos || [],
    contactNumbers: contactNumberIds,
  };

  const handleSubmit = async (data: Record<string, any>) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/listings/${listing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update listing');
      }

      router.push(`/dashboard/listings`);
    } catch (error: any) {
      throw error; // Re-throw to let FormBuilder handle the error display
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  // Update contact numbers field with listingId and businessAccountId
  const configWithListing = {
    ...formConfigs.listing,
    title: 'Update Listing',
    description: 'Update the details about your property. Required fields are marked with *',
    fields: formConfigs.listing.fields.map((field) => {
      if (field.type === 'contact-numbers') {
        return {
          ...field,
          listingId: listing.id,
          businessAccountId: listing.businessAccountId || null,
        };
      }
      return field;
    }),
    defaultValues,
    onSubmit: handleSubmit,
    onCancel: handleCancel,
    submitButton: {
      label: 'Update Listing',
      loadingLabel: 'Updating...',
    },
  };

  return <FormBuilder config={configWithListing} />;
}


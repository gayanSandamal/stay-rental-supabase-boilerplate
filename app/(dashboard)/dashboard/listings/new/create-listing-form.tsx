'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export function CreateListingForm({ landlordId }: { landlordId: number }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      landlordId,
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      address: formData.get('address') as string,
      city: formData.get('city') as string,
      district: formData.get('district') as string,
      propertyType: formData.get('propertyType') as string,
      bedrooms: Number(formData.get('bedrooms')),
      bathrooms: formData.get('bathrooms') ? Number(formData.get('bathrooms')) : null,
      areaSqft: formData.get('areaSqft') ? Number(formData.get('areaSqft')) : null,
      rentPerMonth: formData.get('rentPerMonth') as string,
      depositMonths: formData.get('depositMonths') ? Number(formData.get('depositMonths')) : 3,
      utilitiesIncluded: formData.get('utilitiesIncluded') === 'on',
      serviceCharge: formData.get('serviceCharge') as string || null,
      powerBackup: formData.get('powerBackup') as string || null,
      waterSource: formData.get('waterSource') as string || null,
      waterTankSize: formData.get('waterTankSize') ? Number(formData.get('waterTankSize')) : null,
      hasFiber: formData.get('hasFiber') === 'on',
      fiberISPs: formData.get('fiberISPs') as string || null,
      acUnits: formData.get('acUnits') ? Number(formData.get('acUnits')) : null,
      fans: formData.get('fans') ? Number(formData.get('fans')) : null,
      ventilation: formData.get('ventilation') as string || null,
      isGated: formData.get('isGated') === 'on',
      hasGuard: formData.get('hasGuard') === 'on',
      hasCCTV: formData.get('hasCCTV') === 'on',
      hasBurglarBars: formData.get('hasBurglarBars') === 'on',
      parking: formData.get('parking') === 'on',
      parkingSpaces: formData.get('parkingSpaces') ? Number(formData.get('parkingSpaces')) : null,
      petsAllowed: formData.get('petsAllowed') === 'on',
      noticePeriodDays: formData.get('noticePeriodDays') ? Number(formData.get('noticePeriodDays')) : 30,
      status: 'pending',
    };

    try {
      const response = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create listing');
      }

      const result = await response.json();
      router.push(`/dashboard/listings/${result.listing.id}`);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title" className="mb-2 block">Title *</Label>
            <Input
              id="title"
              name="title"
              required
              placeholder="e.g., Modern 2BR Apartment in Colombo 7"
            />
          </div>

          <div>
            <Label htmlFor="description" className="mb-2 block">Description</Label>
            <textarea
              id="description"
              name="description"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Describe your property..."
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="propertyType" className="mb-2 block">Property Type</Label>
              <select
                id="propertyType"
                name="propertyType"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Select type</option>
                <option value="house">House</option>
                <option value="apartment">Apartment</option>
                <option value="room">Room</option>
              </select>
            </div>

            <div>
              <Label htmlFor="bedrooms" className="mb-2 block">Bedrooms *</Label>
              <Input
                id="bedrooms"
                name="bedrooms"
                type="number"
                min="1"
                required
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bathrooms" className="mb-2 block">Bathrooms</Label>
              <Input
                id="bathrooms"
                name="bathrooms"
                type="number"
                min="0"
              />
            </div>

            <div>
              <Label htmlFor="areaSqft" className="mb-2 block">Area (sq ft)</Label>
              <Input
                id="areaSqft"
                name="areaSqft"
                type="number"
                min="0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="address" className="mb-2 block">Address *</Label>
            <Input
              id="address"
              name="address"
              required
              placeholder="Street address"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="city" className="mb-2 block">City *</Label>
              <Input
                id="city"
                name="city"
                required
                defaultValue="Colombo"
              />
            </div>

            <div>
              <Label htmlFor="district" className="mb-2 block">District</Label>
              <Input
                id="district"
                name="district"
                placeholder="e.g., Colombo"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="rentPerMonth" className="mb-2 block">Monthly Rent (LKR) *</Label>
            <Input
              id="rentPerMonth"
              name="rentPerMonth"
              type="number"
              min="0"
              step="0.01"
              required
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="depositMonths" className="mb-2 block">Deposit (months)</Label>
              <Input
                id="depositMonths"
                name="depositMonths"
                type="number"
                min="0"
                defaultValue="3"
              />
            </div>

            <div>
              <Label htmlFor="serviceCharge" className="mb-2 block">Service Charge (LKR/month)</Label>
              <Input
                id="serviceCharge"
                name="serviceCharge"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="utilitiesIncluded"
              name="utilitiesIncluded"
              className="h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 rounded"
            />
            <Label htmlFor="utilitiesIncluded" className="cursor-pointer">
              Utilities included in rent
            </Label>
          </div>

          <div>
            <Label htmlFor="noticePeriodDays" className="mb-2 block">Notice Period (days)</Label>
            <Input
              id="noticePeriodDays"
              name="noticePeriodDays"
              type="number"
              min="0"
              defaultValue="30"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sri Lanka-Specific Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="powerBackup" className="mb-2 block">Power Backup</Label>
            <select
              id="powerBackup"
              name="powerBackup"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">None</option>
              <option value="generator">Generator</option>
              <option value="solar">Solar</option>
              <option value="ups">UPS</option>
            </select>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="waterSource" className="mb-2 block">Water Source</Label>
              <select
                id="waterSource"
                name="waterSource"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Select source</option>
                <option value="mains">Mains</option>
                <option value="tank">Tank</option>
                <option value="borehole">Borehole</option>
              </select>
            </div>

            <div>
              <Label htmlFor="waterTankSize" className="mb-2 block">Water Tank Size (liters)</Label>
              <Input
                id="waterTankSize"
                name="waterTankSize"
                type="number"
                min="0"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="hasFiber"
              name="hasFiber"
              className="h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 rounded"
            />
            <Label htmlFor="hasFiber" className="cursor-pointer">
              Fiber Internet Available
            </Label>
          </div>

          {true && (
            <div>
              <Label htmlFor="fiberISPs" className="mb-2 block">Fiber ISPs (comma-separated)</Label>
              <Input
                id="fiberISPs"
                name="fiberISPs"
                placeholder="e.g., SLT, Dialog"
              />
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="acUnits" className="mb-2 block">AC Units</Label>
              <Input
                id="acUnits"
                name="acUnits"
                type="number"
                min="0"
              />
            </div>

            <div>
              <Label htmlFor="fans" className="mb-2 block">Fans</Label>
              <Input
                id="fans"
                name="fans"
                type="number"
                min="0"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="ventilation" className="mb-2 block">Ventilation</Label>
            <select
              id="ventilation"
              name="ventilation"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Select quality</option>
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Safety & Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isGated"
                name="isGated"
                className="h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 rounded"
              />
              <Label htmlFor="isGated" className="cursor-pointer">
                Gated Community
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="hasGuard"
                name="hasGuard"
                className="h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 rounded"
              />
              <Label htmlFor="hasGuard" className="cursor-pointer">
                Security Guard
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="hasCCTV"
                name="hasCCTV"
                className="h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 rounded"
              />
              <Label htmlFor="hasCCTV" className="cursor-pointer">
                CCTV
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="hasBurglarBars"
                name="hasBurglarBars"
                className="h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 rounded"
              />
              <Label htmlFor="hasBurglarBars" className="cursor-pointer">
                Burglar Bars
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Other Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="parking"
                name="parking"
                className="h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 rounded"
              />
              <Label htmlFor="parking" className="cursor-pointer">
                Parking Available
              </Label>
            </div>

            <div>
              <Label htmlFor="parkingSpaces" className="mb-2 block">Parking Spaces</Label>
              <Input
                id="parkingSpaces"
                name="parkingSpaces"
                type="number"
                min="0"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="petsAllowed"
              name="petsAllowed"
              className="h-4 w-4 text-orange-500 focus:ring-orange-500 border-gray-300 rounded"
            />
            <Label htmlFor="petsAllowed" className="cursor-pointer">
              Pets Allowed
            </Label>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="flex gap-4">
        <Button
          type="submit"
          className="bg-orange-500 hover:bg-orange-600"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            'Create Listing'
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}


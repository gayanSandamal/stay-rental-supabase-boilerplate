import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Bed, Bath, Zap, Droplet, Wifi, ShieldCheck, Eye, Home, ArrowRight } from 'lucide-react';
import { PublisherInfo } from './publisher-info';

interface ListingCardProps {
  listing: any;
  viewMode?: 'grid' | 'list';
  showPublisher?: boolean;
}

function getListingImage(listing: any): string | null {
  if (!listing.photos) return null;
  try {
    const photos = typeof listing.photos === 'string' ? JSON.parse(listing.photos) : listing.photos;
    if (Array.isArray(photos) && photos.length > 0 && photos[0]) return photos[0];
  } catch {
    // invalid json
  }
  return null;
}

export function ListingCard({ listing, viewMode = 'grid', showPublisher = false }: ListingCardProps) {
  const imageUrl = getListingImage(listing);

  if (viewMode === 'list') {
    return (
      <Link href={`/listings/${listing.id}`} className="group block">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-250 overflow-hidden">
          <div className="flex flex-col md:flex-row gap-0">
            {/* Image */}
            <div className="md:w-64 h-52 md:h-auto relative flex-shrink-0 bg-slate-100">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={listing.title || 'Property image'}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 256px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 to-violet-100">
                  <Home className="h-12 w-12 text-indigo-300" />
                </div>
              )}
              {(listing.verified || listing.visited) && (
                <div className="absolute top-3 left-3 flex flex-col gap-1">
                  {listing.verified && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold shadow">
                      <ShieldCheck className="h-2.5 w-2.5" /> KYC Verified
                    </span>
                  )}
                  {listing.visited && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500 text-white text-[10px] font-bold shadow">
                      <Eye className="h-2.5 w-2.5" /> Visited
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 p-6 flex flex-col">
              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 leading-snug group-hover:text-indigo-600 transition-colors">
                    {listing.title}
                  </h3>
                  <div className="flex items-center text-slate-500 text-sm mt-1 gap-1">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{listing.address}, {listing.city}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xl font-extrabold text-slate-900">
                    LKR {Number(listing.rentPerMonth).toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500">/month</div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm text-slate-700 mb-4">
                {listing.bedrooms && (
                  <span className="flex items-center gap-1"><Bed className="h-4 w-4 text-slate-400" /> {listing.bedrooms} bed</span>
                )}
                {listing.bathrooms && (
                  <span className="flex items-center gap-1"><Bath className="h-4 w-4 text-slate-400" /> {listing.bathrooms} bath</span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {listing.powerBackup && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200">
                    <Zap className="h-3 w-3" /> {listing.powerBackup}
                  </span>
                )}
                {listing.hasFiber && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-200">
                    <Wifi className="h-3 w-3" /> Fiber
                  </span>
                )}
                {listing.waterSource && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 text-xs font-medium border border-sky-200">
                    <Droplet className="h-3 w-3" /> {listing.waterSource}
                  </span>
                )}
              </div>

              {showPublisher && listing.publisherName && (
                <div className="border-t pt-3 mt-auto">
                  <PublisherInfo
                    publisherName={listing.publisherName}
                    publisherType={listing.publisherType || 'individual'}
                    teamMemberName={listing.teamMemberName}
                    createdAt={listing.createdAt}
                    size="sm"
                    showDate
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Grid view
  return (
    <Link href={`/listings/${listing.id}`} className="group block h-full">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-250 overflow-hidden h-full flex flex-col">
        {/* Image */}
        <div className="relative h-52 bg-slate-100 flex-shrink-0">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={listing.title || 'Property image'}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-50 to-violet-100">
              <Home className="h-16 w-16 text-indigo-300" />
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />

          {/* Trust badges */}
          {(listing.verified || listing.visited) && (
            <div className="absolute top-3 left-3 flex flex-col gap-1">
              {listing.verified && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/90 backdrop-blur-sm text-white text-[10px] font-bold shadow-lg">
                  <ShieldCheck className="h-2.5 w-2.5" /> KYC Verified
                </span>
              )}
              {listing.visited && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/90 backdrop-blur-sm text-white text-[10px] font-bold shadow-lg">
                  <Eye className="h-2.5 w-2.5" /> Visited
                </span>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col flex-1">
          <h3 className="font-bold text-slate-900 leading-snug mb-1.5 line-clamp-2 group-hover:text-indigo-600 transition-colors">
            {listing.title}
          </h3>
          <div className="flex items-center text-slate-500 text-xs mb-3 gap-1">
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{listing.address}, {listing.city}</span>
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-700 mb-4">
            {listing.bedrooms && (
              <span className="flex items-center gap-1 text-xs"><Bed className="h-3.5 w-3.5 text-slate-400" /> {listing.bedrooms} bed</span>
            )}
            {listing.bathrooms && (
              <span className="flex items-center gap-1 text-xs"><Bath className="h-3.5 w-3.5 text-slate-400" /> {listing.bathrooms} bath</span>
            )}
          </div>

          {/* Feature tags */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {listing.powerBackup && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-semibold border border-amber-200">
                <Zap className="h-2.5 w-2.5" /> {listing.powerBackup}
              </span>
            )}
            {listing.hasFiber && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-semibold border border-indigo-200">
                <Wifi className="h-2.5 w-2.5" /> Fiber
              </span>
            )}
            {listing.waterSource && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-50 text-sky-700 text-[10px] font-semibold border border-sky-200">
                <Droplet className="h-2.5 w-2.5" /> {listing.waterSource}
              </span>
            )}
          </div>

          {/* Publisher */}
          {showPublisher && listing.publisherName && (
            <div className="border-t pt-3 mb-3">
              <PublisherInfo
                publisherName={listing.publisherName}
                publisherType={listing.publisherType || 'individual'}
                teamMemberName={listing.teamMemberName}
                createdAt={listing.createdAt}
                size="sm"
                showDate
              />
            </div>
          )}

          {/* Price */}
          <div className="mt-auto pt-4 border-t border-slate-100 flex items-end justify-between">
            <div>
              <div className="text-xl font-extrabold text-slate-900">
                LKR {Number(listing.rentPerMonth).toLocaleString()}
                <span className="text-xs font-normal text-slate-500 ml-1">/mo</span>
              </div>
              {listing.depositMonths && (
                <div className="text-xs text-slate-500">Deposit: {listing.depositMonths} mo</div>
              )}
            </div>
            <span className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-600 transition-colors duration-200">
              <ArrowRight className="h-4 w-4 text-indigo-400 group-hover:text-white transition-colors duration-200" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

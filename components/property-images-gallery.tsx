'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface PropertyImagesGalleryProps {
  images: string[];
  title?: string;
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface ImageTrackProps {
  images: string[];
  title: string;
  index: number;
  onIndexChange: (index: number) => void;
  variant: 'inline' | 'lightbox';
  onImageClick?: () => void;
}

/**
 * A horizontally swipable track. Uses native scroll-snap so touch devices get
 * momentum + rubber-banding for free; the arrows and thumbnails drive it by
 * scrolling the same container.
 */
function ImageTrack({
  images,
  title,
  index,
  onIndexChange,
  variant,
  onImageClick,
}: ImageTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const firstRun = useRef(true);
  // The last index this track reported from its own scrolling. Lets us tell an
  // index change we caused (a swipe — leave the scroll alone, snapping handles
  // it) from one imposed on us (arrow, thumbnail, keyboard — scroll to it).
  const reportedIndex = useRef(index);
  // Slide we are animating towards, while a programmatic scroll is in flight.
  // The frames in between sit over earlier slides, so reporting them would drag
  // the index back to where the animation started.
  const pendingTarget = useRef<number | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const isFirstRun = firstRun.current;
    // Never interrupt an in-progress swipe.
    if (!isFirstRun && reportedIndex.current === index) return;
    firstRun.current = false;

    const left = index * track.clientWidth;
    if (Math.abs(track.scrollLeft - left) < 1) {
      reportedIndex.current = index;
      return;
    }

    pendingTarget.current = index;
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    // Fallback in case the animation is cut short (e.g. the user grabs the
    // track mid-flight) and we never see the target frame.
    pendingTimer.current = setTimeout(() => {
      pendingTarget.current = null;
    }, 1000);

    track.scrollTo({
      left,
      behavior: isFirstRun || prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [index]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, []);

  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const track = trackRef.current;
      if (!track || track.clientWidth === 0) return;
      const next = Math.round(track.scrollLeft / track.clientWidth);
      const clamped = Math.min(Math.max(next, 0), images.length - 1);

      if (pendingTarget.current !== null) {
        if (clamped !== pendingTarget.current) return;
        pendingTarget.current = null;
        if (pendingTimer.current) clearTimeout(pendingTimer.current);
      }

      reportedIndex.current = clamped;
      if (clamped !== index) onIndexChange(clamped);
    });
  }, [images.length, index, onIndexChange]);

  return (
    <div
      ref={trackRef}
      onScroll={handleScroll}
      className="no-scrollbar flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      role="group"
      aria-roledescription="carousel"
      aria-label={`${title} photos`}
    >
      {images.map((image, i) => {
        const isPriority = variant === 'inline' && i === 0;
        return (
          <div
            key={`${i}-${image}`}
            className="relative h-full w-full shrink-0 snap-start"
            role="group"
            aria-roledescription="slide"
            aria-label={`Image ${i + 1} of ${images.length}`}
          >
            <Image
              src={image}
              alt={`${title} - Image ${i + 1}`}
              fill
              className={
                variant === 'lightbox'
                  ? 'object-contain'
                  : 'cursor-pointer object-cover'
              }
              sizes={
                variant === 'lightbox'
                  ? '(max-width: 1536px) 100vw, 1536px'
                  : '(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px'
              }
              priority={isPriority}
              // Keep the slides either side ready so a swipe doesn't land on a
              // blank panel while the next photo downloads.
              loading={
                isPriority ? undefined : Math.abs(i - index) <= 1 ? 'eager' : 'lazy'
              }
              draggable={false}
              onClick={onImageClick}
            />
          </div>
        );
      })}
    </div>
  );
}

export function PropertyImagesGallery({ images, title = 'Property' }: PropertyImagesGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showLightbox, setShowLightbox] = useState(false);
  const [mounted, setMounted] = useState(false);
  const thumbStripRef = useRef<HTMLDivElement>(null);

  // Ensure component only renders after mount to avoid hydration issues
  useEffect(() => {
    setMounted(true);
  }, []);

  const count = images?.length ?? 0;

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? count - 1 : prev - 1));
  }, [count]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === count - 1 ? 0 : prev + 1));
  }, [count]);

  // Keep the active thumbnail visible in the scrollable strip on small screens.
  useEffect(() => {
    const active = thumbStripRef.current?.children[currentIndex] as
      | HTMLElement
      | undefined;
    active?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [currentIndex]);

  // Keyboard navigation + scroll lock while the lightbox is open.
  useEffect(() => {
    if (!showLightbox) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowLightbox(false);
      if (event.key === 'ArrowLeft') goToPrevious();
      if (event.key === 'ArrowRight') goToNext();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showLightbox, goToPrevious, goToNext]);

  if (!images || images.length === 0) {
    return (
      <div className="w-full h-96 bg-gray-200 rounded-lg flex items-center justify-center">
        <p className="text-gray-500">No images available</p>
      </div>
    );
  }

  // Return a placeholder during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="w-full h-96 bg-gray-200 rounded-lg flex items-center justify-center">
        <p className="text-gray-500">Loading images...</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Main Image */}
        <div className="relative w-full h-96 bg-gray-200 rounded-lg overflow-hidden group">
          <ImageTrack
            images={images}
            title={title}
            index={currentIndex}
            onIndexChange={setCurrentIndex}
            variant="inline"
            onImageClick={() => setShowLightbox(true)}
          />

          {/* Navigation Arrows — always visible on touch, hover-revealed on desktop */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous image"
                onClick={goToPrevious}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white p-2 rounded-full transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Next image"
                onClick={goToNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white p-2 rounded-full transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* Image Counter */}
          <div className="absolute bottom-4 right-4 bg-black bg-opacity-60 text-white px-3 py-1 rounded-full text-sm">
            {currentIndex + 1} / {images.length}
          </div>
        </div>

        {/* Thumbnail Strip */}
        {images.length > 1 && (
          <div
            ref={thumbStripRef}
            className="no-scrollbar flex gap-2 overflow-x-auto sm:grid sm:grid-cols-6 sm:overflow-visible"
          >
            {images.map((image, index) => (
              <button
                type="button"
                key={index}
                aria-label={`Show image ${index + 1}`}
                aria-current={index === currentIndex}
                onClick={() => setCurrentIndex(index)}
                className={`relative aspect-square w-20 shrink-0 rounded-md overflow-hidden sm:w-auto ${
                  index === currentIndex
                    ? 'ring-2 ring-teal-600 ring-offset-2'
                    : 'opacity-60 hover:opacity-100'
                } transition-all`}
              >
                <Image
                  src={image}
                  alt={`Thumbnail ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="150px"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {showLightbox && (
        <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShowLightbox(false)}
            className="absolute top-4 right-4 z-10 text-white hover:text-gray-300"
          >
            <X className="h-8 w-8" />
          </button>

          {images.length > 1 && (
            <button
              type="button"
              aria-label="Previous image"
              onClick={goToPrevious}
              className="absolute left-4 z-10 text-white hover:text-gray-300"
            >
              <ChevronLeft className="h-12 w-12" />
            </button>
          )}

          <div className="relative w-full h-full max-w-6xl max-h-[90vh]">
            <ImageTrack
              images={images}
              title={title}
              index={currentIndex}
              onIndexChange={setCurrentIndex}
              variant="lightbox"
            />
          </div>

          {images.length > 1 && (
            <button
              type="button"
              aria-label="Next image"
              onClick={goToNext}
              className="absolute right-4 z-10 text-white hover:text-gray-300"
            >
              <ChevronRight className="h-12 w-12" />
            </button>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-lg">
            {currentIndex + 1} / {images.length}
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X, Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';

interface ImageUploaderProps {
  value?: string[];
  onChange?: (urls: string[]) => void;
  maxImages?: number;
  maxSizeInMB?: number;
  disabled?: boolean;
}

// Configurable constants
const DEFAULT_MAX_IMAGES = 6;
const DEFAULT_MAX_SIZE_MB = 5;
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1920;
const COMPRESSION_QUALITY = 0.8;

export function ImageUploader({
  value = [],
  onChange,
  maxImages = DEFAULT_MAX_IMAGES,
  maxSizeInMB = DEFAULT_MAX_SIZE_MB,
  disabled = false,
}: ImageUploaderProps) {
  const [images, setImages] = useState<string[]>(value);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = document.createElement('img');
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions while maintaining aspect ratio
          if (width > height) {
            if (width > MAX_WIDTH) {
              height = (height * MAX_WIDTH) / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = (width * MAX_HEIGHT) / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Convert to compressed base64
          const compressedDataUrl = canvas.toDataURL('image/jpeg', COMPRESSION_QUALITY);
          resolve(compressedDataUrl);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
    });
  };

  const uploadToServer = async (files: File[]): Promise<string[]> => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Upload failed');
    }
    const data = await res.json();
    return data.files.map((f: { url: string }) => f.url);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length === 0) return;

    if (images.length + files.length > maxImages) {
      setError(`You can only upload a maximum of ${maxImages} images`);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          throw new Error(`${file.name} is not an image file`);
        }
        if (file.size > maxSizeInMB * 1024 * 1024) {
          throw new Error(`${file.name} is larger than ${maxSizeInMB}MB`);
        }
      }

      let uploadedUrls: string[];

      try {
        uploadedUrls = await uploadToServer(files);
      } catch {
        // Fallback to client-side base64 if server upload fails
        uploadedUrls = [];
        for (const file of files) {
          const url = await compressImage(file);
          uploadedUrls.push(url);
        }
      }

      const newImages = [...images, ...uploadedUrls];
      setImages(newImages);
      onChange?.(newImages);
    } catch (err: any) {
      setError(err.message || 'Failed to upload images');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
    onChange?.(newImages);
  };

  const canAddMore = images.length < maxImages;

  return (
    <div className="space-y-4">
      {/* Upload Button */}
      {canAddMore && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            disabled={disabled || uploading}
            className="hidden"
          />
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            variant="outline"
            className="w-full"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Compressing and uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload Images ({images.length}/{maxImages})
              </>
            )}
          </Button>
          <p className="text-xs text-gray-500 mt-1">
            Max {maxImages} images, up to {maxSizeInMB}MB each. Images will be automatically optimized.
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Image Preview Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((imageUrl, index) => (
            <div
              key={index}
              className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200"
            >
              <Image
                src={imageUrl}
                alt={`Property image ${index + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 50vw, 33vw"
              />
              <button
                type="button"
                onClick={() => handleRemove(index)}
                disabled={disabled}
                className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
                {index + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {images.length === 0 && !uploading && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <ImageIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600 mb-1">No images uploaded yet</p>
          <p className="text-xs text-gray-500">
            Click the button above to upload property photos
          </p>
        </div>
      )}
    </div>
  );
}


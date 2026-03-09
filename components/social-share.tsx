'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, Copy, Check, MessageCircle } from 'lucide-react';

interface SocialShareProps {
  url: string;
  title: string;
}

export function SocialShare({ url, title }: SocialShareProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareWhatsApp = () => {
    const text = `Check out this rental: ${title}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const shareFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User cancelled
      }
    }
  };

  return (
    <div className="flex items-center gap-3 py-4">
      <span className="text-sm font-medium text-gray-600">Share:</span>
      <Button
        variant="outline"
        size="sm"
        onClick={shareWhatsApp}
        className="text-green-600 border-green-200 hover:bg-green-50"
      >
        <MessageCircle className="h-4 w-4 mr-1" />
        WhatsApp
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={shareFacebook}
        className="text-blue-600 border-blue-200 hover:bg-blue-50"
      >
        <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
        Facebook
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-4 w-4 mr-1 text-green-600" /> : <Copy className="h-4 w-4 mr-1" />}
        {copied ? 'Copied!' : 'Copy Link'}
      </Button>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <Button
          variant="outline"
          size="sm"
          onClick={shareNative}
        >
          <Share2 className="h-4 w-4 mr-1" />
          More
        </Button>
      )}
    </div>
  );
}

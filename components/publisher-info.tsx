import { Building2, User, Calendar } from 'lucide-react';

interface PublisherInfoProps {
  publisherName: string;
  publisherType: 'individual' | 'business';
  teamMemberName?: string | null;
  createdAt: Date | string;
  size?: 'sm' | 'md' | 'lg';
  showDate?: boolean;
}

export function PublisherInfo({
  publisherName,
  publisherType,
  teamMemberName,
  createdAt,
  size = 'sm',
  showDate = true,
}: PublisherInfoProps) {
  const iconSize = size === 'lg' ? 'h-5 w-5' : size === 'md' ? 'h-4 w-4' : 'h-3 w-3';
  const textSize = size === 'lg' ? 'text-base' : size === 'md' ? 'text-sm' : 'text-xs';
  const dateSize = size === 'lg' ? 'text-sm' : size === 'md' ? 'text-xs' : 'text-xs';

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {publisherType === 'business' ? (
          <Building2 className={`${iconSize} text-blue-600`} />
        ) : (
          <User className={`${iconSize} text-gray-600`} />
        )}
        <span className={`${textSize} font-medium text-gray-700`}>
          {publisherName}
        </span>
      </div>
      {teamMemberName && (
        <p className={`${dateSize} text-gray-500 ml-5`}>
          by {teamMemberName}
        </p>
      )}
      {showDate && (
        <div className={`flex items-center gap-1 ml-5`}>
          <Calendar className={`${iconSize} text-gray-400`} />
          <span className={`${dateSize} text-gray-500`}>
            {new Date(createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            })}
          </span>
        </div>
      )}
    </div>
  );
}


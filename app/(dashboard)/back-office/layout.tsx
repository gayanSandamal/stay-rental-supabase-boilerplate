'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { 
  Home, 
  Building2, 
  Users, 
  List, 
  Settings,
  Menu
} from 'lucide-react';

export default function BackOfficeLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const navItems = [
    { href: '/back-office', icon: Home, label: 'Overview' },
    { href: '/back-office/business-accounts', icon: Building2, label: 'Business Accounts' },
    { href: '/back-office/team-members', icon: Users, label: 'Team Members' },
    { href: '/back-office/listings', icon: List, label: 'Listings' },
    { href: '/back-office/settings', icon: Settings, label: 'Settings' },
  ];

  if (!mounted) {
    return <div className="flex-1 bg-gray-50">{children}</div>;
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`w-64 bg-white border-r border-gray-200 lg:block ${
          isSidebarOpen ? 'block' : 'hidden'
        } lg:relative fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="h-full overflow-y-auto p-4">
          <div className="lg:hidden mb-4">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setIsSidebarOpen(false)}
            >
              <Menu className="h-5 w-5 mr-2" />
              Close Menu
            </Button>
          </div>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant={pathname === item.href ? 'secondary' : 'ghost'}
                className={`shadow-none my-1 w-full justify-start ${
                  pathname === item.href ? 'bg-teal-50 text-teal-900' : ''
                }`}
                onClick={() => setIsSidebarOpen(false)}
              >
                <item.icon className="h-4 w-4 mr-2" />
                {item.label}
              </Button>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-4 lg:p-4">
        {children}
      </main>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}

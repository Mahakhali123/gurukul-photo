import type { Metadata } from 'next';
import { AdminDrivePanel } from './AdminDrivePanel';

// Unlisted: nothing in the gallery links here, and crawlers are told to skip it.
// Deliberately not added to robots.txt — a Disallow rule would publish the path.
export const metadata: Metadata = {
  title: 'Manage Drive folders',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

export default function AdminDrivePage() {
  return <AdminDrivePanel />;
}

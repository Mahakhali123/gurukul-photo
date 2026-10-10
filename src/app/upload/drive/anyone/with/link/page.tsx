import type { Metadata } from 'next';
import { UploadDriveForm } from './UploadDriveForm';

// Unlisted: nothing in the gallery links here, and crawlers are told to skip it.
// Deliberately not added to robots.txt — a Disallow rule would publish the path.
export const metadata: Metadata = {
  title: 'Add a Drive folder',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

export default function UploadDrivePage() {
  return <UploadDriveForm />;
}

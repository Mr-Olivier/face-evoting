import type { Metadata } from "next";

// Keep every admin page out of search engines.
export const metadata: Metadata = {
  title: { default: "Admin console", template: "%s · FaceVote Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

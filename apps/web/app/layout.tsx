import "./globals.css";
import "./task-filters.css";
export const metadata = {
  title: "Taskdesk",
  description: "Firm task management",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

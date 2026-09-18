import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800 p-6 text-center">
      <h1 className="text-6xl font-black text-blue-600 mb-2">404</h1>
      <h2 className="text-xl font-bold mb-4">Page Not Found</h2>
      <p className="text-sm text-slate-500 mb-6 max-w-md">
        The link you followed may be broken or the page has been moved.
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}

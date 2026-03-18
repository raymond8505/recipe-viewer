import Link from "next/link";

export default function NotFound() {
  return (
    <div className="text-center py-20">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Recipe Not Found</h2>
      <p className="text-gray-500 mb-6">
        This recipe doesn&apos;t exist or may have been removed.
      </p>
      <Link
        href="/"
        className="inline-block px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
      >
        Back to recipes
      </Link>
    </div>
  );
}

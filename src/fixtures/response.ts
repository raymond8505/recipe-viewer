// Factory for fetch Response objects with image-flavoured defaults.
// Kept out of the @/fixtures barrel alongside the test-only supabase mock —
// import directly from "@/fixtures/response" in test files.
export function makeResponse(
  // Narrowed to ArrayBuffer-backed views: BodyInit excludes SharedArrayBuffer
  body: Uint8Array<ArrayBuffer>,
  contentType = "image/png",
  init: { contentLength?: string; status?: number } = {},
): Response {
  const headers = new Headers({ "content-type": contentType });
  if (init.contentLength) headers.set("content-length", init.contentLength);
  return new Response(body, { status: init.status ?? 200, headers });
}

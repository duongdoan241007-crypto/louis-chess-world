import type { MetadataRoute } from "next";

// This is a private learning portal for a child; keep it out of search indexes.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}

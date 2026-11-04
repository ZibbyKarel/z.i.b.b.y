import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZIBBY",
    short_name: "ZIBBY",
    start_url: "/",
    display: "standalone",
    icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png" }],
  };
}

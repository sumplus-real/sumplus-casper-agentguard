import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * GET /manifest
 *
 * Returns the complete Arsenal project manifest for developer integration.
 * This is a human-friendly version of the project metadata, while
 * /api/manifest provides the machine-optimized API discovery format.
 */
export async function GET() {
  try {
    // Read the manifest file from project root
    const manifestPath = path.join(process.cwd(), "arsenal-manifest.json");
    const manifestContent = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestContent);

    return NextResponse.json(manifest, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load manifest",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { canPickNativeFolder, pickNativeFolder } from "@/lib/native-folder-picker";
import { hasJsonContentType } from "@/lib/request-security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!canPickNativeFolder(request)) {
    return NextResponse.json({ error: "unavailable" }, { status: 403 });
  }
  if (!hasJsonContentType(request)) {
    return NextResponse.json({ error: "json-required" }, { status: 415 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid-request" }, { status: 400 });
  }

  const { initialPath, prompt } = body as { initialPath?: unknown; prompt?: unknown };
  const result = await pickNativeFolder({ initialPath, prompt, signal: request.signal });
  if (result.kind === "selected") return NextResponse.json({ cwd: result.cwd });
  if (result.kind === "cancelled") return NextResponse.json({ cancelled: true });
  return NextResponse.json({ error: result.kind }, { status: result.kind === "busy" ? 409 : 503 });
}

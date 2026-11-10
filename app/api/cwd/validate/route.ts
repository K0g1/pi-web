import { NextResponse } from "next/server";
import { statSync, type Stats } from "fs";
import { opendir } from "fs/promises";
import { homedir } from "os";
import { isAbsolute, resolve } from "path";
import { allowFileRoot } from "@/lib/file-access";
import { projectIdentityKey } from "@/lib/project-identity";
import { resolveProject } from "@/lib/worktree";

function normalizeCwd(cwd: string): string {
  if (cwd === "~") return homedir();
  if (cwd.startsWith("~/")) return resolve(homedir(), cwd.slice(2));
  return isAbsolute(cwd) ? cwd : resolve(cwd);
}

// POST /api/cwd/validate  body: { cwd: string, literal?: boolean }
// Validates a candidate workspace before the UI selects it.
export async function POST(req: Request) {
  try {
    const body = await req.json() as { cwd?: unknown; literal?: unknown };
    const candidate = typeof body.cwd === "string" ? body.cwd : "";
    // The native chooser gives an exact absolute path, unlike a typed field.
    const cwd = body.literal === true ? candidate : candidate.trim();

    if (!cwd) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }
    if (body.literal === true && !isAbsolute(cwd)) {
      return NextResponse.json({ error: "An absolute path is required" }, { status: 400 });
    }

    const normalizedCwd = normalizeCwd(cwd);
    let stat: Stats;
    try {
      stat = statSync(normalizedCwd);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EACCES" || code === "EPERM") {
        return NextResponse.json({ error: `Pi Web cannot access this folder: ${cwd}` }, { status: 403 });
      }
      return NextResponse.json({ error: `Directory does not exist: ${cwd}` }, { status: 400 });
    }

    if (!stat.isDirectory()) {
      return NextResponse.json({ error: `Path is not a directory: ${cwd}` }, { status: 400 });
    }

    if (body.literal === true) {
      // A system picker can see a folder that macOS denies to the Pi Web
      // server. Check that it can actually be opened before switching.
      try {
        await (await opendir(normalizedCwd)).close();
      } catch {
        return NextResponse.json({ error: `Pi Web cannot open this folder: ${cwd}` }, { status: 403 });
      }
    }

    allowFileRoot(normalizedCwd);
    const project = await resolveProject(normalizedCwd);
    return NextResponse.json({
      success: true,
      cwd: normalizedCwd,
      projectRoot: project.projectRoot,
      projectKey: projectIdentityKey(project.projectRoot),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

import { autoArchiveExpiredTasks } from "@/app/actions/tasks";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await autoArchiveExpiredTasks(secret);

  if ("error" in result) {
    return Response.json({ success: false, error: result.error }, { status: 500 });
  }

  return Response.json({ success: true, archivedCount: result.archivedCount });
}

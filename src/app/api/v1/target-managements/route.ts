import { NextRequest, NextResponse } from "next/server";
import { INDEX, buildTargetDoc, esSearch, listTargets, syncCaptureFilter } from "@/lib/targets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const data = await listTargets(req.nextUrl.searchParams);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "list failed" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = body?.data || body;
    const by = String(data.created_by || data.last_modified_by || "spiderx");
    const alias = data?.personalInfo?.alias || data?.alias;
    if (!alias) return NextResponse.json({ error: "alias required" }, { status: 400 });
    const doc = buildTargetDoc(data, by);
    const res: any = await esSearch(`${INDEX.targets}/_doc`, doc, "POST");
    const id = res._id;
    await syncCaptureFilter(id, doc, by).catch(() => null);
    return NextResponse.json({ ok: true, success: true, id, _id: id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "create failed" }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const data = body?.data || body;
    const id = body?._id || data?.id;
    if (!id) return NextResponse.json({ error: "_id required" }, { status: 400 });
    const by = String(data.last_modified_by || data.created_by || "spiderx");
    const existingRes: any = await esSearch(`${INDEX.targets}/_doc/${id}`, undefined, "GET");
    const existing = existingRes._source || {};
    const doc = buildTargetDoc(data, by, existing);
    await esSearch(`${INDEX.targets}/_update/${id}`, { doc }, "POST");
    await syncCaptureFilter(id, doc, by).catch(() => null);
    return NextResponse.json({ ok: true, success: true, id, _id: id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "update failed" }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = body?.ids || [];
    if (!ids.length) {
      // filter-based delete
      const q = new URLSearchParams();
      if (body?.query) q.set("query", body.query);
      if (body?.status) q.set("status", body.status);
      if (body?.priority) q.set("priority", body.priority);
      const listed = await listTargets(q);
      const allIds = (listed.items || []).map((t: any) => t.id);
      if (!allIds.length) return NextResponse.json({ ok: true, deleted: 0 });
      await esSearch(`${INDEX.targets}/_delete_by_query`, { query: { ids: { values: allIds } } }, "POST");
      await esSearch(
        `${INDEX.captureFilter}/_delete_by_query`,
        { query: { terms: { "reference_id.keyword": allIds } } },
        "POST"
      ).catch(() => null);
      return NextResponse.json({ ok: true, success: true, deleted: allIds.length });
    }
    await esSearch(`${INDEX.targets}/_delete_by_query`, { query: { ids: { values: ids } } }, "POST");
    await esSearch(
      `${INDEX.captureFilter}/_delete_by_query`,
      { query: { terms: { "reference_id.keyword": ids } } },
      "POST"
    ).catch(() => null);
    return NextResponse.json({ ok: true, success: true, deleted: ids.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "delete failed" }, { status: 502 });
  }
}

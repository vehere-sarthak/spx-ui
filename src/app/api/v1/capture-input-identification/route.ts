import { NextRequest, NextResponse } from "next/server";
import { INDEX, esSearch, totalHits } from "@/lib/es-server";
import { pageParams } from "@/lib/api-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mapDoc(h: any) {
  const s = h._source || {};
  return {
    id: h._id,
    version: h._version,
    name: s.name,
    type: s.type,
    vlan_id: s.vlan_id || [],
    mac: s.mac || s.mac_address,
    mpls: s.mpls || [],
    iface: s.iface || [],
    pbIP: s.pbIP,
    pbPort: s.pbPort,
    pbType: s.pbType,
    pbDeviceName: s.pbDeviceName,
    pbUsername: s.pbUsername,
    enabled: s.enabled !== false,
    created_by: s.created_by,
    created_on: s.created_on,
    last_modified_by: s.last_modified_by,
    last_modified_on: s.last_modified_on,
  };
}

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const { page, pageSize, from } = pageParams(q, 20);
    const query = (q.get("query") || "").trim();
    const id = q.get("_id") || "";
    if (id) {
      const doc: any = await esSearch(`${INDEX.iface}/_doc/${id}`, undefined, "GET");
      return NextResponse.json({ item: mapDoc(doc) });
    }
    const must: any[] = [];
    if (query) {
      must.push({
        multi_match: {
          query,
          fields: ["name", "type", "pbIP", "pbDeviceName", "created_by", "vlan_id"],
        },
      });
    }
    const data: any = await esSearch(INDEX.iface + "/_search", {
      from,
      size: pageSize,
      track_total_hits: true,
      sort: [{ created_on: "desc" }],
      query: must.length ? { bool: { must } } : { match_all: {} },
      aggs: { by_type: { terms: { field: "type.keyword", size: 20 } } },
      version: true,
    });
    return NextResponse.json({
      total: totalHits(data),
      page,
      pageSize,
      items: (data.hits?.hits || []).map(mapDoc),
      aggs: { by_type: data.aggregations?.by_type?.buckets || [] },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "list failed" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = body?.data || body;
    const _id = body?._id;
    if (!data?.name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const hasValue =
      (data.vlan_id && data.vlan_id.length) ||
      (data.mac && (Array.isArray(data.mac) ? data.mac.length : data.mac)) ||
      (data.mpls && data.mpls.length) ||
      (data.iface && data.iface.length);
    if (!hasValue) {
      return NextResponse.json(
        { error: "identifier value required (vlan_id / mac / mpls / iface)" },
        { status: 400 }
      );
    }
    if (!data.type) {
      if (data.vlan_id) data.type = "VLAN ID";
      else if (data.mac) data.type = "MAC";
      else if (data.mpls) data.type = "MPLS";
      else if (data.iface) data.type = "IFACE";
    }
    const now = Math.floor(Date.now() / 1000);
    const by = data.created_by || data.last_modified_by || "spiderx";
    const doc = {
      ...data,
      created_by: data.created_by || by,
      created_on: data.created_on || now,
      last_modified_by: by,
      last_modified_on: now,
    };
    if (_id) {
      await esSearch(`${INDEX.iface}/_update/${_id}`, { doc }, "POST");
      return NextResponse.json({ ok: true, id: _id });
    }
    const res: any = await esSearch(`${INDEX.iface}/_doc`, doc, "POST");
    return NextResponse.json({ ok: true, id: res._id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "save failed" }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: string[] = body?.ids || (body?.id ? [body.id] : []);
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
    await esSearch(`${INDEX.iface}/_delete_by_query`, {
      query: { ids: { values: ids } },
    }, "POST");
    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "delete failed" }, { status: 502 });
  }
}

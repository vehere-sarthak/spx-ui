import { NextRequest, NextResponse } from "next/server";
import { nowEpochSec, pageParams } from "@/lib/api-utils";
import { sql, sqlExec } from "@/lib/mysql";
import { INDEX, esSearch } from "@/lib/es-server";
import { decryptWirePassword, encryptPassword, proxyToSpx, SPX_PORT } from "@/lib/spx-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const { page, pageSize, from } = pageParams(q, 50);
    const query = (q.get("query") || "").trim();
    const where = query ? "WHERE name LIKE ? OR ip_address LIKE ? OR username LIKE ?" : "";
    const params = query ? [`%${query}%`, `%${query}%`, `%${query}%`] : [];
    const countRows = await sql<{ c: number }>(`SELECT COUNT(*) c FROM spx_management ${where}`, params);
    const rows = await sql(
      `SELECT id, name, ip_address, username, created_by, created_on, last_modified_by, last_modified_on
       FROM spx_management ${where}
       ORDER BY created_on DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, from]
    );

    const live: any = await esSearch(INDEX.links + "/_search", {
      size: 0,
      query: { range: { "@timestamp": { gte: "now-1d", lte: "now" } } },
      aggs: {
        by_ip: {
          terms: { field: "probe_ip.keyword", size: 100 },
          aggs: {
            last: {
              top_hits: {
                size: 1,
                sort: [{ "@timestamp": "desc" }],
                _source: ["probe_host_name", "probe_ip", "@timestamp"],
              },
            },
            links: { cardinality: { field: "link_name.keyword" } },
          },
        },
      },
    }).catch(() => ({ aggregations: { by_ip: { buckets: [] } } }));

    const byIp = new Map(
      ((live.aggregations?.by_ip?.buckets || []) as any[]).map((b) => {
        const last = b.last?.hits?.hits?.[0]?._source || {};
        const age = Date.now() - new Date(last["@timestamp"] || 0).getTime();
        return [
          b.key,
          {
            probe_status: !last["@timestamp"] ? "Stopped" : age > 10 * 60 * 1000 ? "Degraded" : "Running",
            last_seen: last["@timestamp"],
            links: b.links?.value || 0,
            probe_host_name: last.probe_host_name,
          },
        ];
      })
    );

    const items = rows.map((r: any) => {
      const liveRow = byIp.get(r.ip_address) || { probe_status: "Stopped", links: 0 };
      const probe_status = liveRow.probe_status || "Stopped";
      const agent_status =
        probe_status === "Running" ? "Running" : probe_status === "Degraded" ? "Degraded" : "Stopped";
      return { ...r, ...liveRow, probe_status, agent_status };
    });

    return NextResponse.json({
      total: countRows[0]?.c || 0,
      page,
      pageSize,
      items,
      result: items,
      kpi: {
        appliances: countRows[0]?.c || 0,
        agentRunning: items.filter((i: any) => i.agent_status === "Running").length,
        probeRunning: items.filter((i: any) => i.probe_status === "Running").length,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "spx list failed" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = body?.data || body;
    const name = String(data.name || "").trim();
    const ip_address = String(data.ip_address || "").trim();
    const username = String(data.username || "admin").trim();
    const plainPassword = decryptWirePassword(String(data.password || ""));
    if (!name || !ip_address || !plainPassword) {
      return NextResponse.json({ error: "name, ip_address, password required" }, { status: 400 });
    }

    let loginResult: { status: number; data: any };
    try {
      loginResult = await proxyToSpx(ip_address, "/api/auth/login", "POST", {
        username,
        password: plainPassword,
      });
    } catch (err: any) {
      return NextResponse.json(
        {
          error: `Unable to reach Spider-X Edge at ${ip_address}:${SPX_PORT}. ${err?.message || ""}`,
        },
        { status: 502 }
      );
    }
    if (loginResult.status === 401 || !loginResult.data?.ok) {
      return NextResponse.json(
        { error: "Invalid credentials. Authentication against Spider-X Edge appliance failed." },
        { status: 401 }
      );
    }

    const now = nowEpochSec();
    const by = String(data.created_by || "spiderx");
    const result = await sqlExec(
      `INSERT INTO spx_management (name, ip_address, username, password, created_by, created_on, last_modified_by, last_modified_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, ip_address, username, encryptPassword(plainPassword), by, now, by, now]
    );
    return NextResponse.json({
      ok: true,
      success: true,
      id: result.insertId,
      message: "Spider-X Edge appliance registered successfully.",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "register failed" }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const data = body?.data || body;
    const id = Number(body?._id || data.id);
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const now = nowEpochSec();
    const sets = ["name=?", "ip_address=?", "username=?", "last_modified_by=?", "last_modified_on=?"];
    const params: any[] = [
      data.name,
      data.ip_address,
      data.username,
      data.last_modified_by || "spiderx",
      now,
    ];
    if (data.password) {
      sets.push("password=?");
      params.push(encryptPassword(decryptWirePassword(String(data.password))));
    }
    params.push(id);
    await sqlExec(`UPDATE spx_management SET ${sets.join(", ")} WHERE id=?`, params);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "update failed" }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: number[] = body?.ids || (body?.id ? [Number(body.id)] : []);
    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });
    await sqlExec(`DELETE FROM spx_management WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
    return NextResponse.json({
      ok: true,
      success: true,
      deleted: ids.length,
      message: "Appliance removed successfully.",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "delete failed" }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Proxy PCAP download from probe reconstruction service. */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const probeIp = q.get("probe_ip") || "";
    const sessionId = q.get("session_id") || "";
    const id = q.get("id") || sessionId;
    if (!probeIp || !sessionId) {
      return NextResponse.json({ error: "probe_ip and session_id required" }, { status: 400 });
    }
    // Common vehere path pattern; try a few variants
    const candidates = [
      `https://${probeIp}:8082/api/v1/reconstruction/getfiles/${sessionId}.zip`,
      `http://${probeIp}:8082/api/v1/reconstruction/getfiles/${sessionId}.zip`,
      `https://${probeIp}:8082/api/v1/reconstruction/getpcapfile/0/0/0/0/m/0/${sessionId}/${id}.pcap`,
      `http://${probeIp}:8082/api/v1/reconstruction/getpcapfile/0/0/0/0/m/0/${sessionId}/${id}.pcap`,
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(12000),
          // @ts-expect-error Node fetch accepts rejectUnauthorized; it is absent from the DOM RequestInit type
          rejectUnauthorized: false,
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const ctype = res.headers.get("content-type") || "application/octet-stream";
          const name = url.endsWith(".zip") ? `${sessionId}.zip` : `${sessionId}.pcap`;
          return new NextResponse(buf, {
            headers: {
              "Content-Type": ctype,
              "Content-Disposition": `attachment; filename="${name}"`,
            },
          });
        }
      } catch {
        /* try next */
      }
    }
    return NextResponse.json(
      {
        error: "PCAP not available from probe",
        hint: "Reconstruction may still be processing, or probe API is unreachable from SpiderX.",
      },
      { status: 404 }
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "pcap failed" }, { status: 502 });
  }
}

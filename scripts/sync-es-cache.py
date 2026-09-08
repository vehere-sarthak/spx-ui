#!/usr/bin/env python3
"""Refresh ES → data/es-cache/api/*.json used when live ES is unreachable."""
from __future__ import annotations

import json
import subprocess
import time
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parents[1] / "data" / "es-cache"
API = BASE / "api"
AUTH = "admin:CHANGEME"
ES = "https://127.0.0.1:9200"


def curl_json(path: str, body=None):
    cmd = [
        "curl",
        "-sk",
        "--noproxy",
        "*",
        "-u",
        AUTH,
        "--max-time",
        "90",
        "-H",
        "Content-Type: application/json",
        f"{ES}/{path.lstrip('/')}",
    ]
    if body is not None:
        cmd += ["--data-binary", json.dumps(body)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        raise SystemExit(f"curl failed {path}: rc={r.returncode} {r.stderr[:200]}")
    return json.loads(r.stdout)


def format_bytes_short(n):
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    v, i = max(0.0, float(n)), 0
    while v >= 1024 and i < len(units) - 1:
        v /= 1024
        i += 1
    return f"{round(v)} {units[i]}" if v >= 100 or i == 0 else f"{v:.1f} {units[i]}"


PRIORITY_RANK = ("critical", "high", "medium", "low", "info")


def worst_priority(bucket):
    """Highest priority present in a per-term `priority.keyword` sub-aggregation."""
    seen = {
        str(p.get("key")).lower() for p in ((bucket.get("by_priority") or {}).get("buckets") or [])
    }
    return next((p for p in PRIORITY_RANK if p in seen), "info")


def map_alert(hit):
    s = hit.get("_source") or {}
    priority = str(s.get("priority") or "info").lower()
    severity = priority if priority in ("critical", "high", "medium", "low", "info") else "info"
    t = str(s.get("alert_type") or s.get("type") or "").lower()
    stage = "actions"
    if "c2" in t or "beacon" in t:
        stage = "c2"
    elif "exploit" in t:
        stage = "exploit"
    elif "malware" in t or "install" in t:
        stage = "install"
    elif "phish" in t or "delivery" in t:
        stage = "delivery"
    elif "recon" in t or "scan" in t:
        stage = "recon"
    return {
        "id": hit.get("_id"),
        "title": s.get("alert_name") or s.get("value") or "Alert",
        "severity": severity,
        "stage": stage,
        "src": s.get("value") or "-",
        "dst": s.get("link_name") or "-",
        "host": s.get("probe_host_name") or "-",
        "protocol": s.get("type") or s.get("alert_type") or "-",
        "mitre": s.get("mitre_technique") or s.get("mitre") or "-",
        "ts": s.get("@timestamp"),
        "confidence": 80,
        "bytes": int(s.get("hit_count") or 0),
        "status": "open",
        "value": s.get("value"),
        "alert_type": s.get("alert_type"),
        "link_name": s.get("link_name"),
        "probe_host_name": s.get("probe_host_name"),
        "target": map_target(s.get("target")),
    }


def map_target(raw):
    """Mirror of mapTarget() in es-server.ts, so cached dossiers render."""
    if not isinstance(raw, dict):
        return None

    def as_list(v):
        if isinstance(v, list):
            return [str(x) for x in v if x]
        return [str(v)] if v else None

    def iso(v):
        try:
            n = float(v)
        except (TypeError, ValueError):
            return None
        if n <= 0:
            return None
        return (
            datetime.utcfromtimestamp(n / 1000 if n > 1e12 else n).isoformat() + "Z"
        )

    info = raw.get("personalInfo") or {}
    out = {
        "alias": info.get("alias"),
        "firstName": info.get("firstName"),
        "lastName": info.get("lastName"),
        "description": info.get("description"),
        "subject": as_list((raw.get("interceptionCriteria") or {}).get("subject")),
        "priority": info.get("priority"),
        "targetValue": as_list(raw.get("targetValue")),
        "captureAction": as_list(raw.get("capture_action")),
        "createdBy": raw.get("created_by"),
        "lastModifiedBy": raw.get("last_modified_by"),
        "importName": raw.get("importName"),
        "enabled": raw.get("enabled") if isinstance(raw.get("enabled"), bool) else None,
        "activeFrom": raw.get("activeFromTZ") or iso(raw.get("activeFrom")),
        "validTill": raw.get("validTillTZ") or iso(raw.get("validTill")),
    }
    return out if any(v is not None for v in out.values()) else None


def total_hits(res):
    t = (res.get("hits") or {}).get("total")
    if isinstance(t, int):
        return t
    return (t or {}).get("value") or 0


def main():
    BASE.mkdir(parents=True, exist_ok=True)
    API.mkdir(parents=True, exist_ok=True)

    root = curl_json("/")
    alerts = curl_json(
        "logvehere-alerts-*/_search",
        {
            "size": 50,
            "track_total_hits": True,
            "sort": [{"@timestamp": "desc"}],
            "query": {"range": {"@timestamp": {"gte": "now-7d", "lte": "now"}}},
            "aggs": {
                "by_priority": {"terms": {"field": "priority.keyword", "size": 10}},
                "by_type": {"terms": {"field": "type.keyword", "size": 15}},
                "timeline": {
                    "date_histogram": {"field": "@timestamp", "fixed_interval": "6h", "min_doc_count": 0},
                    "aggs": {
                        "by_priority": {"terms": {"field": "priority.keyword", "size": 6}},
                        "subjects": {"cardinality": {"field": "target.personalInfo.alias.keyword"}},
                    },
                },
                "subjects_tl": {
                    "terms": {"field": "target.personalInfo.alias.keyword", "size": 24},
                    "aggs": {
                        "timeline": {
                            "date_histogram": {
                                "field": "@timestamp",
                                "fixed_interval": "6h",
                                "min_doc_count": 0,
                            }
                        },
                        "subject": {
                            "terms": {"field": "target.interceptionCriteria.subject.keyword", "size": 1}
                        },
                        "by_priority": {"terms": {"field": "priority.keyword", "size": 5}},
                        "links": {"cardinality": {"field": "link_name.keyword"}},
                        "latest": {"top_hits": {"size": 1, "sort": [{"@timestamp": "desc"}]}},
                    },
                },
                "in_play": {"cardinality": {"field": "target.personalInfo.alias.keyword"}},
                "offenders": {
                    "terms": {"field": "value.keyword", "size": 8},
                    "aggs": {
                        "by_priority": {"terms": {"field": "priority.keyword", "size": 5}},
                        "latest": {"top_hits": {"size": 1, "sort": [{"@timestamp": "desc"}]}},
                    },
                },
                "links": {"terms": {"field": "link_name.keyword", "size": 8}},
            },
        },
    )
    now_sec = int(time.time())
    targets_life = curl_json(
        "target_managements/_search",
        {
            "size": 0,
            "track_total_hits": True,
            "query": {"match_all": {}},
            "aggs": {
                "enabled": {"filter": {"term": {"enabled": True}}},
                "active_now": {
                    "filter": {
                        "bool": {
                            "filter": [
                                {"term": {"enabled": True}},
                                {"range": {"activeFrom": {"lte": now_sec}}},
                                {"range": {"validTill": {"gte": now_sec}}},
                            ]
                        }
                    }
                },
                "expired": {"filter": {"range": {"validTill": {"lt": now_sec}}}},
                "expiring_24h": {
                    "filter": {"range": {"validTill": {"gte": now_sec, "lte": now_sec + 86400}}}
                },
                "subjects": {"cardinality": {"field": "interceptionCriteria.subject.keyword"}},
            },
        },
    )
    filters_agg = curl_json(
        "capture_filter/_search",
        {
            "size": 0,
            "track_total_hits": True,
            "query": {"match_all": {}},
            "aggs": {"enabled": {"filter": {"term": {"enabled": True}}}},
        },
    )
    wire = curl_json(
        "link-stats-*/_search",
        {
            "size": 0,
            "track_total_hits": True,
            "query": {"range": {"@timestamp": {"gte": "now-7d", "lte": "now"}}},
            "aggs": {
                "packets": {"sum": {"field": "total_packets"}},
                "bytes": {"sum": {"field": "total_bytes"}},
                "probes": {"cardinality": {"field": "probe_host_name.keyword"}},
                "links": {"cardinality": {"field": "link_name.keyword"}},
            },
        },
    )
    spectrum_signals = []
    for index_map in curl_json("link-stats-*/_mapping").values():
        props = ((index_map.get("mappings") or {}).get("properties") or {})
        for parent, band in (("encapsulations_count", "encap"), ("protocols_count", "protocol")):
            for key in ((props.get(parent) or {}).get("properties") or {}):
                field = f"{parent}.{key}"
                if all(sig["field"] != field for sig in spectrum_signals):
                    spectrum_signals.append({"key": key, "band": band, "field": field})
    spectrum_signals = spectrum_signals[:30]
    spectrum = curl_json(
        "link-stats-*/_search",
        {
            "size": 0,
            "query": {"range": {"@timestamp": {"gte": "now-7d", "lte": "now"}}},
            "aggs": {
                "timeline": {
                    "date_histogram": {"field": "@timestamp", "fixed_interval": "6h", "min_doc_count": 0},
                    "aggs": {
                        f'{sig["band"]}:{sig["key"]}': {"sum": {"field": sig["field"]}}
                        for sig in spectrum_signals
                    },
                }
            },
        },
    )
    links = curl_json(
        "link-stats-*/_search",
        {
            "size": 0,
            "query": {"range": {"@timestamp": {"gte": "now-1d", "lte": "now"}}},
            "aggs": {
                "card": {"cardinality": {"field": "link_name.keyword"}},
                "bytes": {"sum": {"field": "total_bytes"}},
                "links": {
                    "terms": {"field": "link_name.keyword", "size": 50},
                    "aggs": {
                        "bytes": {"sum": {"field": "total_bytes"}},
                        "packets": {"sum": {"field": "total_packets"}},
                        "soi": {"sum": {"field": "total_soi_type_count"}},
                        "last": {
                            "top_hits": {
                                "size": 1,
                                "sort": [{"@timestamp": "desc"}],
                                "_source": [
                                    "link_name",
                                    "probe_host_name",
                                    "probe_ip",
                                    "identifier_type",
                                    "identifier_value",
                                    "total_bytes",
                                    "total_packets",
                                    "protocols",
                                    "encapsulations",
                                    "@timestamp",
                                ],
                            }
                        },
                    },
                },
            },
        },
    )
    soi = curl_json(
        "soi-stats-*/_search",
        {
            "size": 0,
            "track_total_hits": True,
            "query": {"range": {"@timestamp": {"gte": "now-7d", "lte": "now"}}},
            "aggs": {"hits": {"sum": {"field": "hit_count"}}},
        },
    )
    targets = curl_json(
        "target_managements/_search",
        {
            "size": 50,
            "sort": [{"created_on": "desc"}],
            "query": {"match_all": {}},
            "aggs": {
                "by_priority": {"terms": {"field": "personalInfo.priority.keyword", "size": 10}},
                "enabled": {"terms": {"field": "enabled", "size": 2}},
                "enabled_f": {"filter": {"term": {"enabled": True}}},
            },
        },
    )
    try:
        audit = curl_json(
            "audittrail-*/_search",
            {
                "size": 50,
                "sort": [{"@timestamp": "desc"}],
                "query": {"range": {"@timestamp": {"gte": "now-30d", "lte": "now"}}},
            },
        )
    except SystemExit:
        audit = {"hits": {"total": 0, "hits": []}}

    pri = {
        str(b["key"]).lower(): b["doc_count"]
        for b in (((alerts.get("aggregations") or {}).get("by_priority") or {}).get("buckets") or [])
    }
    now = time.time() * 1000
    link_items = []
    for b in (((links.get("aggregations") or {}).get("links") or {}).get("buckets") or []):
        last = ((((b.get("last") or {}).get("hits") or {}).get("hits") or [{}])[0].get("_source") or {})
        ts = last.get("@timestamp")
        age = 999999
        if ts:
            try:
                age = now - datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000
            except Exception:
                age = 0
        state = "down" if not ts else ("degraded" if age > 10 * 60 * 1000 else "up")
        link_items.append(
            {
                "id": b["key"],
                "name": b["key"],
                "probe": last.get("probe_host_name") or "-",
                "probe_ip": last.get("probe_ip") or "-",
                "identifier_type": last.get("identifier_type"),
                "identifier_value": last.get("identifier_value"),
                "state": state,
                "mbps": round((float(last.get("total_bytes") or 0) * 8) / 1_000_000),
                "packets": int((b.get("packets") or {}).get("value") or last.get("total_packets") or 0),
                "bytes": float((b.get("bytes") or {}).get("value") or 0),
                "soi": float((b.get("soi") or {}).get("value") or 0),
                "protocols": last.get("protocols") or [],
                "encapsulations": last.get("encapsulations") or [],
                "ts": ts,
            }
        )

    alert_items = [map_alert(h) for h in ((alerts.get("hits") or {}).get("hits") or [])]
    target_items = []
    for h in ((targets.get("hits") or {}).get("hits") or []):
        s = h.get("_source") or {}
        p = s.get("personalInfo") or {}
        target_items.append(
            {
                "id": h.get("_id"),
                "alias": p.get("alias"),
                "name": " ".join([x for x in [p.get("firstName"), p.get("lastName")] if x]) or p.get("alias"),
                "priority": str(p.get("priority") or "").lower(),
                "enabled": bool(s.get("enabled")),
                "values": s.get("targetValue") or [],
                "created_by": s.get("created_by"),
                "validTill": s.get("validTillTZ") or s.get("validTill"),
                "description": p.get("description"),
            }
        )
    audit_items = []
    for h in ((audit.get("hits") or {}).get("hits") or []):
        s = h.get("_source") or {}
        audit_items.append(
            {
                "id": h.get("_id"),
                "ts": s.get("@timestamp"),
                "username": s.get("username"),
                "clientIp": s.get("clientIp"),
                "category": s.get("category"),
                "module": s.get("module"),
                "event": s.get("event"),
                "message": s.get("eventMessage") or s.get("message"),
            }
        )

    (API / "health-es.json").write_text(
        json.dumps({"ok": True, "host": ES, "cluster": root.get("cluster_name"), "name": root.get("name")})
    )
    cadence_buckets = [
        {
            "t": b.get("key_as_string"),
            "total": b.get("doc_count"),
            "subjects": ((b.get("subjects") or {}).get("value") or 0),
            "priorities": {
                str(p.get("key")).lower(): p.get("doc_count")
                for p in ((b.get("by_priority") or {}).get("buckets") or [])
            },
        }
        for b in (((alerts.get("aggregations") or {}).get("timeline") or {}).get("buckets") or [])
    ]
    spectrum_buckets = ((spectrum.get("aggregations") or {}).get("timeline") or {}).get("buckets") or []
    spectrum_rows = []
    for sig in spectrum_signals:
        values = [round((b.get(f'{sig["band"]}:{sig["key"]}') or {}).get("value") or 0) for b in spectrum_buckets]
        if sum(values) > 0:
            spectrum_rows.append(
                {"key": sig["key"], "band": sig["band"], "total": sum(values), "values": values}
            )
    spectrum_rows.sort(key=lambda r: -r["total"])

    def agg(res, name):
        return (res.get("aggregations") or {}).get(name) or {}

    alert_aggs = alerts.get("aggregations") or {}
    subject_tl = (alert_aggs.get("subjects_tl") or {}).get("buckets") or []
    subject_columns = [b.get("key_as_string") for b in ((subject_tl[0] or {}).get("timeline") or {}).get("buckets", [])]
    subject_rows = [
        {
            "alias": b.get("key"),
            "subject": ((b.get("subject") or {}).get("buckets") or [{}])[0].get("key"),
            "priority": worst_priority(b),
            "total": b.get("doc_count"),
            "links": ((b.get("links") or {}).get("value") or 0),
            "values": [t.get("doc_count") for t in ((b.get("timeline") or {}).get("buckets") or [])],
            "latest": map_alert(((b.get("latest") or {}).get("hits") or {}).get("hits", [{}])[0])
            if ((b.get("latest") or {}).get("hits") or {}).get("hits")
            else None,
        }
        for b in subject_tl
    ]
    in_play = (alert_aggs.get("in_play") or {}).get("value") or 0
    active_targets = agg(targets_life, "active_now").get("doc_count") or 0
    soi_docs = total_hits(soi)
    latest_alert_ts = (alert_items[0] or {}).get("ts") if alert_items else None

    thread = [
        {
            "id": "target", "step": 1, "label": "Targets saved", "detail": "target_managements",
            "value": total_hits(targets_life), "sub": f"{active_targets:,} active now",
            "stale": active_targets == 0,
        },
        {
            "id": "filter", "step": 2, "label": "Capture filters", "detail": "capture_filter",
            "value": total_hits(filters_agg),
            "sub": f"{agg(filters_agg, 'enabled').get('doc_count') or 0:,} enabled",
            "stale": total_hits(filters_agg) == 0,
        },
        {
            "id": "probe", "step": 3, "label": "Probes serving", "detail": "probe dictionary",
            "value": agg(wire, "probes").get("value") or 0,
            "sub": f"{agg(wire, 'links').get('value') or 0:,} links armed",
            "stale": (agg(wire, "probes").get("value") or 0) == 0,
        },
        {
            "id": "wire", "step": 4, "label": "Packets matched", "detail": "on the wire",
            "value": round(agg(wire, "packets").get("value") or 0),
            "sub": format_bytes_short(agg(wire, "bytes").get("value") or 0),
            "stale": (agg(wire, "packets").get("value") or 0) == 0,
        },
        {
            "id": "edge", "step": 5, "label": "SOI hits", "detail": "written on the edge",
            "value": round(agg(soi, "hits").get("value") or 0),
            "sub": f"{soi_docs:,} stat docs", "stale": soi_docs == 0,
        },
        {
            "id": "cms", "step": 6, "label": "Indexed on CMS", "detail": "soi-stats-*, link-stats-*",
            "value": soi_docs + total_hits(wire), "sub": "stat docs indexed",
            "ts": latest_alert_ts, "stale": not latest_alert_ts,
        },
        {
            "id": "console", "step": 7, "label": "Subjects in play", "detail": "surfaced to the analyst",
            "value": in_play, "sub": f"{total_hits(alerts):,} alerts", "stale": in_play == 0,
        },
    ]

    (API / "ndr-command.json").write_text(
        json.dumps(
            {
                "kpi": {
                    "alerts_total": total_hits(alerts),
                    "critical": pri.get("critical") or 0,
                    "high": pri.get("high") or 0,
                    "medium": pri.get("medium") or 0,
                    "low": pri.get("low") or 0,
                    "soi_hits": ((soi.get("aggregations") or {}).get("hits") or {}).get("value") or 0,
                    "links": ((links.get("aggregations") or {}).get("card") or {}).get("value") or len(link_items),
                    "link_bytes": ((links.get("aggregations") or {}).get("bytes") or {}).get("value") or 0,
                    "targets_total": total_hits(targets_life),
                    "targets_enabled": ((targets_life.get("aggregations") or {}).get("enabled") or {}).get("doc_count")
                    or 0,
                    "targets_active": active_targets,
                    "targets_expired": ((targets_life.get("aggregations") or {}).get("expired") or {}).get("doc_count")
                    or 0,
                    "targets_expiring_24h": (
                        (targets_life.get("aggregations") or {}).get("expiring_24h") or {}
                    ).get("doc_count")
                    or 0,
                    "subjects_total": ((targets_life.get("aggregations") or {}).get("subjects") or {}).get("value") or 0,
                    "subjects_in_play": in_play,
                },
                "thread": thread,
                "subjects": {"interval": "6h", "buckets": subject_columns, "rows": subject_rows},
                "cadence": {"interval": "6h", "buckets": cadence_buckets},
                "spectrum": {
                    "interval": "6h",
                    "buckets": [b.get("key_as_string") for b in spectrum_buckets],
                    "rows": spectrum_rows,
                },
                "trend": {
                    "timeline": [{"t": b["t"], "count": b["total"]} for b in cadence_buckets]
                },
                "offenders": {
                    "offenders": [
                        {
                            "key": b.get("key"),
                            "doc_count": b.get("doc_count"),
                            "severity": worst_priority(b),
                            "latest": map_alert(((b.get("latest") or {}).get("hits") or {}).get("hits", [{}])[0])
                            if ((b.get("latest") or {}).get("hits") or {}).get("hits")
                            else None,
                        }
                        for b in (((alerts.get("aggregations") or {}).get("offenders") or {}).get("buckets") or [])
                    ],
                    "links": (((alerts.get("aggregations") or {}).get("links") or {}).get("buckets") or []),
                },
                "recent": {"items": alert_items[:20], "total": total_hits(alerts)},
                "links": {
                    "items": [
                        {
                            "id": x["id"],
                            "name": x["name"],
                            "probe": x["probe"],
                            "state": x["state"],
                            "bytes": x["bytes"],
                        }
                        for x in link_items
                    ]
                },
            }
        )
    )
    (API / "alerts.json").write_text(
        json.dumps(
            {
                "total": total_hits(alerts),
                "page": 0,
                "pageSize": 50,
                "items": alert_items,
                "aggs": {
                    "by_priority": (((alerts.get("aggregations") or {}).get("by_priority") or {}).get("buckets") or []),
                    "by_type": (((alerts.get("aggregations") or {}).get("by_type") or {}).get("buckets") or []),
                },
            }
        )
    )
    (API / "link-monitoring.json").write_text(
        json.dumps({"total": len(link_items), "windowHits": total_hits(links), "items": link_items})
    )
    (API / "target-managements.json").write_text(
        json.dumps(
            {
                "total": total_hits(targets),
                "page": 0,
                "pageSize": 50,
                "items": target_items,
                "aggs": {
                    "by_priority": (((targets.get("aggregations") or {}).get("by_priority") or {}).get("buckets") or []),
                    "enabled": (((targets.get("aggregations") or {}).get("enabled") or {}).get("buckets") or []),
                },
            }
        )
    )
    (API / "audittrail.json").write_text(
        json.dumps({"total": total_hits(audit), "page": 0, "pageSize": 50, "items": audit_items})
    )
    print(
        f"synced alerts={total_hits(alerts)} links={len(link_items)} targets={total_hits(targets)} → {API}"
    )


if __name__ == "__main__":
    main()

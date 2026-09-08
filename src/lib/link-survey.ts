import { apiFetch } from "./api-client";
export type PbData = {
  pbIP: string;
  pbPort: string;
  pbType: string;
  pbDeviceName: string;
  pbUsername: string;
  pbPassword: string;
};

export const EMPTY_PB: PbData = {
  pbIP: "",
  pbPort: "443",
  pbType: "ixia",
  pbDeviceName: "",
  pbUsername: "",
  pbPassword: "",
};

export type LinkSurveyRow = {
  title: string;
  value: string;
  type: string;
};

const SURVEY_KEY = "spiderx_link_survey_pb";

export function saveSurveyConfig(pb: PbData) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SURVEY_KEY, JSON.stringify(pb));
}

export function loadSurveyConfig(): PbData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SURVEY_KEY);
    if (!raw) return null;
    return { ...EMPTY_PB, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

/** Parse CSV/JSON textarea: JSON array, or lines `title,value,type` / bare VLAN values. */
export function parseLinkRows(text: string): LinkSurveyRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        return arr
          .map((r: any) => ({
            title: String(r.title || r.name || "").trim(),
            value: String(r.value || r.vlan || "").trim(),
            type: String(r.type || "vlan_id").trim() || "vlan_id",
          }))
          .filter((r) => r.title && r.value);
      }
    } catch {
      /* fall through to line parse */
    }
  }

  return trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^title\s*[,|]/i.test(l))
    .map((line) => {
      if (line.includes(",") || line.includes("|") || line.includes("\t")) {
        const parts = line.split(/[,|\t]/).map((p) => p.trim().replace(/^"|"$/g, ""));
        const [a, b, c] = parts;
        if (parts.length === 1) {
          return { title: `vlan-${a}`, value: a, type: "vlan_id" };
        }
        if (parts.length === 2) {
          return { title: a, value: b, type: "vlan_id" };
        }
        return { title: a, value: b, type: c || "vlan_id" };
      }
      return { title: `vlan-${line}`, value: line, type: "vlan_id" };
    })
    .filter((r) => r.title && r.value);
}

export async function postBulkImportPbLinks(pbData: PbData, linkRows: LinkSurveyRow[]) {
  const res = await apiFetch("/link-monitoring/bulk-import-pb-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        pbData,
        linkRows: JSON.stringify(linkRows),
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Import failed");
  return json;
}

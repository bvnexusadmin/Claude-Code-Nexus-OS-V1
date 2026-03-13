import { supabase } from "./supabase";

const API_BASE = "";
const TENANT_STORAGE_KEY = "nexus_active_client_id";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };

  // attach active tenant if set
  try {
    const clientId = localStorage.getItem(TENANT_STORAGE_KEY);
    if (clientId) headers["x-nexus-client-id"] = clientId;
  } catch {
    // ignore
  }

  return headers;
}

async function readJsonSafe(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 300)}`);
  }
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers,
  });

  const data = await readJsonSafe(res);

  if (!res.ok || !data?.ok) {
    const msg = data?.error || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return data as T;
}

export async function apiPost<T = any>(path: string, body: any): Promise<T> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await readJsonSafe(res);

  if (!res.ok || !data?.ok) {
    const msg = data?.error || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return data as T;
}

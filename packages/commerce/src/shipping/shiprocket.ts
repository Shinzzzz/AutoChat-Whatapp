import { getEnv, mockFlags } from "@autochat/core";

export interface ShipmentResult {
  shipmentId?: string;
  awb?: string;
  courier?: string;
  status: string;
  trackingUrl?: string;
  mock: boolean;
}

export interface CreateShipmentArgs {
  orderId: string;
  customerName: string;
  customerPhone?: string;
  quantity: number;
  amountInr: number;
  city?: string;
}

const AUTH_URL = "https://apiv2.shiprocket.in/v1/external/auth/login";
const BASE = "https://apiv2.shiprocket.in/v1/external";

let tokenCache: { token: string; expires: number } | null = null;

async function getToken(): Promise<string> {
  const env = getEnv();
  if (tokenCache && tokenCache.expires > Date.now()) return tokenCache.token;
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Shiprocket auth failed: ${res.status}`);
  const data = (await res.json()) as { token: string };
  tokenCache = { token: data.token, expires: Date.now() + 9 * 24 * 3600 * 1000 };
  return data.token;
}

export async function createShipment(args: CreateShipmentArgs): Promise<ShipmentResult> {
  if (mockFlags().shiprocket) {
    return {
      shipmentId: `mock_ship_${args.orderId.slice(-6)}`,
      awb: `MOCKAWB${args.orderId.slice(-6).toUpperCase()}`,
      courier: "Mock Logistics",
      status: "Pickup scheduled",
      trackingUrl: `${getEnv().PUBLIC_BASE_URL.replace(/\/$/, "")}/track/mock/${args.orderId}`,
      mock: true,
    };
  }
  const token = await getToken();
  const res = await fetch(`${BASE}/orders/create/adhoc`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: args.orderId,
      order_date: new Date().toISOString().slice(0, 10),
      billing_customer_name: args.customerName,
      billing_phone: args.customerPhone,
      billing_city: args.city ?? "Mumbai",
      billing_country: "India",
      order_items: [{ name: "Branded bottled water", sku: args.orderId, units: args.quantity, selling_price: args.amountInr }],
      payment_method: "Prepaid",
      sub_total: args.amountInr,
      length: 30,
      breadth: 20,
      height: 20,
      weight: 5,
    }),
  });
  if (!res.ok) throw new Error(`Shiprocket create order failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { shipment_id?: number; awb_code?: string; courier_name?: string; status?: string };
  return {
    shipmentId: data.shipment_id ? String(data.shipment_id) : undefined,
    awb: data.awb_code,
    courier: data.courier_name,
    status: data.status ?? "Created",
    mock: false,
  };
}

export async function getTracking(awb: string): Promise<ShipmentResult> {
  if (mockFlags().shiprocket) {
    return { awb, courier: "Mock Logistics", status: "In transit", mock: true };
  }
  const token = await getToken();
  const res = await fetch(`${BASE}/courier/track/awb/${awb}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Shiprocket track failed: ${res.status}`);
  const data = (await res.json()) as {
    tracking_data?: { shipment_track?: { current_status?: string; courier_name?: string }[]; track_url?: string };
  };
  const t = data.tracking_data?.shipment_track?.[0];
  return {
    awb,
    courier: t?.courier_name,
    status: t?.current_status ?? "Unknown",
    trackingUrl: data.tracking_data?.track_url,
    mock: false,
  };
}

export function parseShiprocketWebhook(payload: unknown): { awb?: string; status?: string } {
  const b = payload as { awb?: string; current_status?: string; shipment_status?: string };
  return { awb: b.awb, status: b.current_status ?? b.shipment_status };
}

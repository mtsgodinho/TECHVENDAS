export type Profile = {
  id: string;
  full_name: string;
  role: "admin" | "attendant";
};
export const statuses = {
  pending: "Pendente",
  contacted: "Contatado",
  interested: "Interessado",
  follow_up: "Retornar depois",
  no_response: "Sem resposta",
  sold: "Venda realizada",
  lost: "Perdido",
} as const;
export type Status = keyof typeof statuses;
export type Lead = {
  id: string;
  name: string;
  phone: string;
  source: string;
  campaign: string | null;
  source_date: string | null;
  status: Status;
  assigned_to: string | null;
  batch_id: string | null;
  returned_at: string | null;
  follow_up_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};
export type Batch = { id: string; created_at: string; attendant_id: string };
export type Activity = {
  id: string;
  lead_id: string;
  actor_id: string;
  old_status: Status | null;
  new_status: Status;
  notes: string;
  event_type: string;
  created_at: string;
  leads?: { name: string } | null;
};
export type Metrics = {
  total: number;
  stock: number;
  assigned: number;
  statuses: Partial<Record<Status, number>>;
  worked: number;
  worked_today: number;
  worked_week: number;
  sales: number;
};
export const origins = [
  "Teste realizado",
  "Carrinho abandonado",
  "Demonstrou interesse",
  "Outro / não informado",
];
export function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(value))
    : "—";
}
export function localInput(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
  return parts.replace(" ", "T");
}
export function brazilInstant(value: string) {
  return value ? new Date(`${value}:00-03:00`).toISOString() : null;
}
export function phoneLabel(phone: string) {
  return phone.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "+55 ($1) $2-$3");
}

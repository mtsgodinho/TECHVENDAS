export default function DigitalPanel({
  label,
  value,
  loading,
  tone,
  index,
}: {
  label: string;
  value: number;
  loading: boolean;
  tone: "cyan" | "blue" | "violet" | "green";
  index: number;
}) {
  return (
    <article className="digital-panel" data-tone={tone} aria-busy={loading}>
      <div className="digital-panel-heading">
        <h3>{label}</h3>
        <span aria-hidden="true">0{index + 1}</span>
      </div>
      <strong className="digital-panel-value">
        {loading ? "—" : value.toLocaleString("pt-BR")}
      </strong>
      <div className="digital-panel-footer">
        <span>LEADS</span>
        <span>Dados do CRM</span>
      </div>
    </article>
  );
}

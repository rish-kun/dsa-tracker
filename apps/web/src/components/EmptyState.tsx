export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="empty-state">
      <p className="empty-state-mark" aria-hidden="true">
        ∅
      </p>
      <h2 className="empty-state-title">{title}</h2>
      <p className="empty-state-body">{body}</p>
    </div>
  );
}

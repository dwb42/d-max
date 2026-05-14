export function ErrorState(props: { title: string; description?: string | null }) {
  return (
    <div className="error-state" role="alert">
      <strong>{props.title}</strong>
      {props.description ? <p>{props.description}</p> : null}
    </div>
  );
}

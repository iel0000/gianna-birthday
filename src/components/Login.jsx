// Shown when a guest visits without a personalised invitation link.
// The site is invitation-only — the host shares a /?invite=<guid> URL with
// each guest. There's no manual name/email login any more.
export default function Login() {
  return (
    <section className="login card" aria-label="Use your invitation link">
      <p className="card__eyebrow">Welcome 💜</p>
      <h2 className="card__title">Open your invitation link</h2>
      <p className="card__lede">
        This celebration is invitation-only. Please tap the personalised link the family sent you
        — it will load your name and the seats reserved for your party automatically.
      </p>
      <p className="card__lede">
        If you can't find your link, please reply to the message we sent and we'll resend it
        right away.
      </p>
    </section>
  );
}

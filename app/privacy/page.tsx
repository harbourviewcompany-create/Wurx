export const metadata = { title: 'Privacy Policy — Wurx' }

export default function PrivacyPage() {
  return (
    <section className="container section">
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1>Privacy Policy</h1>
        <p className="muted">Last updated: {new Date().toLocaleDateString('en-CA')}</p>

        <p>
          This policy explains what personal information Wurx collects, why,
          and how it&apos;s handled, in line with Canada&apos;s Personal
          Information Protection and Electronic Documents Act (PIPEDA).
        </p>

        <h2>1. What we collect</h2>
        <p>
          Account details (name, email, phone), address and postal code for
          service delivery, payment details (processed by Stripe — we do not
          store card numbers), and booking history. Pros additionally provide
          business details, service areas, and availability.
        </p>

        <h2>2. Why we collect it</h2>
        <p>
          To create and manage your account, process subscription payments,
          match bookings to pros, and provide support. We do not sell personal
          information to third parties.
        </p>

        <h2>3. Who it&apos;s shared with</h2>
        <p>
          The pro assigned to your booking sees the details needed to perform
          the job (name, address, service, time). Payment processing is
          handled by Stripe under its own privacy policy. We may share
          information if required by law.
        </p>

        <h2>4. Data retention</h2>
        <p>
          We retain account and booking data as long as your account is active
          and as needed to meet legal and accounting obligations afterward.
        </p>

        <h2>5. Your rights</h2>
        <p>
          You can request access to, correction of, or deletion of your
          personal information by contacting us. You can update most details
          directly from your account.
        </p>

        <h2>6. Security</h2>
        <p>
          Data is stored with Supabase and protected with row-level access
          controls. No system is perfectly secure, and we can&apos;t guarantee
          absolute security.
        </p>

        <h2>7. Contact</h2>
        <p>Questions about this policy can be sent to the contact address on our website.</p>

        <p className="form-note">
          This page is a general template and has not been reviewed by a
          lawyer or privacy professional. Have it reviewed before relying on
          it for real customer or provider traffic.
        </p>
      </div>
    </section>
  )
}

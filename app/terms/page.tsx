export const metadata = { title: 'Terms of Service — Wurx' }

export default function TermsPage() {
  return (
    <section className="container section">
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1>Terms of Service</h1>
        <p className="muted">Last updated: {new Date().toLocaleDateString('en-CA')}</p>

        <p>
          These Terms govern your use of Wurx (&quot;we&quot;, &quot;us&quot;), a
          subscription home services marketplace serving Ottawa, Ontario. By
          creating an account or booking a service, you agree to these Terms.
        </p>

        <h2>1. The service</h2>
        <p>
          Wurx connects customers with independent third-party service
          providers (&quot;pros&quot;) for home services such as cleaning, snow
          removal, lawn care, and handyman work. Pros are independent
          contractors, not Wurx employees. Wurx facilitates the booking and
          payment but is not itself the provider of the underlying service.
        </p>

        <h2>2. Subscriptions and billing</h2>
        <p>
          Plans are billed monthly in advance through Stripe. Each plan
          includes a bank of service minutes that renews each billing period
          and does not roll over unless stated otherwise. You can cancel
          anytime; cancellation takes effect at the end of the current billing
          period.
        </p>

        <h2>3. Bookings</h2>
        <p>
          Booking a service holds the required minutes from your plan. Minutes
          are only deducted once a pro marks the job complete. You may cancel
          an upcoming booking before it starts to release the held minutes.
        </p>

        <h2>4. Providers</h2>
        <p>
          Pros apply to join Wurx and are responsible for the accuracy of the
          services, areas, and availability on their profile. Verification
          status shown on a profile reflects Wurx&apos;s review process at a
          point in time and is not a guarantee of a pro&apos;s work.
        </p>

        <h2>5. Cancellations and refunds</h2>
        <p>
          Refunds and credit adjustments are handled on a case-by-case basis.
          Contact us if a completed job did not meet expectations.
        </p>

        <h2>6. Limitation of liability</h2>
        <p>
          Wurx is not liable for damages arising from services performed by
          independent pros, to the fullest extent permitted by Ontario law.
        </p>

        <h2>7. Changes</h2>
        <p>
          We may update these Terms from time to time. Continued use of Wurx
          after changes take effect constitutes acceptance.
        </p>

        <h2>8. Contact</h2>
        <p>Questions about these Terms can be sent to the contact address on our website.</p>

        <p className="form-note">
          This page is a general template and has not been reviewed by a
          lawyer. Have it reviewed before relying on it for real customer or
          provider traffic.
        </p>
      </div>
    </section>
  )
}

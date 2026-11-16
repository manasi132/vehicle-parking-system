# Final Acceptance Handoff — Team 10 VPS

This page is the checklist for work that cannot be completed or verified from repository access alone. Use a dedicated test/staging deployment and the agreed evaluation build. Never use production customer data or real card information for evaluation.

## 1. Repository closeout

- [ ] Review PR #40 as an independent reviewer.
- [ ] Confirm the root, backend and frontend workflows pass on the exact PR #40 head.
- [ ] Confirm PR #40 contains the squash-merged consistency fix from PR #43.
- [ ] Resolve review comments and record reviewer approval; do not approve your own work.
- [ ] Merge PR #40 to `main` only after independent review and instructor/team acceptance.
- [ ] Assign and agree story points for issues #35–39; verify the linked GitHub Project board and sprint columns.

## 2. Manual UAT — perform with the running UI

Use separate driver, attendant and admin test accounts. For every scenario, record actual result, tester, date/time, environment URL, commit SHA and redacted screenshot/video. Mark Pass only after observing the expected result.

| UAT ID | Role | Steps | Expected observation | Result / evidence |
|---|---|---|---|---|
| UAT-01 | Driver | Register and log in; try invalid password; perform logout/login. | Correct role/session, useful validation and no password disclosure. | Fill during test |
| UAT-02 | Admin | Create a lot; add slots; edit lot and pricing; deactivate lot. | Changes persist and appear in the UI; inactive lot is not bookable. | Fill during test |
| UAT-03 | Driver | Search by location/city, inspect availability and estimated fee. | Matching lots, time-window availability and fee quote shown. | Fill during test |
| UAT-04 | Driver | Reserve a slot, then submit overlapping bookings from two sessions. | One overlapping booking only; losing request receives conflict/busy response. | Fill during test |
| UAT-05 | Driver | Cancel a future reservation; repeat cancellation. | First cancellation releases slot; duplicate is rejected safely. | Fill during test |
| UAT-06 | Attendant | Enter matching vehicle for active reservation; attempt mismatching vehicle; exit matching vehicle. | Valid entry occupies slot; invalid entry is rejected and alert appears; valid exit frees slot and returns stay duration. | Fill during test |
| UAT-07 | Admin | View occupancy, attendants, audit events and reports. Attempt report endpoint as driver. | Admin sees intended information; audit contains actor/action/target but no secrets; driver is denied. | Fill during test |
| UAT-08 | Driver/Admin | Use password reset/OTP flow if delivery is configured; test lockout. | Generic reset response; OTP not exposed in API; lockout behaviour matches documented policy. | Fill during test |
| UAT-09 | Driver | Perform actual Stripe test-mode charge only with approved test account/key and client-generated test token. Repeat retry/refund recovery. | One successful intent/receipt, expected failure for decline and no duplicate charge/refund. | Pending credentials/provider |
| UAT-10 | Admin/Attendant | Verify public slot board updates after booking, entry, exit and cancellation. | Redacted status update visible; no reservation/vehicle secrets in event payload. | Fill during test |

Attach the completed signed sheet `TEAM_10_VPS_UAT_And_Final_Signoff_Sheet.docx`. A template or unsigned copy is not a UAT pass.

## 3. Actual demo recordings

- [ ] Record a 60-second Sprint 1 video from the running application and save as `docs/demo/sprint1-demo.mp4`.
- [ ] Record a 120-second Sprint 2 video from the accepted commit and save as `docs/demo/sprint2-demo.mp4`.
- [ ] Keep real browser interactions visible; redact emails, phone numbers, tokens and provider secrets.
- [ ] Include only flows that actually work; do not simulate a live Stripe response or deployed TLS result.
- [ ] Commit the videos or provide instructor-approved evidence links and add them to the README.

## 4. Deployment and external acceptance

### Stripe
Requires Stripe test account, test-mode secret key and client-generated test token. Keep credentials in deployment secrets, never in Git. Complete one successful payment, one decline, one same-reservation retry and refund recovery. Capture redacted provider dashboard references and receipt IDs; do not show keys or tokens.

### HTTPS/TLS
Replace the `parking.example.com` template with the real hostname and install a trusted full-chain certificate. Verify:

```powershell
curl.exe -I http://YOUR_HOST/
curl.exe -I https://YOUR_HOST/
openssl s_client -connect YOUR_HOST:443 -servername YOUR_HOST -verify_hostname YOUR_HOST -verify_return_error -tls1_2
openssl s_client -connect YOUR_HOST:443 -servername YOUR_HOST -verify_hostname YOUR_HOST -verify_return_error -tls1_3
```

Record SAN/expiry/chain, redirect, HSTS, TLS 1.2/1.3 success and rejection of older protocol versions. CI's ephemeral certificate only proves Nginx syntax.

### Performance
Run the agreed 500-user JMeter workload against production-like deployment with normal connection settings. Keep JMX, sanitized JTL, summary report, host specs, concurrency/ramp-up, duration and run commit. Repeat enough times to distinguish a stable p90 ≤3s from a single lucky result.

### Security/accessibility/reporting
- [ ] Run active/deployed security testing only against authorized staging; record scope, tool/version, findings and remediation.
- [ ] Run axe/WCAG scans plus keyboard-only and screen-reader checks; retain report and remediation.
- [ ] Seed report data inside/outside date range; verify totals and non-admin denial.
- [ ] Capture monthly uptime evidence before claiming a 99.5% availability objective.

## 5. Final document and sprint sign-off

- [ ] Team reviews SRS Revision 1.1, Test Plan Revision 1.1, SAD As-Built Addendum and RTM for consistency with delivered code.
- [ ] Original SAD reconciled with as-built addendum and diagrams.
- [ ] UAT sign-off sheet completed with actual observations and signatures.
- [ ] Project board/story ownership/points and Sprint 2 completion state reviewed.
- [ ] PR #40 reviewed and merged; final `main` commit recorded.
- [ ] Demo video links and final test evidence indexed in `docs/README.md`.

Do not mark the project fully ready until applicable checkboxes are genuinely completed. If hosting/provider access is unavailable, document the limitation and obtain an explicit instructor-approved disposition.

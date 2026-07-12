# Security

Please do not open public issues for security-sensitive reports.

Send a private report to the repository owner with:

- affected version or commit
- reproduction steps
- impact
- any suggested mitigation

Ledger source records can include project paths, internal notes, and release
history. Do not commit secrets, credentials, private keys, production data, or
private customer information to Ledger records.

`ledger serve` treats rendered Ledger content as sensitive. It binds to
loopback by default, rejects non-loopback binding unless `--expose` is present,
and requires `LEDGER_SERVE_TOKEN` in network mode. Network exposure should sit
behind TLS. Generated static files carry a restrictive CSP meta policy, but a
third-party static host remains responsible for transport security and response
headers.

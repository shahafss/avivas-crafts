-- One-time refresh (008 FR-038): the Terms and Privacy Policy drafts no longer mention a VAT
-- registration. Marking both pages as not owner-edited lets the next seed (the deploy runs
-- `db:migrate && db:seed`) replace them with the new drafts, bump their version and record the
-- new content_page_version rows. The migration runs once, so later admin edits are kept.
UPDATE content_page SET owner_edited = false WHERE slug IN ('terms', 'privacy');

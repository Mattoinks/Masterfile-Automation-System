-- lot2526_cases previously had no link to the DN it came from (case_no is
-- just a sequential counter, independent of the dispatch note - see 0001's
-- comment on that column). Adding dn_number so the 2526 Cases view can
-- search/identify a case by the actual DN it was created from, not just
-- its internal case number. Nullable/blank for any case created before
-- this column existed (none exist right now - the table was reset to
-- empty during testing - but the app tolerates a blank dn_number either
-- way, same as it already does for test_bau).

alter table lot2526_cases add column dn_number text;

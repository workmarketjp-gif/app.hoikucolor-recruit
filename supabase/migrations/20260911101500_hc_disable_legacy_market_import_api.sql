-- Legacy HM import predates HC's explicit publication switch and can promote HM-published
-- jobs directly. It is retained for controlled service-role migration only, never browser use.
revoke all on function public.hc_import_legacy_market_recruitment(uuid)
from public, anon, authenticated;

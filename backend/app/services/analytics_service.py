from __future__ import annotations

from collections import Counter
from typing import Any

from app.models.schemas import AnalyticsResponse
from app.services.excel_service import ExcelService


class AnalyticsService:
    def __init__(self) -> None:
        self.excel = ExcelService()

    def get_analytics(self) -> AnalyticsResponse:
        records = self.excel.get_all_master_records()
        total = len(records)

        monthly: dict[str, int] = Counter()
        devices: Counter[str] = Counter()
        owners: Counter[str] = Counter()
        failures: Counter[str] = Counter()

        for rec in records:
            mth = str(rec.get("recd_mth") or rec.get("store_received") or "Unknown")[:7]
            monthly[mth] += 1
            device = str(rec.get("device") or "").strip()
            if device:
                devices[device] += 1
            owner = str(rec.get("owner") or "").strip()
            if owner:
                owners[owner] += 1
            if not owner:
                failures["Missing Owner"] += 1
            if not str(rec.get("device") or "").strip():
                failures["Missing Device"] += 1
            if not str(rec.get("quantity") or "").strip():
                failures["Missing Quantity"] += 1

        dup_rate = 0.0
        if total > 0:
            dn_counts = Counter(str(r.get("dn_number") or "") for r in records if r.get("dn_number"))
            dup_dns = sum(1 for c in dn_counts.values() if c > 1)
            dup_rate = round((dup_dns / max(len(dn_counts), 1)) * 100, 1)

        return AnalyticsResponse(
            total_cases=total,
            monthly_returns=dict(sorted(monthly.items(), reverse=True)[:12]),
            top_devices=[{"device": d, "count": c} for d, c in devices.most_common(10)],
            duplicate_rate=dup_rate,
            common_failures=[{"issue": k, "count": v} for k, v in failures.most_common(5)],
            cases_per_owner=[{"owner": o, "count": c} for o, c in owners.most_common(10)],
        )


def compute_kpis(rows):
    total_billed = sum(r.get("total_billed", 0) for r in rows)
    total_collected = sum(r.get("total_collected", 0) for r in rows)
    total_opex = sum(r.get("total_opex", 0) for r in rows)

    return {
        "collection_efficiency": total_collected / total_billed if total_billed else 0,
        "operating_ratio": total_opex / total_billed if total_billed else 0
    }

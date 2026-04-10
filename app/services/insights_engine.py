
def generate_insights(data):
    insights = []
    for row in data:
        if row.get("pct_nrw", 0) > 40:
            insights.append({"issue": "High NRW", "severity": "high"})
    return insights

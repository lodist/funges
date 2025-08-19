import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql/"


def main() -> None:
    api_token = os.getenv("CF_API_TOKEN")
    zone_id = os.getenv("CF_ZONE_ID")
    if not api_token or not zone_id:
        raise RuntimeError(
            "CF_API_TOKEN and CF_ZONE_ID environment variables must be set"
        )

    start_date = datetime.now(timezone.utc).replace(day=1).strftime("%Y-%m-%d")
    end_date = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    graphql_query = {
        "query": f"""
        query {{
          viewer {{
            zones(filter: {{ zoneTag: \"{zone_id}\" }}) {{
              httpRequests1dGroups(limit: 30, filter: {{ date_geq: \"{start_date}\", date_leq: \"{end_date}\" }}) {{
                uniq {{
                  uniques
                }}
              }}
            }}
          }}
        }}"""
    }

    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }

    response = requests.post(GRAPHQL_URL, json=graphql_query, headers=headers)
    response.raise_for_status()
    data = response.json()

    try:
        daily_uniques = data["data"]["viewer"]["zones"][0]["httpRequests1dGroups"]
        total_unique_visitors = sum(day["uniq"]["uniques"] for day in daily_uniques)
    except (KeyError, IndexError, TypeError):
        print("No data found or failed API request")
        return

    print(f"Unique visitors in the past 30 days: {total_unique_visitors}")

    output_path = Path("public/data/visitors.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    current_data = {}
    if output_path.exists():
        try:
            with output_path.open("r") as f:
                current_data = json.load(f)
        except json.JSONDecodeError:
            current_data = {}

    current_data["count"] = total_unique_visitors

    with output_path.open("w") as f:
        json.dump(current_data, f, indent=2)


if __name__ == "__main__":
    main()

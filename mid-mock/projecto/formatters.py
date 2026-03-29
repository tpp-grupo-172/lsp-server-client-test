def format_currency(amount: float, symbol: str = "$") -> str:
    return f"{symbol}{amount:.2f}"


def format_name(first: str, last: str) -> str:
    return f"{first.strip()} {last.strip()}"


def format_percentage(value: float) -> str:
    return f"{value:.1f}%"

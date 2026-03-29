from projecto import formatters as utils_formatters


def send_order_confirmation(email: str, product_name: str, total: float) -> bool:
    formatted = utils_formatters.format_currency(total)
    print(f"Order confirmation sent to {email}: {product_name} - {formatted}")
    return True


def send_welcome_email(email: str, name: str) -> bool:
    print(f"Welcome email sent to {email} for {name}")
    return True


def send_stock_alert(product_name: str, stock: int) -> bool:
    print(f"Stock alert for {product_name}: {stock} units remaining")
    return True


def hola() -> bool:
    return True

from projecto import product as core_product
from projecto import user as core_user
from projecto import order as services_order
from projecto import notification as services_notification
from projecto import formatters as utils_formatters


def add_product(name: str, price: float, stock: int) -> dict:
    product = core_product.create_product(name, price, stock)
    return {"name": product.name, "formatted_price": product.formatted_price()}


def place_order(
    username: str,
    email: str,
    age: int,
    product_name: str,
    price: float,
    stock: int,
    quantity: int,
) -> dict:
    user = core_user.create_user(username, email, age)
    product = core_product.create_product(product_name, price, stock)
    order = services_order.create_order(user, product, quantity)
    result = services_order.process_order(order)
    if product.stock <= 5:
        services_notification.send_stock_alert(product_name, product.stock)
    return result


def get_discounted_price(
    product_name: str, price: float, stock: int, discount: float
) -> str:
    product = core_product.create_product(product_name, price, stock)
    discounted = core_product.apply_discount(product, discount)
    return utils_formatters.format_currency(discounted)

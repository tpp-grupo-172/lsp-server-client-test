from projecto import user as core_user
from projecto import product as core_product
from projecto import formatters as utils_formatters
from projecto import notification as services_notification


class Order:
    def __init__(self, user: core_user.User, product: core_product.Product, quantity: int):
        self.user = user
        self.product = product
        self.quantity = quantity

    def total(self) -> float:
        discounted = core_product.apply_discount(self.product, 0)
        return round(discounted * self.quantity, 2)

    def formatted_total(self) -> str:
        return utils_formatters.format_currency(self.total())


def create_order(user: core_user.User, product: core_product.Product, quantity: int) -> Order:
    if not product.is_available():
        raise ValueError("Product is not available")
    if quantity <= 0:
        raise ValueError("Quantity must be positive")
    return Order(user, product, quantity)


def process_order(order: Order) -> dict:
    summary = core_user.get_user_summary(order.user)
    services_notification.send_order_confirmation(
        order.user.email, order.product.name, order.total()
    )
    return {
        "user": summary,
        "total": order.total(),
        "formatted_total": order.formatted_total(),
    }

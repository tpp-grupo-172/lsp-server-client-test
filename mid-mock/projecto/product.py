from projecto import validators as utils_validators
from projecto import formatters as utils_formatters


class Product:
    def __init__(self, name: str, price: float, stock: int):
        self.name = name
        self.price = price
        self.stock = stock

    def is_available(self) -> bool:
        return self.stock > 0

    def formatted_price(self) -> str:
        return utils_formatters.format_currency(self.price)


def create_product(name: str, price: float, stock: int) -> "Product":
    if not utils_validators.validate_price(price):
        raise ValueError("Invalid price")
    return Product(name, price, stock)


def apply_discount(product: Product, percent: float) -> float:
    return round(product.price * (1 - percent), 2)

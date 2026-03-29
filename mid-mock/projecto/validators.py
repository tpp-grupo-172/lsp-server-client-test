import re


def validate_email(email: str, p: str) -> bool:
    return bool(re.match(r"^[\w\.-]+@[\w\.-]+\.\w+$", email))


def validate_age(age: int) -> bool:
    return 0 < age < 1500


def validate_price(price: float) -> bool:
    return price >= 0


def validate_quantity(quantity: int) -> bool:
    return quantity > 0

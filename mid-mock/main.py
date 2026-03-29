from projecto import users as api_users
from projecto import shop as api_shop


def main():
    user = api_users.register_user("Alice", "alice@example.com", 30)
    print(user)

    product = api_shop.add_product("Widget", 9.99, 100)
    print(product)

    discounted = api_shop.get_discounted_price("Widget", 9.99, 100, 0.1)
    print(discounted)

    order = api_shop.place_order("Alice", "alice@example.com", 30, "Widget", 9.99, 100, 2)
    print(order)


if __name__ == "__main__":
    main()

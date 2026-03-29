from projecto import validators as utils_validators


class User:
    def __init__(self, name: str, email: str, age: int):
        self.name = name
        self.email = email
        self.age = age

    def is_valid(self) -> bool:
        return (
            utils_validators.validate_email(self.email, "")
            and utils_validators.validate_age(self.age)
        )


def create_user(name: str, email: str, age: int) -> User:
    user = User(name, email, age)
    if not user.is_valid():
        raise ValueError("Invalid user data")
    return user


def get_user_summary(user: User) -> dict:
    if not user.is_valid():
        raise ValueError("Invalid user")
    return {
        "name": user.name,
        "email": user.email,
        "age": user.age,
    }

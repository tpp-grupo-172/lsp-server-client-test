from projecto import user as core_user
from projecto import notification as services_notification


def register_user(name: str, email: str, age: int) -> dict:
    u = core_user.create_user(name, email, age)
    services_notification.send_welcome_email(email, name)
    return core_user.get_user_summary(u)


def get_user_profile(name: str, email: str, age: int) -> dict:
    u = core_user.create_user(name, email, age)
    return core_user.get_user_summary(u)


def deactivate_user(email: str) -> bool:
    print(f"User {email} deactivated")
    return True
